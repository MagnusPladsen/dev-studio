import { ArrowLeftRight, Film, SquareDashed, ArrowRight, Box, CalendarRange, CirclePlay, Columns3, Copy, Download, GitPullRequestArrow, Hash, FileCode, FileText, FlipHorizontal2, FolderOpen, Gauge, Grid3X3, Image, Layers, LayoutGrid, LayoutTemplate, Link2, List, ListChecks, ListTodo, Maximize2, MessageSquare, MousePointer2, Music, Network, NotebookPen, PaintBucket, Paintbrush, Palette, Pencil, Piano, Pipette, Play, Rows3, Ruler, Scaling, Search, Shapes, Shuffle, SlidersHorizontal, Sparkles, SquareCheck, StickyNote, VolumeX, WandSparkles, Waypoints, type LucideIcon } from "lucide-react";
import { COPY, type HelpText } from "@/copy";
import { MENU_TIP, UNDO_TIP } from "@/copy/shared";

export type HelpTopic =
  | "assets"
  | "board"
  | "decisions"
  | "diagrams"
  | "dialogue"
  | "music"
  | "notebook"
  | "palettes"
  | "pixel-art"
  | "sfx"
  | "sprites"
  | "story"
  | "tilemap"
  | "voxels";

/** One thing a tool can do, with the icon the first-visit tutorial shows next to it. */
export interface HelpFeature {
  icon: LucideIcon;
  text: string;
}

export interface HelpContent {
  title: string;
  /** One sentence. */
  summary: string;
  /** 3-5 short bullets, most important first. */
  canDo: HelpFeature[];
  /** 3-4 quick-start steps. */
  steps: string[];
  /** 2-4 tips, keyboard shortcuts where real. */
  tips: string[];
}

/** Pairs a shared tool's per-app help text with its icons, one icon per `canDo` line. */
function withIcons(text: HelpText, icons: LucideIcon[]): HelpContent {
  return { ...text, canDo: text.canDo.map((line, index) => ({ icon: icons[index], text: line })) };
}

