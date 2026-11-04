# Coin for Godot 4

| File | What it is |
| --- | --- |
| `coin.png` | The sprite sheet: every frame in a grid. |
| `coin_frames.tres` | A SpriteFrames resource with one animation per tag, each frame timed as in the editor. |
| `coin.tscn` | An AnimatedSprite2D scene using it, playing the first animation on start. |

Animations:
- `default`: 4 frames (0, 1, 2, 3), 500 ms a loop

## Load it
1. Copy the `coin` folder anywhere into your Godot project.
2. Open or instance `coin.tscn`, or give any AnimatedSprite2D the `coin_frames.tres` resource.
3. Play an animation from code: `$AnimatedSprite2D.play("default")`.

The scene sets Texture Filter to Nearest so pixels stay sharp. For the whole project, set
Project Settings > Rendering > Textures > Canvas Textures > Default Texture Filter to Nearest.

---
Made with GameDev Studio (https://gamedev-studio.pladsen.dev). Free to use in any project, no watermark, no credit needed.
