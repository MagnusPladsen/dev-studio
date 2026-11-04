import { MCP_LOOPBACK_PORTS } from "@/lib/mcp-auth";
import { appConfigFor, type AppId } from "@/lib/app-config";

/** Public by design: the project URL, its anon key (shipped in the site's JS) and the OAuth client id. */
const SUPABASE_URL = "https://lznqrdbvamheoisjaoqr.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6bnFyZGJ2YW1oZW9pc2phb3FyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzMjI2NjMsImV4cCI6MjEwODg5ODY2M30.7lyqGsYWBskiU-tal0s44iuA5DOv1KX43pFD2AAqcog";
const CLIENT_ID = "307f2e96-2f35-4a4e-a116-0d5c4302551f";

export type AuthMode = "oauth" | "cli";

export interface ServerConfig {
  supabaseUrl: string;
  supabaseKey: string;
  clientId: string;
  authMode: AuthMode;
  /** Where the `/auth/cli` fallback page lives (the Site URL, which is the GameDev Studio domain). */
  siteUrl: string;
  /** `STUDIO_DEFAULT_APP`, for new projects; unset means the app of the most recently changed project. */
  defaultApp?: AppId;
  ports: readonly number[];
}

export function readConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  return {
    supabaseUrl: (env.STUDIO_SUPABASE_URL ?? SUPABASE_URL).replace(/\/$/, ""),
    supabaseKey: env.STUDIO_SUPABASE_KEY ?? SUPABASE_ANON_KEY,
    clientId: env.STUDIO_CLIENT_ID ?? CLIENT_ID,
    authMode: env.STUDIO_AUTH === "cli" ? "cli" : "oauth",
    siteUrl: (env.STUDIO_SITE_URL ?? appConfigFor(undefined).url).replace(/\/$/, ""),
    defaultApp: env.STUDIO_DEFAULT_APP ? appConfigFor(env.STUDIO_DEFAULT_APP).id : undefined,
    ports: MCP_LOOPBACK_PORTS,
  };
}
