# Crystal Cave for Tiled

4 × 3 tiles of 8 px. Layers: `Rock`, `Secrets`.
Auto-tile terrains: `Rock` (16 tiles, sides), `Moss` (47 tiles, sides and corners).
Has collision: solid cells and one-way platforms (solid from above only).

| File | What it is |
| --- | --- |
| `crystal_cave.tmx` | The map (Tiled XML), using the tileset below. |
| `crystal_cave.tsx` | The tileset: the tiles, terrains as Wang sets, and two collision tiles with a `collides` property. |
| `crystal_cave_tiles.png` | The tileset image. |
| `crystal_cave.tmj` | The same map as Tiled JSON with the tileset embedded, for engines that read JSON. |

## Load it
Open `crystal_cave.tmx` in Tiled (free, mapeditor.org). Collision is the `Collision` object layer: rectangles of type
`solid` or `one_way`, each with a `one_way` bool property. Terrains are in the Terrain Sets panel; paint with them
using the Terrain Brush.

---
Made with GameDev Studio (https://gamedev-studio.pladsen.dev). Free to use in any project, no watermark, no credit needed.
