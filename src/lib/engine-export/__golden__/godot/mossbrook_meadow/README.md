# Mossbrook Meadow for Godot 4

32 × 18 tiles of 16 px. Layers: `Ground`, `Objects`.
Auto-tile terrains: `Ground` (16 tiles, sides).
Has collision: solid cells and one-way platforms (solid from above only).

| File | What it is |
| --- | --- |
| `mossbrook_meadow_tiles.png` | Every tile the map uses, plus a red solid and a blue one-way collision tile at the end. |
| `mossbrook_meadow_tileset.tres` | A TileSet: the tiles, terrain sets for auto-tiling, and physics layer 1 on the collision tiles. |
| `mossbrook_meadow.tscn` | A Node2D with one TileMapLayer per layer, and a hidden Collision layer painted with the collision tiles. |

## Load it
1. Copy the `mossbrook_meadow` folder anywhere into your Godot project.
2. Open or instance `mossbrook_meadow.tscn`.
3. Bodies on collision mask 1 now collide with the map. The Collision layer is hidden but still collides; show it
   in the editor to see or repaint it. One-way tiles only stop bodies falling onto them from above.
4. Auto-tiling: select a layer, open the TileMap panel's Terrains tab and paint with a terrain.

---
Made with GameDev Studio (https://gamedev-studio.pladsen.dev). Free to use in any project, no watermark, no credit needed.
