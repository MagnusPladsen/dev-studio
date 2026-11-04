/** A tiny reporter: every check prints one line, failures are collected and fail the run at the end. */
const failures: string[] = [];
let passed = 0;

export function check(label: string, ok: boolean, detail?: unknown): boolean {
  if (ok) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    const shown = detail === undefined ? "" : `\n         ${typeof detail === "string" ? detail : JSON.stringify(detail)}`.slice(0, 1200);
    failures.push(label);
    console.log(`  FAIL ${label}${shown}`);
  }
  return ok;
}

/** For a step later steps can't run without. */
export function must<T>(label: string, value: T | null | undefined, detail?: unknown): T {
  if (!check(label, value !== null && value !== undefined, detail)) throw new Error(`Stopped: ${label}`);
  return value as T;
}

export function section(title: string) {
  console.log(`\n${title}`);
}

export function summary(): number {
  console.log(`\n${passed} checks passed, ${failures.length} failed.`);
  for (const failure of failures) console.log(`  - ${failure}`);
  return failures.length ? 1 : 0;
}
