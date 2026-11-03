import type { AssetRef, DiagramEdge, DiagramNode } from "@/types";
import { linkCardSize } from "@/lib/diagrams/cards";
import type { ExampleContext } from "./types";

// Milanote-style example boards for the Canvas: a moodboard, a level plan and a core-loop flow chart for
// "Pip's Quest". The pictures are tiny hand-made pixel SVGs built from the Mossbrook Meadow palette, and
// the sketches are hand-placed freehand strokes.

const MEADOW = ["#1b1f2a", "#cfefff", "#8fd3ff", "#f4f7ff", "#7ac74f", "#4f9d3a", "#2f6b2e", "#a9744f", "#6b4430", "#8b8f98", "#3a8fd9", "#235a9c", "#f6c445"];

type Pixel = [x: number, y: number, w: number, h: number, color: string];
type StrokePoint = [x: number, y: number];

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

// Freehand strokes, as if drawn with the pen tool. Points are relative to the stroke's top-left corner.
const FULL_JUMP: StrokePoint[] = [[4, 94], [12, 66], [22, 42], [34, 24], [48, 12], [64, 5], [82, 3], [100, 5], [116, 12], [130, 24], [142, 40], [152, 60], [160, 80], [166, 98]];
const SHORT_HOP: StrokePoint[] = [[4, 98], [12, 80], [22, 68], [34, 62], [46, 63], [56, 70], [64, 82], [70, 98]];
const GROUND: StrokePoint[] = [[0, 4], [40, 2], [80, 5], [120, 3], [160, 5], [200, 2], [228, 4]];
const COIN_JUMP: StrokePoint[] = [[5, 70], [24, 44], [50, 20], [86, 4], [122, 18], [146, 42], [164, 70]];

/** A wobbly hand-drawn loop that overshoots where it started, like circling something with a pen. */
function penLoop(radiusX: number, radiusY: number): StrokePoint[] {
  const points: StrokePoint[] = [];
  for (let degrees = -110; degrees <= 280; degrees += 18) {
    const angle = (degrees * Math.PI) / 180;
    const wobble = 1 + 0.05 * Math.sin(angle * 3);
    points.push([Math.round(radiusX * (1 + Math.cos(angle) * wobble) + 4), Math.round(radiusY * (1 + Math.sin(angle) * wobble) + 4)]);
  }
  return points;
}

type Extra = Partial<DiagramNode>;

export function card(id: string, type: DiagramNode["type"], x: number, y: number, width: number, height: number, label = "", extra: Extra = {}): DiagramNode {
  return { id, type, x, y, width, height, label, ...extra };
}

export const group = (id: string, x: number, y: number, width: number, height: number, label: string, color: string) =>
  card(id, "group", x, y, width, height, label, { color });

export const note = (id: string, x: number, y: number, width: number, text: string, color?: string) =>
  card(id, "note", x, y, width, 60, text, color ? { color } : {});

const image = (id: string, x: number, y: number, width: number, src: string, aspect: number, caption = "") =>
  card(id, "image", x, y, width, Math.round(width / aspect), caption, { data: { src, aspect } });

const assetCard = (id: string, x: number, y: number, width: number, label: string, asset: AssetRef) =>
  card(id, "asset", x, y, width, 64, label, { data: { asset } });

const shape = (id: string, type: DiagramNode["type"], x: number, y: number, label: string, color?: string) =>
  card(id, type, x, y, 160, 64, label, color ? { color } : {});

function link(id: string, x: number, y: number, url: string, preview: Record<string, string>, width = linkCardSize(url).width) {
  return card(id, "link", x, y, width, linkCardSize(url).height, "", { data: { url, preview } });
}

function checklist(id: string, x: number, y: number, width: number, title: string, items: [string, boolean][]) {
  return card(id, "checklist", x, y, width, 160, title, {
    data: { items: items.map(([text, done], i) => ({ id: `${id}-${i + 1}`, text, done })) },
  });
}

