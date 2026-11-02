export type HelpTopic =
  | "assets"
  | "board"
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

export interface HelpContent {
  title: string;
  /** One sentence. */
  summary: string;
  /** 3-5 short bullets. */
  canDo: string[];
  /** 3-4 quick-start steps. */
  steps: string[];
  /** 2-4 tips, keyboard shortcuts where real. */
  tips: string[];
}

const UNDO_TIP = "Ctrl/⌘+Z undoes, Ctrl/⌘+Shift+Z redoes. Every change saves by itself.";
const MENU_TIP = "Right-click (or long-press) an item in the list for copy, rename, links and more.";

export const HELP: Record<HelpTopic, HelpContent> = {
  assets: {
    title: "Project dashboard",
    summary: "Your project's home: open any tool and see everything you've made.",
    canDo: [
      "Open any of the tools from the cards at the top.",
      "See every asset in the project, newest first, with its links.",
      "Search by name or filter by type.",
      "Add or remove the example assets for the whole project.",
      "Export the whole project as one JSON file.",
    ],
    steps: [
      "Pick a tool card, for example Pixel Art.",
      "Make something there. It saves by itself.",
      "Come back here to find it in the list below.",
      "Click a name to open it, or a linked chip to jump to that asset.",
    ],
    tips: [
      "Not sure where to start? Press Add examples and explore them.",
      "Right-click (or long-press) a row to rename, duplicate, link or delete it.",
      "Export project gives a backup you can import again from Projects.",
    ],
  },
  board: {
    title: "Task Board",
    summary: "Plan your game's work with issues, columns and sprints.",
    canDo: [
      "Track tasks and bugs as issues with type, priority, points and labels.",
      "Drag issues between columns, or use the Move to… menu.",
      "Plan sprints in Backlog, then start and complete them.",
      "Search and filter everything in All issues, archived ones too.",
      "Add notes to an issue; they live in the Notebook.",
    ],
    steps: [
      "Press Create issue and give it a title.",
      "Drag the card across the columns as work moves on.",
      "Click a card to edit its details, links and notes.",
      "Archive done issues to keep the board tidy.",
    ],
    tips: [
      "Press C to create an issue.",
      "Rename or add columns to fit how you work.",
      UNDO_TIP,
      "Export the board as CSV or JSON.",
    ],
  },
  diagrams: {
    title: "Diagrams",
    summary: "A free-form board for moodboards, story flow, level plans, sketches and references.",
    canDo: [
      "Add notes, to-do lists, images, links, groups and any project asset as cards.",
      "Draw rectangles, ellipses, diamonds and flow-chart shapes, and sketch with the pen.",
      "Connect cards and shapes with arrows to show flow.",
      "Select many cards at once to move, recolour, duplicate, align or distribute them.",
      "Play YouTube, Spotify, Vimeo and SoundCloud links right on the board.",
    ],
    steps: [
      "Add a card or shape from Add, or paste and drop pictures and links in.",
      "Pick the pen tool to sketch; Esc goes back to selecting.",
      "Use the Connect tool, or drag a selected card's dot onto another card.",
      "Shift+drag (or the box-select tool on touch) around cards to select several.",
    ],
    tips: [
      "Drag empty space to pan; scroll or pinch to zoom. Shift+click adds or removes a card.",
      "Ctrl/⌘+C, Ctrl/⌘+V and Ctrl/⌘+D copy, paste and duplicate cards, lines included.",
      "Double-click a card or line to edit it. Delete removes the selection; Ctrl/⌘+Z undoes.",
      "Export the board as PNG, SVG or JSON.",
    ],
  },
  dialogue: {
    title: "Dialogue Trees",
    summary: "Write branching conversations for your characters.",
    canDo: [
      "Build a tree from Start, Dialogue, Choice, Condition, Action and End nodes.",
      "Give each line a speaker, and choices their own branches.",
      "Play through a conversation with Preview.",
      "Export as JSON or a Yarn Spinner script.",
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
      "Write notes for melody, harmony, bass and drums channels.",
      "Pick an instrument per channel: square, triangle, noise and more.",
      "Set tempo (BPM), loop length and note length.",
      "Mute or solo channels while you listen.",
      "Export the pattern as a WAV file.",
    ],
    steps: [
      "Press + to make a new track, or add the examples.",
      "Pick a channel, then click the grid to place a note.",
      "Drag right while placing to make a note longer.",
      "Press Play, turn on Loop, and keep tweaking.",
    ],
    tips: [
      "Click a note again to remove it.",
      "Ctrl/⌘ + scroll zooms time; add Shift to zoom pitch.",
      UNDO_TIP,
    ],
  },
  notebook: {
    title: "Notebook",
    summary: "Keep ideas, to-do lists, design notes and playtest feedback.",
    canDo: [
      "Write notes in Markdown, with headings, lists and code.",
      "Tick off checklists and see progress at a glance.",
      "Sort notes into folders, add tags and pin the important ones.",
      "Link to other notes and story entries with [[double brackets]].",
      "Start from templates like a to-do list or game design doc.",
    ],
    steps: [
      "Press New note, or pick a template from the arrow next to it.",
      "Give it a title and start writing.",
      "Type - [ ] to make a checklist item.",
      "Switch to Preview to read it and tick items off.",
    ],
    tips: [
      "Type [[ to search notes and story entries to link.",
      UNDO_TIP,
      MENU_TIP,
    ],
  },
  palettes: {
    title: "Palettes",
    summary: "Keep your game's colours in one place and reuse them.",
    canDo: [
      "Make your own palettes or start from a preset copy.",
      "Add colours with a picker or a hex code.",
      "Click a swatch to copy its hex code.",
      "Open Pixel Art with a palette loaded.",
      "Export as a .txt hex list or a GIMP .gpl palette.",
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
      "Draw with pencil, eraser, fill, line, rectangle, circle and move tools.",
      "Use layers, and frames for animation with onion skin.",
      "Play the animation and set its speed (fps).",
      "Resize the canvas and swap in a project palette.",
      "Scale a sprite up (8×8 → 16×16 and more), sharp or smooth, in place or as a copy.",
      "Export a PNG, a sprite sheet or an animated GIF.",
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
      "Generate sounds like Jump, Coin, Laser, Explosion and Hit.",
      "Randomise a sound, or Mutate it a little.",
      "Fine-tune wave type, pitch, length and more with sliders.",
      "Keep sounds in your project and export them as WAV.",
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
      "Pick which sprites go on a sheet.",
      "Each sprite gets a row, with its frames left to right.",
      "Set padding between frames.",
      "Export the sheet as PNG plus an atlas JSON of frame positions.",
      "Export at 2×, 3× or 4× size, sharp or smooth; the atlas scales with it.",
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
  story: {
    title: "Story",
    summary: "Write your game's lore: characters, places, items, quests and events.",
    canDo: [
      "Write entries in Markdown, sorted by type and tags.",
      "Link entries with [[double brackets]]; hover a link for a summary.",
      "See which entries mention this one.",
      "View how everything connects in the graph.",
    ],
    steps: [
      "Press New entry, pick a type and give it a title.",
      "Write about it. Types like Character start from a template.",
      "Type [[ to link another entry.",
      "Open the graph button to see your world's connections.",
    ],
    tips: [
      "Click a [[link]] to an entry that doesn't exist yet to create it.",
      UNDO_TIP,
      MENU_TIP,
    ],
  },
  tilemap: {
    title: "Tilemap",
    summary: "Paint game levels with your own sprites as tiles.",
    canDo: [
      "Paint with your project sprites or basic colour tiles.",
      "Paint, fill an area or erase.",
      "Stack layers, hide them and change their order.",
      "Export a PNG of the map or Tiled-style JSON.",
    ],
    steps: [
      "Press + and set the map's width and height in tiles.",
      "Pick a sprite or colour on the left.",
      "Click or drag on the map to paint.",
      "Add a layer for things that sit on top, like trees.",
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
      "Add, erase and paint cubes, fill faces and draw boxes.",
      "Mirror edits across the X, Y or Z axis.",
      "Turn a sprite into a 3D model.",
      "Export .glb, OBJ + MTL, MagicaVoxel .vox or a PNG.",
    ],
    steps: [
      "Press New model, or make one from a sprite.",
      "Pick a colour and the Add tool, then click to place cubes.",
      "Right-drag to turn the view, scroll to zoom.",
      "Export it for Blender, Godot, Unity or the web.",
    ],
    tips: [
      "Keys: B add, E erase, P paint, I picker, G fill, R box.",
      "Box tool: arrow keys change height, Enter places, Esc cancels.",
      "On a phone, two fingers turn and zoom, or turn on Orbit.",
      UNDO_TIP,
    ],
  },
};
