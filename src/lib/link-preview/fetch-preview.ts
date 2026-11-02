import { lookup } from "node:dns";
import http, { type IncomingMessage } from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import type { LinkPreview } from "@/lib/diagrams/cards";
import { embedFor, imageUrlFor, PROVIDER_NAMES, type EmbedProvider } from "@/lib/diagrams/embeds";
import { parsePageMeta } from "./meta";
import { isPrivateAddress, isPrivateHostname } from "./safe-host";

const DEADLINE_MS = 8000;
const MAX_BYTES = 512 * 1024;
const MAX_REDIRECTS = 4;
const USER_AGENT = "GameDevStudioLinkPreview/1.0 (+https://gamedev-studio.pladsen.dev)";

// Only these fixed oEmbed endpoints are asked directly; every other service's page goes through `fetchPublic`.
const OEMBED: Partial<Record<EmbedProvider, string>> = {
  youtube: "https://www.youtube.com/oembed?format=json&url=",
  youtubeMusic: "https://www.youtube.com/oembed?format=json&url=",
  spotify: "https://open.spotify.com/oembed?url=",
  vimeo: "https://vimeo.com/api/oembed.json?url=",
  soundcloud: "https://soundcloud.com/oembed?format=json&url=",
};

export class PreviewError extends Error {}

function assertAllowedUrl(url: URL): void {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new PreviewError("Only web links can be previewed");
  if (url.port && url.port !== "80" && url.port !== "443") throw new PreviewError("Unusual ports are not previewed");
  if (url.username || url.password) throw new PreviewError("Links with passwords are not previewed");
  if (isPrivateHostname(url.hostname)) throw new PreviewError("Private addresses are not previewed");
}

/**
 * Resolves for the socket itself and refuses private answers, so the address that was checked is the
 * one connected to. A second lookup (DNS rebinding) can't slip an internal address in after the check.
 */
const publicOnlyLookup: LookupFunction = (hostname, options, callback) => {
  lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, "", 0);
    if (addresses.length === 0 || addresses.some((entry) => isPrivateAddress(entry.address))) {
      return callback(new PreviewError("Private addresses are not previewed"), "", 0);
    }
    if (options.all) return (callback as unknown as (e: null, a: typeof addresses) => void)(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
};

function get(url: URL, accept: string, signal: AbortSignal): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const request = client.get(url, { lookup: publicOnlyLookup, signal, headers: { "user-agent": USER_AGENT, accept } }, resolve);
    request.on("error", reject);
  });
}

/** Fetches a public page, re-checking the address on every redirect so a link can't point the server inwards. */
async function fetchPublic(start: string, accept: string, signal: AbortSignal): Promise<{ response: IncomingMessage; finalUrl: string }> {
  let url = new URL(start);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    assertAllowedUrl(url);
    const response = await get(url, accept, signal);
    const status = response.statusCode ?? 0;
    const location = response.headers.location;
    if (status >= 300 && status < 400 && location) {
      response.destroy();
      url = new URL(location, url);
      continue;
    }
    if (status < 200 || status >= 300) {
      response.destroy();
      throw new PreviewError(`The site answered ${status}`);
    }
    return { response, finalUrl: url.toString() };
  }
  throw new PreviewError("Too many redirects");
}

async function readCapped(response: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of response as AsyncIterable<Buffer>) {
    chunks.push(chunk);
    size += chunk.byteLength;
    if (size >= MAX_BYTES) break;
  }
  response.destroy();
  return Buffer.concat(chunks).subarray(0, MAX_BYTES).toString("utf8");
}

async function oembedPreview(provider: EmbedProvider, endpoint: string, link: string, signal: AbortSignal): Promise<LinkPreview> {
  // YouTube's oEmbed answers for www.youtube.com addresses, so YouTube Music links are asked that way.
  const target = provider === "youtubeMusic" ? link.replace("//music.youtube.com/", "//www.youtube.com/") : link;
  const response = await fetch(endpoint + encodeURIComponent(target), {
    signal,
    headers: { "user-agent": USER_AGENT, accept: "application/json" },
  });
  if (!response.ok) throw new PreviewError(`${PROVIDER_NAMES[provider]} answered ${response.status}`);
  const data = (await response.json()) as Record<string, unknown>;
  const text = (key: string) => (typeof data[key] === "string" ? (data[key] as string).slice(0, 200) : undefined);
  return {
    title: text("title"),
    description: text("author_name"),
    image: text("thumbnail_url"),
    siteName: PROVIDER_NAMES[provider],
  };
}

async function pagePreview(link: string, signal: AbortSignal): Promise<LinkPreview> {
  const { response, finalUrl } = await fetchPublic(link, "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", signal);
  const type = response.headers["content-type"] ?? "";
  if (type.startsWith("image/") || !type.includes("html")) {
    response.destroy();
    return type.startsWith("image/") ? { image: finalUrl } : {};
  }
  return parsePageMeta(await readCapped(response), finalUrl);
}

export async function fetchLinkPreview(link: string): Promise<LinkPreview> {
  const signal = AbortSignal.timeout(DEADLINE_MS);
  const embed = embedFor(link);
  const endpoint = embed && OEMBED[embed.provider];
  if (embed && endpoint) return oembedPreview(embed.provider, endpoint, link, signal);
  const image = imageUrlFor(link);
  if (image) return { image };
  const preview = await pagePreview(link, signal);
  return embed ? { ...preview, siteName: PROVIDER_NAMES[embed.provider] } : preview;
}