function drawing(id: string, x: number, y: number, points: StrokePoint[], color: string) {
  const width = Math.max(...points.map(([px]) => px));
  const height = Math.max(...points.map(([, py]) => py));
  return card(id, "drawing", x, y, width, height, "", { color, data: { points, box: { width, height } } });
}

const edge = (id: string, from: string, to: string, label = "", type: DiagramEdge["type"] = "arrow"): DiagramEdge => ({ id, from, to, label, type });

const CELESTE_OST = {
  url: "https://open.spotify.com/album/1ZfETfec0U02KrKNI8w3Gf",
  preview: {
    title: "Celeste (Original Soundtrack)",
    description: "Lena Raine",
    image: "https://image-cdn-fa.spotifycdn.com/image/ab67616d00001e02b351fafcb334009c3216a039",
    siteName: "Spotify",
  },
};

const GMTK_CELESTE = {
  url: "https://www.youtube.com/watch?v=yorTG9at90g",
  preview: {
    title: "Why Does Celeste Feel So Good to Play?",
    description: "Game Maker's Toolkit",
    image: "https://i.ytimg.com/vi/yorTG9at90g/hqdefault.jpg",
    siteName: "YouTube",
  },
};

const JUICE_TALK = {
  url: "https://www.youtube.com/watch?v=Fy0aCDmgnxg",
  preview: {
    title: "Juice it or lose it",
    description: "Martin Jonasson & Petri Purho",
    image: "https://i.ytimg.com/vi/Fy0aCDmgnxg/hqdefault.jpg",
    siteName: "YouTube",
  },
};

const LOSPEC = {
  url: "https://lospec.com/palette-list",
  preview: {
    title: "Palette List",
    description: "Over 2500 free pixel art palettes to import into any pixel art program.",
    image: "https://cdn.lospec.com/static/homepage/palette-list.png",
    siteName: "Lospec",
  },
};

/** Look, sound and feel references side by side, each pinned to the studio assets they inspired. */
function moodboard({ id }: ExampleContext) {
  return {
    id: id("pip-moodboard"),
    name: "Pip's Quest Moodboard",
    nodes: [
      group("look", 40, 40, 632, 502, "Look & feel", "#4ade80"),
      group("sound", 696, 40, 352, 502, "Sound & music", "#60a5fa"),
      group("feel", 1072, 40, 616, 502, "Game feel", "#facc15"),

      image("scene", 56, 80, 288, MEADOW_SCENE, 32 / 18, "Mossbrook Meadow: soft sky, chunky hills"),
      image("strip", 368, 80, 288, PALETTE_STRIP, MEADOW.length / 2, "13 colours, nothing else"),
      note("style", 368, 186, 288, "Bright and cozy. Readable at 16×16: thick dark outlines, flat colours, no gradients."),
      assetCard("pip", 56, 304, 288, "Pip (walk)", { type: "sprite", id: id("hero") }),
      assetCard("model", 368, 304, 288, "Pip (3D)", { type: "model", id: id("hero-3d") }),
      assetCard("palette", 56, 392, 288, "Mossbrook Meadow", { type: "palette", id: id("meadow-palette") }),
      link("lospec", 368, 392, LOSPEC.url, LOSPEC.preview, 288),
      note("rule", 56, 480, 600, "Every sprite, tile and model uses the Mossbrook Meadow palette. No exceptions.", "#4ade80"),

      link("ost", 712, 80, CELESTE_OST.url, CELESTE_OST.preview),
      assetCard("theme", 712, 240, 320, "Title Theme", { type: "music", id: id("title-theme") }),
      assetCard("jump", 712, 328, 320, "Jump", { type: "sound", id: id("jump") }),
      note("chiptune", 712, 416, 320, "Chiptune only: bright square leads, soft triangle bass, short punchy SFX."),

      link("gmtk", 1088, 80, GMTK_CELESTE.url, GMTK_CELESTE.preview),
      note("takeaways", 1088, 408, 320, "Steal for Pip: coyote time, jump buffering, variable jump height.", "#facc15"),
      drawing("full-jump", 1452, 88, FULL_JUMP, "#facc15"),
      drawing("short-hop", 1452, 84, SHORT_HOP, "#60a5fa"),
      drawing("ground", 1444, 186, GROUND, "#a0a0b8"),
      note("arc", 1432, 208, 240, "Hold jump: full arc (yellow). Tap: short hop (blue)."),
      assetCard("states", 1432, 296, 240, "Player States", { type: "diagram", id: id("player-states") }),
      checklist("feel-todo", 1432, 384, 240, "Feel to-do", [
        ["Coyote time", true],
        ["Jump buffer", false],
        ["Variable jump", false],
      ]),
    ],
    edges: [
      edge("e1", "ost", "theme", "Inspires"),
      edge("e2", "gmtk", "takeaways", "Takeaways"),
      edge("e3", "takeaways", "states", "", "dashed"),
    ],
  };
}

