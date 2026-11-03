import { Circle, Diamond, RectangleHorizontal } from "lucide-react";
import { diamondOutline, ellipseOutline, roundedRectOutline } from "@/lib/diagrams/shapes";
import { defineOutlineShape } from "./define";

const SHAPE_COLOR = "#a0a0b8";

export const BASIC_SHAPES = [
  defineOutlineShape({
    type: "rectangle",
    label: "Rectangle",
    icon: RectangleHorizontal,
    color: SHAPE_COLOR,
    size: { width: 160, height: 100 },
    shapeStyle: "basic",
    outline: (r) => roundedRectOutline(r, 8),
    library: { section: "shapes", hint: "Box with text, any size", keywords: ["box", "square", "block"] },
  }),
  defineOutlineShape({
    type: "ellipse",
    label: "Ellipse",
    icon: Circle,
    color: SHAPE_COLOR,
    size: { width: 160, height: 100 },
    shapeStyle: "basic",
    labelInset: "px-[12%]",
    outline: ellipseOutline,
    library: { section: "shapes", hint: "Circle or oval with text", keywords: ["circle", "oval", "round"] },
  }),
  defineOutlineShape({
    type: "diamond",
    label: "Diamond",
    icon: Diamond,
    color: SHAPE_COLOR,
    size: { width: 160, height: 110 },
    shapeStyle: "basic",
    labelInset: "px-[22%]",
    outline: (r) => diamondOutline(r),
    library: { section: "shapes", hint: "Diamond with text", keywords: ["rhombus", "decision"] },
  }),
];
