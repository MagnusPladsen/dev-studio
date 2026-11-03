import { Circle, Diamond, Hexagon, Square } from "lucide-react";
import { diamondOutline, hexagonOutline, roundedRectOutline } from "@/lib/diagrams/shapes";
import { defineOutlineShape } from "./define";

const FLOW_SIZE = { width: 140, height: 56 };
/** The flow-chart Condition diamond pokes out a little so its label fits; the plain Diamond doesn't. */
const CONDITION_OVERHANG = 4;

export const FLOW_SHAPES = [
  defineOutlineShape({
    type: "state",
    label: "State",
    defaultLabel: "State",
    icon: Circle,
    color: "#60a5fa",
    size: FLOW_SIZE,
    shapeStyle: "flow",
    outline: (r) => roundedRectOutline(r, 12),
    library: { section: "flow", keywords: ["status", "mode", "state machine"] },
  }),
  defineOutlineShape({
    type: "action",
    label: "Action",
    defaultLabel: "Action",
    icon: Square,
    color: "#34d399",
    size: FLOW_SIZE,
    shapeStyle: "flow",
    outline: (r) => roundedRectOutline(r, 4),
    library: { section: "flow", keywords: ["step", "process", "task"] },
  }),
  defineOutlineShape({
    type: "condition",
    label: "Condition",
    defaultLabel: "Condition",
    icon: Diamond,
    color: "#fbbf24",
    size: FLOW_SIZE,
    shapeStyle: "flow",
    outline: (r) => diamondOutline(r, CONDITION_OVERHANG),
    library: { section: "flow", keywords: ["decision", "if", "branch", "question"] },
  }),
  defineOutlineShape({
    type: "event",
    label: "Event",
    defaultLabel: "Event",
    icon: Hexagon,
    color: "#f472b6",
    size: FLOW_SIZE,
    shapeStyle: "flow",
    outline: hexagonOutline,
    library: { section: "flow", keywords: ["trigger", "signal", "start", "input", "hexagon"] },
  }),
  defineOutlineShape({
    type: "custom",
    label: "Custom",
    defaultLabel: "Custom",
    icon: Square,
    color: "#7c5cfc",
    size: FLOW_SIZE,
    shapeStyle: "flow",
    outline: (r) => roundedRectOutline(r, 4),
  }),
];
