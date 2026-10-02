import { describe, expect, it, vi } from "vitest";
import {
  IMAGE_SVG_UNSUPPORTED,
  MAX_IMAGE_BYTES,
  abortable,
  downloadSafeImage,
  isPublicAddress,
  pinnedImageRequest,
  resolvePublicUrl,
  type ImageResponse,
  type ResolvedAddress,
} from "./safe-image-download";
import { MAX_SVG_BYTES } from "./svg-sanitize";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";

const publicLookup = async (): Promise<ResolvedAddress[]> => [{ address: "93.184.216.34", family: 4 }];

async function* singleChunk(bytes: Buffer) {
  yield bytes;
}

function fakeResponse(overrides: Partial<ImageResponse> & { bytes?: Buffer } = {}): ImageResponse {
  const bytes = overrides.bytes ?? Buffer.from("fake-image-bytes");
  return {
    statusCode: overrides.statusCode ?? 200,
    headers: { "content-type": "image/png", "content-length": String(bytes.byteLength), ...overrides.headers },
    body: overrides.body ?? singleChunk(bytes),
    destroy: overrides.destroy ?? vi.fn(),
  };
}

describe("isPublicAddress", () => {
  it("rejects private and reserved IPv4 ranges", () => {
    for (const address of ["10.0.0.1", "127.0.0.1", "169.254.169.254", "172.16.0.1", "192.168.1.1", "0.0.0.0", "224.0.0.1", "192.0.2.1"]) {
      expect(isPublicAddress(address)).toBe(false);
    }
  });

  it("accepts a public IPv4 address", () => {
    expect(isPublicAddress("93.184.216.34")).toBe(true);
  });

  it("rejects loopback, link-local and unique-local IPv6, and IPv4-mapped-private IPv6", () => {
    for (const address of ["::1", "fe80::1", "fc00::1", "fd00::1", "::ffff:10.0.0.1", "2001:db8::1"]) {
      expect(isPublicAddress(address)).toBe(false);
    }
  });

  it("accepts a global unicast IPv6 address", () => {
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
  });
});

