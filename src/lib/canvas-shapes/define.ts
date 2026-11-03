import type { ShapeDefinition } from "./types";
import { drawShape } from "@/lib/diagrams/png-cards";
import { shapeSvg } from "@/lib/diagrams/svg-cards";

type RequiredField = "type" | "label" | "icon" | "color" | "size" | "body" | "toSvg" | "drawPng";
export type ShapeFields = Pick<ShapeDefinition, RequiredField> & Partial<Omit<ShapeDefinition, RequiredField>>;

/** Fills in the usual answers, so each definition only states what makes its shape different. */
export function defineShape(fields: ShapeFields): ShapeDefinition {
  return {
    minSize: { width: 80, height: 40 },
    defaultLabel: "",
    isAutoHeight: false,
    layer: "front",
    isContainer: false,
    canEditText: true,
    canLinkAsset: false,
    placement: "place",
    ...fields,
  };
}

/** A card drawn as an outline with a centred label, on the board and in both exports. */
export function defineOutlineShape(
  fields: Omit<ShapeFields, "body" | "toSvg" | "drawPng"> & Required<Pick<ShapeDefinition, "outline" | "shapeStyle">>
): ShapeDefinition {
  const shape: ShapeDefinition = defineShape({
    canLinkAsset: true,
    labelInset: "px-3",
    ...fields,
    body: "shape",
    toSvg: (node, r) => shapeSvg(node, r, shape),
    drawPng: (ctx, node, r) => drawShape(ctx, node, r, shape),
  });
  return shape;
}
