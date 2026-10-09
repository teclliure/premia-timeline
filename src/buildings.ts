// All buildings in one merged mesh. Parts are sorted by the year they appear, so the draw range
// is a prefix of the buffer: buildings from the future are never sent to the GPU. Each part rises
// from its base during `uSpan` years. Walls get procedural windows (lit at night); old low houses
// get tiled pitched roofs, everything else Catalan flat roofs (terrats) with a parapet line.
import * as THREE from "three";
import type { BuildingData, Pt } from "./data";
import type { Ground } from "./ground";

export interface Buildings {
  mesh: THREE.Mesh;
  count: number;
  setYear(year: number, span: number): boolean;
  setNight(night: number): void;
}

const FLOOR = 3.1;

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function area(r: Pt[]): number {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const p = r[i];
    const q = r[(i + 1) % r.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

function convex(r: Pt[]): boolean {
  let sign = 0;
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length], c = r[(i + 2) % r.length];
    const z = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(z) < 1e-6) continue;
    if (sign === 0) sign = Math.sign(z); else if (Math.sign(z) !== sign) return false;
  }
  return true;
}

class Builder {
  pos: number[] = [];
  nrm: number[] = [];
  base: number[] = [];
  info: number[] = [];
  uv: number[] = [];
  private cur = { base: 0, year: 0, seed: 0, floors: 0 };
  start(base: number, year: number, seed: number, floors: number) { this.cur = { base, year, seed, floors }; }
  /** Triangle from local (x, n, y) points with kind and wall uv per vertex. */
  tri(a: number[], b: number[], c: number[], kind: number, uva: Pt, uvb: Pt, uvc: Pt) {
    const A = new THREE.Vector3(a[0], a[2], -a[1]);
    const B = new THREE.Vector3(b[0], b[2], -b[1]);
    const C = new THREE.Vector3(c[0], c[2], -c[1]);
    const n = new THREE.Vector3().crossVectors(B.clone().sub(A), C.clone().sub(A)).normalize();
    for (const [P, uv] of [[A, uva], [B, uvb], [C, uvc]] as Array<[THREE.Vector3, Pt]>) {
      this.pos.push(P.x, P.y, P.z);
      this.nrm.push(n.x, n.y, n.z);
      this.base.push(this.cur.base);
      this.info.push(this.cur.year, kind, this.cur.seed, this.cur.floors);
      this.uv.push(uv[0], uv[1]);
    }
  }
  get vertices() { return this.pos.length / 3; }
}