export const HELP: Record<HelpTopic, HelpContent> = {
  assets: withIcons(COPY.help.assets, [LayoutGrid, List, Search, Sparkles, Download]),
  board: withIcons(COPY.help.board, [ListTodo, Columns3, CalendarRange, Search, NotebookPen]),
  diagrams: withIcons(COPY.help.diagrams, [StickyNote, Shapes, ArrowRight, MousePointer2, CirclePlay]),
  dialogue: {
    title: "Dialogue Trees",
    summary: "Write branching conversations for your characters.",
    canDo: [
      { icon: Waypoints, text: "Build a tree from Start, Dialogue, Choice, Condition, Action and End nodes." },
      { icon: MessageSquare, text: "Give each line a speaker, and choices their own branches." },
      { icon: Play, text: "Play through a conversation with Preview." },
      { icon: FileCode, text: "Export as JSON or a Yarn Spinner script." },
    ],
    steps: [
      "Press New Dialogue to start a tree.",
      "Add nodes from the toolbar.",
      "Drag from a node's coloured dot to the next node to connect them.",
      "Double-click a node to edit its text, then press Preview.",
    ],
    tips: [
      "Select a node and press Delete to remove it.",
      "Drag empty space to pan; scroll or the buttons zoom.",
      UNDO_TIP,
      MENU_TIP,
    ],
  },
  music: {
    title: "Music Composer",
    summary: "Compose chiptune loops on a four-channel piano roll.",
    canDo: [
      { icon: Music, text: "Write notes for melody, harmony, bass and drums channels." },
      { icon: Piano, text: "Pick an instrument per channel: square, triangle, noise and more." },
      { icon: Gauge, text: "Set tempo (BPM), loop length and note length." },
      { icon: VolumeX, text: "Mute or solo channels while you listen." },
      { icon: Download, text: "Export the pattern as a WAV file." },
    ],
    steps: [
      "Press + to make a new track, or add the examples.",
      "Pick a channel, then click the grid to place a note.",
      "Drag in any direction to draw a run of notes; Note length sets how long each one is.",
      "Press Play, turn on Loop, and keep tweaking.",
    ],
    tips: [
      "Click a note again to remove it, or start a drag on a note to erase along the way.",
      "Ctrl/⌘ + scroll zooms time; add Shift to zoom pitch.",
      UNDO_TIP,
    ],
  },
  decisions: withIcons(COPY.help.decisions, [Hash, FileText, GitPullRequestArrow, Link2, Download]),
  notebook: withIcons(COPY.help.notebook, [FileText, ListChecks, FolderOpen, Link2, LayoutTemplate]),
  palettes: {
    title: "Palettes",
    summary: "Keep your game's colours in one place and reuse them.",
    canDo: [
      { icon: Palette, text: "Make your own palettes or start from a preset copy." },
      { icon: Pipette, text: "Add colours with a picker or a hex code." },
      { icon: Copy, text: "Click a swatch to copy its hex code." },
      { icon: Paintbrush, text: "Open Pixel Art with a palette loaded." },
      { icon: Download, text: "Export as a .txt hex list or a GIMP .gpl palette." },
    ],
    steps: [
      "Press + for a new palette, or click a preset.",
      "Pick a colour and press Add Color.",
      "Hover a swatch and press × to remove it.",
      "Press Use in Pixel Art to draw with it.",
    ],
    tips: [
      ".gpl files open in GIMP, Aseprite, Krita and Inkscape.",
      UNDO_TIP,
      MENU_TIP,
    ],
  },
  "pixel-art": {
    title: "Pixel Art",
    summary: "Draw sprites and animate them frame by frame.",
    canDo: [
      { icon: Pencil, text: "Draw with pencil, eraser, fill, line, rectangle, circle and move tools." },
      { icon: Layers, text: "Use layers, and frames for animation with onion skin." },
      { icon: Play, text: "Play the animation and set its speed (fps)." },
      { icon: Scaling, text: "Resize the canvas, scale a sprite up (8×8 → 16×16 and more) or swap in a project palette." },
      { icon: Download, text: "Export a PNG, a sprite sheet or an animated GIF." },
    ],
    steps: [
      "Press New sprite and pick a size.",
      "Choose a tool and a colour, then draw on the canvas.",
      "Add or duplicate a frame to make the next pose.",
      "Press Play to watch it move.",
    ],
    tips: [
      "Keys: B pencil, E eraser, G fill, L line, R rectangle, O circle, I picker, M move.",
      "Scroll over the canvas to zoom.",
      "To make a sprite bigger without redrawing it, open the Canvas menu and use Scale up.",
      UNDO_TIP,
      "Right-click a frame to duplicate, move or copy it as PNG.",
    ],
  },
  sfx: {
    title: "SFX Generator",
    summary: "Make retro sound effects with a few clicks.",
    canDo: [
      { icon: WandSparkles, text: "Generate sounds like Jump, Coin, Laser, Explosion and Hit." },
      { icon: Shuffle, text: "Randomise a sound, or Mutate it a little." },
      { icon: SlidersHorizontal, text: "Fine-tune wave type, pitch, length and more with sliders." },
      { icon: Download, text: "Keep sounds in your project and export them as WAV." },
    ],
    steps: [
      "Click a generator, for example Jump. Each click makes a new variant.",
      "Press Play to hear it, and Mutate to nudge it.",
      "Name it and press Keep this sound.",
      "Export it as WAV for your game.",
    ],
    tips: [
      "Once kept, every change saves by itself.",
      "Ctrl/⌘+Z undoes, Ctrl/⌘+Shift+Z redoes.",
      MENU_TIP,
    ],
  },
  sprites: {
    title: "Sprite Sheets",
    summary: "Pack your sprites into one image for your game engine.",
    canDo: [
      { icon: SquareCheck, text: "Pick which sprites go on a sheet." },
      { icon: Rows3, text: "Each sprite gets a row, with its frames left to right." },
      { icon: Ruler, text: "Set padding between frames." },
      { icon: Download, text: "Export the sheet as PNG plus an atlas JSON of frame positions." },
      { icon: Maximize2, text: "Export at 2×, 3× or 4× size, sharp or smooth; the atlas scales with it." },
    ],
    steps: [
      "Draw some sprites in Pixel Art first.",
      "Press New sprite sheet.",
      "Tick the sprites to include on the left.",
      "Export the PNG and the atlas JSON.",
    ],
    tips: [
      "Add padding if your engine shows lines between frames.",
      UNDO_TIP,
      MENU_TIP,
    ],
  },
  story: withIcons(COPY.help.story, [FileText, Link2, ArrowLeftRight, Network]),
  tilemap: {
    title: "Tilemap",
    summary: "Paint game levels with your own sprites as tiles.",
    canDo: [
      { icon: Grid3X3, text: "Paint with your project sprites or basic colour tiles." },
      { icon: PaintBucket, text: "Paint, fill an area or erase." },
      { icon: Layers, text: "Stack layers, hide them and change their order." },
      { icon: Shapes, text: "Auto-tile with terrains, and mark solid or one-way collision." },
      { icon: Download, text: "Export a PNG of the map or Tiled-style JSON with collision." },
    ],
    steps: [
      "Press + and set the map's width and height in tiles.",
      "Pick a sprite or colour on the left.",
      "Click or drag on the map to paint.",
      "Add a layer for things that sit on top, like trees.",
      "For auto-tiling, add a terrain, give its slots tiles, then pick it and paint.",
      "Pick the collision tool to mark where players can stand.",
    ],
    tips: [
      "Draw tiles in Pixel Art and they show up here.",
      UNDO_TIP,
      MENU_TIP,
    ],
  },
  voxels: {
    title: "3D Pixel Art",
    summary: "Pixel art with depth: stack coloured cubes into 3D models (also called voxel art).",
    canDo: [
      { icon: Box, text: "Add, erase and paint cubes, fill faces and draw boxes." },
      { icon: Layers, text: "Draw one flat layer at a time in Slice view, like Pixel Art." },
      { icon: SquareDashed, text: "Select cubes to move, copy, rotate or flip them; mirror edits across X, Y or Z." },
      { icon: Image, text: "Turn a sprite into a 3D model, 1–8 cubes deep, flat or puffy." },
      { icon: Film, text: "Render it as 2D sprites (1, 4 or 8 directions) or a turntable GIF; export .glb, OBJ, .vox or PNG." },
    ],
    steps: [
      "Press New model, or make one from a sprite.",
      "Pick a colour and the Add tool, then click to place cubes.",
      "Right-drag to turn the view, scroll to zoom.",
      "Export it for Blender, Godot, Unity or the web.",
    ],
    tips: [
      "Keys: B add, E erase, P paint, I picker, G fill, R box, V select.",
      "Slice view: switch with 3D / Slice; [ and ] change layer.",
      "Selection: arrows move it (Page Up/Down for up/down in 3D); Ctrl/⌘+C, X, V copy, cut, paste; Ctrl/⌘+D duplicates; Delete removes; Esc deselects.",
      "Box tool: arrow keys change height, Enter places, Esc cancels.",
      "On a phone, two fingers turn and zoom, or turn on Orbit.",
      UNDO_TIP,
    ],
  },
};
