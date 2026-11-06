# Coin for Tiled

| File | What it is |
| --- | --- |
| `coin.png` | The sprite sheet: every frame in a grid. |
| `coin.tsx` | A Tiled tileset of the frames. Each animation plays on the tile of its first frame, which has an `animation` property with its name. |

Animations:
- `default`: 4 frames (0, 1, 2, 3), 500 ms a loop

## Load it
In Tiled, open a map, then Map > Add External Tileset… and pick `coin.tsx`. Place an animated tile and it plays in
Tiled and in engines that read Tiled tile animations.

---
Made with GameDev Studio (https://gamedev-studio.pladsen.dev). Free to use in any project, no watermark, no credit needed.
