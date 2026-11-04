import { createServer, type Server } from "node:http";

export type CallbackResult = { ok: true; code: string } | { ok: false; error: string };

export interface LoopbackListener {
  port: number;
  /** Resolves on the first request to /callback that carries our `state` (or after the timeout). */
  result: Promise<CallbackResult>;
  close(): void;
}

const PAGE = (message: string) =>
  `<!doctype html><meta charset="utf-8"><title>Dev Studio &amp; GameDev Studio</title>` +
  `<body style="font-family:system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem"><p>${message}</p></body>`;

const DONE = PAGE("Signed in. You can close this tab and go back to Claude.");
const DENIED = PAGE("You said no, so Claude is not connected. You can close this tab.");
const FAILED = PAGE("Sign-in did not finish. Close this tab and start it again from Claude.");

function listen(server: Server, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => resolve(true));
  });
}

function outcome(url: URL, state: string): CallbackResult | null {
  if (url.pathname !== "/callback" || url.searchParams.get("state") !== state) return null;
  const error = url.searchParams.get("error");
  if (error) return { ok: false, error: error === "access_denied" ? "access_denied" : "sign_in_failed" };
  const code = url.searchParams.get("code");
  return code ? { ok: true, code } : { ok: false, error: "no_code" };
}

/**
 * Listens on 127.0.0.1 (never all interfaces) on the first free port, for one redirect that carries
 * `state`. The page never echoes query values. Stops after the first valid hit or `timeoutMs`.
 */
export async function startLoopback(ports: readonly number[], state: string, timeoutMs = 5 * 60_000): Promise<LoopbackListener> {
  let settle: (result: CallbackResult) => void = () => {};
  const result = new Promise<CallbackResult>((resolve) => (settle = resolve));
  const server = createServer((request, response) => {
    const found = outcome(new URL(request.url ?? "/", "http://127.0.0.1"), state);
    response.writeHead(found ? 200 : 404, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    response.end(!found ? FAILED : found.ok ? DONE : found.error === "access_denied" ? DENIED : FAILED);
    if (found) settle(found);
  });
  for (const port of ports) {
    if (!(await listen(server, port))) continue;
    const timer = setTimeout(() => settle({ ok: false, error: "timeout" }), timeoutMs);
    const close = () => {
      clearTimeout(timer);
      server.close();
      server.closeAllConnections();
    };
    void result.finally(close);
    return { port, result, close };
  }
  throw new Error(`Ports ${ports.join(", ")} are all in use. Close whatever uses them and try again.`);
}
