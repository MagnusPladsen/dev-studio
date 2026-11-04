# Plain for Unity

4 × 3 tiles of 8 px. Layers: `Rock`, `Secrets`.
No collision painted.

| File | What it is |
| --- | --- |
| `plain_tiles.png` | The tiles, sliced into sprites `plain_tile_<n>` (Point filter), plus `plain_solid` and `plain_one_way` collision tiles. |
| `plain.png` | The whole map as one picture, for a quick backdrop. |
| `plain.json` | The map in Tiled's JSON format: each layer's tiles and a Collision object layer of rectangles. |

## Load it
1. Copy the `plain` folder into `Assets` (keep the `.meta` files next to the PNGs).
2. Quick look: drag `plain.png` into the scene. One tile is one unit.
3. To paint with the tiles: Window > 2D > Tile Palette, Create New Palette, then drag `plain_tiles.png` onto it.
4. To rebuild the layout and collision: in `plain.json`, each layer's `data` lists tiles row by row from the
   top-left; a number n means sprite `plain_tile_<n-1>` and 0 is empty. Collision rectangles are in pixels with y
   pointing down. Or open the JSON in Tiled (free), save it as .tmx and import that with SuperTiled2Unity.

---
Made with GameDev Studio (https://gamedev-studio.pladsen.dev). Free to use in any project, no watermark, no credit needed.
