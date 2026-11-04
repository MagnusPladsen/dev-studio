import { spawn } from "node:child_process";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { readConfig } from "./config";
import { maskEmail, Session } from "./auth/session";
import { openTokenStore } from "./auth/token-store";
import { createStudioClient } from "./store/client";
import { createStudioServer, SERVER_VERSION } from "./server";

/** stdout carries the MCP protocol, so every human-readable line goes to stderr. */
const say = (line: string) => process.stderr.write(`${line}\n`);

function openBrowser(url: string): Promise<void> {
  const [command, args] =
    process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  return new Promise((resolve, reject) => {
    const child = spawn(command, args as string[], { stdio: "ignore", detached: true });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

const HELP = `dev-studio-mcp ${SERVER_VERSION}: MCP server for Dev Studio and GameDev Studio.

  dev-studio-mcp          run the server over stdio (what Claude starts)
  dev-studio-mcp login    sign in in the browser
  dev-studio-mcp logout   forget this computer's sign-in
  dev-studio-mcp whoami   show who is signed in

Env: STUDIO_AUTH=cli (fallback sign-in), STUDIO_DEFAULT_APP, STUDIO_SUPABASE_URL, STUDIO_SUPABASE_KEY, STUDIO_CLIENT_ID.`;

const COMMANDS = [undefined, "serve", "login", "logout", "whoami"];

async function main(command: string | undefined): Promise<number> {
  if (!COMMANDS.includes(command)) {
    say(HELP);
    return command === "help" || command === "--help" || command === "-h" ? 0 : 2;
  }
  const config = readConfig();
  const store = await openTokenStore(config.supabaseUrl, say);
  const session = new Session({ config, store, openBrowser });

  switch (command) {
    case undefined:
    case "serve": {
      // Library code that logs must not write into the protocol stream.
      console.log = console.info = console.debug = console.error;
      const server = createStudioServer(config, session, createStudioClient(config, session));
      await server.connect(new StdioServerTransport());
      return -1;
    }
    case "login": {
      const who = await session.signIn((url) => say(`Opening the browser. If it doesn't open, go to:\n${url}`));
      say(`Signed in as ${maskEmail(who.email)}.`);
      return 0;
    }
    case "logout":
      await session.signOut();
      say("Signed out on this computer. To cut access everywhere, press Disconnect under Use with Claude in the app.");
      return 0;
    case "whoami": {
      const who = await session.identity();
      say(who ? `Signed in as ${maskEmail(who.email)} (${who.mode === "cli" ? "fallback sign-in" : "OAuth"}), kept in ${store.describe()}.` : "Not signed in.");
      return who ? 0 : 1;
    }
  }
  return 2;
}

main(process.argv[2]).then(
  (code) => {
    if (code >= 0) process.exit(code);
  },
  (error: unknown) => {
    say(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
);
