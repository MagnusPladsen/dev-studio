# Plain for Tiled

4 × 3 tiles of 8 px. Layers: `Rock`, `Secrets`.
No collision painted.

| File | What it is |
| --- | --- |
| `plain.tmx` | The map (Tiled XML), using the tileset below. |
| `plain.tsx` | The tileset: the tiles, terrains as Wang sets, and two collision tiles with a `collides` property. |
| `plain_tiles.png` | The tileset image. |
| `plain.tmj` | The same map as Tiled JSON with the tileset embedded, for engines that read JSON. |

## Load it
Open `plain.tmx` in Tiled (free, mapeditor.org). Collision is the `Collision` object layer: rectangles of type
`solid` or `one_way`, each with a `one_way` bool property. Terrains are in the Terrain Sets panel; paint with them
using the Terrain Brush.

---
Made with GameDev Studio (https://gamedev-studio.pladsen.dev). Free to use in any project, no watermark, no credit needed.
