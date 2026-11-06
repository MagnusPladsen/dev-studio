import type { Sprite, TilemapData } from "@/types";
import { loadImage, spriteFrameSrc } from "@/lib/pixels";
import { BASIC_TILES } from "@/lib/tilemap/tiled-export";
import { COLLISION } from "@/lib/tilemap/collision";
import { buildTileAtlas, cellCoords, layerCells, type AtlasCell, type TileAtlas } from "./tile-atlas";
import type { TilemapExport } from "./types";

/** Browser-only: draws the PNGs the engine exports put in their zips. */

export async function canvasPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not encode the PNG");
  return new Uint8Array(await blob.arrayBuffer());
}

function makeCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

/** Solid: a red box; one-way: a blue band along the top, as the editor's collision overlay shows them. */
function drawCollisionTile(ctx: CanvasRenderingContext2D, value: number, x: number, y: number, size: number) {
  if (value === COLLISION.oneWay) {
    ctx.fillStyle = "rgba(56,189,248,0.85)";
    ctx.fillRect(x, y, size, Math.max(2, size / 4));
    return;
  }
  ctx.fillStyle = "rgba(239,68,68,0.35)";
  ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = "rgba(239,68,68,0.9)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
}

async function drawCell(ctx: CanvasRenderingContext2D, cell: AtlasCell, x: number, y: number, size: number, spriteById: Map<string, Sprite>) {
  const source = cell.source;
  if (source.kind === "collision") return drawCollisionTile(ctx, source.value, x, y, size);
  if (typeof source.tile === "number") {
    ctx.fillStyle = BASIC_TILES[source.tile % BASIC_TILES.length];
    ctx.fillRect(x, y, size, size);
    return;
  }
  const sprite = spriteById.get(source.tile);
  const src = sprite && spriteFrameSrc(sprite, 0);
  // a tile whose sprite was deleted stays empty, as the map leaves it blank in the editor
  const image = src ? await loadImage(src).catch(() => null) : null;
  if (image) ctx.drawImage(image, x, y, size, size);
}

async function drawAtlas(atlas: TileAtlas, spriteById: Map<string, Sprite>): Promise<HTMLCanvasElement> {
  const size = atlas.tileSize;
  const { canvas, ctx } = makeCanvas(atlas.columns * size, atlas.rows * size);
  for (const [index, cell] of atlas.cells.entries()) {
    const { x, y } = cellCoords(atlas, index);
    await drawCell(ctx, cell, x * size, y * size, size, spriteById);
  }
  return canvas;
}

/** The visible layers, drawn from the atlas so the map picture matches the exported tiles exactly. */
function drawMap(tilemap: TilemapData, atlas: TileAtlas, atlasCanvas: HTMLCanvasElement): HTMLCanvasElement {
  const size = atlas.tileSize;
  const { canvas, ctx } = makeCanvas(tilemap.width * size, tilemap.height * size);
  tilemap.layers.forEach((layer, layerIndex) => {
    if (!layer.visible) return;
    layerCells(tilemap, atlas, layerIndex).forEach((row, y) =>
      row.forEach((cell, x) => {
        if (cell === null) return;
        const from = cellCoords(atlas, cell);
        ctx.drawImage(atlasCanvas, from.x * size, from.y * size, size, size, x * size, y * size, size, size);
      })
    );
  });
  return canvas;
}

export async function renderTilemapExport(tilemap: TilemapData, spriteById: Map<string, Sprite>): Promise<TilemapExport> {
  const atlas = buildTileAtlas(tilemap);
  const atlasCanvas = await drawAtlas(atlas, spriteById);
  return { tilemap, atlas, atlasPng: await canvasPng(atlasCanvas), mapPng: await canvasPng(drawMap(tilemap, atlas, atlasCanvas)) };
}
