import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

/** Starts a built server over stdio, the way Claude does, and returns what it offers. Needs no sign-in. */
export async function listCapabilities(command, args = []) {
  const client = new Client({ name: "dev-studio-mcp-packaging", version: "1" });
  await client.connect(new StdioClientTransport({ command, args, stderr: "inherit" }));
  try {
    const { tools } = await client.listTools();
    const prompts = client.getServerCapabilities()?.prompts ? (await client.listPrompts()).prompts : [];
    return { tools, prompts };
  } finally {
    await client.close();
  }
}
