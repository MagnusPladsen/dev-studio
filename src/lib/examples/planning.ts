import type { DiagramEdge, DiagramNode, DialogueNode } from "@/types";
import type { ExampleModule } from "./types";
import { diagramBoardExamples } from "./diagram-boards";

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
const when = (id: string, x: number, y: number, condition: string, nextId: string): DNode => ({
  id,
  type: "condition",
  x,
  y,
  condition,
  text: condition,
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
      nodes: [
        start("s", 40, 135, "ask"),
        say("ask", 160, 120, "Elder Maren", "Pip, the Sunsteel Sword was stolen and carried into the Whispering Forest. Without it, the Shadow King will return.", "pick"),
        choose("pick", 440, 100, "Will you help?", [
          ["I'll bring the sword back.", "accept"],
          ["Not now, I'm not ready.", "decline"],
        ]),
        say("accept", 740, 20, "Elder Maren", "Brave child. Follow the river east, and trust no shadow that speaks.", "quest"),
        act("quest", 1000, 20, "start_quest lost_sword", "has"),
        when("has", 1260, 25, "has_sunsteel_sword", "back"),
        say("back", 1460, 20, "Elder Maren", "The Sunsteel Sword! Mossbrook owes you everything, Pip.", "reward"),
        act("reward", 1720, 20, "give_coins 50", "end1"),
        end("end1", 1980, 35),
        say("decline", 740, 260, "Elder Maren", "Then rest tonight. But the Shadow King will not wait long.", "end2"),
        end("end2", 1000, 275),
      ],
    },
    {
      id: id("gate-guard"),
      name: "Gate Guard",
      nodes: [
        start("s", 40, 115, "night"),
        when("night", 150, 100, "is_night", "halt"),
        say("halt", 340, 95, "Gate Guard", "Halt! The gate stays shut after dark. Come back at sunrise.", "pick"),
        choose("pick", 600, 70, "Pip says:", [
          ["Please, it's urgent. Elder Maren sent me.", "fine"],
          ["Okay. Goodnight.", "end2"],
        ]),
        say("fine", 880, 20, "Gate Guard", "The Elder? ...Fine. Be quick, and don't tell the captain.", "open"),
        act("open", 1140, 20, "open_gate", "end1"),
        end("end1", 1400, 35),
        end("end2", 880, 200),
      ],
    },
  ],
};

export const planningExamples: ExampleModule[] = [diagrams, dialogues];
