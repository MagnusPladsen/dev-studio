"use client";

import { Download } from "lucide-react";
import { ToolbarMenu, type ToolbarMenuItem } from "./ToolbarMenu";

export type ExportItem = ToolbarMenuItem;

/** The one "Export ▾" button every editor uses, always at the right of its toolbar. */
export function ExportMenu({ items, disabled, label = "Export", options }: { items: ExportItem[]; disabled?: boolean; label?: string; options?: React.ReactNode }) {
  return (
    <ToolbarMenu
      icon={Download}
      label={label}
      title="Download this asset. Free, no watermark."
      items={items}
      disabled={disabled}
      footer="Free to use, no watermark."
      header={options}
    />
  );
}
