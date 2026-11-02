import { describe, expect, it } from "vitest";
import { appConfigFor, belongsToApp } from "./app-config";

describe("app config", () => {
  it("builds Dev Studio only when the flag says so", () => {
    expect(appConfigFor("dev-studio").id).toBe("dev-studio");
    expect(appConfigFor(undefined).id).toBe("gamedev-studio");
    expect(appConfigFor("something-else").id).toBe("gamedev-studio");
  });

  it("gives Dev Studio only the planning tools", () => {
    expect(appConfigFor("dev-studio").assetTypes).toEqual(["issue", "diagram", "story", "note"]);
  });

  it("treats projects without an app as GameDev Studio projects", () => {
    expect(belongsToApp({}, "gamedev-studio")).toBe(true);
    expect(belongsToApp({}, "dev-studio")).toBe(false);
    expect(belongsToApp({ app: "dev-studio" }, "dev-studio")).toBe(true);
  });
});