describe("resolvePublicUrl", () => {
  it("rejects non-http(s) protocols, credentials in the URL, and non-standard ports", async () => {
    await expect(resolvePublicUrl("ftp://example.com/a.png", publicLookup)).rejects.toThrow();
    await expect(resolvePublicUrl("https://user:pass@example.com/a.png", publicLookup)).rejects.toThrow("unsafe_image_url");
    await expect(resolvePublicUrl("https://example.com:8443/a.png", publicLookup)).rejects.toThrow("unsafe_image_url");
  });

  it("rejects internal-looking hostnames before any DNS lookup", async () => {
    const lookup = vi.fn(publicLookup);
    await expect(resolvePublicUrl("https://myapp.internal/a.png", lookup)).rejects.toThrow("unsafe_image_url");
    await expect(resolvePublicUrl("https://host.local/a.png", lookup)).rejects.toThrow("unsafe_image_url");
    expect(lookup).not.toHaveBeenCalled();
  });

  it("resolves the host and rejects when any resolved address is private", async () => {
    await expect(resolvePublicUrl("https://example.com/a.png", async () => [{ address: "169.254.169.254", family: 4 }]))
      .rejects.toThrow("unsafe_image_address");
    await expect(resolvePublicUrl("https://example.com/a.png", async () => [{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.1", family: 4 }]))
      .rejects.toThrow("unsafe_image_address");
  });

  it("rejects when the lookup lies about the address family", async () => {
    await expect(resolvePublicUrl("https://example.com/a.png", async () => [{ address: "93.184.216.34", family: 6 }]))
      .rejects.toThrow("unsafe_image_address");
  });

  it("accepts a public host and returns its first resolved address", async () => {
    const result = await resolvePublicUrl("https://example.com/a.png", async () => [{ address: "93.184.216.34", family: 4 }]);
    expect(result.url.hostname).toBe("example.com");
    expect(result.address).toEqual({ address: "93.184.216.34", family: 4 });
  });

  it("accepts a literal public IP in the URL without calling the resolver", async () => {
    const lookup = vi.fn(publicLookup);
    const result = await resolvePublicUrl("https://93.184.216.34/a.png", lookup);
    expect(result.address.address).toBe("93.184.216.34");
    expect(lookup).not.toHaveBeenCalled();
  });

  it("rejects a literal private IP in the URL", async () => {
    await expect(resolvePublicUrl("https://127.0.0.1/a.png", publicLookup)).rejects.toThrow("unsafe_image_address");
  });
});

describe("pinnedImageRequest", () => {
  let server: Server;
  let port: number;

  async function withServer(handler: Parameters<typeof createServer>[0], run: () => Promise<void>) {
    server = createServer(handler);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
    try {
      await run();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  it("connects to the pinned address, not to whatever the hostname would resolve to", async () => {
    await withServer((req, res) => {
      res.setHeader("content-type", "image/png");
      res.end(Buffer.from("ok"));
    }, async () => {
      // The hostname does not resolve anywhere real; only the pinned
      // address (127.0.0.1, this server) makes the connection succeed.
      const url = new URL(`http://pinned-host-does-not-resolve.invalid.example:${port}/a.png`);
      const response = await pinnedImageRequest(url, { address: "127.0.0.1", family: 4 }, new AbortController().signal);
      expect(response.statusCode).toBe(200);
      const chunks: Buffer[] = [];
      for await (const chunk of response.body) chunks.push(Buffer.from(chunk));
      expect(Buffer.concat(chunks).toString()).toBe("ok");
      response.destroy();
    });
  });

  it("preserves the original Host header for the pinned connection", async () => {
    await withServer((req, res) => {
      res.setHeader("content-type", "image/png");
      res.end(String(req.headers.host));
    }, async () => {
      const url = new URL(`http://original-host.example:${port}/a.png`);
      const response = await pinnedImageRequest(url, { address: "127.0.0.1", family: 4 }, new AbortController().signal);
      const chunks: Buffer[] = [];
      for await (const chunk of response.body) chunks.push(Buffer.from(chunk));
      expect(Buffer.concat(chunks).toString()).toBe(`original-host.example:${port}`);
      response.destroy();
    });
  });
});

describe("downloadSafeImage", () => {
  it("downloads a supported image within the byte limit", async () => {
    const bytes = Buffer.from("small-png-bytes");
    const request = vi.fn(async () => fakeResponse({ bytes }));
    const result = await downloadSafeImage("https://example.com/a.png", { lookup: publicLookup, request });
    expect(result).toEqual({ bytes, contentType: "image/png" });
  });

  it("fixes the IP resolved by lookup and passes that exact address to request, without re-resolving", async () => {
    const resolved: ResolvedAddress = { address: "93.184.216.34", family: 4 };
    const lookup = vi.fn(async () => [resolved]);
    const request = vi.fn(async () => fakeResponse());
    await downloadSafeImage("https://example.com/a.png", { lookup, request });
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]![1]).toEqual(resolved);
  });

  it("follows up to 3 redirects, re-validating the target on every hop", async () => {
    const lookup = vi.fn(publicLookup);
    const request = vi
      .fn<(url: URL, address: ResolvedAddress, signal: AbortSignal) => Promise<ImageResponse>>()
      .mockResolvedValueOnce(fakeResponse({ statusCode: 302, headers: { location: "https://example.com/b.png" } }))
      .mockResolvedValueOnce(fakeResponse({ statusCode: 302, headers: { location: "https://example.com/c.png" } }))
      .mockResolvedValueOnce(fakeResponse({ statusCode: 200 }));
    const result = await downloadSafeImage("https://example.com/a.png", { lookup, request });
    expect(result.contentType).toBe("image/png");
    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls[1]![0].toString()).toBe("https://example.com/b.png");
    expect(request.mock.calls[2]![0].toString()).toBe("https://example.com/c.png");
  });

  it("rejects a redirect to a host that resolves to a private address, without following it", async () => {
    const lookup = async (host: string) => (host === "cdn.corp-assets.io" ? [{ address: "10.0.0.5", family: 4 as const }] : [{ address: "93.184.216.34", family: 4 as const }]);
    const request = vi.fn(async () => fakeResponse({ statusCode: 302, headers: { location: "https://cdn.corp-assets.io/a.png" } }));
    await expect(downloadSafeImage("https://example.com/a.png", { lookup, request })).rejects.toThrow("unsafe_image_address");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("stops following redirects after the 4th hop", async () => {
    const request = vi.fn(async () => fakeResponse({ statusCode: 302, headers: { location: "https://example.com/next.png" } }));
    await expect(downloadSafeImage("https://example.com/a.png", { lookup: publicLookup, request })).rejects.toThrow("image_redirect_limit");
    expect(request).toHaveBeenCalledTimes(4);
  });

  it("rejects a redirect status without a location header", async () => {
    const request = vi.fn(async () => fakeResponse({ statusCode: 302, headers: { location: undefined } }));
    await expect(downloadSafeImage("https://example.com/a.png", { lookup: publicLookup, request })).rejects.toThrow("image_redirect_limit");
  });

  it("rejects a non-2xx, non-redirect status", async () => {
    const request = vi.fn(async () => fakeResponse({ statusCode: 404 }));
    await expect(downloadSafeImage("https://example.com/a.png", { lookup: publicLookup, request })).rejects.toThrow("image_http_error");
  });

  it("rejects an unsupported content-type that is not an SVG", async () => {
    for (const contentType of ["text/html", "application/octet-stream", "text/plain", "application/xml", "application/json", "image/x-icon"]) {
      const request = vi.fn(async () => fakeResponse({ headers: { "content-type": contentType } }));
      await expect(downloadSafeImage("https://example.com/a.png", { lookup: publicLookup, request })).rejects.toThrow("image_type_unsupported");
    }
  });

  // Ticket 13, D-8 (review of PR 614): a logo that is only an SVG is not found; it did not fail to download.
  describe("an SVG is told apart from any other unsupported type", () => {
    const svg = Buffer.from('<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10z"/></svg>');
    const download = (response: ImageResponse) => downloadSafeImage("https://example.com/logo", { lookup: publicLookup, request: vi.fn(async () => response) });

    it("by its type: image/svg+xml, with parameters or in any case, without reading the body", async () => {
      for (const contentType of ["image/svg+xml", "image/svg+xml; charset=utf-8", "IMAGE/SVG+XML"]) {
        let read = false;
        const body = { [Symbol.asyncIterator]() { read = true; throw new Error("the body must not be read for a type that says SVG"); } };
        await expect(download(fakeResponse({ headers: { "content-type": contentType }, body }))).rejects.toThrow(IMAGE_SVG_UNSUPPORTED);
        expect(read, contentType).toBe(false);
      }
    });

    it("by its first bytes when the server says nothing or something generic", async () => {
      for (const contentType of [undefined, "text/xml", "application/xml", "text/plain", "application/octet-stream", "binary/octet-stream"]) {
        await expect(download(fakeResponse({ bytes: svg, headers: { "content-type": contentType as never } })), String(contentType)).rejects.toThrow(IMAGE_SVG_UNSUPPORTED);
      }
    });

    it("an SVG without the XML prolog, in upper case, or after a BOM and blank lines is still one", async () => {
      for (const body of ['<svg xmlns="http://www.w3.org/2000/svg"></svg>', '<SVG xmlns="http://www.w3.org/2000/svg"></SVG>', '\ufeff\n\n  <svg>', "<svg>"]) {
        await expect(download(fakeResponse({ bytes: Buffer.from(body), headers: { "content-type": "text/plain" } })), body).rejects.toThrow(IMAGE_SVG_UNSUPPORTED);
      }
    });

    it("what is not an SVG stays an unsupported type, even if it says <svgfoo> or mentions svg", async () => {
      for (const body of ["<html><body>nope</body></html>", "plain text about svg files", "<svgfoo>", "\u0089PNG\r\n\u001a\n", ""]) {
        await expect(download(fakeResponse({ bytes: Buffer.from(body), headers: { "content-type": "application/octet-stream" } })), body).rejects.toThrow("image_type_unsupported");
      }
    });

    it("never sniffs a type that cannot be an SVG: html is refused without reading its body", async () => {
      let read = false;
      const body = { [Symbol.asyncIterator]() { read = true; throw new Error("the body must not be read for text/html"); } };
      await expect(download(fakeResponse({ headers: { "content-type": "text/html" }, body }))).rejects.toThrow("image_type_unsupported");
      expect(read).toBe(false);
    });

    it("reads at most 4096 bytes to tell, never the whole response", async () => {
      let sent = 0;
      async function* endless() { for (;;) { sent += 1024; yield Buffer.alloc(1024, 0x41); } }
      await expect(download(fakeResponse({ headers: { "content-type": "application/octet-stream" }, body: endless() }))).rejects.toThrow("image_type_unsupported");
      expect(sent).toBeLessThanOrEqual(4096 + 1024);
    });

    it("an <svg> that only starts after the first 4096 bytes is not looked for", async () => {
      const late = Buffer.concat([Buffer.alloc(5000, 0x20), Buffer.from("<svg>")]);
      await expect(download(fakeResponse({ bytes: late, headers: { "content-type": "text/plain" } }))).rejects.toThrow("image_type_unsupported");
    });

    it("a body that fails while being read does not hide the reason: it is just unsupported", async () => {
      async function* broken() { yield Buffer.from("<?xml"); throw new Error("socket hang up"); }
      await expect(download(fakeResponse({ headers: { "content-type": "text/plain" }, body: broken() }))).rejects.toThrow("image_type_unsupported");
    });

    it("a real raster is untouched by all this", async () => {
      await expect(download(fakeResponse({ bytes: Buffer.from("png-bytes"), headers: { "content-type": "image/png" } }))).resolves.toMatchObject({ contentType: "image/png" });
    });
  });

  // Ticket 15, item 2: a logo may be an SVG. Only a caller that draws it as a PNG asks for it (`allowSvg`); everyone else keeps the behaviour above.
  describe("allowSvg", () => {
    const svg = Buffer.from('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10z"/></svg>');
    const download = (response: ImageResponse, extra: Partial<Parameters<typeof downloadSafeImage>[1]> = {}) =>
      downloadSafeImage("https://example.com/logo", { lookup: publicLookup, request: vi.fn(async () => response), allowSvg: true, ...extra });

    it("takes an SVG by its type: image/svg+xml, with parameters or in any case, and returns it as image/svg+xml", async () => {
      for (const contentType of ["image/svg+xml", "image/svg+xml; charset=utf-8", "IMAGE/SVG+XML", "Image/Svg+Xml;charset=UTF-8"]) {
        const result = await download(fakeResponse({ bytes: svg, headers: { "content-type": contentType } }));
        expect(result, contentType).toEqual({ bytes: svg, contentType: "image/svg+xml" });
      }
    });

    it("takes an SVG by its first bytes when the type is text/plain, application/octet-stream, text/xml, application/xml, binary/octet-stream or missing", async () => {
      for (const contentType of ["text/plain", "application/octet-stream", "text/xml", "application/xml", "binary/octet-stream", undefined]) {
        const result = await download(fakeResponse({ bytes: svg, headers: { "content-type": contentType as never } }));
        expect(result, String(contentType)).toEqual({ bytes: svg, contentType: "image/svg+xml" });
      }
    });

    it("gives back every byte of an SVG sent in several chunks, including the ones used to tell what it is", async () => {
      async function* chunks() { yield svg.subarray(0, 20); yield svg.subarray(20, 60); yield svg.subarray(60); }
      const result = await download(fakeResponse({ headers: { "content-type": "text/plain", "content-length": undefined }, body: chunks() }));
      expect(result.bytes.equals(svg)).toBe(true);
    });

    it("an SVG after a BOM, blank lines or in upper case is still told by its first bytes", async () => {
      for (const body of ['<SVG xmlns="http://www.w3.org/2000/svg"></SVG>', '﻿\n\n  <svg>', "<svg>"]) {
        const result = await download(fakeResponse({ bytes: Buffer.from(body), headers: { "content-type": "application/octet-stream" } }));
        expect(result.contentType, body).toBe("image/svg+xml");
      }
    });

    it("refuses a body that is not an SVG when the type is ambiguous: image_type_unsupported", async () => {
      for (const contentType of [undefined, "text/plain", "text/xml", "application/xml", "application/octet-stream"]) {
        for (const body of ["<html><body>nope</body></html>", "plain text about svg files", "<svgfoo>", "\u0089PNG\r\n\u001a\n", "<?xml version=\"1.0\"?><feed/>"]) {
          await expect(download(fakeResponse({ bytes: Buffer.from(body), headers: { "content-type": contentType as never } })), `${contentType} ${body}`).rejects.toThrow("image_type_unsupported");
        }
      }
    });

    it("never sniffs a type that cannot be an SVG (html, json, icons), and does not read its body", async () => {
      for (const contentType of ["text/html", "application/json", "image/x-icon", "application/pdf"]) {
        let read = false;
        const body = { [Symbol.asyncIterator]() { read = true; throw new Error("the body must not be read"); } };
        await expect(download(fakeResponse({ headers: { "content-type": contentType }, body })), contentType).rejects.toThrow("image_type_unsupported");
        expect(read, contentType).toBe(false);
      }
    });

    it("does not judge the body of something that says it is an SVG: the sanitizer does", async () => {
      const result = await download(fakeResponse({ bytes: Buffer.from("this is not an svg"), headers: { "content-type": "image/svg+xml" } }));
      expect(result).toEqual({ bytes: Buffer.from("this is not an svg"), contentType: "image/svg+xml" });
    });

    it("keeps raster images as they were: same type back, same 10 MB limit (not the SVG one)", async () => {
      const png = Buffer.alloc(MAX_SVG_BYTES + 1000, 7);
      const result = await download(fakeResponse({ bytes: png, headers: { "content-type": "image/png" } }));
      expect(result.contentType).toBe("image/png");
      expect(result.bytes.equals(png)).toBe(true); // Not toEqual: comparing a megabyte element by element is slow.
      await expect(download(fakeResponse({ headers: { "content-type": "image/png", "content-length": String(MAX_IMAGE_BYTES + 1) } }))).rejects.toThrow("image_too_large");
    });

    it("limits an SVG to MAX_SVG_BYTES by its content-length, by type and by sniffing, before reading the body", async () => {
      for (const contentType of ["image/svg+xml", "text/plain", "application/octet-stream", undefined]) {
        let read = false;
        const body = { [Symbol.asyncIterator]() { read = true; throw new Error("the body must not be read"); } };
        await expect(download(fakeResponse({ headers: { "content-type": contentType as never, "content-length": String(MAX_SVG_BYTES + 1) }, body })), String(contentType)).rejects.toThrow("image_too_large");
        expect(read, String(contentType)).toBe(false);
      }
    });

    it("accepts an SVG of exactly MAX_SVG_BYTES, and refuses one that is a byte longer, when the stream is the only thing that says", async () => {
      const head = Buffer.from("<svg>"), exact = Buffer.concat([head, Buffer.alloc(MAX_SVG_BYTES - head.length, 0x20)]);
      expect(exact.length).toBe(MAX_SVG_BYTES);
      for (const contentType of ["image/svg+xml", "text/plain"]) {
        const ok = await download(fakeResponse({ bytes: exact, headers: { "content-type": contentType, "content-length": undefined } }));
        expect(ok.bytes.length, contentType).toBe(MAX_SVG_BYTES);
        async function* tooMuch() { yield exact; yield Buffer.from(" "); }
        await expect(download(fakeResponse({ headers: { "content-type": contentType, "content-length": undefined }, body: tooMuch() })), contentType).rejects.toThrow("image_too_large");
      }
    });

    it("stops reading a stream of an SVG that never ends, at the limit", async () => {
      let sent = 0;
      async function* endless() { yield Buffer.from("<svg>"); for (;;) { sent += 64 * 1024; yield Buffer.alloc(64 * 1024, 0x20); } }
      await expect(download(fakeResponse({ headers: { "content-type": "image/svg+xml", "content-length": undefined }, body: endless() }))).rejects.toThrow("image_too_large");
      expect(sent).toBeLessThanOrEqual(MAX_SVG_BYTES + 64 * 1024);
    });

    it("a smaller maxBytes still wins over the SVG limit", async () => {
      await expect(download(fakeResponse({ bytes: Buffer.alloc(2000, 0x20), headers: { "content-type": "image/svg+xml" } }), { maxBytes: 1500 })).rejects.toThrow("image_too_large");
      await expect(download(fakeResponse({ bytes: Buffer.alloc(2000, 0x20), headers: { "content-type": "image/svg+xml", "content-length": "2000" } }), { maxBytes: 1500 })).rejects.toThrow("image_too_large");
    });

    it("refuses a compressed SVG (the real size would be hidden), an empty one, and a failing stream", async () => {
      await expect(download(fakeResponse({ bytes: svg, headers: { "content-type": "image/svg+xml", "content-encoding": "gzip" } }))).rejects.toThrow("image_too_large");
      async function* empty() {}
      await expect(download(fakeResponse({ body: empty(), headers: { "content-type": "image/svg+xml", "content-length": "0" } }))).rejects.toThrow("image_empty");
      async function* broken() { yield Buffer.from("<svg>"); throw new Error("socket hang up"); }
      await expect(download(fakeResponse({ headers: { "content-type": "image/svg+xml", "content-length": undefined }, body: broken() }))).rejects.toThrow("socket hang up");
    });

    it("destroys the response once, whether the SVG is taken or refused", async () => {
      const taken = vi.fn(), refused = vi.fn();
      await download(fakeResponse({ bytes: svg, headers: { "content-type": "image/svg+xml" }, destroy: taken }));
      await expect(download(fakeResponse({ bytes: Buffer.from("<html>"), headers: { "content-type": "text/plain" }, destroy: refused }))).rejects.toThrow("image_type_unsupported");
      expect(taken).toHaveBeenCalledTimes(1);
      expect(refused).toHaveBeenCalledTimes(1);
    });

    it("follows a redirect to an SVG, re-validating the target as for any image", async () => {
      const request = vi.fn<(url: URL, address: ResolvedAddress, signal: AbortSignal) => Promise<ImageResponse>>()
        .mockResolvedValueOnce(fakeResponse({ statusCode: 302, headers: { location: "https://cdn.example.com/logo" } }))
        .mockResolvedValueOnce(fakeResponse({ bytes: svg, headers: { "content-type": "image/svg+xml" } }));
      const result = await downloadSafeImage("https://example.com/logo", { lookup: publicLookup, request, allowSvg: true });
      expect(result.contentType).toBe("image/svg+xml");
      const privateLookup = async (host: string) => (host === "cdn.example.com" ? [{ address: "10.0.0.5", family: 4 as const }] : [{ address: "93.184.216.34", family: 4 as const }]);
      const again = vi.fn(async () => fakeResponse({ statusCode: 302, headers: { location: "https://cdn.example.com/logo" } }));
      await expect(downloadSafeImage("https://example.com/logo", { lookup: privateLookup, request: again, allowSvg: true })).rejects.toThrow("unsafe_image_address");
    });

    it("without allowSvg (absent or false) an SVG is still refused as before, by type and by bytes, and html stays an unsupported type", async () => {
      for (const allowSvg of [undefined, false]) {
        const options = allowSvg === undefined ? {} : { allowSvg };
        for (const contentType of ["image/svg+xml", "text/plain", undefined]) {
          const request = vi.fn(async () => fakeResponse({ bytes: svg, headers: { "content-type": contentType as never } }));
          await expect(downloadSafeImage("https://example.com/logo", { lookup: publicLookup, request, ...options }), `${allowSvg} ${contentType}`).rejects.toThrow(IMAGE_SVG_UNSUPPORTED);
        }
        const request = vi.fn(async () => fakeResponse({ bytes: svg, headers: { "content-type": "text/html" } }));
        await expect(downloadSafeImage("https://example.com/logo", { lookup: publicLookup, request, ...options })).rejects.toThrow("image_type_unsupported");
      }
    });
  });

  it("accepts every raster type in the allowlist", async () => {
    for (const contentType of ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"]) {
      const request = vi.fn(async () => fakeResponse({ headers: { "content-type": contentType } }));
      const result = await downloadSafeImage("https://example.com/a.png", { lookup: publicLookup, request });
      expect(result.contentType).toBe(contentType);
    }
  });

  it("rejects when the advertised content-length exceeds the byte limit", async () => {
    const request = vi.fn(async () => fakeResponse({ headers: { "content-length": String(MAX_IMAGE_BYTES + 1) } }));
    await expect(downloadSafeImage("https://example.com/a.png", { lookup: publicLookup, request })).rejects.toThrow("image_too_large");
  });

  it("rejects a non-identity content-encoding, which could mask the real size", async () => {
    const request = vi.fn(async () => fakeResponse({ headers: { "content-encoding": "gzip" } }));
    await expect(downloadSafeImage("https://example.com/a.png", { lookup: publicLookup, request })).rejects.toThrow("image_too_large");
  });

  it("rejects a stream that exceeds the byte limit even without an honest content-length", async () => {
    async function* oversized() {
      yield Buffer.alloc(1024, 1);
      yield Buffer.alloc(1024, 1);
    }
    const request = vi.fn(async () => fakeResponse({ headers: { "content-length": undefined }, body: oversized() }));
    await expect(downloadSafeImage("https://example.com/a.png", { lookup: publicLookup, request, maxBytes: 1500 })).rejects.toThrow("image_too_large");
  });

  it("clamps a caller-provided maxBytes to the hard 10 MB ceiling", async () => {
    const request = vi.fn(async () => fakeResponse({ headers: { "content-length": String(MAX_IMAGE_BYTES + 1) } }));
    await expect(downloadSafeImage("https://example.com/a.png", { lookup: publicLookup, request, maxBytes: MAX_IMAGE_BYTES * 10 })).rejects.toThrow("image_too_large");
  });

  it("rejects an empty body", async () => {
    async function* empty() {}
    const request = vi.fn(async () => fakeResponse({ body: empty(), headers: { "content-length": "0" } }));
    await expect(downloadSafeImage("https://example.com/a.png", { lookup: publicLookup, request })).rejects.toThrow("image_empty");
  });

  it("aborts on timeout instead of hanging", async () => {
    const request = vi.fn(() => new Promise<ImageResponse>(() => {}));
    await expect(downloadSafeImage("https://example.com/a.png", { lookup: publicLookup, request, timeoutMs: 20 })).rejects.toThrow();
  });

  it("destroys the response even when a later validation step rejects it", async () => {
    const destroy = vi.fn();
    const request = vi.fn(async () => fakeResponse({ headers: { "content-type": "text/html" }, destroy }));
    await expect(downloadSafeImage("https://example.com/a.png", { lookup: publicLookup, request })).rejects.toThrow();
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});

describe("abortable", () => {
  it("rejects immediately if the signal is already aborted", () => {
    const controller = new AbortController();
    controller.abort(new Error("already-gone"));
    expect(() => abortable(new Promise(() => {}), controller.signal)).toThrow("already-gone");
  });

  it("rejects with the abort reason when the signal fires mid-flight", async () => {
    const controller = new AbortController();
    const never = new Promise(() => {});
    const result = abortable(never, controller.signal);
    controller.abort(new Error("cancelled"));
    await expect(result).rejects.toThrow("cancelled");
  });

  it("resolves normally when the work finishes before any abort", async () => {
    const controller = new AbortController();
    await expect(abortable(Promise.resolve("done"), controller.signal)).resolves.toBe("done");
  });
});
