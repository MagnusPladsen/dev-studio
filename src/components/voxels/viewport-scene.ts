import {
  AxesHelper,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  DirectionalLight,
  EdgesGeometry,
  Float32BufferAttribute,
  HemisphereLight,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  MOUSE,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  Raycaster,
  Scene,
  TOUCH,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Vec3, VoxelGrid } from "@/lib/voxels/grid";
import { buildMesh, greedyQuads } from "@/lib/voxels/mesh";
import { raycastGrid, type RayHit } from "@/lib/voxels/raycast";
import { CAMERA_FOV, cellCentreToWorld, getFitDistance, worldToGrid, type CameraPose } from "./viewport-helpers";

const GROUND_COLOR = 0x8a8aa6;
const PREVIEW_ADD_COLOR = 0xffffff;
const PREVIEW_ERASE_COLOR = 0xff4d5e;
const PREVIEW_OPACITY = 0.4;
const SELECTION_COLOR = 0x4dd0ff;
const SLICE_COLOR = 0xffffff;
const GIZMO_SIZE = 72;
const GIZMO_MARGIN = 8;

interface PreviewLayer {
  mesh: InstancedMesh | null;
  geometry: BoxGeometry;
  material: MeshBasicMaterial;
}

/** A translucent box with outlined edges, used for the selection and the current slice. */
interface Overlay {
  fill: Mesh<BoxGeometry, MeshBasicMaterial>;
  edges: LineSegments<EdgesGeometry, LineBasicMaterial>;
}

/** A box in grid cells: inclusive min and max corners. */
export interface CellBox {
  min: Vec3;
  max: Vec3;
}

function createOverlay(color: number, fillOpacity: number, edgeOpacity: number): Overlay {
  const box = new BoxGeometry(1, 1, 1);
  const fill = new Mesh(box, new MeshBasicMaterial({ color, transparent: true, opacity: fillOpacity, depthWrite: false }));
  const edges = new LineSegments(
    new EdgesGeometry(box),
    new LineBasicMaterial({ color, transparent: true, opacity: edgeOpacity, depthTest: false })
  );
  fill.renderOrder = 2;
  edges.renderOrder = 3;
  fill.visible = edges.visible = false;
  return { fill, edges };
}

function placeOverlay(overlay: Overlay, box: CellBox | null, size: Vec3, pad: number): void {
  overlay.fill.visible = overlay.edges.visible = !!box;
  if (!box) return;
  const dims = [0, 1, 2].map((axis) => box.max[axis] - box.min[axis] + 1 + pad);
  const centre = [0, 1, 2].map((axis) => (box.min[axis] + box.max[axis] + 1) / 2) as Vec3;
  const [x, y, z] = [centre[0] - size[0] / 2, centre[1], centre[2] - size[2] / 2];
  for (const part of [overlay.fill, overlay.edges]) {
    part.position.set(x, y, z);
    part.scale.set(dims[0], dims[1], dims[2]);
  }
}

function disposeOverlay(overlay: Overlay): void {
  overlay.fill.geometry.dispose();
  overlay.fill.material.dispose();
  overlay.edges.geometry.dispose();
  overlay.edges.material.dispose();
}

interface AxisGizmo {
  scene: Scene;
  camera: OrthographicCamera;
  axes: AxesHelper;
}

export interface ViewportScene {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  controls: OrbitControls;
  voxels: Mesh<BufferGeometry, MeshLambertMaterial>;
  ground: LineSegments<BufferGeometry, LineBasicMaterial>;
  preview: PreviewLayer;
  selection: Overlay;
  slice: Overlay;
  gizmo: AxisGizmo;
  frame: number;
}

function createAxisGizmo(): AxisGizmo {
  const scene = new Scene();
  const axes = new AxesHelper(1);
  scene.add(axes);
  const camera = new OrthographicCamera(-1.3, 1.3, 1.3, -1.3, 0.1, 10);
  return { scene, camera, axes };
}

function addLights(scene: Scene): void {
  scene.add(new HemisphereLight(0xffffff, 0x8a8aa6, 1.4));
  const sun = new DirectionalLight(0xffffff, 1.8);
  sun.position.set(0.5, 1, 0.75);
  scene.add(sun);
}

