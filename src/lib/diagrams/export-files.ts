import type { Diagram } from "@/types";
import { downloadBlob } from "@/lib/download";
import { renderDiagramPng, type RenderInput } from "./render-png";
import { renderDiagramSvg } from "./render-svg";

function fileName(diagram: Diagram, extension: string): string {
  return `${diagram.name || "canvas"}.${extension}`;
}

export async function exportPng(input: RenderInput): Promise<void> {
  const canvas = await renderDiagramPng(input);
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = fileName(input.diagram, "png");
  link.click();
}

export function exportSvg(input: RenderInput): void {
  downloadBlob(fileName(input.diagram, "svg"), new Blob([renderDiagramSvg(input)], { type: "image/svg+xml" }));
}

export function exportJson(diagram: Diagram): void {
  downloadBlob(fileName(diagram, "canvas.json"), new Blob([JSON.stringify(diagram, null, 2)], { type: "application/json" }));
}
