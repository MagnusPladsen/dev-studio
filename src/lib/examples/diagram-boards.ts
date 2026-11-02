import type { AssetRef, DiagramEdge, DiagramNode } from "@/types";
import { linkCardSize } from "@/lib/diagrams/cards";
import type { ExampleContext } from "./types";

// Milanote-style example boards for Diagrams: a moodboard and a level plan for "Pip's Quest".
// The pictures are tiny hand-made pixel SVGs built from the Mossbrook Meadow palette.

const MEADOW = ["#1b1f2a", "#cfefff", "#8fd3ff", "#f4f7ff", "#7ac74f", "#4f9d3a", "#2f6b2e", "#a9744f", "#6b4430", "#8b8f98", "#3a8fd9", "#235a9c", "#f6c445"];

type Pixel = [x: number, y: number, w: number, h: number, color: string];

function pixelSvg(width: number, height: number, pixels: Pixel[]): string {
  const rects = pixels.map(([x, y, w, h, fill]) => `<rect x='${x}' y='${y}' width='${w}' height='${h}' fill='${fill}'/>`).join("");
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${width} ${height}' shape-rendering='crispEdges'>${rects}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const MEADOW_SCENE = pixelSvg(32, 18, [
  [0, 0, 32, 18, "#8fd3ff"],
  [0, 0, 32, 4, "#cfefff"],
  [25, 2, 3, 3, "#f6c445"],
  [5, 3, 6, 2, "#f4f7ff"],
  [6, 2, 3, 1, "#f4f7ff"],
  [16, 5, 4, 1, "#f4f7ff"],
  [0, 9, 9, 3, "#4f9d3a"],
  [2, 8, 5, 1, "#4f9d3a"],
  [22, 8, 10, 4, "#2f6b2e"],
  [24, 7, 6, 1, "#2f6b2e"],
  [0, 11, 32, 7, "#4f9d3a"],
  [0, 11, 32, 1, "#7ac74f"],
  [0, 14, 32, 4, "#a9744f"],
  [0, 16, 32, 2, "#6b4430"],
  [18, 11, 6, 4, "#3a8fd9"],
  [18, 13, 6, 2, "#235a9c"],
  [10, 9, 2, 2, "#f4f7ff"],
  [10, 10, 1, 1, "#1b1f2a"],
  [14, 7, 1, 1, "#f6c445"],
  [16, 6, 1, 1, "#f6c445"],
  [27, 10, 2, 1, "#7ac74f"],
  [27, 9, 2, 1, "#4f9d3a"],
  [6, 12, 1, 1, "#8b8f98"],
]);

const PALETTE_STRIP = pixelSvg(MEADOW.length, 2, MEADOW.map((color, i): Pixel => [i, 0, 1, 2, color]));

const LEVEL_SKETCH = pixelSvg(24, 10, [
  [0, 0, 24, 10, "#cfefff"],
  [0, 7, 9, 3, "#7ac74f"],
  [9, 8, 4, 2, "#3a8fd9"],
  [13, 7, 5, 3, "#7ac74f"],
  [18, 5, 6, 5, "#4f9d3a"],
  [18, 5, 6, 1, "#7ac74f"],
  [1, 5, 1, 2, "#1b1f2a"],
  [6, 6, 1, 1, "#4f9d3a"],
  [9, 5, 1, 1, "#f6c445"],
  [11, 4, 1, 1, "#f6c445"],
  [13, 5, 1, 1, "#f6c445"],
  [15, 6, 1, 1, "#4f9d3a"],
  [22, 2, 1, 3, "#1b1f2a"],
  [23, 2, 1, 1, "#f87171"],
]);

type Extra = Partial<DiagramNode>;

function card(id: string, type: DiagramNode["type"], x: number, y: number, width: number, height: number, label = "", extra: Extra = {}): DiagramNode {
  return { id, type, x, y, width, height, label, ...extra };
}

const note = (id: string, x: number, y: number, width: number, text: string, color?: string) =>
  card(id, "note", x, y, width, 60, text, color ? { color } : {});

const image = (id: string, x: number, y: number, width: number, src: string, aspect: number, caption = "") =>
  card(id, "image", x, y, width, Math.round(width / aspect), caption, { data: { src, aspect } });

const assetCard = (id: string, x: number, y: number, label: string, asset: AssetRef) =>
  card(id, "asset", x, y, 220, 64, label, { data: { asset } });

function link(id: string, x: number, y: number, url: string, preview: Record<string, string>) {
  const { width, height } = linkCardSize(url);
  return card(id, "link", x, y, width, height, "", { data: { url, preview } });
}

function checklist(id: string, x: number, y: number, title: string, items: [string, boolean][]) {
  return card(id, "checklist", x, y, 240, 160, title, {
    data: { items: items.map(([text, done], i) => ({ id: `${id}-${i + 1}`, text, done })) },
  });
}

const edge = (id: string, from: string, to: string, label = "", type: DiagramEdge["type"] = "arrow"): DiagramEdge => ({ id, from, to, label, type });

