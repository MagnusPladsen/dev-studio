import { describe, expect, it } from "vitest";
import { relationMark, routeEdge } from "./edge-route";
import { edgeEndpoints } from "./geometry";

const left = { x: 0, y: 0, width: 100, height: 100 };
const right = { x: 300, y: 0, width: 100, height: 100 };

describe("routeEdge", () => {
  it("should be the straight card-to-card line when no end is a row", () => {
    const { start, end } = edgeEndpoints(left, right);
    expect(routeEdge({ rect: left }, { rect: right }).points).toEqual([start, end]);
  });

  it("should leave a row sideways, towards the other table", () => {
    const { points } = routeEdge({ rect: left, anchorY: 60 }, { rect: right, anchorY: 20 });
    expect(points).toEqual([{ x: 102, y: 60 }, { x: 124, y: 60 }, { x: 274, y: 20 }, { x: 296, y: 20 }]);
  });

  it("should leave from the left side when the other end is to the left", () => {
    expect(routeEdge({ rect: right, anchorY: 50 }, { rect: left }).points[0]).toEqual({ x: 298, y: 50 });
  });
});

describe("relationMark", () => {
  const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }];

  it("should draw one bar across the line for a one end", () => {
    expect(relationMark(points, "end", "one")).toEqual([[{ x: 91, y: 6 }, { x: 91, y: -6 }]]);
  });

  it("should draw three toes meeting at the card for a many end", () => {
    const toes = relationMark(points, "start", "many");
    expect(toes.map(([, toe]) => toe)).toEqual([{ x: 0, y: -6 }, { x: 0, y: 0 }, { x: 0, y: 6 }]);
  });
});
