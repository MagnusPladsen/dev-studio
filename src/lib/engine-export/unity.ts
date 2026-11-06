import { sheetLayout, type SheetRect } from "@/lib/sprite-animation";
import { COLLISION } from "@/lib/tilemap/collision";
import { fileStem, spriteAnimations, type SpriteAnimation } from "./names";
import { unitySpriteReadme, unityTilemapReadme } from "./readmes";
import { cellCoords } from "./tile-atlas";
import { tiledMapJson } from "./tiled-format";
import type { ExportFile, SpriteExport, TilemapExport } from "./types";

/**
 * Unity: PNGs with `.meta` files that import them as point-filtered, uncompressed sprites sliced into frames or tiles,
 * and one `.anim` clip per animation. Ids are hashed from the names, so the same export always gets the same ids and
 * the clips can point at the sliced sprites.
 */

function fnv1a(text: string, seed: number): number {
  let hash = seed >>> 0;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0;
  return hash;
}

/** A 32-hex-digit id (Unity guid or spriteID) from a name. */
export function hashGuid(text: string): string {
  return [0x811c9dc5, 0x01000193, 0x5bd1e995, 0x27d4eb2f].map((seed) => fnv1a(text, seed).toString(16).padStart(8, "0")).join("");
}

/** A positive 53-bit sprite fileID from a name. */
export function hashFileId(text: string): string {
  const id = (fnv1a(text, 0x9e3779b9) % 0x200000) * 0x100000000 + fnv1a(text, 0x85ebca6b);
  return String(id || 1);
}

interface UnitySprite {
  name: string;
  rect: SheetRect;
}

function spriteEntry(sprite: UnitySprite, imageHeight: number): string[] {
  const { x, y, w, h } = sprite.rect;
  return [
    `    - serializedVersion: 2`,
    `      name: ${sprite.name}`,
    `      rect:`,
    `        serializedVersion: 2`,
    `        x: ${x}`,
    `        y: ${imageHeight - y - h}`,
    `        width: ${w}`,
    `        height: ${h}`,
    `      alignment: 0`,
    `      pivot: {x: 0.5, y: 0.5}`,
    `      border: {x: 0, y: 0, z: 0, w: 0}`,
    `      outline: []`,
    `      physicsShape: []`,
    `      tessellationDetail: -1`,
    `      bones: []`,
    `      spriteID: ${hashGuid(`sprite:${sprite.name}`)}`,
    `      internalID: ${hashFileId(sprite.name)}`,
    `      vertices: []`,
    `      indices: `,
    `      edges: []`,
    `      weights: []`,
  ];
}

/** A TextureImporter `.meta`: sliced into `sprites` when given (Multiple), else one sprite (Single). */
export function textureMeta(guid: string, options: { pixelsPerUnit: number; imageHeight: number; sprites?: UnitySprite[] }): string {
  const sprites = options.sprites ?? [];
  const lines = [
    `fileFormatVersion: 2`,
    `guid: ${guid}`,
    `TextureImporter:`,
    `  internalIDToNameTable: []`,
    `  externalObjects: {}`,
    `  serializedVersion: 12`,
    `  mipmaps:`,
    `    enableMipMap: 0`,
    `    sRGBTexture: 1`,
    `  isReadable: 0`,
    `  textureFormat: 1`,
    `  maxTextureSize: 2048`,
    `  textureSettings:`,
    `    serializedVersion: 2`,
    `    filterMode: 0`,
    `    aniso: 1`,
    `    mipBias: 0`,
    `    wrapU: 1`,
    `    wrapV: 1`,
    `    wrapW: 1`,
    `  nPOTScale: 0`,
    `  spriteMode: ${sprites.length ? 2 : 1}`,
    `  spriteExtrude: 1`,
    `  spriteMeshType: 0`,
    `  alignment: 0`,
    `  spritePivot: {x: 0.5, y: 0.5}`,
    `  spritePixelsToUnits: ${options.pixelsPerUnit}`,
    `  spriteBorder: {x: 0, y: 0, z: 0, w: 0}`,
    `  alphaUsage: 1`,
    `  alphaIsTransparency: 1`,
    `  textureType: 8`,
    `  textureShape: 1`,
    `  platformSettings:`,
    `  - serializedVersion: 3`,
    `    buildTarget: DefaultTexturePlatform`,
    `    maxTextureSize: 2048`,
    `    resizeAlgorithm: 0`,
    `    textureFormat: -1`,
    `    textureCompression: 0`,
    `    compressionQuality: 50`,
    `    crunchedCompression: 0`,
    `  spriteSheet:`,
    `    serializedVersion: 2`,
    sprites.length ? `    sprites:` : `    sprites: []`,
    ...sprites.flatMap((sprite) => spriteEntry(sprite, options.imageHeight)),
    `    outline: []`,
    `    physicsShape: []`,
    `    bones: []`,
    `    spriteID: `,
    `    internalID: 0`,
    `    vertices: []`,
    `    indices: `,
    `    edges: []`,
    `    weights: []`,
    `    secondaryTextures: []`,
    sprites.length ? `    nameFileIdTable:` : `    nameFileIdTable: {}`,
    ...sprites.map((sprite) => `      ${sprite.name}: ${hashFileId(sprite.name)}`),
    `  userData: `,
    `  assetBundleName: `,
    `  assetBundleVariant: `,
    ``,
  ];
  return lines.join("\n");
}

const seconds = (ms: number): string => String(Number((ms / 1000).toFixed(4)));

