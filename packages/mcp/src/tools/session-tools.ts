import * as z from "zod";
import { maskEmail } from "../auth/session";
import { guarded, READ_ONLY, result, type ToolContext } from "./context";

export function registerSessionTools({ server, session }: ToolContext): void {
  server.registerTool(
    "sign_in",
    {
      title: "Sign in",
      description: "Opens the browser to connect Claude to the user's Dev Studio / GameDev Studio account. Waits up to 5 minutes.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    () =>
      guarded(async () => {
        let link = "";
        const who = await session.signIn((url) => (link = url));
        return result(`Signed in as ${maskEmail(who.email)}.`, { signedIn: true, email: maskEmail(who.email), link });
      })
  );

  server.registerTool(
    "whoami",
    { title: "Who is signed in", description: "Shows which account Claude is connected to.", inputSchema: z.object({}), annotations: READ_ONLY },
    () =>
      guarded(async () => {
        const who = await session.identity();
        if (!who) return result("Not signed in. Call sign_in.", { signedIn: false });
        return result(`Signed in as ${maskEmail(who.email)} (${who.mode === "cli" ? "fallback sign-in" : "OAuth"}).`, {
          signedIn: true,
          email: maskEmail(who.email),
          mode: who.mode,
        });
      })
  );

  server.registerTool(
    "sign_out",
    {
      title: "Sign out",
      description: "Forgets this computer's sign-in. To cut access everywhere, use Disconnect under Use with Claude in the app.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    () =>
      guarded(async () => {
        await session.signOut();
        return result("Signed out on this computer.", { signedIn: false });
      })
  );
}
