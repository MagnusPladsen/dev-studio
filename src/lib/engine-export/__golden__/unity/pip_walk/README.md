# Pip (walk) for Unity

| File | What it is |
| --- | --- |
| `pip_walk.png` | The sprite sheet: every frame in a grid. |
| `pip_walk.png.meta` | Import settings: Sprite (Multiple), sliced into `pip_walk_0`, `pip_walk_1`…, Point filter, no compression. |
| `pip_walk_idle.anim` | An Animation Clip that loops the frames with their own durations. |
| `pip_walk_walk.anim` | An Animation Clip that loops the frames with their own durations. |
| `pip_walk_hop.anim` | An Animation Clip that loops the frames with their own durations. |
| `pip_walk_walk_2.anim` | An Animation Clip that loops the frames with their own durations. |

Animations:
- `idle`: 2 frames (0, 1), 1350 ms a loop
- `walk`: 4 frames (2, 3, 4, 5), 600 ms a loop
- `hop`: 4 frames (3, 4, 5, 4), 600 ms a loop
- `walk_2`: 3 frames (4, 3, 2), 450 ms a loop

## Load it
1. Copy the `pip_walk` folder into your project's `Assets` folder (keep the `.meta` file next to the PNG).
2. Drag a frame such as `pip_walk_0` into the scene to make a Sprite Renderer.
3. Drag one of the `.anim` clips onto that object: Unity adds an Animator and plays the clip.

---
Made with GameDev Studio (https://gamedev-studio.pladsen.dev). Free to use in any project, no watermark, no credit needed.
