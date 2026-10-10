// Ground height shared by terrain, sea and the CPU (camera, picking, landmarks).
//
// height(p) = DEM sampled at p shifted landward by the shoreline offset of the current year, so the
// whole beach profile slides seaward (wider beach) or landward (narrower) inside a band around
// today's shoreline. Outside the 4 km box the DEM is extended: flat along the coast, descending
// on the shelf seaward and rising inland, so the horizon makes sense at any sea level.
import * as THREE from "three";
import { asset, type Coastline, type Dem } from "./data";

export const SEGMENTS = 16;

export interface Ground {
  dem: Dem;
  coast: Coastline;
  demTex: THREE.DataTexture;
  shoreTex: THREE.Texture;
  /** Unit vector pointing out to sea, in local (x, n). */
  seaN: [number, number];
  uniforms: {
    uDem: { value: THREE.Texture };
    uShore: { value: THREE.Texture };
    uSize: { value: number };
    uCell: { value: number };
    uSeaN: { value: THREE.Vector2 };
    uOff: { value: number[] };
    uBand: { value: number };
  };
  shore: Uint8ClampedArray;
  shorePx: number;
  /** Shoreline offsets (m, + = beach wider than today) for the current year. */
  offsets: Float32Array;
  setYear(year: number): void;
  height(x: number, n: number): number;
}

export const GROUND_GLSL = /* glsl */ `
uniform sampler2D uDem;
uniform sampler2D uShore;
uniform float uSize;
uniform float uCell;
uniform vec2 uSeaN;
uniform float uOff[${SEGMENTS}];
uniform float uBand;

vec2 boxUv(vec2 p) { return vec2((p.x + 0.5 * uSize) / uSize, (0.5 * uSize - p.y) / uSize); }

float demRaw(vec2 p) { return texture(uDem, boxUv(p)).r; }

/** Seaward shift (m) of the beach profile at local point p. */
float shoreShift(vec2 p) {
  vec2 uv = boxUv(p);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  vec4 s = texture(uShore, uv);
  if (s.g < 0.5 / 255.0) return 0.0;
  float signedD = (s.r * 255.0 - 127.0) * 2.0;
  float w = 1.0 - smoothstep(uBand * 0.45, uBand, abs(signedD));
  float f = clamp(s.g * float(${SEGMENTS}) - 0.5, 0.0, float(${SEGMENTS - 1}));
  int i0 = int(floor(f));
  int i1 = min(i0 + 1, ${SEGMENTS - 1});
  float off = mix(uOff[i0], uOff[i1], fract(f));
  return off * w;
}

/** Ground height (m above today's sea level). */
float groundH(vec2 p) {
  float half_ = 0.5 * uSize - uCell;
  vec2 q = clamp(p, vec2(-half_), vec2(half_));
  vec2 d = p - q;
  if (dot(d, d) > 0.0) {
    float h = demRaw(q);
    float seaward = dot(d, uSeaN);
    return h + (seaward > 0.0 ? -0.013 * seaward : min(-seaward * 0.045, 450.0));
  }
  vec2 sp = p - shoreShift(p) * uSeaN;
  return demRaw(sp);
}

/** Point at which to sample the orthophotos (the beach image slides with the profile). */
vec2 photoPoint(vec2 p) { return p - shoreShift(p) * uSeaN; }
`;

function toHalf(dem: Dem): Uint16Array {
  const out = new Uint16Array(dem.h.length);
  for (let i = 0; i < dem.h.length; i++) out[i] = THREE.DataUtils.toHalfFloat(dem.h[i]);
  return out;
}

async function loadPixels(url: string): Promise<{ data: Uint8ClampedArray; px: number; tex: THREE.Texture }> {
  // onload rather than img.decode(): decode() can stay pending while the tab is hidden.
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`${url}: failed to load`));
    img.src = url;
  });
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const tex = new THREE.Texture(img);
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.flipY = false;
  tex.needsUpdate = true;
  return { data: ctx.getImageData(0, 0, img.width, img.height).data, px: img.width, tex };
}

