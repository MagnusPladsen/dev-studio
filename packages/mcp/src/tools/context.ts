import type { McpServer } from "@modelcontextprotocol/server";
import type { CallToolResult } from "@modelcontextprotocol/server";
import type { ServerConfig } from "../config";
import type { Session } from "../auth/session";
import type { Studio } from "../store/studio";

export interface ToolContext {
  server: McpServer;
  config: ServerConfig;
  session: Session;
  studio: Studio;
}

export function result(text: string, structured?: Record<string, unknown>): CallToolResult {
  return structured ? { content: [{ type: "text", text }], structuredContent: structured } : { content: [{ type: "text", text }] };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message);
  return String(error);
}

/** Tool errors go back to Claude as text it can act on, not as protocol errors. */
export async function guarded(run: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await run();
  } catch (error) {
    return { content: [{ type: "text", text: errorMessage(error) }], isError: true };
  }
}

export const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;
export const WRITES = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;
