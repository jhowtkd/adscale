/**
 * What the first bytes of an image file say about the picture, read by hand (ticket 16, second round of the review of PR 618): how big it is once decoded and whether it can
 * have see-through pixels. `sharp` is not asked: opening a file to read its header is not free. libvips reserves the canvas of the picture (width x height x 4 bytes) when it opens a
 * WebP or a GIF, before any limit of pixels is checked and outside any queue (measured: +1 GB for two reads of a 16383 x 16383 lossless WebP of 3 KB, and 8 reads at once of a 6324 x 6324
 * one of 1.7 KB took +460 to +610 MB); only the header of a PNG is free to read that way. Everything here is a few reads of fixed positions, so it holds the same on any system.
 *
 * Only the formats a logo comes in and that are cheap to decode are read. A format that is not read (AVIF, HEIC, TIFF, ...) is `"unsupported"`: the AV1 decoder, for one, takes
 * 240 to 270 MB to open an 8 MP picture. A WebP with animation is `"unsupported"` too: libwebp keeps several canvases to open it (+122 MB for 8 MP), and one picture is what is judged.
 * A header that cannot be read (cut short, a size of zero, a value the format does not allow) is `"unreadable"`. Neither is a failure of the logo: it is stored all the same.
 */
export type RasterHeader =
  | { format: "jpeg"; seeThrough: false }
  | {
      format: "png" | "webp" | "gif";
      width: number;
      height: number;
      /** What decoding the picture costs in memory: what it takes once decoded, as libvips holds it (width x height x bands x bytes of a sample), times the canvases its decoder keeps besides it. */
      decodedBytes: number;
      /** `false` only when the file says for certain that no pixel is see-through (nothing is decoded for it). A format that cannot say before the pixels are read counts as `true`. */
      seeThrough: boolean;
    };

const ascii = (bytes: Uint8Array, from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
const u16le = (bytes: Uint8Array, at: number) => bytes[at]! | (bytes[at + 1]! << 8);
const u24le = (bytes: Uint8Array, at: number) => bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16);
const u32le = (bytes: Uint8Array, at: number) => (bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16) | (bytes[at + 3]! << 24)) >>> 0;
const u32be = (bytes: Uint8Array, at: number) => ((bytes[at]! << 24) | (bytes[at + 1]! << 16) | (bytes[at + 2]! << 8) | bytes[at + 3]!) >>> 0;

// PNG: the bands libvips gives each colour type (a palette is opened as RGB) and the bit depths the format allows for it.
const PNG_COLOUR: Record<number, { bands: number; depths: number[] }> = {
  0: { bands: 1, depths: [1, 2, 4, 8, 16] }, 2: { bands: 3, depths: [8, 16] }, 3: { bands: 3, depths: [1, 2, 4, 8] }, 4: { bands: 2, depths: [8, 16] }, 6: { bands: 4, depths: [8, 16] },
};
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_MAX_SIDE = 0x7fffffff;

function readPng(bytes: Uint8Array): RasterHeader | "unreadable" {
  // After the signature the first chunk is IHDR: a length of 13, its name, then width, height, bit depth, colour type, compression, filter and interlace (and 4 bytes of checksum).
  if (bytes.length < 33 || u32be(bytes, 8) !== 13 || ascii(bytes, 12, 16) !== "IHDR") return "unreadable";
  const width = u32be(bytes, 16), height = u32be(bytes, 20), depth = bytes[24]!, type = bytes[25]!, colour = PNG_COLOUR[type];
  if (!colour || !colour.depths.includes(depth) || width < 1 || height < 1 || width > PNG_MAX_SIDE || height > PNG_MAX_SIDE) return "unreadable";
  // The transparency of the colour types with no alpha channel (0, 2 and 3) is a `tRNS` chunk, which comes before the first IDAT: the chunks up to there are walked by their lengths.
  let keyed = false;
  for (let at = 33; at + 8 <= bytes.length;) {
    const name = ascii(bytes, at + 4, at + 8);
    if (name === "tRNS") { keyed = true; break; }
    if (name === "IDAT" || name === "IEND") break;
    at += 12 + u32be(bytes, at);
  }
  const alpha = type === 4 || type === 6;
  return { format: "png", width, height, seeThrough: alpha || keyed, decodedBytes: width * height * (colour.bands + (!alpha && keyed ? 1 : 0)) * (depth === 16 ? 2 : 1) };
}

