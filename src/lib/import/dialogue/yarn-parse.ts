/** One statement in a Yarn Spinner node body. */
export type YarnStatement =
  | { kind: "line"; speaker?: string; text: string }
  | { kind: "options"; options: { text: string; body: YarnStatement[] }[] }
  | { kind: "if"; branches: { condition: string | null; body: YarnStatement[] }[] }
  | { kind: "command"; text: string }
  | { kind: "jump"; target: string | null }
  | { kind: "stop" };

export interface YarnNode {
  title: string;
  body: YarnStatement[];
}

export interface YarnScript {
  nodes: YarnNode[];
  /** Things the importer can't keep, counted while parsing. */
  counts: { conditionalLines: number; unclosedIfs: number; strayCommands: number };
}

interface Line {
  indent: number;
  text: string;
}

const COMMAND = /^<<\s*(.*?)\s*>>$/;
const TRAILING_CONDITION = /\s*<<\s*if\s+.*>>\s*$/;
const HASHTAGS = /(\s+#[^\s#]+)+\s*$/;
const SPEAKER = /^([A-Za-z0-9_][\w .'-]{0,40}?):\s+(.*)$/;

/** Drops `// comments` (a `//` at the start or after a space, so URLs survive). */
const stripComment = (text: string) => text.replace(/(^|\s)\/\/.*$/, "").trimEnd();

function toLine(raw: string): Line {
  const expanded = raw.replace(/\t/g, "    ");
  return { indent: expanded.length - expanded.trimStart().length, text: expanded.trim() };
}

class BodyParser {
  private position = 0;

  constructor(private lines: Line[], private counts: YarnScript["counts"]) {}

  private command(line: Line | undefined): string | null {
    return line ? (COMMAND.exec(line.text)?.[1] ?? null) : null;
  }

  /** Text with its hashtags and any trailing `<<if …>>` taken off (that condition can't be kept). */
  private cleanText(text: string): string {
    const withoutTags = text.replace(HASHTAGS, "");
    if (!TRAILING_CONDITION.test(withoutTags)) return withoutTags.trim();
    this.counts.conditionalLines++;
    return withoutTags.replace(TRAILING_CONDITION, "").trim();
  }

  /** The whole body. A stray elseif/else/endif is skipped. */
  all(): YarnStatement[] {
    const statements: YarnStatement[] = [];
    while (this.position < this.lines.length) {
      statements.push(...this.block(-1));
      if (this.position < this.lines.length) {
        this.position++;
        this.counts.strayCommands++;
      }
    }
    return statements;
  }

  /** Statements until the block ends: a line indented no deeper than `parentIndent`, or an elseif/else/endif. */
  block(parentIndent: number): YarnStatement[] {
    const statements: YarnStatement[] = [];
    while (this.position < this.lines.length) {
      const line = this.lines[this.position];
      if (line.indent <= parentIndent) break;
      const command = this.command(line);
      if (command !== null && /^(elseif|else|endif)\b/.test(command)) break;
      if (line.text.startsWith("->")) {
        statements.push(this.options(line.indent));
        continue;
      }
      this.position++;
      if (command === null) statements.push(this.line(line.text));
      else if (/^if\b/.test(command)) statements.push(this.ifBlock(command.slice(2).trim(), parentIndent));
      else statements.push(this.simpleCommand(command));
    }
    return statements;
  }

  private line(text: string): YarnStatement {
    const clean = this.cleanText(text);
    const match = SPEAKER.exec(clean);
    return match ? { kind: "line", speaker: match[1].trim(), text: match[2] } : { kind: "line", text: clean };
  }

  private simpleCommand(command: string): YarnStatement {
    if (command === "stop") return { kind: "stop" };
    const jump = /^jump\s+(.+)$/.exec(command);
    if (!jump) return { kind: "command", text: command };
    const target = jump[1].trim();
    return { kind: "jump", target: /^[A-Za-z_][\w.]*$/.test(target) ? target : null };
  }

  private options(indent: number): YarnStatement {
    const options: { text: string; body: YarnStatement[] }[] = [];
    for (let line = this.lines[this.position]; line?.indent === indent && line.text.startsWith("->"); line = this.lines[this.position]) {
      this.position++;
      options.push({ text: this.cleanText(line.text.slice(2)), body: this.block(indent) });
    }
    return { kind: "options", options };
  }

  private ifBlock(condition: string, parentIndent: number): YarnStatement {
    const branches: { condition: string | null; body: YarnStatement[] }[] = [{ condition, body: this.block(parentIndent) }];
    for (;;) {
      const command = this.command(this.lines[this.position]);
      if (command === null || !/^(elseif|else|endif)\b/.test(command)) {
        this.counts.unclosedIfs++;
        break;
      }
      this.position++;
      if (command.startsWith("endif")) break;
      const elseIf = /^elseif\s+(.*)$/.exec(command);
      branches.push({ condition: elseIf ? elseIf[1].trim() : null, body: this.block(parentIndent) });
    }
    return { kind: "if", branches };
  }
}

/** Splits a `.yarn` file into nodes (`title:` headers, `---` body `===`) and parses each body. */
export function parseYarn(text: string): YarnScript {
  const counts = { conditionalLines: 0, unclosedIfs: 0, strayCommands: 0 };
  const nodes: YarnNode[] = [];
  let title = "";
  let body: Line[] | null = null;
  for (const raw of text.replace(/^﻿/, "").split(/\r?\n/)) {
    const content = stripComment(raw);
    if (body === null) {
      if (content.trim() === "---") body = [];
      else {
        const header = /^\s*title\s*:\s*(.+)$/.exec(content);
        if (header) title = header[1].trim();
      }
    } else if (content.trim() === "===") {
      if (title) nodes.push({ title, body: new BodyParser(body, counts).all() });
      title = "";
      body = null;
    } else if (content.trim()) body.push(toLine(content));
  }
  if (body !== null && title) nodes.push({ title, body: new BodyParser(body, counts).all() });
  return { nodes, counts };
}