/** A level told in three beats, with a marked-up sketch and everything needed to build it. */
function levelPlan({ id }: ExampleContext) {
  return {
    id: id("meadow-plan"),
    name: "Mossbrook Meadow Level Plan",
    nodes: [
      group("learn", 40, 40, 288, 284, "1 · Learn", "#4ade80"),
      group("practise", 392, 40, 288, 284, "2 · Practise", "#facc15"),
      group("test", 744, 40, 288, 284, "3 · Test", "#f87171"),
      group("sketch-group", 40, 372, 632, 430, "Side view", "#2dd4bf"),
      group("build", 736, 372, 296, 430, "Build it", "#60a5fa"),

      note("s1", 56, 80, 256, "Pip starts at the village gate. Safe, flat ground."),
      note("s2", 56, 162, 256, "Teach jumping: a log to hop over, then a small step."),
      assetCard("jump", 56, 244, 256, "Jump", { type: "sound", id: id("jump") }),
      note("m1", 408, 80, 256, "First slime patrols a long flat stretch."),
      note("m2", 408, 162, 256, "Coin trail arcs over the water gap to show the jump."),
      assetCard("slime", 408, 244, 256, "Slime", { type: "sprite", id: id("slime") }),
      note("t1", 760, 80, 256, "Two slimes and a high ledge: combine everything."),
      note("t2", 760, 162, 256, "Flag on top of the hill. Hidden chest behind it."),
      assetCard("chest", 760, 244, 256, "Chest", { type: "sprite", id: id("chest") }),

      image("sketch", 56, 412, 600, LEVEL_SKETCH, 24 / 10, "Red pen: the jump the coins teach, and the secret behind the flag."),
      drawing("coin-jump", 256, 516, COIN_JUMP, "#f87171"),
      drawing("flag-loop", 568, 446, penLoop(30, 46), "#f87171"),
      assetCard("music", 56, 722, 288, "Overworld", { type: "music", id: id("melody") }),
      assetCard("coin", 368, 722, 288, "Coin pickup", { type: "sound", id: id("coin") }),

      assetCard("map", 752, 412, 264, "Mossbrook Meadow", { type: "tilemap", id: id("meadow") }),
      assetCard("village", 752, 492, 264, "Mossbrook Village", { type: "story", id: id("village") }),
      checklist("todo", 752, 600, 264, "Level to-do", [
        ["Block out ground", true],
        ["Place slimes", false],
        ["Coin trail over gap", false],
        ["Hide the chest behind the flag", false],
        ["Playtest with a friend", false],
      ]),
    ],
    edges: [
      edge("e1", "learn", "practise", "then"),
      edge("e2", "practise", "test", "then"),
      edge("e3", "sketch-group", "build", "Build", "dashed"),
    ],
  };
}

