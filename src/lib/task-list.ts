/** A markdown task item: "- [ ] text" or "* [x] text", possibly indented. */
const TASK_LINE = /^(\s*[-*]\s+\[)([ xX])(\]\s+)(.*)$/;

export interface TaskItem {
  line: number;
  done: boolean;
  text: string;
}

export function parseTask(line: string, index: number): TaskItem | null {
  const m = line.match(TASK_LINE);
  return m ? { line: index, done: m[2] !== " ", text: m[4] } : null;
}

export function taskProgress(text: string): { done: number; total: number } {
  const tasks = text.split("\n").flatMap((l, i) => parseTask(l, i) ?? []);
  return { done: tasks.filter((t) => t.done).length, total: tasks.length };
}

/** Ticks or unticks the task on the given line; other lines are left exactly as they were. */
export function toggleTask(text: string, line: number): string {
  const lines = text.split("\n");
  const m = lines[line]?.match(TASK_LINE);
  if (!m) return text;
  lines[line] = `${m[1]}${m[2] === " " ? "x" : " "}${m[3]}${m[4]}`;
  return lines.join("\n");
}