export function createViewportScene(canvas: HTMLCanvasElement): ViewportScene {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new Scene();
  addLights(scene);
  const camera = new PerspectiveCamera(CAMERA_FOV, 1, 0.1, 1000);
  const controls = new OrbitControls(camera, canvas);
  const voxels = new Mesh(new BufferGeometry(), new MeshLambertMaterial({ vertexColors: true }));
  const ground = new LineSegments(
    new BufferGeometry(),
    new LineBasicMaterial({ color: GROUND_COLOR, transparent: true, opacity: 0.35 }),
  );
  const preview: PreviewLayer = {
    mesh: null,
    geometry: new BoxGeometry(1.04, 1.04, 1.04),
    material: new MeshBasicMaterial({ transparent: true, opacity: PREVIEW_OPACITY, depthWrite: false }),
  };
  const selection = createOverlay(SELECTION_COLOR, 0.12, 0.9);
  const slice = createOverlay(SLICE_COLOR, 0.07, 0.5);
  scene.add(voxels, ground, selection.fill, selection.edges, slice.fill, slice.edges);
  return { renderer, scene, camera, controls, voxels, ground, preview, selection, slice, gizmo: createAxisGizmo(), frame: 0 };
}

export function setSelectionBox(viewport: ViewportScene, box: CellBox | null, size: Vec3): void {
  placeOverlay(viewport.selection, box, size, 0.08);
}

/** Highlights one layer of the grid (the one shown in Slice view). */
export function setSliceLayer(viewport: ViewportScene, layer: { axis: 0 | 1 | 2; index: number } | null, size: Vec3): void {
  if (!layer) return placeOverlay(viewport.slice, null, size, 0);
  const min: Vec3 = [0, 0, 0];
  const max: Vec3 = [size[0] - 1, size[1] - 1, size[2] - 1];
  min[layer.axis] = max[layer.axis] = layer.index;
  placeOverlay(viewport.slice, { min, max }, size, 0.02);
}

export function applyControlScheme(controls: OrbitControls, oneFingerOrbit: boolean): void {
  controls.mouseButtons = { LEFT: oneFingerOrbit ? MOUSE.ROTATE : null, MIDDLE: MOUSE.ROTATE, RIGHT: MOUSE.ROTATE };
  controls.touches = { ONE: oneFingerOrbit ? TOUCH.ROTATE : null, TWO: TOUCH.DOLLY_ROTATE };
}

export function applyCameraPose(viewport: ViewportScene, pose: CameraPose, size: Vec3): void {
  const { camera, controls } = viewport;
  const distance = getFitDistance(size);
  camera.near = Math.max(distance / 200, 0.05);
  camera.far = distance * 20;
  camera.position.set(...pose.position);
  camera.updateProjectionMatrix();
  controls.minDistance = 2;
  controls.maxDistance = distance * 4;
  controls.target.set(...pose.target);
  controls.update();
}

export function setVoxelMesh(viewport: ViewportScene, grid: VoxelGrid, colors: string[]): void {
  const arrays = buildMesh(greedyQuads(grid), colors, grid.size, 1);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(arrays.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(arrays.normals, 3));
  geometry.setAttribute("color", new BufferAttribute(arrays.colors, 3));
  geometry.setIndex(new BufferAttribute(arrays.indices, 1));
  viewport.voxels.geometry.dispose();
  viewport.voxels.geometry = geometry;
}

function buildGroundPositions(size: Vec3): number[] {
  const [halfX, halfZ] = [size[0] / 2, size[2] / 2];
  const positions: number[] = [];
  for (let x = 0; x <= size[0]; x++) positions.push(x - halfX, 0, -halfZ, x - halfX, 0, halfZ);
  for (let z = 0; z <= size[2]; z++) positions.push(-halfX, 0, z - halfZ, halfX, 0, z - halfZ);
  return positions;
}

export function setGroundGrid(viewport: ViewportScene, size: Vec3): void {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(buildGroundPositions(size), 3));
  viewport.ground.geometry.dispose();
  viewport.ground.geometry = geometry;
}

function ensurePreviewCapacity(viewport: ViewportScene, count: number): InstancedMesh {
  const { preview, scene } = viewport;
  if (preview.mesh && preview.mesh.instanceMatrix.count >= count) return preview.mesh;
  if (preview.mesh) {
    scene.remove(preview.mesh);
    preview.mesh.dispose();
  }
  const capacity = 2 ** Math.ceil(Math.log2(Math.max(count, 64)));
  const mesh = new InstancedMesh(preview.geometry, preview.material, capacity);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  scene.add(mesh);
  preview.mesh = mesh;
  return mesh;
}

