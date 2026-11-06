import type { DiagramEdge, DiagramNode, DialogueNode } from "@/types";
import type { ExampleModule } from "./types";
import { diagramBoardExamples, note } from "./diagram-boards";
import { relation, table } from "./erd";

// Example assets for: diagrams, dialogues — the logic and conversations of "Pip's Quest".

export type NodeSpec = [id: string, type: DiagramNode["type"], x: number, y: number, label: string, width?: number];
export type EdgeSpec = [from: string, to: string, label: string, type?: DiagramEdge["type"]];

export function diagram(nodes: NodeSpec[], edges: EdgeSpec[]): { nodes: DiagramNode[]; edges: DiagramEdge[] } {
  return {
    nodes: nodes.map(([id, type, x, y, label, width = 140]): DiagramNode => ({
      id,
      type,
      x,
      y,
      width,
      height: type === "note" ? 64 : 56,
      label,
    })),
    edges: edges.map(([from, to, label, type = "arrow"], i): DiagramEdge => ({ id: `e${i + 1}`, from, to, label, type })),
  };
}

const diagrams: ExampleModule = {
  collection: "diagrams",
  legacyNames: ["Player State Machine (Example)"],
  build: (ctx) => [
    ...diagramBoardExamples(ctx),
    {
      id: ctx.id("player-states"),
      name: "Player States",
      ...diagram(
        [
          ["idle", "state", 100, 220, "Idle"],
          ["walk", "state", 360, 80, "Walk"],
          ["jump", "state", 360, 360, "Jump"],
          ["fall", "state", 620, 360, "Fall"],
          ["hurt", "event", 620, 80, "Hurt"],
          ["note", "note", 60, 440, "Coyote time: Pip can still jump 0.1 s after leaving a ledge", 260],
        ],
        [
          ["idle", "walk", "Move key"],
          ["walk", "idle", "No input", "dashed"],
          ["idle", "jump", "Jump key"],
          ["walk", "jump", "Jump key"],
          ["jump", "fall", "Moving down"],
          ["fall", "idle", "Lands"],
          ["walk", "hurt", "Touches enemy"],
          ["hurt", "idle", "After 0.5 s", "dashed"],
        ]
      ),
    },
    {
      id: ctx.id("enemy-ai"),
      name: "Slime AI",
      ...diagram(
        [
          ["patrol", "state", 80, 100, "Patrol"],
          ["sees", "condition", 330, 100, "Pip within 5 tiles?", 170],
          ["chase", "state", 620, 100, "Chase"],
          ["close", "condition", 610, 320, "Close enough?", 160],
          ["attack", "action", 340, 320, "Attack (hop)"],
          ["cooldown", "state", 80, 320, "Cooldown"],
        ],
        [
          ["patrol", "sees", "Every 0.2 s"],
          ["sees", "chase", "Yes"],
          ["sees", "patrol", "No", "dashed"],
          ["chase", "close", "Each frame"],
          ["close", "attack", "Yes"],
          ["close", "chase", "No", "dashed"],
          ["attack", "cooldown", "Hit or miss"],
          ["cooldown", "patrol", "After 1 s", "dashed"],
        ]
      ),
    },
    {
      id: ctx.id("screen-flow"),
      name: "Screen Flow",
      ...diagram(
        [
          ["title", "state", 80, 200, "Title"],
          ["select", "state", 320, 200, "Level Select"],
          ["level", "state", 560, 200, "Level"],
          ["pause", "state", 800, 60, "Pause"],
          ["victory", "event", 800, 340, "Victory"],
          ["gameover", "event", 560, 380, "Game Over"],
        ],
        [
          ["title", "select", "Start"],
          ["select", "level", "Pick a level"],
          ["level", "pause", "Esc"],
          ["pause", "level", "Resume", "dashed"],
          ["pause", "title", "Quit"],
          ["level", "victory", "Reach the flag"],
          ["victory", "select", "Next level"],
          ["level", "gameover", "Out of hearts"],
          ["gameover", "title", "Back to title", "dashed"],
        ]
      ),
    },
    {
      id: ctx.id("save-data"),
      name: "Save Data",
      nodes: [
        table("player", 80, 200, "player", [["id", "int", "PK"], ["save_version", "int"], ["hearts", "int"], ["coins", "int"], ["current_screen", "text"], ["checkpoint", "text"], ["saved_at", "timestamp"]]),
        table("inventory", 480, 40, "inventory", [["id", "int", "PK"], ["player_id", "int", "FK"], ["item", "text"], ["count", "int"], ["is_equipped", "boolean"]]),
        table("quests", 480, 260, "quest_progress", [["id", "int", "PK"], ["player_id", "int", "FK"], ["quest", "text"], ["step", "int"], ["is_done", "boolean"]]),
        table("levels", 480, 480, "level_unlocks", [["id", "int", "PK"], ["player_id", "int", "FK"], ["level", "text"], ["best_coins", "int"], ["unlocked_at", "timestamp"]]),
        note("autosave", 80, 470, 300, "Saved to local storage each time Pip enters a new screen (ADR-003). Bump save_version when a table changes so old saves still load."),
      ],
      edges: [
        relation("e1", "inventory.player_id", "player.id"),
        relation("e2", "quests.player_id", "player.id"),
        relation("e3", "levels.player_id", "player.id"),
      ],
    },
  ],
};

