import type { FrameTag } from "@/types";
import type { ExampleContext, ExampleModule } from "./types";

// Meadow palette shared by every example sprite, so they read as one game.
const PALETTE: Record<string, string> = {
  K: "#1d1a2b", // outline
  W: "#f4f4ec", // highlight
  S: "#f2c39b", // skin
  R: "#d94a4a", // red
  r: "#8f2d3a", // dark red
  Y: "#f6c945", // gold
  y: "#c98a2b", // dark gold
  G: "#6abe30", // grass
  g: "#3f8a3a", // dark grass
  B: "#5aa9e6", // blue
  b: "#2f5f9e", // dark blue
  N: "#8b5a3c", // brown
  n: "#5c3a28", // dark brown
  L: "#9aa4b0", // stone / steel
  D: "#5b6270", // dark stone
  P: "#9b5de5", // slime
  p: "#5e3a9e", // dark slime
};

const SIZE = 16;
const BLANK = ".".repeat(SIZE);

function fit(rows: string[]): string[] {
  const out = rows.map((r) => (r + BLANK).slice(0, SIZE));
  while (out.length < SIZE) out.push(BLANK);
  return out.slice(0, SIZE);
}

function toDataUrl(rows: string[]): string {
  const c = document.createElement("canvas");
  c.width = SIZE;
  c.height = SIZE;
  const ctx = c.getContext("2d")!;
  fit(rows).forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const col = PALETTE[ch];
      if (!col) return;
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 1, 1);
    });
  });
  return c.toDataURL();
}

const flipH = (rows: string[]) => fit(rows).map((r) => [...r].reverse().join(""));
const shiftUp = (rows: string[], n: number) => [...fit(rows).slice(n), ...Array(n).fill(BLANK)];

/** A solid tile: one base colour plus hand-placed specks [x, y, colour]. */
function tile(base: string, specks: [number, number, string][], rows?: Record<number, string>): string[] {
  const grid = Array.from({ length: SIZE }, () => base.repeat(SIZE).split(""));
  for (const [y, row] of Object.entries(rows ?? {})) grid[Number(y)] = (row + base.repeat(SIZE)).slice(0, SIZE).split("");
  for (const [x, y, ch] of specks) grid[y][x] = ch;
  return grid.map((r) => r.join(""));
}

interface Animation {
  /** Milliseconds per frame, where a frame differs from the fps. */
  durations?: number[];
  frameTags?: Omit<FrameTag, "id">[];
}

function sprite(ctx: ExampleContext, slug: string, name: string, fps: number, frames: string[][], animation: Animation = {}) {
  const id = ctx.id(slug);
  const duration = Math.round(1000 / fps);
  return {
    id,
    name,
    width: SIZE,
    height: SIZE,
    fps,
    hasFrameDurations: true,
    frameTags: (animation.frameTags ?? []).map((tag) => ({ ...tag, id: `${id}-tag-${tag.name}` })),
    tags: ["example"],
    frames: frames.map((rows, i) => {
      const pixels = toDataUrl(rows);
      return {
        id: `${id}-f${i}`,
        pixels,
        duration: animation.durations?.[i] ?? duration,
        layers: [{ id: `${id}-f${i}-l0`, name: "Layer 1", visible: true, pixels }],
      };
    }),
  };
}

// ── Pip, the hero: front-facing 4-frame walk ──
const PIP_TOP = [
  "................",
  "......KKKK......",
  ".....KNNNNK.....",
  "....KNNNNNNK....",
  "....KNSSSSNK....",
  "....KSKSSKSK....",
  "....KSSSSSSK....",
  ".....KSSSSK.....",
  "....KBBBBBBK....",
  "...KSKBBBBKSK...",
  "...KSKBBBBKSK...",
];
const PIP_STRIDE_A = [
  "....KbbbbbbK....",
  "....KbbKKbbK....",
  "....KbK..KbK....",
  "....KbK..KnnK...",
  "...KnnK..KKKK...",
];
const PIP_STRIDE_B = [
  "....KbbbbbbK....",
  "....KbbKKbbK....",
  "....KbK..KbK....",
  "...KnnK..KbK....",
  "...KKKK..KnnK...",
];
const PIP_TOGETHER = [
  "....KbbbbbbK....",
  ".....KbbbbK.....",
  ".....KbKKbK.....",
  ".....KnnnnK.....",
  ".....KKKKKK.....",
];
// passing pose: body bobs up a pixel while the legs pass each other
const pipBob = () => [...shiftUp(PIP_TOP, 1).slice(0, 10), PIP_TOP[10], ...PIP_TOGETHER];
const PIP_STAND = [...PIP_TOP, ...PIP_TOGETHER];
const PIP_BLINK = PIP_STAND.map((row, y) => (y === 5 ? "....KSSSSSSK...." : row));

