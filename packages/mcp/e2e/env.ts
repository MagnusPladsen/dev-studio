import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** Set by scripts/mcp-e2e.sh from `supabase status`; the run refuses anything that isn't a local stack. */
export interface E2eEnv {
  supabaseUrl: string;
  anonKey: string;
  serviceKey: string;
  jwtSecret: string;
  mailpitUrl: string;
  appUrl: string;
  work: string;
  serverEntry: string;
}

const LOCAL = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Run this through scripts/mcp-e2e.sh.`);
  return value.replace(/\/$/, "");
}

export function readEnv(): E2eEnv {
  const env = {
    supabaseUrl: required("E2E_SUPABASE_URL"),
    anonKey: required("E2E_ANON_KEY"),
    serviceKey: required("E2E_SERVICE_KEY"),
    jwtSecret: required("E2E_JWT_SECRET"),
    mailpitUrl: required("E2E_MAILPIT_URL"),
    appUrl: required("E2E_APP_URL"),
    work: required("E2E_WORK"),
    serverEntry: fileURLToPath(new URL("../dist/index.js", import.meta.url)),
  };
  for (const url of [env.supabaseUrl, env.mailpitUrl, env.appUrl]) {
    if (!LOCAL.test(url)) throw new Error(`Refusing to run against ${url}: the end-to-end check only talks to a local stack.`);
  }
  return env;
}

/** What the MCP server needs to talk to the local stack instead of production. */
export function serverEnv(env: E2eEnv, clientId: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    ...(process.env as Record<string, string>),
    STUDIO_SUPABASE_URL: env.supabaseUrl,
    STUDIO_SUPABASE_KEY: env.anonKey,
    STUDIO_CLIENT_ID: clientId,
    STUDIO_SITE_URL: env.appUrl,
    STUDIO_DEFAULT_APP: "dev-studio",
    ...extra,
  };
}

export const shimDir = (env: E2eEnv) => join(env.work, "bin");
export const openedUrlFile = (env: E2eEnv) => join(env.work, "opened-url.txt");
