# Crystal Cave for Unity

4 × 3 tiles of 8 px. Layers: `Rock`, `Secrets`.
Auto-tile terrains: `Rock` (16 tiles, sides), `Moss` (47 tiles, sides and corners).
Has collision: solid cells and one-way platforms (solid from above only).

| File | What it is |
| --- | --- |
| `crystal_cave_tiles.png` | The tiles, sliced into sprites `crystal_cave_tile_<n>` (Point filter), plus `crystal_cave_solid` and `crystal_cave_one_way` collision tiles. |
| `crystal_cave.png` | The whole map as one picture, for a quick backdrop. |
| `crystal_cave.json` | The map in Tiled's JSON format: each layer's tiles and a Collision object layer of rectangles. |

## Load it
1. Copy the `crystal_cave` folder into `Assets` (keep the `.meta` files next to the PNGs).
2. Quick look: drag `crystal_cave.png` into the scene. One tile is one unit.
3. To paint with the tiles: Window > 2D > Tile Palette, Create New Palette, then drag `crystal_cave_tiles.png` onto it.
4. To rebuild the layout and collision: in `crystal_cave.json`, each layer's `data` lists tiles row by row from the
   top-left; a number n means sprite `crystal_cave_tile_<n-1>` and 0 is empty. Collision rectangles are in pixels with y
   pointing down. Or open the JSON in Tiled (free), save it as .tmx and import that with SuperTiled2Unity.

---
Made with GameDev Studio (https://gamedev-studio.pladsen.dev). Free to use in any project, no watermark, no credit needed.