// ── Slime: idle squash ──
const SLIME_UP = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "......KKKK......",
  "....KKPPPPKK....",
  "...KPPWPPPPPK...",
  "..KPPWWPPPPPPK..",
  "..KPPPPPPPPPPK..",
  "..KPPKPPPPKPPK..",
  "..KPPKPPPPKPPK..",
  "..KPPPPPPPPPPK..",
  "..KpPPPPPPPPpK..",
  "...KppppppppK...",
  "....KKKKKKKK....",
];
const SLIME_SQUASH = [
  ...Array(7).fill(BLANK),
  ".....KKKKKK.....",
  "...KKPPPPPPKK...",
  "..KPPWWPPPPPPK..",
  ".KPPPPPPPPPPPPK.",
  ".KPPPKPPPPKPPPK.",
  ".KPPPKPPPPKPPPK.",
  ".KpPPPPPPPPPPpK.",
  "..KppppppppppK..",
  "...KKKKKKKKKK...",
];

// ── Coin: 4-frame spin ──
const COIN_FULL = [
  "................",
  "................",
  ".....KKKKKK.....",
  "....KYYYYYYK....",
  "...KYWWYYYYyK...",
  "...KYWYyyYYyK...",
  "...KYYYyYYYyK...",
  "...KYYYyYYYyK...",
  "...KYYYyYYYyK...",
  "...KYYyyyYYyK...",
  "...KYYYYYYYyK...",
  "....KyYYYYyK....",
  ".....KKKKKK.....",
];
const COIN_TURN = [
  "................",
  "................",
  "......KKKK......",
  ".....KYYYYK.....",
  "....KYWYYYyK....",
  "....KWYyYYyK....",
  "....KYYyYYyK....",
  "....KYYyYYyK....",
  "....KYYyYYyK....",
  "....KYyyyYyK....",
  "....KYYYYYyK....",
  ".....KYYYyK.....",
  "......KKKK......",
];
const COIN_EDGE = [
  "................",
  "................",
  ".......KK.......",
  "......KyYK......",
  "......KYyK......",
  "......KYyK......",
  "......KYyK......",
  "......KYyK......",
  "......KYyK......",
  "......KYyK......",
  "......KYyK......",
  "......KyYK......",
  ".......KK.......",
];

const HEART = [
  "................",
  "................",
  "..KKKK....KKKK..",
  ".KRRRRK..KRRRRK.",
  "KRWWRRRKKRRRRRRK",
  "KRWRRRRRRRRRRRRK",
  "KRRRRRRRRRRRRRrK",
  ".KRRRRRRRRRRRrK.",
  "..KRRRRRRRRRrK..",
  "...KRRRRRRRrK...",
  "....KRRRRRrK....",
  ".....KRRRrK.....",
  "......KRrK......",
  ".......KK.......",
];

const SWORD = [
  "................",
  ".............KK.",
  "............KWLK",
  "...........KWLK.",
  "..........KWLK..",
  ".........KWLK...",
  "........KWLK....",
  ".......KWLK.....",
  "......KWLK......",
  "..KK.KWLK.......",
  "..KYKWLK........",
  "...KYYK.........",
  "...KnYYK........",
  "..KnK.KK........",
  ".KYK............",
  "..K.............",
];

const CHEST = [
  "................",
  "................",
  "................",
  "..KKKKKKKKKKKK..",
  ".KNNNNNNNNNNNNK.",
  ".KNnYNNNNNNYnNK.",
  ".KNnNNNNNNNNnNK.",
  ".KKKKKKYYKKKKKK.",
  ".KNnNNNYyNNNnNK.",
  ".KNnNNNNNNNNnNK.",
  ".KNnNNNNNNNNnNK.",
  ".KNnNNNNNNNNnNK.",
  ".KnnnnnnnnnnnnK.",
  "..KKKKKKKKKKKK..",
];

