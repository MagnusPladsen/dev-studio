import { z } from "zod";
import { id, projectRow, projectRowMaybeUpdated, tags } from "./common";

/** Art is read-only for the MCP (it may rename, tag and link it), so these check shape, not pixel content. */

const spriteFrameSchema = z.looseObject({
  id,
  pixels: z.string(),
  duration: z.number(),
  layers: z.array(z.looseObject({ id, name: z.string(), visible: z.boolean(), pixels: z.string() })).optional(),
});

export const spriteSchema = z.looseObject({
  ...projectRow,
  name: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  frames: z.array(spriteFrameSchema).min(1),
  fps: z.number(),
  hasFrameDurations: z.boolean().optional(),
  frameTags: z
    .array(z.looseObject({ id, name: z.string(), from: z.number().int(), to: z.number().int(), color: z.string(), direction: z.enum(["forward", "reverse", "pingpong"]) }))
    .optional(),
  paletteId: z.string().optional(),
  tags,
});

export const paletteSchema = z.looseObject({
  ...projectRowMaybeUpdated,
  name: z.string(),
  colors: z.array(z.string()),
  tags: tags.optional(),
});

export const spriteSheetSchema = z.looseObject({
  ...projectRowMaybeUpdated,
  name: z.string(),
  spriteIds: z.array(z.string()),
  padding: z.number(),
  powerOfTwo: z.boolean(),
  tags: tags.optional(),
});

export const tilemapSchema = z.looseObject({
  ...projectRow,
  name: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  tileSize: z.number().positive(),
  layers: z.array(z.looseObject({ id, name: z.string(), visible: z.boolean(), tiles: z.array(z.array(z.union([z.number(), z.string(), z.null()]))) })),
  tilesetSpriteIds: z.array(z.string()),
  terrains: z
    .array(z.looseObject({ id, name: z.string(), kind: z.enum(["edge16", "blob47"]), tiles: z.record(z.string(), z.union([z.number(), z.string()])) }))
    .optional(),
  collision: z.array(z.array(z.number())).optional(),
  tags,
});

export const voxelModelSchema = z.looseObject({
  ...projectRow,
  name: z.string(),
  size: z.tuple([z.number().int().positive(), z.number().int().positive(), z.number().int().positive()]),
  paletteId: z.string().optional(),
  colors: z.array(z.string()),
  voxels: z.string(),
  thumbnail: z.string().optional(),
  tags,
});
