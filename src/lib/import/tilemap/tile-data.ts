import { ImportError } from "../types";

export type TileEncoding = "csv" | "base64" | undefined;

/** Reads a layer's or chunk's tile ids however Tiled stored them: plain numbers, CSV, or base64 (optionally zlib/gzip). */
export async function decodeTileData(data: unknown, encoding: TileEncoding, compression: string | undefined, layerName: string): Promise<number[]> {
  if (Array.isArray(data)) return data.map((gid) => Number(gid) >>> 0);
  if (typeof data !== "string") throw new ImportError(`Layer "${layerName}" has no tile data.`);
  if (encoding === "csv") return data.split(",").map((gid) => gid.trim()).filter(Boolean).map((gid) => Number(gid) >>> 0);
  if (encoding !== "base64") throw new ImportError(`Layer "${layerName}" uses an unknown tile encoding.`);
  const bytes = await decompress(base64Bytes(data.trim(), layerName), compression, layerName);
  if (bytes.length % 4 !== 0) throw new ImportError(`Layer "${layerName}" has damaged tile data.`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Array.from({ length: bytes.length / 4 }, (_, i) => view.getUint32(i * 4, true));
}

function base64Bytes(text: string, layerName: string): Uint8Array {
  try {
    return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
  } catch {
    throw new ImportError(`Layer "${layerName}" has damaged tile data.`);
  }
}

async function decompress(bytes: Uint8Array, compression: string | undefined, layerName: string): Promise<Uint8Array> {
  if (!compression) return bytes;
  if (compression === "zstd") throw new ImportError(`Layer "${layerName}" is compressed with Zstandard. Save the map with zlib, gzip or no compression in Tiled.`);
  if (compression !== "zlib" && compression !== "gzip") throw new ImportError(`Layer "${layerName}" uses an unknown compression ("${compression}").`);
  try {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream(compression === "zlib" ? "deflate" : "gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    throw new ImportError(`Layer "${layerName}" has damaged ${compression} data.`);
  }
}

/** Tiled keeps flips in the top bits of each tile id: horizontal, vertical, diagonal and hexagonal rotation. */
const FLAG_BITS = 0xf0000000;

export const tileIdOf = (gid: number): number => (gid & ~FLAG_BITS) >>> 0;
export const isFlipped = (gid: number): boolean => (gid & FLAG_BITS) !== 0;
