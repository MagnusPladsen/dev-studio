# Pip (walk) for Godot 4

| File | What it is |
| --- | --- |
| `pip_walk.png` | The sprite sheet: every frame in a grid. |
| `pip_walk_frames.tres` | A SpriteFrames resource with one animation per tag, each frame timed as in the editor. |
| `pip_walk.tscn` | An AnimatedSprite2D scene using it, playing the first animation on start. |

Animations:
- `idle`: 2 frames (0, 1), 1350 ms a loop
- `walk`: 4 frames (2, 3, 4, 5), 600 ms a loop
- `hop`: 4 frames (3, 4, 5, 4), 600 ms a loop
- `walk_2`: 3 frames (4, 3, 2), 450 ms a loop

## Load it
1. Copy the `pip_walk` folder anywhere into your Godot project.
2. Open or instance `pip_walk.tscn`, or give any AnimatedSprite2D the `pip_walk_frames.tres` resource.
3. Play an animation from code: `$AnimatedSprite2D.play("idle")`.

The scene sets Texture Filter to Nearest so pixels stay sharp. For the whole project, set
Project Settings > Rendering > Textures > Canvas Textures > Default Texture Filter to Nearest.

---
Made with GameDev Studio (https://gamedev-studio.pladsen.dev). Free to use in any project, no watermark, no credit needed.