export async function createGround(dem: Dem, coast: Coastline): Promise<Ground> {
  const demTex = new THREE.DataTexture(toHalf(dem), dem.cols, dem.rows, THREE.RedFormat, THREE.HalfFloatType);
  demTex.minFilter = THREE.LinearFilter;
  demTex.magFilter = THREE.LinearFilter;
  demTex.wrapS = demTex.wrapT = THREE.ClampToEdgeWrapping;
  demTex.needsUpdate = true;
  const shore = await loadPixels(asset("textures/shore.png"));

  // Seaward normal: perpendicular to the coast axis, on the side where the DEM is lower.
  const [ax, an] = coast.axis;
  let seaN: [number, number] = [an, -ax];
  const probe = (k: number) => elevationClamp(dem, coast.origin[0] + seaN[0] * k, coast.origin[1] + seaN[1] * k);
  if (probe(300) > probe(-300)) seaN = [-seaN[0], -seaN[1]];

  const offsets = new Float32Array(SEGMENTS);
  const uniforms = {
    uDem: { value: demTex as THREE.Texture },
    uShore: { value: shore.tex },
    uSize: { value: dem.size },
    uCell: { value: dem.cell },
    uSeaN: { value: new THREE.Vector2(seaN[0], seaN[1]) },
    uOff: { value: Array.from(offsets) },
    uBand: { value: coast.band },
  };

  const g: Ground = {
    dem, coast, demTex, shoreTex: shore.tex, seaN, uniforms, shore: shore.data, shorePx: shore.px, offsets,
    setYear(year: number) {
      const keys = coast.keys;
      const seg = coast.segments;
      const pick = (k: number) => (i: number) => keys[k].offsets[Math.min(Math.floor((i / SEGMENTS) * seg), seg - 1)];
      let f: (i: number) => number;
      if (year <= keys[0].year) f = pick(0);
      else if (year >= keys[keys.length - 1].year) f = pick(keys.length - 1);
      else {
        const k = keys.findIndex(c => c.year >= year);
        const a = pick(k - 1);
        const b = pick(k);
        const t = (year - keys[k - 1].year) / (keys[k].year - keys[k - 1].year);
        f = i => a(i) * (1 - t) + b(i) * t;
      }
      for (let i = 0; i < SEGMENTS; i++) offsets[i] = f(i);
      uniforms.uOff.value = Array.from(offsets);
    },
    height(x: number, n: number) {
      const half = dem.size / 2 - dem.cell;
      const qx = Math.min(Math.max(x, -half), half);
      const qn = Math.min(Math.max(n, -half), half);
      const dx = x - qx;
      const dn = n - qn;
      if (dx !== 0 || dn !== 0) {
        const h = elevationClamp(dem, qx, qn);
        const seaward = dx * seaN[0] + dn * seaN[1];
        return h + (seaward > 0 ? -0.013 * seaward : Math.min(-seaward * 0.045, 450));
      }
      const s = shiftAt(g, x, n);
      return elevationClamp(dem, x - s * seaN[0], n - s * seaN[1]);
    },
  };
  return g;
}

function shiftAt(g: Ground, x: number, n: number): number {
  const size = g.dem.size;
  const u = (x + size / 2) / size;
  const v = (size / 2 - n) / size;
  if (u < 0 || u >= 1 || v < 0 || v >= 1) return 0;
  const px = g.shorePx;
  const i = (Math.floor(v * px) * px + Math.floor(u * px)) * 4;
  const gch = g.shore[i + 1];
  if (gch === 0) return 0;
  const signedD = (g.shore[i] - 127) * 2;
  const band = g.coast.band;
  const t = Math.min(Math.max((Math.abs(signedD) - band * 0.45) / (band * 0.55), 0), 1);
  const w = 1 - t * t * (3 - 2 * t);
  const f = Math.min(Math.max((gch / 255) * SEGMENTS - 0.5, 0), SEGMENTS - 1);
  const i0 = Math.floor(f);
  const i1 = Math.min(i0 + 1, SEGMENTS - 1);
  return (g.offsets[i0] * (1 - (f - i0)) + g.offsets[i1] * (f - i0)) * w;
}

function elevationClamp(dem: Dem, x: number, n: number): number {
  const half = dem.size / 2;
  const c = Math.min(Math.max((x + half) / dem.cell - 0.5, 0), dem.cols - 1.001);
  const r = Math.min(Math.max((half - n) / dem.cell - 0.5, 0), dem.rows - 1.001);
  const c0 = Math.floor(c);
  const r0 = Math.floor(r);
  const fc = c - c0;
  const fr = r - r0;
  const i = r0 * dem.cols + c0;
  const a = dem.h[i] * (1 - fc) + dem.h[i + 1] * fc;
  const b = dem.h[i + dem.cols] * (1 - fc) + dem.h[i + dem.cols + 1] * fc;
  return a * (1 - fr) + b * fr;
}

/** Ray from the camera against the ground (CPU ray march), for double-click fly-to. */
export function pickGround(g: Ground, ray: THREE.Ray, seaLevel: number, maxDist = 30000): THREE.Vector3 | null {
  const p = new THREE.Vector3();
  let prev = 0;
  for (let t = 1; t < maxDist; t *= 1.03, t += 1) {
    ray.at(t, p);
    const h = Math.max(g.height(p.x, -p.z), seaLevel);
    if (p.y <= h) {
      // refine
      let lo = prev, hi = t;
      for (let k = 0; k < 20; k++) {
        const m = (lo + hi) / 2;
        ray.at(m, p);
        if (p.y <= Math.max(g.height(p.x, -p.z), seaLevel)) hi = m; else lo = m;
      }
      ray.at(hi, p);
      return p.clone();
    }
    prev = t;
  }
  return null;
}
