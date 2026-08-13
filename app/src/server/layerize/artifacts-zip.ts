import "server-only";

import { createWriteStream } from "node:fs";
import { once } from "node:events";
import { deflateRawSync } from "node:zlib";
import type { LayerizationLayer } from "./contracts";

const LOCAL_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const CENTRAL_HEADER = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
const END_HEADER = Buffer.from([0x50, 0x4b, 0x05, 0x06]);

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (let index = 0; index < buffer.length; index += 1) {
    crc ^= buffer[index];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

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

type ZipEntry = {
  name: string;
  crc: number;
  compressedSize: number;
  uncompressedSize: number;
  offset: number;
};

async function appendZipFile(
  stream: NodeJS.WritableStream,
  name: string,
  data: Buffer,
  offset: number,
): Promise<ZipEntry> {
  const compressed = deflateRawSync(data);
  const crc = crc32(data);
  const nameBytes = Buffer.from(name, "utf8");
  const local = Buffer.concat([
    LOCAL_HEADER,
    u16(20),
    u16(0),
    u16(8),
    u16(0),
    u16(0),
    u32(crc),
    u32(compressed.length),
    u32(data.length),
    u16(nameBytes.length),
    u16(0),
    nameBytes,
    compressed,
  ]);
  if (!stream.write(local)) await once(stream, "drain");
  return {
    name,
    crc,
    compressedSize: compressed.length,
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
    u16(0),
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

export async function writeLayerizationDiagnosticZipFile(input: {
  filePath: string;
  original: Buffer;
  recomposed: Buffer;
  layers: LayerizationLayer[];
  loadLayer: (layer: LayerizationLayer) => Promise<Buffer>;
  manifest: Record<string, unknown>;
}): Promise<void> {
  const stream = createWriteStream(input.filePath);
  const entries: ZipEntry[] = [];
  let offset = 0;
  const write = async (name: string, data: Buffer) => {
    const entry = await appendZipFile(stream, name, data, offset);
    offset += 30 + Buffer.byteLength(name) + entry.compressedSize;
    entries.push(entry);
  };
  await write("original.png", input.original);
  await write("recomposed-preview.png", input.recomposed);
  for (const layer of [...input.layers].sort((left, right) => left.order - right.order)) {
    await write(
      `layers/${String(layer.order).padStart(2, "0")}-${safeName(layer.name)}.png`,
      await input.loadLayer(layer),
    );
  }
  await write("manifest.json", Buffer.from(`${JSON.stringify(input.manifest, null, 2)}\n`));
  const central = Buffer.concat(entries.map(directoryRecord));
  const end = Buffer.concat([
    END_HEADER,
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(central.length),
    u32(offset),
    u16(0),
  ]);
  if (!stream.write(Buffer.concat([central, end]))) await once(stream, "drain");
  stream.end();
  await once(stream, "finish");
}