export function createBuildings(data: BuildingData, ground: Ground, exclude: Array<{ at: Pt; r: number }>): Buildings {
  const parts = [...data.parts].sort((a, b) => a[0] - b[0]);
  const bld = new Builder();
  const years: number[] = [];
  const starts: number[] = [];
  for (let pi = 0; pi < parts.length; pi++) {
    const [year, floors, baseDm, ringsDm, use] = parts[pi];
    const rings: Pt[][] = ringsDm.map(r => {
      const out: Pt[] = [];
      for (let i = 0; i + 1 < r.length; i += 2) out.push([r[i] / 10, r[i + 1] / 10]);
      return out;
    }).filter(r => r.length >= 3);
    if (!rings.length) continue;
    const outer = rings[0];
    const cx = outer.reduce((s, p) => s + p[0], 0) / outer.length;
    const cn = outer.reduce((s, p) => s + p[1], 0) / outer.length;
    if (exclude.some(e => Math.hypot(cx - e.at[0], cn - e.at[1]) < e.r)) continue;
    if (area(outer) < 0) outer.reverse();
    for (let k = 1; k < rings.length; k++) if (area(rings[k]) > 0) rings[k].reverse();

    years.push(year);
    starts.push(bld.vertices);
    const base = Math.min(baseDm / 10, ground.height(cx, cn));
    const fl = Math.max(1, Math.min(floors, 30));
    const top = base + fl * FLOOR + (use === "I" ? 2 : 0.5);
    const seed = hash(pi * 1.37 + cx * 0.11 + cn * 0.07);
    bld.start(base, year, seed, fl);
    const bottom = base - 2;

    // Walls.
    for (const ring of rings) {
      let u = 0;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len < 0.05) continue;
        const vb = bottom - base;
        const vt = top - base;
        bld.tri([a[0], a[1], bottom], [b[0], b[1], bottom], [b[0], b[1], top], 0, [u, vb], [u + len, vb], [u + len, vt]);
        bld.tri([a[0], a[1], bottom], [b[0], b[1], top], [a[0], a[1], top], 0, [u, vb], [u + len, vt], [u, vt]);
        u += len;
      }
    }

    // Roof.
    const pitched = year < 1930 && fl <= 3 && outer.length === 4 && rings.length === 1 && convex(outer) && seed < 0.7;
    if (pitched) {
      const [A, B, C, D] = outer;
      const lab = Math.hypot(B[0] - A[0], B[1] - A[1]);
      const lbc = Math.hypot(C[0] - B[0], C[1] - B[1]);
      // Ridge parallel to the longer side, between the midpoints of the short sides.
      const [p0, p1, p2, p3] = lab >= lbc ? [A, B, C, D] : [B, C, D, A];
      const short = Math.min(lab, lbc);
      const rise = Math.min(short * 0.18, 2.6);
      const m1: Pt = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
      const m2: Pt = [(p3[0] + p0[0]) / 2, (p3[1] + p0[1]) / 2];
      const R = top + rise;
      const w = Math.max(lab, lbc);
      bld.tri([p0[0], p0[1], top], [p1[0], p1[1], top], [m1[0], m1[1], R], 2, [0, 0], [w, 0], [w, short / 2]);
      bld.tri([p0[0], p0[1], top], [m1[0], m1[1], R], [m2[0], m2[1], R], 2, [0, 0], [w, short / 2], [0, short / 2]);
      bld.tri([p2[0], p2[1], top], [p3[0], p3[1], top], [m2[0], m2[1], R], 2, [0, 0], [w, 0], [w, short / 2]);
      bld.tri([p2[0], p2[1], top], [m2[0], m2[1], R], [m1[0], m1[1], R], 2, [0, 0], [w, short / 2], [0, short / 2]);
      // Gable ends.
      bld.tri([p1[0], p1[1], top], [p2[0], p2[1], top], [m1[0], m1[1], R], 3, [0, top - base], [short, top - base], [short / 2, R - base]);
      bld.tri([p3[0], p3[1], top], [p0[0], p0[1], top], [m2[0], m2[1], R], 3, [0, top - base], [short, top - base], [short / 2, R - base]);
    } else {
      const contour = outer.map(p => new THREE.Vector2(p[0], p[1]));
      const holes = rings.slice(1).map(r => r.map(p => new THREE.Vector2(p[0], p[1])));
      const all = [...contour, ...holes.flat()];
      for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(contour, holes)) {
        let a = all[i], b = all[j];
        const c = all[k];
        if ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) < 0) [a, b] = [b, a];
        bld.tri([a.x, a.y, top], [b.x, b.y, top], [c.x, c.y, top], 1, [a.x, a.y], [b.x, b.y], [c.x, c.y]);
      }
    }
  }
  starts.push(bld.vertices);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(bld.pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(bld.nrm, 3));
  geo.setAttribute("aBase", new THREE.Float32BufferAttribute(bld.base, 1));
  geo.setAttribute("aInfo", new THREE.Float32BufferAttribute(bld.info, 4));
  geo.setAttribute("aWall", new THREE.Float32BufferAttribute(bld.uv, 2));
  geo.computeBoundingSphere();

  const uniforms = { uYear: { value: 2026 }, uSpan: { value: 2 }, uNight: { value: 0 } };
  const growGLSL = /* glsl */ `
attribute float aBase;
attribute vec4 aInfo;
uniform float uYear, uSpan;
float growth() { return clamp((uYear - aInfo.x) / uSpan + 0.02, 0.0, 1.0); }`;
  const grow = /* glsl */ `
vec3 transformed = vec3(position);
float g = growth();
transformed.y = aBase + (position.y - aBase) * g;`;

  const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
${growGLSL}
attribute vec2 aWall;
varying vec4 vInfo;
varying vec2 vWall;
varying float vGrow;`)
      .replace("#include <begin_vertex>", `${grow}
