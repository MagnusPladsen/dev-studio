import { NextResponse, type NextRequest } from "next/server";
import { ASSET_KINDS, ASSET_TYPES } from "@/lib/assets";

const ENABLED_TOOL_PATHS = new Set(["assets", ...ASSET_TYPES.map((type) => ASSET_KINDS[type].path)]);

/** Sends links to tools this app doesn't have (e.g. Pixel Art in Dev Studio) to the project dashboard. */
export function proxy(request: NextRequest): NextResponse {
  const [, , projectId, tool] = request.nextUrl.pathname.split("/");
  if (!tool || ENABLED_TOOL_PATHS.has(tool)) return NextResponse.next();
  return NextResponse.redirect(new URL(`/project/${projectId}/assets`, request.url));
}

export const config = {
  matcher: "/project/:projectId/:tool/:path*",
};
