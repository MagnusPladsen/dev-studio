import type { NextRequest } from "next/server";
import { normalizeUrl } from "@/lib/diagrams/embeds";
import { fetchLinkPreview, PreviewError } from "@/lib/link-preview/fetch-preview";
import { APP } from "@/lib/app-config";
import { isCrossSiteRequest } from "@/lib/link-preview/same-origin";

export async function GET(request: NextRequest) {
  if (isCrossSiteRequest(request.headers, request.nextUrl.host)) {
    return Response.json({ error: `Only available inside ${APP.name}` }, { status: 403 });
  }
  const raw = request.nextUrl.searchParams.get("url") ?? "";
  const url = raw.length <= 2048 ? normalizeUrl(raw) : null;
  if (!url) return Response.json({ error: "Not a web link" }, { status: 400 });
  try {
    const preview = await fetchLinkPreview(url);
    return Response.json(preview, { headers: { "cache-control": "public, max-age=3600, s-maxage=86400" } });
  } catch (error) {
    const message = error instanceof PreviewError ? error.message : "Could not load a preview";
    console.warn("link preview failed", { host: new URL(url).hostname, reason: message });
    return Response.json({ error: message }, { status: 502 });
  }
}
