# Mossbrook Meadow for Unity

32 × 18 tiles of 16 px. Layers: `Ground`, `Objects`.
Auto-tile terrains: `Ground` (16 tiles, sides).
Has collision: solid cells and one-way platforms (solid from above only).

| File | What it is |
| --- | --- |
| `mossbrook_meadow_tiles.png` | The tiles, sliced into sprites `mossbrook_meadow_tile_<n>` (Point filter), plus `mossbrook_meadow_solid` and `mossbrook_meadow_one_way` collision tiles. |
| `mossbrook_meadow.png` | The whole map as one picture, for a quick backdrop. |
| `mossbrook_meadow.json` | The map in Tiled's JSON format: each layer's tiles and a Collision object layer of rectangles. |

## Load it
1. Copy the `mossbrook_meadow` folder into `Assets` (keep the `.meta` files next to the PNGs).
2. Quick look: drag `mossbrook_meadow.png` into the scene. One tile is one unit.
3. To paint with the tiles: Window > 2D > Tile Palette, Create New Palette, then drag `mossbrook_meadow_tiles.png` onto it.
4. To rebuild the layout and collision: in `mossbrook_meadow.json`, each layer's `data` lists tiles row by row from the
   top-left; a number n means sprite `mossbrook_meadow_tile_<n-1>` and 0 is empty. Collision rectangles are in pixels with y
   pointing down. Or open the JSON in Tiled (free), save it as .tmx and import that with SuperTiled2Unity.

---
Made with GameDev Studio (https://gamedev-studio.pladsen.dev). Free to use in any project, no watermark, no credit needed.
