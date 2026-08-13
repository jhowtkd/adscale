import "server-only";

import { createWriteStream, type WriteStream } from "node:fs";
import { once } from "node:events";
import { Readable } from "node:stream";
import { crc32, createDeflateRaw } from "node:zlib";
import type { LayerizationLayer } from "./contracts";

const LOCAL_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const CENTRAL_HEADER = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
const DATA_DESCRIPTOR = Buffer.from([0x50, 0x4b, 0x07, 0x08]);
const END_HEADER = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
const DATA_DESCRIPTOR_FLAG = 0x0008;
const CHUNK_SIZE = 64 * 1024;

function u16(value: number): Buffer {
  const buffer = Buffer.allocUnsafe(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function u32(value: number): Buffer {
  const buffer = Buffer.allocUnsafe(4);
  buffer.writeUInt32LE(value);
  return buffer;
}

async function writeAll(stream: WriteStream, chunk: Buffer): Promise<void> {
  if (!stream.write(chunk)) await once(stream, "drain");
}

function yieldEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

type ZipEntry = {
  name: string;
  crc: number;
  compressedSize: number;
  uncompressedSize: number;
  offset: number;
};

async function appendZipFile(
  stream: WriteStream,
  name: string,
  data: Buffer,
  offset: number,
): Promise<ZipEntry> {
  const nameBytes = Buffer.from(name, "utf8");
  await writeAll(stream, Buffer.concat([
    LOCAL_HEADER,
    u16(20),
    u16(DATA_DESCRIPTOR_FLAG),
    u16(8),
    u16(0),
    u16(0),
    u32(0),
    u32(0),
    u32(0),
    u16(nameBytes.length),
    u16(0),
    nameBytes,
  ]));

  const deflate = createDeflateRaw();
  let compressedSize = 0;
  let crc = crc32(Buffer.alloc(0));
  const consume = (async () => {
    for await (const chunk of Readable.from(deflate)) {
      const output = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      compressedSize += output.length;
      await writeAll(stream, output);
    }
  })();
  for (let index = 0; index < data.length; index += CHUNK_SIZE) {
    const slice = data.subarray(index, Math.min(index + CHUNK_SIZE, data.length));
    crc = crc32(slice, crc);
    if (!deflate.write(slice)) await once(deflate, "drain");
    await yieldEventLoop();
  }
  deflate.end();
  await consume;
  await writeAll(stream, Buffer.concat([
    DATA_DESCRIPTOR,
    u32(crc),
    u32(compressedSize),
    u32(data.length),
  ]));
  return {
    name,
    crc,
    compressedSize,
    uncompressedSize: data.length,
    offset,
  };
}

function directoryRecord(entry: ZipEntry): Buffer {
  const nameBytes = Buffer.from(entry.name, "utf8");
  return Buffer.concat([
    CENTRAL_HEADER,
    u16(20),
    u16(20),
    u16(DATA_DESCRIPTOR_FLAG),
    u16(8),
    u16(0),
    u16(0),
    u32(entry.crc),
    u32(entry.compressedSize),
    u32(entry.uncompressedSize),
    u16(nameBytes.length),
    u16(0),
    u16(0),
    u16(0),
    u16(0),
    u32(0),
    u32(entry.offset),
    nameBytes,
  ]);
}

function safeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "layer";
}

function closeZipStream(stream: WriteStream): void {
  if (!stream.destroyed && !stream.closed) stream.destroy();
}

export async function writeLayerizationDiagnosticZipFile(input: {
  filePath: string;
  loadOriginal: () => Promise<Buffer>;
  loadRecomposed: () => Promise<Buffer>;
  layers: LayerizationLayer[];
  loadLayer: (layer: LayerizationLayer) => Promise<Buffer>;
  manifest: Record<string, unknown>;
}): Promise<void> {
  const stream = createWriteStream(input.filePath);
  const failed = new Promise<never>((_, reject) => {
    stream.once("error", reject);
  });
  const entries: ZipEntry[] = [];
  let offset = 0;
  try {
    const writeArchive = async () => {
      const write = async (name: string, data: Buffer) => {
        const entry = await appendZipFile(stream, name, data, offset);
        offset += 30 + Buffer.byteLength(name) + entry.compressedSize + 16;
        entries.push(entry);
      };
      await write("original.png", await input.loadOriginal());
      await write("recomposed-preview.png", await input.loadRecomposed());
      for (const layer of [...input.layers].sort((left, right) => left.order - right.order)) {
        await write(
          `layers/${String(layer.order).padStart(2, "0")}-${safeName(layer.name)}.png`,
          await input.loadLayer(layer),
        );
      }
      await write("manifest.json", Buffer.from(`${JSON.stringify(input.manifest, null, 2)}\n`));
      const central = Buffer.concat(entries.map(directoryRecord));
      await writeAll(stream, Buffer.concat([
        central,
        END_HEADER,
        u16(0),
        u16(0),
        u16(entries.length),
        u16(entries.length),
        u32(central.length),
        u32(offset),
        u16(0),
      ]));
      stream.end();
      await once(stream, "finish");
    };
    await Promise.race([writeArchive(), failed]);
  } catch (error) {
    closeZipStream(stream);
    throw error;
  }
}