/** An AnimationClip that swaps a SpriteRenderer's sprite, each frame held for its own duration, looping. */
export function animationClip(clipName: string, animation: SpriteAnimation, frameNames: string[], sheetGuid: string): string {
  const reference = (frame: number) => `{fileID: ${hashFileId(frameNames[frame])}, guid: ${sheetGuid}, type: 3}`;
  const starts = animation.durations.map((_, i) => animation.durations.slice(0, i).reduce((sum, ms) => sum + ms, 0));
  const total = animation.durations.reduce((sum, ms) => sum + ms, 0);
  // the last frame is keyed again at the end, so it's held for its full duration before the clip loops
  const keys = [...animation.frames.map((frame, i) => ({ time: starts[i], frame })), { time: total, frame: animation.frames[animation.frames.length - 1] }];
  return [
    `%YAML 1.1`,
    `%TAG !u! tag:unity3d.com,2011:`,
    `--- !u!74 &7400000`,
    `AnimationClip:`,
    `  m_ObjectHideFlags: 0`,
    `  m_Name: ${clipName}`,
    `  serializedVersion: 7`,
    `  m_Legacy: 0`,
    `  m_Compressed: 0`,
    `  m_UseHighQualityCurve: 1`,
    `  m_RotationCurves: []`,
    `  m_CompressedRotationCurves: []`,
    `  m_EulerCurves: []`,
    `  m_PositionCurves: []`,
    `  m_ScaleCurves: []`,
    `  m_FloatCurves: []`,
    `  m_PPtrCurves:`,
    `  - curve:`,
    ...keys.flatMap((key) => [`    - time: ${seconds(key.time)}`, `      value: ${reference(key.frame)}`]),
    `    attribute: m_Sprite`,
    `    path: `,
    `    classID: 212`,
    `    script: {fileID: 0}`,
    `  m_SampleRate: 60`,
    `  m_WrapMode: 0`,
    `  m_Bounds:`,
    `    m_Center: {x: 0, y: 0, z: 0}`,
    `    m_Extent: {x: 0, y: 0, z: 0}`,
    `  m_ClipBindingConstant:`,
    `    genericBindings:`,
    `    - serializedVersion: 2`,
    `      path: 0`,
    `      attribute: 0`,
    `      script: {fileID: 0}`,
    `      typeID: 212`,
    `      customType: 23`,
    `      isPPtrCurve: 1`,
    `    pptrCurveMapping:`,
    ...keys.map((key) => `    - ${reference(key.frame)}`),
    `  m_AnimationClipSettings:`,
    `    serializedVersion: 2`,
    `    m_StartTime: 0`,
    `    m_StopTime: ${seconds(total)}`,
    `    m_LoopTime: 1`,
    `    m_KeepOriginalPositionY: 1`,
    `  m_EditorCurves: []`,
    `  m_EulerEditorCurves: []`,
    `  m_HasGenericRootTransform: 0`,
    `  m_HasMotionFloatCurves: 0`,
    `  m_Events: []`,
    ``,
  ].join("\n");
}

export function unitySpriteFiles(sprite: SpriteExport): ExportFile[] {
  const stem = fileStem(sprite.name, "sprite");
  const guid = hashGuid(`${stem}.png`);
  const { rects } = sheetLayout(sprite.durations.length, sprite.width, sprite.height);
  const frames = rects.map((rect, i) => ({ name: `${stem}_${i}`, rect }));
  const frameNames = frames.map((frame) => frame.name);
  const clips = spriteAnimations(sprite).map((animation) => {
    const clipName = `${stem}_${fileStem(animation.name, "animation")}`;
    return { path: `${stem}/${clipName}.anim`, data: animationClip(clipName, animation, frameNames, guid) };
  });
  return [
    { path: `${stem}/${stem}.png`, data: sprite.sheetPng },
    { path: `${stem}/${stem}.png.meta`, data: textureMeta(guid, { pixelsPerUnit: Math.max(sprite.width, sprite.height), imageHeight: sprite.rows * sprite.height, sprites: frames }) },
    ...clips,
    { path: `${stem}/README.md`, data: unitySpriteReadme(sprite, stem, clips.map((clip) => clip.path.split("/")[1])) },
  ];
}

function atlasSpriteName(stem: string, input: TilemapExport, index: number): string {
  const source = input.atlas.cells[index].source;
  if (source.kind === "collision") return `${stem}_${source.value === COLLISION.oneWay ? "one_way" : "solid"}`;
  return `${stem}_tile_${index}`;
}

export function unityTilemapFiles(input: TilemapExport): ExportFile[] {
  const { tilemap, atlas } = input;
  const stem = fileStem(tilemap.name, "tilemap");
  const size = atlas.tileSize;
  const tiles = atlas.cells.map((_, i) => {
    const { x, y } = cellCoords(atlas, i);
    return { name: atlasSpriteName(stem, input, i), rect: { x: x * size, y: y * size, w: size, h: size } };
  });
  const map = tiledMapJson(tilemap, atlas, { image: `${stem}_tiles.png`, tilesetName: stem }, "objects");
  return [
    { path: `${stem}/${stem}_tiles.png`, data: input.atlasPng },
    { path: `${stem}/${stem}_tiles.png.meta`, data: textureMeta(hashGuid(`${stem}_tiles.png`), { pixelsPerUnit: size, imageHeight: atlas.rows * size, sprites: tiles }) },
    { path: `${stem}/${stem}.png`, data: input.mapPng },
    { path: `${stem}/${stem}.png.meta`, data: textureMeta(hashGuid(`${stem}.png`), { pixelsPerUnit: size, imageHeight: tilemap.height * size }) },
    { path: `${stem}/${stem}.json`, data: JSON.stringify(map, null, 2) },
    { path: `${stem}/README.md`, data: unityTilemapReadme(input, stem) },
  ];
}
