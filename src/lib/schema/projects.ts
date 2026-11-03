import { z } from "zod";
import { assetType, id, timestamp } from "./common";

export const assetRefSchema = z.looseObject({
  type: assetType,
  id,
  /** One canvas element, when the ref points inside a diagram. */
  elementId: z.string().min(1).optional(),
});

export const projectSchema = z.looseObject({
  id,
  name: z.string(),
  description: z.string(),
  thumbnail: z.string().optional(),
  pins: z.looseObject({ tools: z.array(z.string()), assets: z.array(assetRefSchema) }).optional(),
  showTutorials: z.boolean().optional(),
  app: z.enum(["gamedev-studio", "dev-studio"]).optional(),
  createdAt: timestamp,
  updatedAt: timestamp,
  example: z.boolean().optional(),
});
