import type { DecisionStatus } from "@/types";
import type { ExampleModule } from "./types";

export interface DecisionDraft {
  slug: string;
  title: string;
  status: DecisionStatus;
  daysAgo: number;
  context: string;
  options: string;
  decision: string;
  consequences: string;
  supersededBy?: string; // slug
  tags: string[];
}

function dateDaysAgo(days: number): string {
  const date = new Date(Date.now() - days * 86_400_000);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/** Numbers the drafts ADR-001, ADR-002… in the order given. */
export function decisionsModule(drafts: DecisionDraft[]): ExampleModule {
  return {
    collection: "decisions",
    build: ({ id }) =>
      drafts.map(({ slug, daysAgo, supersededBy, ...rest }, index) => ({
        ...rest,
        id: id(slug),
        number: index + 1,
        date: dateDaysAgo(daysAgo),
        ...(supersededBy ? { supersededBy: id(supersededBy) } : {}),
      })),
  };
}

// Pip's Quest, the GameDev Studio example game.
const GAME_DECISIONS: DecisionDraft[] = [
  {
    slug: "adr-pixel-scale",
    title: "16×16 sprites drawn at 4× scale",
    status: "accepted",
    daysAgo: 40,
    tags: ["art"],
    context: `We need one size for every character and tile before drawing more art. Redrawing later is the most expensive kind of change.`,
    options: `- **16×16 at 4×**: fast to draw, reads well on a phone, a 320×180 screen fits 20×11 tiles
- **32×32 at 2×**: more detail for faces, but four times the pixels for every animation frame
- **Mixed sizes**: big bosses, small tiles. Looks messy next to each other`,
    decision: `Every sprite and tile is **16×16**, drawn on the Meadow palette and shown at 4× in the game. Bosses are made from several 16×16 pieces.`,
    consequences: `- The Tilemap grid is 16 px, so tiles and sprites line up without scaling
- Pip's face has room for two pixels of eye. Expressions come from animation, not detail
- New colours go into the palette first, so everything still matches`,
  },
  {
    slug: "adr-checkpoint-saves",
    title: "Save only at checkpoint statues",
    status: "superseded",
    daysAgo: 25,
    supersededBy: "adr-autosave",
    tags: ["save-system"],
    context: `Players need to keep their progress between play sessions. Classic platformers save at fixed points.`,
    options: `- **Checkpoint statues**: simple, and adds a bit of tension
- **Save anywhere from the menu**: easy to abuse right before a hard jump`,
    decision: `The game saves when Pip touches a checkpoint statue. There is one statue per screen group.`,
    consequences: `- Few save points to test
- Losing ten minutes of play to a closed browser tab is possible`,
  },
  {
    slug: "adr-autosave",
    title: "Autosave on every new screen",
    status: "accepted",
    daysAgo: 6,
    tags: ["save-system"],
    context: `Replaces ADR-002. Playtesters on the web build closed the tab between checkpoints and lost their coins and the sword. Three out of five said they would not start again.`,
    options: `- **Keep checkpoints, add more statues**: still loses progress on a closed tab
- **Autosave on entering a screen**: nothing more than one screen is ever lost
- **Autosave every few seconds**: saves in the middle of a jump, which feels unfair after a reload`,
    decision: `The game saves to local storage each time Pip enters a new screen. Checkpoint statues stay as the place you come back to after losing all hearts.`,
    consequences: `- Saving has to be fast enough to happen during a screen change
- Save data needs a version number so old saves still load after updates
- [ ] Add a small "Saved" icon in the corner during the screen change`,
  },
];

export const decisionExamples: ExampleModule[] = [decisionsModule(GAME_DECISIONS)];
