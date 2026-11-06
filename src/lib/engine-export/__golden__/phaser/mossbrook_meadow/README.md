# Mossbrook Meadow for Phaser 3

32 × 18 tiles of 16 px. Layers: `Ground`, `Objects`.
Auto-tile terrains: `Ground` (16 tiles, sides).
Has collision: solid cells and one-way platforms (solid from above only).

| File | What it is |
| --- | --- |
| `mossbrook_meadow_tiles.png` | The tileset image, plus a solid and a one-way collision tile at the end. |
| `mossbrook_meadow.json` | The map in Tiled's JSON format with the tileset embedded. Collision is a hidden `Collision` tile layer whose tiles have `collides` and `one_way` properties. |

## Load it
```js
// preload()
this.load.tilemapTiledJSON("mossbrook_meadow", "mossbrook_meadow/mossbrook_meadow.json");
this.load.image("mossbrook_meadow_tiles", "mossbrook_meadow/mossbrook_meadow_tiles.png");

// create()
const map = this.make.tilemap({ key: "mossbrook_meadow" });
const tiles = map.addTilesetImage("mossbrook_meadow", "mossbrook_meadow_tiles");
map.createLayer("Ground", tiles);
map.createLayer("Objects", tiles);
const collision = map.createLayer("Collision", tiles).setVisible(false);
collision.setCollisionByProperty({ collides: true });
// one-way platforms only block from above
collision.forEachTile((tile) => tile.properties.one_way && tile.setCollision(false, false, true, false));
this.physics.add.collider(player, collision);
```

Set `pixelArt: true` in your game config so the pixels stay sharp.

---
Made with GameDev Studio (https://gamedev-studio.pladsen.dev). Free to use in any project, no watermark, no credit needed.
