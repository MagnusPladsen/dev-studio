import { describe, expect, it } from "vitest";
import { imageSrc, itemsFromLines, linkCardSize, linkLook, linkPreview, linkUrl } from "./cards";

describe("linkCardSize", () => {
  it("should start a compact card when the link is a plain page", () => {
    expect(linkCardSize("https://lospec.com/palette-list")).toEqual({ width: 280, height: 64 });
  });

  it("should start a song-shaped card when the link is a track", () => {
    expect(linkCardSize("https://tidal.com/browse/track/77646169")).toEqual({ width: 320, height: 112 });
  });
});

describe("linkLook", () => {
  it("should fall back to the domain when there is no title or label", () => {
    const look = linkLook({ id: "n", type: "link", x: 0, y: 0, width: 280, height: 64, label: "", data: { url: "https://www.lospec.com/x" } });
    expect(look.title).toBe("lospec.com");
  });
});

describe("itemsFromLines", () => {
  let next = 0;
  const makeId = () => `new${++next}`;
  const previous = [
    { id: "a", text: "Sketch Pip", done: true },
    { id: "b", text: "Pick palette", done: false },
  ];

  it("keeps ticks for unchanged lines, even when reordered", () => {
    const items = itemsFromLines(["Pick palette", "Sketch Pip"], previous, makeId);
    expect(items).toEqual([previous[1], previous[0]]);
  });

  it("keeps the tick of an edited line and adds new lines unticked", () => {
    const items = itemsFromLines(["Sketch Pip idle", "Pick palette", "", "Animate run"], previous, makeId);
    expect(items[0]).toEqual({ id: "a", text: "Sketch Pip idle", done: true });
    expect(items[1]).toEqual(previous[1]);
    expect(items[2]).toMatchObject({ text: "Animate run", done: false });
    expect(items).toHaveLength(3);
  });
});

describe("stored URLs", () => {
  const node = (data: Record<string, unknown>) => ({ id: "n", type: "link" as const, x: 0, y: 0, width: 1, height: 1, label: "", data });

  it("drops anything that isn't a web address, whatever got saved", () => {
    expect(linkUrl(node({ url: "javascript:alert(1)" }))).toBeUndefined();
    expect(linkPreview(node({ preview: { title: "x", image: "javascript:alert(1)" } }))).toMatchObject({ title: "x", image: undefined });
    expect(imageSrc(node({ src: "data:text/html,<script>" }))).toBeUndefined();
  });

  it("keeps web links and image data", () => {
    expect(linkUrl(node({ url: "https://lospec.com/" }))).toBe("https://lospec.com/");
    expect(imageSrc(node({ src: "data:image/png;base64,AAAA" }))).toBe("data:image/png;base64,AAAA");
  });
});
