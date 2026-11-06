# Coin for Phaser 3

| File | What it is |
| --- | --- |
| `coin.png` | The sprite sheet: every frame in a grid. |
| `coin.json` | Aseprite-format data: frame positions, each frame's duration and the tags as animations. |

Animations:
- `default`: 4 frames (0, 1, 2, 3), 500 ms a loop

## Load it
```js
// preload()
this.load.aseprite("coin", "coin/coin.png", "coin/coin.json");

// create()
this.anims.createFromAseprite("coin");
this.add.sprite(100, 100, "coin").play({ key: "default", repeat: -1 });
```

Set `pixelArt: true` in your game config so the pixels stay sharp.

---
Made with GameDev Studio (https://gamedev-studio.pladsen.dev). Free to use in any project, no watermark, no credit needed.