const LOOP_COLUMN = 264;
const loopX = (column: number) => 56 + column * LOOP_COLUMN;
const shapeX = (column: number) => loopX(column) + 40;

/** The moment-to-moment loop as a flow chart, each step wired to the asset that makes it happen. */
function coreLoop({ id }: ExampleContext) {
  return {
    id: id("core-loop"),
    name: "Pip's Core Loop",
    nodes: [
      group("loop", 40, 40, 1064, 572, "The core loop", "#a78bfa"),
      group("polish", 1128, 40, 288, 572, "Make it feel good", "#facc15"),

      assetCard("music", loopX(0), 80, 240, "Overworld", { type: "music", id: id("melody") }),
      assetCard("pip", loopX(1), 80, 240, "Pip (walk)", { type: "sprite", id: id("hero") }),
      assetCard("slime-ai", loopX(2), 80, 240, "Slime AI", { type: "diagram", id: id("enemy-ai") }),
      assetCard("jump", loopX(3), 80, 240, "Jump", { type: "sound", id: id("jump") }),

      shape("start", "ellipse", shapeX(0), 200, "Start level", "#4ade80"),
      shape("explore", "state", shapeX(1), 200, "Explore"),
      shape("slime", "condition", shapeX(2), 200, "Slime ahead?"),
      shape("stomp", "action", shapeX(3), 200, "Stomp it"),
      shape("coins", "event", shapeX(3), 376, "Coins + score"),
      shape("flag", "diamond", shapeX(2), 376, "Reached the flag?", "#facc15"),
      shape("clear", "rectangle", shapeX(1), 376, "Level clear!", "#4ade80"),
      shape("save", "rectangle", shapeX(0), 376, "Save progress"),
      drawing("fun-loop", shapeX(3) - 30, 178, penLoop(106, 50), "#f472b6"),

      assetCard("save-issue", loopX(0), 496, 240, "Save/load progress", { type: "issue", id: id("i-save-system") }),
      assetCard("powerup", loopX(1), 496, 240, "Power-up", { type: "sound", id: id("powerup") }),
      assetCard("screens", loopX(2), 496, 240, "Screen Flow", { type: "diagram", id: id("screen-flow") }),
      assetCard("coin", loopX(3), 496, 240, "Coin", { type: "sprite", id: id("coin") }),

      note("p2", 1144, 80, 256, "Circled in pink: the fun bit. A stomp bounces Pip higher, so it's a reward, not just safety.", "#f472b6"),
      link("juice", 1144, 190, JUICE_TALK.url, JUICE_TALK.preview, 256),
      checklist("polish-todo", 1144, 448, 256, "Loop to-do", [
        ["Slime patrol", true],
        ["Stomp bounce", false],
        ["Coin burst on stomp", false],
        ["Flag slide animation", false],
      ]),
    ],
    edges: [
      edge("e1", "start", "explore"),
      edge("e2", "explore", "slime"),
      edge("e3", "slime", "stomp", "Yes"),
      edge("e4", "stomp", "coins"),
      edge("e5", "coins", "flag"),
      edge("e6", "slime", "flag", "No"),
      edge("e7", "flag", "explore", "No"),
      edge("e8", "flag", "clear", "Yes"),
      edge("e9", "clear", "save"),
      edge("e10", "save", "start", "Next level", "dashed"),
      edge("u1", "music", "start", "", "line"),
      edge("u2", "pip", "explore", "", "line"),
      edge("u3", "slime-ai", "slime", "", "line"),
      edge("u4", "jump", "stomp", "", "line"),
      edge("u5", "save-issue", "save", "", "line"),
      edge("u6", "powerup", "clear", "", "line"),
      edge("u7", "screens", "flag", "", "line"),
      edge("u8", "coin", "coins", "", "line"),
    ],
  };
}

export function diagramBoardExamples(ctx: ExampleContext) {
  return [moodboard(ctx), levelPlan(ctx), coreLoop(ctx)];
}
