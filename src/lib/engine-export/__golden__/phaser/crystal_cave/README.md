# Crystal Cave for Phaser 3

4 × 3 tiles of 8 px. Layers: `Rock`, `Secrets`.
Auto-tile terrains: `Rock` (16 tiles, sides), `Moss` (47 tiles, sides and corners).
Has collision: solid cells and one-way platforms (solid from above only).

| File | What it is |
| --- | --- |
| `crystal_cave_tiles.png` | The tileset image, plus a solid and a one-way collision tile at the end. |
| `crystal_cave.json` | The map in Tiled's JSON format with the tileset embedded. Collision is a hidden `Collision` tile layer whose tiles have `collides` and `one_way` properties. |

## Load it
```js
// preload()
this.load.tilemapTiledJSON("crystal_cave", "crystal_cave/crystal_cave.json");
this.load.image("crystal_cave_tiles", "crystal_cave/crystal_cave_tiles.png");

// create()
const map = this.make.tilemap({ key: "crystal_cave" });
const tiles = map.addTilesetImage("crystal_cave", "crystal_cave_tiles");
map.createLayer("Rock", tiles);
map.createLayer("Secrets", tiles);
const collision = map.createLayer("Collision", tiles).setVisible(false);
collision.setCollisionByProperty({ collides: true });
// one-way platforms only block from above
collision.forEachTile((tile) => tile.properties.one_way && tile.setCollision(false, false, true, false));
this.physics.add.collider(player, collision);
```

Set `pixelArt: true` in your game config so the pixels stay sharp.

---
Made with GameDev Studio (https://gamedev-studio.pladsen.dev). Free to use in any project, no watermark, no credit needed.