function readWebp(bytes: Uint8Array): RasterHeader | "unsupported" | "unreadable" {
  // After "RIFF", the size and "WEBP", the first chunk says which kind of WebP it is (its data starts at byte 20).
  if (bytes.length < 20) return "unreadable";
  const kind = ascii(bytes, 12, 16);
  const picture = (width: number, height: number, seeThrough: boolean): RasterHeader | "unreadable" =>
    width < 1 || height < 1 ? "unreadable" : { format: "webp", width, height, seeThrough, decodedBytes: width * height * 4 };
  if (kind === "VP8X") {
    // The extended format: a byte of flags (0x02 is animation), 3 reserved bytes, then the canvas: width - 1 and height - 1, 24 bits each. What its alpha flag says is not trusted: an animated
    // file may have frames with alpha without it, and the pixels tell for the rest.
    if (bytes.length < 30) return "unreadable";
    if ((bytes[20]! & 0x02) !== 0) return "unsupported";
    return picture(1 + u24le(bytes, 24), 1 + u24le(bytes, 27), true);
  }
  if (kind === "VP8L") {
    // Lossless: the byte 0x2f, then 14 bits of width - 1, 14 of height - 1, 1 of "alpha is used" and 3 of version.
    if (bytes.length < 25 || bytes[20] !== 0x2f) return "unreadable";
    const bits = u32le(bytes, 21);
    return picture((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1, ((bits >>> 28) & 1) === 1);
  }
  if (kind === "VP8 ") {
    // Lossy with no extended header, so with no alpha: 3 bytes of frame tag, the start code 9d 01 2a, then 14 bits of width and 14 of height.
    if (bytes.length < 30 || bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return "unreadable";
    return picture(u16le(bytes, 26) & 0x3fff, u16le(bytes, 28) & 0x3fff, false);
  }
  return "unreadable";
}

// libvips opens a GIF with canvases of the picture besides the picture itself. Measured at 8 MP (2890 x 2890), one measure at a time: +53 MB for the first one and +220 MB once the allocator
// has kept what each thread freed, against +43 and +81 MB for an interlaced 16-bit PNG of the same decoded size. Counted three times, the ceiling means the same for every format (a GIF up to 1670 x 1670).
const GIF_CANVASES = 3;

function readGif(bytes: Uint8Array): RasterHeader | "unreadable" {
  // After "GIF87a" or "GIF89a" the logical screen: width and height, 16 bits each. Any frame may mark a colour as transparent, and libvips opens the first one as RGBA: the pixels tell.
  if (bytes.length < 13) return "unreadable";
  const width = u16le(bytes, 6), height = u16le(bytes, 8);
  return width < 1 || height < 1 ? "unreadable" : { format: "gif", width, height, seeThrough: true, decodedBytes: width * height * 4 * GIF_CANVASES };
}

/** The header of a PNG, a JPEG, a WebP or a GIF from its first bytes, or why it cannot be had (see the top of the file). It reads fixed positions and allocates nothing. */
export function readRasterHeader(bytes: Uint8Array): RasterHeader | "unsupported" | "unreadable" {
  if (PNG_SIGNATURE.every((value, index) => bytes[index] === value)) return readPng(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { format: "jpeg", seeThrough: false };
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return readWebp(bytes);
  const gif = ascii(bytes, 0, 6);
  if (gif === "GIF87a" || gif === "GIF89a") return readGif(bytes);
  return "unsupported";
}
