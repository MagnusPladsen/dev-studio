import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, type CallToolResult } from "@modelcontextprotocol/server";
import { readConfig } from "../config";
import type { Session } from "../auth/session";
import { createStudioServer } from "../server";
import type { FakeSupabase } from "./fake-supabase";

export const signedIn = { accessToken: async () => "token", identity: async () => ({ userId: "u1", email: "magnus@example.com", mode: "oauth" }) } as unknown as Session;

export type ToolCall = (name: string, args?: Record<string, unknown>) => Promise<{ text: string; data: Record<string, unknown>; isError: boolean }>;

/** A real MCP client talking to the server over an in-memory transport, backed by the fake Supabase. */
export async function connectClient(db: FakeSupabase, session: Session = signedIn): Promise<{ client: Client; call: ToolCall }> {
  const server = createStudioServer(readConfig({}), session, db.client);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "test", version: "1" });
  await client.connect(clientSide);
  const call: ToolCall = async (name, args = {}) => {
    const result = (await client.callTool({ name, arguments: args })) as CallToolResult;
    const text = result.content.map((c) => (c.type === "text" ? c.text : "")).join("\n");
    return { text, data: (result.structuredContent ?? {}) as Record<string, unknown>, isError: Boolean(result.isError) };
  };
  return { client, call };
}
