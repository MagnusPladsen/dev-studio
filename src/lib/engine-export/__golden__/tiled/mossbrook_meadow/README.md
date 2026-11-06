# Mossbrook Meadow for Tiled

32 × 18 tiles of 16 px. Layers: `Ground`, `Objects`.
Auto-tile terrains: `Ground` (16 tiles, sides).
Has collision: solid cells and one-way platforms (solid from above only).

| File | What it is |
| --- | --- |
| `mossbrook_meadow.tmx` | The map (Tiled XML), using the tileset below. |
| `mossbrook_meadow.tsx` | The tileset: the tiles, terrains as Wang sets, and two collision tiles with a `collides` property. |
| `mossbrook_meadow_tiles.png` | The tileset image. |
| `mossbrook_meadow.tmj` | The same map as Tiled JSON with the tileset embedded, for engines that read JSON. |

## Load it
Open `mossbrook_meadow.tmx` in Tiled (free, mapeditor.org). Collision is the `Collision` object layer: rectangles of type
`solid` or `one_way`, each with a `one_way` bool property. Terrains are in the Terrain Sets panel; paint with them
using the Terrain Brush.

---
Made with GameDev Studio (https://gamedev-studio.pladsen.dev). Free to use in any project, no watermark, no credit needed.
