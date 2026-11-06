# Pip (walk) for Tiled

| File | What it is |
| --- | --- |
| `pip_walk.png` | The sprite sheet: every frame in a grid. |
| `pip_walk.tsx` | A Tiled tileset of the frames. Each animation plays on the tile of its first frame, which has an `animation` property with its name. |

Animations:
- `idle`: 2 frames (0, 1), 1350 ms a loop
- `walk`: 4 frames (2, 3, 4, 5), 600 ms a loop
- `hop`: 4 frames (3, 4, 5, 4), 600 ms a loop
- `walk_2`: 3 frames (4, 3, 2), 450 ms a loop

## Load it
In Tiled, open a map, then Map > Add External Tileset… and pick `pip_walk.tsx`. Place an animated tile and it plays in
Tiled and in engines that read Tiled tile animations.

---
Made with GameDev Studio (https://gamedev-studio.pladsen.dev). Free to use in any project, no watermark, no credit needed.
