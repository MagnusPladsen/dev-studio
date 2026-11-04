import { describe, expect, it } from "vitest";
import packageJson from "../package.json";
import { SERVER_VERSION } from "./server";

describe("the published version", () => {
  it("is the version the server reports, so a bump in package.json is a bump everywhere", () => {
    expect(SERVER_VERSION).toBe(packageJson.version);
  });
});
