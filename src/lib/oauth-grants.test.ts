import { describe, expect, it } from "vitest";
import type { OAuthGrant } from "@supabase/supabase-js";
import { formatGrantedAt, grantsStateFrom, withoutGrant } from "./oauth-grants";

function grant(id: string, grantedAt: string): OAuthGrant {
  return { client: { id, name: `Client ${id}`, uri: "", logo_uri: "" }, scopes: ["openid", "email"], granted_at: grantedAt };
}

describe("grantsStateFrom", () => {
  it("is an error when Supabase fails", () => {
    expect(grantsStateFrom({ data: null, error: { message: "OAuth server is disabled" } })).toEqual({ kind: "error", message: "OAuth server is disabled" });
  });

  it("is empty with no grants", () => {
    expect(grantsStateFrom({ data: [], error: null })).toEqual({ kind: "empty" });
    expect(grantsStateFrom({ data: null, error: null })).toEqual({ kind: "empty" });
  });

  it("lists grants newest first", () => {
    const older = grant("a", "2026-10-01T10:00:00Z");
    const newer = grant("b", "2026-11-02T10:00:00Z");
    expect(grantsStateFrom({ data: [older, newer], error: null })).toEqual({ kind: "list", grants: [newer, older] });
  });
});

describe("withoutGrant", () => {
  it("drops a disconnected app and becomes empty after the last one", () => {
    const state = grantsStateFrom({ data: [grant("a", "2026-10-01T10:00:00Z"), grant("b", "2026-10-02T10:00:00Z")], error: null });
    const afterOne = withoutGrant(state, "a");
    expect(afterOne).toEqual({ kind: "list", grants: [grant("b", "2026-10-02T10:00:00Z")] });
    expect(withoutGrant(afterOne, "b")).toEqual({ kind: "empty" });
  });

  it("leaves other states alone", () => {
    expect(withoutGrant({ kind: "loading" }, "a")).toEqual({ kind: "loading" });
  });
});

describe("formatGrantedAt", () => {
  it("formats a date and tolerates junk", () => {
    expect(formatGrantedAt("2026-11-03T12:00:00Z", "en-GB")).toBe("3 Nov 2026");
    expect(formatGrantedAt("not a date")).toBe("");
  });
});
