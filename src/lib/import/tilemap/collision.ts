import { COLLISION, collisionFromRects, hasCollision, type CollisionRect } from "@/lib/tilemap/collision";
import type { TiledLayer, TiledMap } from "./tiled-model";

type ObjectLayer = Extract<TiledLayer, { kind: "object" }>;

const COLLISION_LAYER = /collision|collide|solid/i;
const COLLISION_TYPE = /^(solid|collision|wall|one[_ -]?way|platform)$/i;
const ONE_WAY_TYPE = /one[_ -]?way|platform/i;

/** An object layer is read as collision when its name or its objects' types say so. */
export function isCollisionLayer(layer: ObjectLayer): boolean {
  return COLLISION_LAYER.test(layer.name) || layer.objects.some((object) => COLLISION_TYPE.test(object.type));
}

/**
 * The map's collision from its collision object layers: each rectangle marks the cells whose centre it covers.
 * Returns undefined when there is none, so maps without collision stay without it.
 */
export function readCollision(map: TiledMap, bounds: { x: number; y: number; width: number; height: number }, warnings: string[]) {
  const layers = map.layers.filter((layer): layer is ObjectLayer => layer.kind === "object" && isCollisionLayer(layer));
  const objects = layers.flatMap((layer) => layer.objects);
  const skipped = objects.filter((object) => object.shape !== "rectangle").length;
  if (skipped) warnings.push(`${skipped} collision shape${skipped === 1 ? " wasn't a rectangle and was" : "s weren't rectangles and were"} skipped.`);
  const rects = objects
    .filter((object) => object.shape === "rectangle")
    .map(
      (object): CollisionRect => ({
        x: object.x / map.tileWidth - bounds.x,
        y: object.y / map.tileHeight - bounds.y,
        width: object.width / map.tileWidth,
        height: object.height / map.tileHeight,
        value: object.isOneWay || ONE_WAY_TYPE.test(object.type) ? COLLISION.oneWay : COLLISION.solid,
      })
    );
  const grid = collisionFromRects(rects, bounds.width, bounds.height);
  return hasCollision(grid) ? grid : undefined;
}