export function setPreviewCells(viewport: ViewportScene, cells: Vec3[], size: Vec3, isErase: boolean): void {
  if (cells.length === 0 && !viewport.preview.mesh) return;
  const mesh = ensurePreviewCapacity(viewport, cells.length);
  const matrix = new Matrix4();
  cells.forEach((cell, index) => {
    const [x, y, z] = cellCentreToWorld(cell, size);
    mesh.setMatrixAt(index, matrix.makeTranslation(x, y, z));
  });
  mesh.count = cells.length;
  mesh.visible = cells.length > 0;
  mesh.instanceMatrix.needsUpdate = true;
  viewport.preview.material.color.set(isErase ? PREVIEW_ERASE_COLOR : PREVIEW_ADD_COLOR);
}

export function resizeViewport(viewport: ViewportScene, width: number, height: number): void {
  if (width === 0 || height === 0) return;
  viewport.renderer.setSize(width, height, false);
  viewport.camera.aspect = width / height;
  viewport.camera.updateProjectionMatrix();
}

function renderGizmo(viewport: ViewportScene): void {
  const { renderer, camera, controls, gizmo } = viewport;
  const offset = new Vector3().subVectors(camera.position, controls.target).normalize().multiplyScalar(3);
  gizmo.camera.position.copy(offset);
  gizmo.camera.up.copy(camera.up);
  gizmo.camera.lookAt(0, 0, 0);
  renderer.setViewport(GIZMO_MARGIN, GIZMO_MARGIN, GIZMO_SIZE, GIZMO_SIZE);
  renderer.setScissor(GIZMO_MARGIN, GIZMO_MARGIN, GIZMO_SIZE, GIZMO_SIZE);
  renderer.setScissorTest(true);
  renderer.autoClear = false;
  renderer.clearDepth();
  renderer.render(gizmo.scene, gizmo.camera);
  renderer.autoClear = true;
  renderer.setScissorTest(false);
}

export function renderViewport(viewport: ViewportScene, withHelpers: boolean = true): void {
  const { renderer, scene, camera, ground, preview } = viewport;
  const size = renderer.getSize(new Vector2());
  ground.visible = withHelpers;
  const { selection, slice } = viewport;
  const selectionShown = selection.fill.visible;
  const sliceShown = slice.fill.visible;
  if (!withHelpers) selection.fill.visible = selection.edges.visible = slice.fill.visible = slice.edges.visible = false;
  if (preview.mesh) preview.mesh.visible = withHelpers && preview.mesh.count > 0;
  renderer.setViewport(0, 0, size.x, size.y);
  renderer.render(scene, camera);
  if (withHelpers) renderGizmo(viewport);
  selection.fill.visible = selection.edges.visible = selectionShown;
  slice.fill.visible = slice.edges.visible = sliceShown;
  renderer.setViewport(0, 0, size.x, size.y);
}

export function requestRender(viewport: ViewportScene): void {
  if (viewport.frame) return;
  viewport.frame = requestAnimationFrame(() => {
    viewport.frame = 0;
    renderViewport(viewport);
  });
}

export function snapshotViewportPng(viewport: ViewportScene): string {
  renderViewport(viewport, false);
  const png = viewport.renderer.domElement.toDataURL("image/png");
  renderViewport(viewport);
  return png;
}

const raycaster = new Raycaster();
const pointer = new Vector2();

export function pickGridHit(viewport: ViewportScene, clientX: number, clientY: number, grid: VoxelGrid): RayHit | null {
  const rect = viewport.renderer.domElement.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, viewport.camera);
  const { origin, direction } = raycaster.ray;
  if (direction.lengthSq() === 0) return null;
  const gridOrigin = worldToGrid([origin.x, origin.y, origin.z], grid.size);
  return raycastGrid(gridOrigin, [direction.x, direction.y, direction.z], grid);
}

export function disposeViewportScene(viewport: ViewportScene): void {
  if (viewport.frame) cancelAnimationFrame(viewport.frame);
  viewport.controls.dispose();
  viewport.voxels.geometry.dispose();
  viewport.voxels.material.dispose();
  viewport.ground.geometry.dispose();
  viewport.ground.material.dispose();
  viewport.preview.mesh?.dispose();
  viewport.preview.geometry.dispose();
  viewport.preview.material.dispose();
  disposeOverlay(viewport.selection);
  disposeOverlay(viewport.slice);
  viewport.gizmo.axes.dispose();
  viewport.renderer.dispose();
}
