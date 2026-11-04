# Pip (walk) for Phaser 3

| File | What it is |
| --- | --- |
| `pip_walk.png` | The sprite sheet: every frame in a grid. |
| `pip_walk.json` | Aseprite-format data: frame positions, each frame's duration and the tags as animations. |

Animations:
- `idle`: 2 frames (0, 1), 1350 ms a loop
- `walk`: 4 frames (2, 3, 4, 5), 600 ms a loop
- `hop`: 4 frames (3, 4, 5, 4), 600 ms a loop
- `walk_2`: 3 frames (4, 3, 2), 450 ms a loop

## Load it
```js
// preload()
this.load.aseprite("pip_walk", "pip_walk/pip_walk.png", "pip_walk/pip_walk.json");

// create()
this.anims.createFromAseprite("pip_walk");
this.add.sprite(100, 100, "pip_walk").play({ key: "idle", repeat: -1 });
```

Set `pixelArt: true` in your game config so the pixels stay sharp.

---
Made with GameDev Studio (https://gamedev-studio.pladsen.dev). Free to use in any project, no watermark, no credit needed.
