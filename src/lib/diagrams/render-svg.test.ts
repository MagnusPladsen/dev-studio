import { describe, expect, it } from "vitest";
import type { Diagram, DiagramNode } from "@/types";
import { LINK_THUMB, SONG_COVER } from "./cards";
import { PROVIDER_COLORS } from "./embeds";
import { renderDiagramSvg } from "./render-svg";
import { escapeXml, wrapByWidth } from "./svg-cards";

const node = (extra: Partial<DiagramNode>): DiagramNode => ({ id: "n", type: "note", x: 0, y: 0, width: 200, height: 80, label: "", ...extra });
const diagram = (nodes: DiagramNode[], edges: Diagram["edges"] = []): Diagram => ({
  id: "d",
  projectId: "p",
  name: "Board",
  nodes,
  edges,
  tags: [],
  createdAt: "",
  updatedAt: "",
});
const render = (d: Diagram) => renderDiagramSvg({ diagram: d, rectOf: (n) => n, describeAsset: () => null });

describe("escapeXml", () => {
  it("should escape markup characters when text goes into SVG", () => {
    expect(escapeXml(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&apos;");
  });
});

describe("wrapByWidth", () => {
  it("should break between words when a line gets too long", () => {
    expect(wrapByWidth("one two three four", 30, 10)).toEqual(["one", "two", "three", "four"]);
  });

  it("should keep the text's own line breaks when wrapping", () => {
    expect(wrapByWidth("a\nb", 1000, 10)).toEqual(["a", "b"]);
  });
});

describe("renderDiagramSvg", () => {
  it("should crop the view box to the cards plus padding when exporting", () => {
    const svg = render(diagram([node({ x: 100, y: 50, width: 200, height: 80 })]));
    expect(svg).toContain('viewBox="60 10 280 160"');
  });

  it("should escape card text when a note contains markup", () => {
    const svg = render(diagram([node({ label: "<script>alert(1)</script>" })]));
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
  });

  it("should escape colours when saved data holds something other than a colour", () => {
    const svg = render(diagram([node({ color: '"/><script>x</script>' })]));
    expect(svg).not.toContain("<script>");
  });

  it("should draw an ellipse when the board has an ellipse shape", () => {
    expect(render(diagram([node({ type: "ellipse", label: "Boss" })]))).toMatch(/<ellipse[^>]*cx="100"/);
  });

  it("should draw a path when the board has a drawing", () => {
    const drawing = node({ type: "drawing", width: 10, height: 10, data: { points: [[0, 0], [10, 10]], box: { width: 10, height: 10 } } });
    expect(render(diagram([drawing]))).toContain('<path d="M0 0 L10 10"');
  });

  it("should draw a song with its service accent when a link card holds a Spotify album", () => {
    const card = node({ type: "link", width: 300, height: 112, data: { url: "https://open.spotify.com/album/1ZfETfec0U02KrKNI8w3Gf", preview: { title: "Celeste" } } });
    const svg = render(diagram([card]));
    expect(svg).toContain(`fill="${PROVIDER_COLORS.spotify}"`);
    expect(svg).toContain(`width="${SONG_COVER}" height="${SONG_COVER}"`);
  });

  it("should draw a video frame with the provider badge when a link card holds a YouTube video", () => {
    const card = node({ type: "link", width: 320, height: 260, data: { url: "https://www.youtube.com/watch?v=yorTG9at90g" } });
    const svg = render(diagram([card]));
    expect(svg).toContain(">YouTube</tspan>");
    expect(svg).toContain(`height="${320 / (16 / 9)}"`);
  });

  it("should draw a small thumbnail rather than a hero image when a link card holds a plain page", () => {
    const card = node({ type: "link", width: 280, height: 64, data: { url: "https://lospec.com/palette-list", preview: { image: "https://cdn.lospec.com/card.png" } } });
    expect(render(diagram([card]))).toMatch(new RegExp(`<svg x="12" y="12" width="${LINK_THUMB}" height="${LINK_THUMB}"`));
  });

  it("should draw an arrow line when two cards are connected", () => {
    const a = node({ id: "a" });
    const b = node({ id: "b", x: 400 });
    const svg = render(diagram([a, b], [{ id: "e", from: "a", to: "b", type: "arrow" }]));
    expect(svg).toMatch(/<line[^>]*marker-end="url\(#arrow\)"/);
  });
});
