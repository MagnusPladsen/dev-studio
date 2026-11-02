/**
 * Upscaling for pixel art.
 *
 * - "sharp": every pixel becomes an N×N block. Exact, and the easiest to keep editing.
 * - "smooth": AdvMAME2x / AdvMAME3x (Scale2x/Scale3x), the classic pixel-art scalers. They round off
 *   stair-stepped diagonals but never invent new colours, so the result still looks like pixel art.
 *   ×4 is Scale2x applied twice.
 */

export type ScaleMethod = "sharp" | "smooth";
export type ScaleFactor = 2 | 3 | 4;

export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** RGBA packed into one number so neighbours compare in one step. Fully transparent pixels compare equal. */
function toInts({ width, height, data }: Pixels): Uint32Array {
  const out = new Uint32Array(width * height);
  for (let p = 0, i = 0; p < out.length; p++, i += 4) {
    out[p] = data[i + 3] === 0 ? 0 : ((data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3]) >>> 0;
  }
  return out;
}

function toPixels(ints: Uint32Array, width: number, height: number): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let p = 0, i = 0; p < ints.length; p++, i += 4) {
    const v = ints[p];
    data[i] = v >>> 24;
    data[i + 1] = (v >>> 16) & 255;
    data[i + 2] = (v >>> 8) & 255;
    data[i + 3] = v & 255;
  }
  return { width, height, data };
}

function nearest(src: Uint32Array, w: number, h: number, n: number): Uint32Array {
  const W = w * n;
  const out = new Uint32Array(W * h * n);
  for (let y = 0; y < h * n; y++) {
    const row = Math.floor(y / n) * w;
    for (let x = 0; x < W; x++) out[y * W + x] = src[row + Math.floor(x / n)];
  }
  return out;
}

function scale2x(src: Uint32Array, w: number, h: number): Uint32Array {
  const W = w * 2;
  const out = new Uint32Array(W * h * 2);
  const at = (x: number, y: number) => src[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const P = at(x, y);
      const A = at(x, y - 1); // up
      const B = at(x + 1, y); // right
      const C = at(x - 1, y); // left
      const D = at(x, y + 1); // down
      const o = y * 2 * W + x * 2;
      out[o] = C === A && C !== D && A !== B ? A : P;
      out[o + 1] = A === B && A !== C && B !== D ? B : P;
      out[o + W] = D === C && D !== B && C !== A ? C : P;
      out[o + W + 1] = B === D && B !== A && D !== C ? D : P;
    }
  }
  return out;
}

function scale3x(src: Uint32Array, w: number, h: number): Uint32Array {
  const W = w * 3;
  const out = new Uint32Array(W * h * 3);
  const at = (x: number, y: number) => src[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const A = at(x - 1, y - 1), B = at(x, y - 1), C = at(x + 1, y - 1);
      const D = at(x - 1, y), E = at(x, y), F = at(x + 1, y);
      const G = at(x - 1, y + 1), H = at(x, y + 1), I = at(x + 1, y + 1);
      const o = y * 3 * W + x * 3;
      const db = D === B && D !== H && B !== F;
      const bf = B === F && B !== D && F !== H;
      const hd = H === D && H !== F && D !== B;
      const fh = F === H && F !== B && H !== D;
      out[o] = db ? D : E;
      out[o + 1] = (db && E !== C) || (bf && E !== A) ? B : E;
      out[o + 2] = bf ? F : E;
      out[o + W] = (hd && E !== A) || (db && E !== G) ? D : E;
      out[o + W + 1] = E;
      out[o + W + 2] = (bf && E !== I) || (fh && E !== C) ? F : E;
      out[o + 2 * W] = hd ? D : E;
      out[o + 2 * W + 1] = (fh && E !== G) || (hd && E !== I) ? H : E;
      out[o + 2 * W + 2] = fh ? F : E;
    }
  }
  return out;
}

export function scalePixels(src: Pixels, factor: ScaleFactor, method: ScaleMethod): Pixels {
  const ints = toInts(src);
  const { width: w, height: h } = src;
  if (method === "sharp") return toPixels(nearest(ints, w, h, factor), w * factor, h * factor);
  if (factor === 2) return toPixels(scale2x(ints, w, h), w * 2, h * 2);
  if (factor === 3) return toPixels(scale3x(ints, w, h), w * 3, h * 3);
  const once = scale2x(ints, w, h);
  return toPixels(scale2x(once, w * 2, h * 2), w * 4, h * 4);
}
