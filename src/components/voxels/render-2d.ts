import {
  BufferAttribute,
  BufferGeometry,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshLambertMaterial,
  OrthographicCamera,
  Scene,
  WebGLRenderer,
} from "three";
import type { VoxelGrid } from "@/lib/voxels/grid";
import { buildMesh, greedyQuads } from "@/lib/voxels/mesh";
import { addOutline, cameraBasis, crispAlpha, fitFrame, occupiedBounds } from "@/lib/voxels/render";

export interface Render2DOptions {
  /** Width and height of each frame, in pixels. */
  size: number;
  elevation: number;
  outline: boolean;
}

export const OUTLINE_RGB: [number, number, number] = [20, 20, 28];

/**
 * Renders the model from each yaw into small, hard-edged frames (no anti-aliasing, transparent
 * background). All frames share one camera window so the model keeps its size and position.
 * Returns an empty list for an empty model.
 */
export function renderModelFrames(grid: VoxelGrid, colors: string[], yaws: number[], opts: Render2DOptions): ImageData[] {
  const bounds = occupiedBounds(grid);
  if (!bounds || yaws.length === 0) return [];

  const canvas = document.createElement("canvas");
  const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(opts.size, opts.size, false);
  renderer.setClearColor(0x000000, 0);

  const arrays = buildMesh(greedyQuads(grid), colors, grid.size, 1);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(arrays.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(arrays.normals, 3));
  geometry.setAttribute("color", new BufferAttribute(arrays.colors, 3));
  geometry.setIndex(new BufferAttribute(arrays.indices, 1));
  const material = new MeshLambertMaterial({ vertexColors: true });
  const scene = new Scene();
  scene.add(new Mesh(geometry, material));
  scene.add(new HemisphereLight(0xffffff, 0x8a8aa6, 1.4));
  // the key light follows the camera (from its upper left), so every direction is lit the same way
  const sun = new DirectionalLight(0xffffff, 1.8);
  scene.add(sun, sun.target);

  const frame = fitFrame(bounds, yaws, opts.elevation, opts.size, opts.outline ? 1.5 : 0.5);
  const camera = new OrthographicCamera(frame.left, frame.right, frame.top, frame.bottom, 0.1, 10_000);
  const distance = Math.hypot(...grid.size) * 4 + 10;

  const read = document.createElement("canvas");
  read.width = read.height = opts.size;
  const ctx = read.getContext("2d", { willReadFrequently: true })!;

  const frames: ImageData[] = [];
  try {
    for (const yaw of yaws) {
      const { toCamera, right, up } = cameraBasis(yaw, opts.elevation);
      camera.position.set(toCamera[0] * distance, toCamera[1] * distance, toCamera[2] * distance);
      camera.up.set(0, 1, 0);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      sun.position.set(
        (toCamera[0] - right[0] * 0.6 + up[0] * 0.8) * distance,
        (toCamera[1] - right[1] * 0.6 + up[1] * 0.8) * distance,
        (toCamera[2] - right[2] * 0.6 + up[2] * 0.8) * distance
      );
      renderer.render(scene, camera);
      ctx.clearRect(0, 0, opts.size, opts.size);
      ctx.drawImage(canvas, 0, 0);
      const image = ctx.getImageData(0, 0, opts.size, opts.size);
      crispAlpha(image.data);
      if (opts.outline) addOutline(image.data, opts.size, opts.size, OUTLINE_RGB);
      frames.push(image);
    }
  } finally {
    geometry.dispose();
    material.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
  return frames;
}

export function imageToDataUrl(image: ImageData): string {
  const c = document.createElement("canvas");
  c.width = image.width;
  c.height = image.height;
  c.getContext("2d")!.putImageData(image, 0, 0);
  return c.toDataURL("image/png");
}

/** All frames side by side in one row. */
export function framesToSheet(frames: ImageData[]): Promise<Blob> {
  const size = frames[0]?.width ?? 1;
  const c = document.createElement("canvas");
  c.width = size * Math.max(1, frames.length);
  c.height = size;
  const ctx = c.getContext("2d")!;
  frames.forEach((f, i) => ctx.putImageData(f, i * size, 0));
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't make the PNG"))), "image/png"));
}