function moodboard({ id }: ExampleContext) {
  return {
    id: id("pip-moodboard"),
    name: "Pip's Quest Moodboard",
    nodes: [
      card("look", "group", 40, 40, 620, 470, "Look & feel", { color: "#4ade80" }),
      card("sound", "group", 690, 40, 340, 470, "Sound & music", { color: "#60a5fa" }),
      image("scene", 56, 80, 300, MEADOW_SCENE, 32 / 18, "Mossbrook Meadow mood: soft sky, chunky hills"),
      image("strip", 376, 80, 268, PALETTE_STRIP, MEADOW.length / 2, "13 colours, nothing else"),
      note("style", 376, 170, 268, "Bright and cozy. Readable at 16×16: thick dark outlines, flat colours, no gradients."),
      assetCard("pip", 56, 330, "Pip", { type: "sprite", id: id("hero") }),
      assetCard("palette", 56, 410, "Mossbrook Meadow", { type: "palette", id: id("meadow-palette") }),
      assetCard("model", 376, 330, "Pip (3D)", { type: "model", id: id("hero-3d") }),
      link("ost", 706, 80, "https://open.spotify.com/album/1ZfETfec0U02KrKNI8w3Gf", {
        title: "Celeste (Original Soundtrack)",
        description: "Lena Raine",
        image: "https://image-cdn-fa.spotifycdn.com/image/ab67616d00001e02b351fafcb334009c3216a039",
        siteName: "Spotify",
      }),
      assetCard("theme", 706, 410, "Title Theme", { type: "music", id: id("title-theme") }),
      link("gmtk", 1070, 40, "https://www.youtube.com/watch?v=yorTG9at90g", {
        title: "Why Does Celeste Feel So Good to Play?",
        description: "Game Maker's Toolkit",
        image: "https://i.ytimg.com/vi/yorTG9at90g/hqdefault.jpg",
        siteName: "YouTube",
      }),
      note("feel", 1070, 330, 300, "Steal for Pip: coyote time, jump buffering, variable jump height.", "#facc15"),
      assetCard("states", 1070, 450, "Player States", { type: "diagram", id: id("player-states") }),
      link("lospec", 1410, 40, "https://lospec.com/palette-list", {
        title: "Palette List",
        description: "Over 2500 free pixel art palettes to import into any pixel art program.",
        image: "https://cdn.lospec.com/static/homepage/palette-list.png",
        siteName: "Lospec",
      }),
      checklist("todo", 1410, 330, "Art to-do", [
        ["Pip idle + run", true],
        ["Slime squash frames", true],
        ["Meadow tile edges", false],
        ["Title screen logo", false],
      ]),
    ],
    edges: [edge("e1", "gmtk", "feel", "Takeaways"), edge("e2", "feel", "states", "Build it here", "dashed"), edge("e3", "ost", "theme", "Inspires")],
  };
}

function levelPlan({ id }: ExampleContext) {
  return {
    id: id("meadow-plan"),
    name: "Mossbrook Meadow Level Plan",
    nodes: [
      card("start", "group", 40, 40, 272, 330, "1 · Learn", { color: "#4ade80" }),
      card("middle", "group", 352, 40, 272, 330, "2 · Practise", { color: "#facc15" }),
      card("end", "group", 664, 40, 272, 330, "3 · Test", { color: "#f87171" }),
      note("s1", 56, 80, 240, "Pip starts at the village gate. Safe, flat ground."),
      note("s2", 56, 168, 240, "Teach jumping: a log to hop over, then a small step."),
      assetCard("jump", 56, 256, "Jump", { type: "sound", id: id("jump") }),
      note("m1", 368, 80, 240, "First slime patrols a long flat stretch."),
      note("m2", 368, 168, 240, "Coin trail arcs over the water gap to show the jump."),
      assetCard("coin", 368, 256, "Coin", { type: "sound", id: id("coin") }),
      note("e1n", 680, 80, 240, "Two slimes and a high ledge: combine everything."),
      note("e2n", 680, 168, 240, "Flag on top of the hill. Hidden chest behind it."),
      assetCard("chest", 680, 256, "Chest", { type: "sprite", id: id("chest") }),
      image("sketch", 40, 420, 420, LEVEL_SKETCH, 24 / 10, "Rough side view: gate, log, water gap, coins, hill and flag"),
      assetCard("map", 500, 420, "Mossbrook Meadow", { type: "tilemap", id: id("meadow") }),
      checklist("todo", 500, 510, "Level to-do", [
        ["Block out ground", true],
        ["Place slimes", false],
        ["Coin trail over gap", false],
        ["Playtest with a friend", false],
      ]),
    ],
    edges: [edge("e1", "start", "middle", "then"), edge("e2", "middle", "end", "then"), edge("e3", "sketch", "map", "Build in Tilemap", "dashed")],
  };
}

export function diagramBoardExamples(ctx: ExampleContext) {
  return [moodboard(ctx), levelPlan(ctx)];
}
