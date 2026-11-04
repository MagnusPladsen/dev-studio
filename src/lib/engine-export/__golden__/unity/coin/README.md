# Coin for Unity

| File | What it is |
| --- | --- |
| `coin.png` | The sprite sheet: every frame in a grid. |
| `coin.png.meta` | Import settings: Sprite (Multiple), sliced into `coin_0`, `coin_1`…, Point filter, no compression. |
| `coin_default.anim` | An Animation Clip that loops the frames with their own durations. |

Animations:
- `default`: 4 frames (0, 1, 2, 3), 500 ms a loop

## Load it
1. Copy the `coin` folder into your project's `Assets` folder (keep the `.meta` file next to the PNG).
2. Drag a frame such as `coin_0` into the scene to make a Sprite Renderer.
3. Drag one of the `.anim` clips onto that object: Unity adds an Animator and plays the clip.

---
Made with GameDev Studio (https://gamedev-studio.pladsen.dev). Free to use in any project, no watermark, no credit needed.