type DNode = DialogueNode;
const start = (id: string, x: number, y: number, nextId: string): DNode => ({ id, type: "start", x, y, nextId });
const end = (id: string, x: number, y: number): DNode => ({ id, type: "end", x, y });
const say = (id: string, x: number, y: number, speaker: string, text: string, nextId?: string): DNode => ({
  id,
  type: "dialogue",
  x,
  y,
  speaker,
  text,
  nextId,
});
const choose = (id: string, x: number, y: number, text: string, choices: [string, string][]): DNode => ({
  id,
  type: "choice",
  x,
  y,
  text,
  choices: choices.map(([t, targetId]) => ({ text: t, targetId })),
});
/** A true/false variable test: `name` or `not name`, true goes to `nextId`, otherwise `elseId`. */
const when = (id: string, x: number, y: number, variable: string, nextId: string, elseId: string): DNode => ({
  id,
  type: "condition",
  x,
  y,
  condition: variable,
  text: variable,
  check: { variable, op: "==", value: true },
  nextId,
  elseId,
});
const setFlag = (id: string, x: number, y: number, variable: string, nextId: string): DNode => ({
  id,
  type: "action",
  x,
  y,
  text: `${variable} = true`,
  set: { variable, op: "set", value: true },
  nextId,
});
const act = (id: string, x: number, y: number, text: string, nextId: string): DNode => ({ id, type: "action", x, y, text, nextId });

const dialogues: ExampleModule = {
  collection: "dialogues",
  legacyNames: ["Example NPC Conversation"],
  build: ({ id }) => [
    {
      id: id("merchant"),
      name: "Merchant Tobb",
      nodes: [
        start("s", 40, 215, "hello"),
        say("hello", 160, 200, "Merchant Tobb", "Ah, Pip! Fresh from Mossbrook? I've potions, rope, and a lantern that never runs dry.", "pick"),
        choose("pick", 440, 165, "What do you say?", [
          ["Show me what you sell.", "wares"],
          ["I want to sell this slime jelly.", "jelly"],
          ["Just looking, thanks.", "bye"],
        ]),
        say("wares", 740, 40, "Merchant Tobb", "Potion: 5 coins. Rope: 3. The lantern is 20, and worth every coin.", "shop"),
        act("shop", 1000, 40, "open_shop", "end1"),
        end("end1", 1260, 55),
        say("jelly", 740, 200, "Merchant Tobb", "Slime jelly! Makes a fine glue. Two coins apiece.", "pay"),
        act("pay", 1000, 200, "give_coins 2", "end2"),
        end("end2", 1260, 215),
        say("bye", 740, 360, "Merchant Tobb", "Suit yourself. Mind the Whispering Forest after dark.", "end3"),
        end("end3", 1000, 375),
      ],
    },
    {
      id: id("elder-quest"),
      name: "Elder Maren's Quest",
      variables: [
        { name: "quest_started", type: "bool", defaultValue: false },
        { name: "has_sunsteel_sword", type: "bool", defaultValue: false },
      ],
      nodes: [
        start("s", 40, 175, "started"),
        when("started", 150, 160, "quest_started", "has", "ask"),
        when("has", 360, 40, "has_sunsteel_sword", "back", "not-yet"),
        say("back", 560, 20, "Elder Maren", "The Sunsteel Sword! Mossbrook owes you everything, Pip.", "reward"),
        act("reward", 820, 20, "give_coins 50", "end1"),
        end("end1", 1080, 35),
        say("not-yet", 560, 140, "Elder Maren", "The sword is still out there, Pip. Follow the river east.", "end3"),
        end("end3", 820, 155),
        say("ask", 360, 300, "Elder Maren", "Pip, the Sunsteel Sword was stolen and carried into the Whispering Forest. Without it, the Shadow King will return.", "pick"),
        choose("pick", 640, 280, "Will you help?", [
          ["I'll bring the sword back.", "accept"],
          ["Not now, I'm not ready.", "decline"],
        ]),
        say("accept", 940, 220, "Elder Maren", "Brave child. Follow the river east, and trust no shadow that speaks.", "quest"),
        act("quest", 1200, 220, "start_quest lost_sword", "remember"),
        setFlag("remember", 1460, 220, "quest_started", "end4"),
        end("end4", 1720, 235),
        say("decline", 940, 400, "Elder Maren", "Then rest tonight. But the Shadow King will not wait long.", "end2"),
        end("end2", 1200, 415),
      ],
    },
    {
      id: id("gate-guard"),
      name: "Gate Guard",
      variables: [{ name: "is_night", type: "bool", defaultValue: true }],
      nodes: [
        start("s", 40, 115, "night"),
        when("night", 150, 100, "is_night", "halt", "day"),
        say("halt", 340, 95, "Gate Guard", "Halt! The gate stays shut after dark. Come back at sunrise.", "pick"),
        choose("pick", 600, 70, "Pip says:", [
          ["Please, it's urgent. Elder Maren sent me.", "fine"],
          ["Okay. Goodnight.", "end2"],
        ]),
        say("fine", 880, 20, "Gate Guard", "The Elder? ...Fine. Be quick, and don't tell the captain.", "open"),
        act("open", 1140, 20, "open_gate", "end1"),
        end("end1", 1400, 35),
        end("end2", 880, 200),
        say("day", 340, 240, "Gate Guard", "Morning, Pip. Gate's open. Mind the slimes on the road.", "end3"),
        end("end3", 600, 255),
      ],
    },
  ],
};

export const planningExamples: ExampleModule[] = [diagrams, dialogues];
