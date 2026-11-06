# Plain for Phaser 3

4 × 3 tiles of 8 px. Layers: `Rock`, `Secrets`.
No collision painted.

| File | What it is |
| --- | --- |
| `plain_tiles.png` | The tileset image, plus a solid and a one-way collision tile at the end. |
| `plain.json` | The map in Tiled's JSON format with the tileset embedded. Collision is a hidden `Collision` tile layer whose tiles have `collides` and `one_way` properties. |

## Load it
```js
// preload()
this.load.tilemapTiledJSON("plain", "plain/plain.json");
this.load.image("plain_tiles", "plain/plain_tiles.png");

// create()
const map = this.make.tilemap({ key: "plain" });
const tiles = map.addTilesetImage("plain", "plain_tiles");
map.createLayer("Rock", tiles);
map.createLayer("Secrets", tiles);
```

Set `pixelArt: true` in your game config so the pixels stay sharp.

---
Made with GameDev Studio (https://gamedev-studio.pladsen.dev). Free to use in any project, no watermark, no credit needed.
