import { z } from "zod";
import { projectRow } from "./common";
import { assetRefSchema } from "./projects";

export const linkSchema = z.looseObject({
  ...projectRow,
  from: assetRefSchema,
  to: assetRefSchema,
});
