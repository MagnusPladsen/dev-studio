import { z } from "zod";
import { id, projectRow, tags } from "./common";

/** Sounds and music are read-only for the MCP (it may rename, tag and link them). Dialogue text is editable. */

export const soundSchema = z.looseObject({
  ...projectRow,
  name: z.string(),
  params: z.looseObject({
    waveType: z.enum(["square", "sawtooth", "sine", "triangle", "noise"]),
    frequency: z.number(),
    frequencySlide: z.number(),
    repeatSpeed: z.number(),
    sustainTime: z.number(),
    decayTime: z.number(),
    attackTime: z.number(),
    hpFilterCutoff: z.number(),
    lpFilterCutoff: z.number(),
    lpFilterResonance: z.number(),
    volume: z.number(),
    vibratoDepth: z.number(),
    vibratoSpeed: z.number(),
  }),
  tags,
});

const musicNoteSchema = z.looseObject({ pitch: z.number(), start: z.number(), duration: z.number(), velocity: z.number() });

export const musicSchema = z.looseObject({
  ...projectRow,
  name: z.string(),
  bpm: z.number().positive(),
  key: z.number().int().min(0).max(11).optional(),
  scale: z.enum(["chromatic", "major", "minor", "majorPentatonic", "minorPentatonic", "blues"]).optional(),
  channels: z.array(
    z.looseObject({
      id,
      name: z.string(),
      instrument: z.string(),
      preset: z.string().optional(),
      envelope: z
        .looseObject({ attack: z.number().min(0), decay: z.number().min(0), sustain: z.number().min(0).max(1), release: z.number().min(0) })
        .optional(),
      vibrato: z.looseObject({ rate: z.number().positive(), depth: z.number().min(0), delay: z.number().min(0) }).optional(),
      volume: z.number(),
      patterns: z.array(z.looseObject({ id, notes: z.array(musicNoteSchema) })),
    })
  ),
  sections: z
    .array(
      z.looseObject({
        id,
        name: z.string(),
        length: z.union([z.literal(8), z.literal(16), z.literal(32)]),
        repeat: z.number().int().min(1).max(8).optional(),
        patterns: z.array(z.looseObject({ channelId: z.string(), patternId: z.string() })),
      })
    )
    .optional(),
  loopStartId: z.string().optional(),
  tags,
});

const dialogueValue = z.union([z.boolean(), z.number(), z.string()]);
const translations = z.record(z.string(), z.string());

const dialogueNodeSchema = z.looseObject({
  id,
  type: z.enum(["dialogue", "choice", "condition", "action", "start", "end"]),
  x: z.number(),
  y: z.number(),
  speaker: z.string().optional(),
  text: z.string().optional(),
  translations: translations.optional(),
  choices: z.array(z.looseObject({ id: z.string().optional(), text: z.string(), targetId: z.string(), translations: translations.optional() })).optional(),
  nextId: z.string().optional(),
  elseId: z.string().optional(),
  condition: z.string().optional(),
  check: z.looseObject({ variable: z.string(), op: z.enum(["==", "!=", "<", "<=", ">", ">="]), value: dialogueValue }).optional(),
  set: z.looseObject({ variable: z.string(), op: z.enum(["set", "add", "toggle"]), value: dialogueValue.optional() }).optional(),
});

export const dialogueSchema = z
  .looseObject({
    ...projectRow,
    name: z.string(),
    nodes: z.array(dialogueNodeSchema),
    variables: z.array(z.looseObject({ name: z.string(), type: z.enum(["bool", "number", "string"]), defaultValue: dialogueValue })).optional(),
    languages: z.array(z.string()).optional(),
    tags,
  })
  .refine((tree) => new Set(tree.nodes.map((n) => n.id)).size === tree.nodes.length, { message: "Dialogue node ids must be unique", path: ["nodes"] });
