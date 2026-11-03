import {
  Box,
  BookOpen,
  GitBranch,
  Grid3X3,
  MessageSquare,
  Music,
  NotebookPen,
  Package,
  Paintbrush,
  Palette,
  Scale,
  SquareKanban,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import type { AssetType } from "@/types";

export const ASSET_ICONS: Record<AssetType, LucideIcon> = {
  sprite: Paintbrush,
  music: Music,
  sound: Volume2,
  tilemap: Grid3X3,
  diagram: GitBranch,
  story: BookOpen,
  dialogue: MessageSquare,
  palette: Palette,
  spritesheet: Package,
  note: NotebookPen,
  issue: SquareKanban,
  model: Box,
  decision: Scale,
};