vInfo = aInfo; vWall = aWall; vGrow = g;`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
uniform float uNight;
varying vec4 vInfo;
varying vec2 vWall;
varying float vGrow;
float h11(float n) { return fract(sin(n * 91.345) * 47453.5453); }
float h21(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 wallPalette(float s, float year) {
  vec3 c0 = vec3(0.91, 0.89, 0.85), c1 = vec3(0.90, 0.83, 0.68), c2 = vec3(0.84, 0.70, 0.48);
  vec3 c3 = vec3(0.86, 0.66, 0.55), c4 = vec3(0.80, 0.78, 0.74);
  float k = fract(s * 7.0 + (year < 1900.0 ? 0.35 : 0.0));
  return k < 0.2 ? c0 : k < 0.4 ? c1 : k < 0.6 ? c2 : k < 0.8 ? c3 : c4;
}`)
      .replace("#include <map_fragment>", `
float kind = vInfo.y;
float seed = vInfo.z;
vec3 col;
float lit = 0.0;
if (kind < 0.5 || kind > 2.5) {
  col = wallPalette(seed, vInfo.x);
  float floors = vInfo.w;
  float v = vWall.y;
  float fv = fract(v / ${FLOOR.toFixed(1)});
  float fl = floor(v / ${FLOOR.toFixed(1)});
  float spacing = vInfo.x < 1940.0 ? 3.0 : 3.6;
  float fu = fract(vWall.x / spacing);
  float cell = floor(vWall.x / spacing);
  bool win = kind < 0.5 && v > 0.4 && fl < floors && fu > 0.32 && fu < 0.68 && fv > 0.28 && fv < (fl < 0.5 ? 0.92 : 0.82);
  // Fade the window pattern to its average colour once a window is smaller than ~1 px.
  float fw = max(fwidth(vWall.x), fwidth(vWall.y));
  float detail = 1.0 - smoothstep(0.2, 0.7, fw);
  vec3 glass = vec3(0.10, 0.12, 0.14) + 0.06 * h21(vec2(cell, fl) + seed);
  float facade = (kind < 0.5 && v > 0.4 && fl < floors) ? 1.0 : 0.0;
  float winMask = win ? 1.0 : 0.0;
  col = mix(col, glass, winMask * detail + facade * (1.0 - detail) * 0.2);
  lit = (winMask * detail * step(0.55, h21(vec2(cell * 1.3, fl * 2.1) + seed * 9.0)) + facade * (1.0 - detail) * 0.07) * uNight;
  if (kind < 0.5 && fv > 0.94 && fl < floors) col *= mix(1.0, 0.92, detail); // floor line
  col *= 0.92 + 0.08 * h11(seed * 13.0);
} else if (kind < 1.5) {
  col = mix(vec3(0.66, 0.58, 0.50), vec3(0.62, 0.61, 0.59), step(0.5, seed)) * (0.9 + 0.1 * h21(floor(vWall * 0.6)));
} else {
  col = vec3(0.62, 0.32, 0.20) * (0.85 + 0.15 * h11(seed * 31.0)) * (0.93 + 0.07 * sin(vWall.y * 9.0));
}
diffuseColor.rgb *= col;`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
totalEmissiveRadiance += lit * vec3(1.0, 0.78, 0.45) * 0.9;`);
  };
  material.customProgramCacheKey = () => "premia-buildings";

  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${growGLSL}`)
      .replace("#include <begin_vertex>", grow);
  };
  depth.customProgramCacheKey = () => "premia-buildings-depth";

  const mesh = new THREE.Mesh(geo, material);
  mesh.customDepthMaterial = depth;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;

  let lastCount = -1;
  return {
    mesh,
    count: years.length,
    setYear(year: number, span: number) {
      uniforms.uYear.value = year;
      uniforms.uSpan.value = span;
      // Upper bound: number of parts with year <= current year.
      let lo = 0, hi = years.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (years[m] <= year) lo = m + 1; else hi = m; }
      const count = starts[lo];
      geo.setDrawRange(0, count);
      const changed = count !== lastCount;
      lastCount = count;
      return changed || year - years[Math.max(lo - 1, 0)] < span;
    },
    setNight(night: number) { uniforms.uNight.value = night; },
  };
}