// ── Tiles (fully opaque, tile seamlessly) ──
const DIRT_SPECKS: [number, number, string][] = [
  [4, 0, "n"], [14, 0, "n"], [8, 1, "n"], [1, 2, "n"], [13, 2, "D"], [6, 3, "n"], [11, 4, "n"],
  [2, 5, "D"], [8, 6, "n"], [14, 6, "n"], [4, 7, "n"], [11, 8, "D"], [1, 9, "n"], [6, 10, "n"],
  [13, 10, "n"], [5, 12, "D"], [10, 12, "n"], [2, 13, "n"], [13, 14, "D"], [8, 15, "n"],
];
const DIRT = tile("N", DIRT_SPECKS);
const GRASS = tile("N", DIRT_SPECKS.filter(([, y]) => y > 5), {
  0: "GGgGGGGGgGGGGGgG",
  1: "GGGGGgGGGGGgGGGG",
  2: "gGGGGGGGGGGGGGGg",
  3: "GgGGgGGgGGgGGgGG",
  4: "gNgGNgGNNgGNgGNg",
  5: "NNNgNNNNNNNNgNNN",
});
const STONE = tile("L", [
  [1, 1, "W"], [2, 1, "W"], [9, 1, "W"], [10, 1, "W"], [5, 9, "W"], [6, 9, "W"], [13, 9, "W"], [14, 9, "W"],
  [6, 5, "D"], [12, 3, "D"], [3, 13, "D"], [10, 12, "D"],
], {
  0: "DDDDDDDDDDDDDDDD",
  8: "DDDDDDDDDDDDDDDD",
}).map((row, y) => {
  // vertical mortar: offset every other course like real stonework
  const cols = y > 0 && y < 8 ? [0, 8] : y > 8 ? [4, 12] : [];
  return [...row].map((ch, x) => (cols.includes(x) ? "D" : ch)).join("");
});
const waterFrame = (offset: number) =>
  tile("B", [
    ...[0, 1, 2].map((i): [number, number, string] => [(2 + offset + i) % 16, 3, "W"]),
    ...[0, 1, 2].map((i): [number, number, string] => [(10 + offset + i) % 16, 7, "W"]),
    ...[0, 1, 2].map((i): [number, number, string] => [(5 + offset + i) % 16, 11, "W"]),
    ...[0, 1, 2].map((i): [number, number, string] => [(13 + offset + i) % 16, 14, "W"]),
    [(7 + offset) % 16, 1, "b"], [(1 + offset) % 16, 9, "b"], [(12 + offset) % 16, 5, "b"], [(9 + offset) % 16, 13, "b"],
  ]);

export const artExamples: ExampleModule[] = [
  {
    collection: "sprites",
    build: (ctx) => [
      sprite(ctx, "hero", "Pip (walk)", 8, [PIP_STAND, PIP_BLINK, [...PIP_TOP, ...PIP_STRIDE_A], pipBob(), [...PIP_TOP, ...PIP_STRIDE_B], pipBob()], {
        durations: [1200, 150],
        frameTags: [
          { name: "idle", from: 0, to: 1, color: "#5aa9e6", direction: "forward" },
          { name: "walk", from: 2, to: 5, color: "#6abe30", direction: "forward" },
        ],
      }),
      sprite(ctx, "slime", "Slime", 3, [SLIME_UP, SLIME_SQUASH], {
        durations: [450, 200],
        frameTags: [{ name: "bounce", from: 0, to: 1, color: "#9b5de5", direction: "forward" }],
      }),
      sprite(ctx, "coin", "Coin", 8, [COIN_FULL, COIN_TURN, COIN_EDGE, flipH(COIN_TURN)]),
      sprite(ctx, "heart", "Heart", 8, [HEART]),
      sprite(ctx, "sword", "Sunsteel Sword", 8, [SWORD]),
      sprite(ctx, "chest", "Chest", 8, [CHEST]),
      sprite(ctx, "tile-grass", "Grass tile", 8, [GRASS]),
      sprite(ctx, "tile-dirt", "Dirt tile", 8, [DIRT]),
      sprite(ctx, "tile-stone", "Stone tile", 8, [STONE]),
      sprite(ctx, "tile-water", "Water tile", 2, [waterFrame(0), waterFrame(4)]),
    ],
  },
];
