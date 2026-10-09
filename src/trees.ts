// Trees detected in the current orthophoto plus era crops (vines, orchards), drawn per tile so
// off-screen tiles are culled. Each instance carries the years it exists; the vertex shader
// hides it outside that range, so scrubbing time never rebuilds buffers.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Trees } from "./data";
import type { Ground } from "./ground";

const TILES = 8;

export interface TreeLayer {
  group: THREE.Group;
  setYear(year: number): void;
  setDensity(d: number): void;
}

function colored(g: THREE.BufferGeometry, c: number): THREE.BufferGeometry {
  const col = new THREE.Color(c);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([col.r, col.g, col.b], i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return g.toNonIndexed();
}

function shapes(): THREE.BufferGeometry[] {
  // Unit height 1: kind 0 Mediterranean pine / oak, kind 1 orchard tree, kind 2 vine stock.
  const trunk = colored(new THREE.CylinderGeometry(0.03, 0.05, 0.45, 5).translate(0, 0.225, 0), 0x5a4632);
  const crown = colored(new THREE.IcosahedronGeometry(0.33, 0).scale(1.25, 0.75, 1.25).translate(0, 0.72, 0), 0x3d5a2c);
  const tree = mergeGeometries([trunk, crown])!;
  const oTrunk = colored(new THREE.CylinderGeometry(0.05, 0.07, 0.4, 5).translate(0, 0.2, 0), 0x6a5238);
  const oCrown = colored(new THREE.IcosahedronGeometry(0.42, 0).translate(0, 0.62, 0), 0x56702f);
  const orchard = mergeGeometries([oTrunk, oCrown])!;
  const vine = colored(new THREE.BoxGeometry(0.9, 1, 0.5).translate(0, 0.5, 0), 0x6b7a35);
  return [tree, orchard, vine];
}

export function createTrees(trees: Trees, ground: Ground): TreeLayer {
  const size = ground.dem.size;
  const half = size / 2;
  const tileSize = size / TILES;
  const uniforms = { uYear: { value: 2026 }, uThin: { value: 0 }, uDensity: { value: 1 } };
  const vert = /* glsl */ `
attribute vec3 aLife; // from, until, seed
uniform float uYear, uThin, uDensity;
float alive() {
  float a = step(aLife.x, uYear) * step(uYear, aLife.y - 0.001);
  a *= step(uThin, aLife.z) * step(aLife.z, uDensity);
  return a;
}`;
  const body = /* glsl */ `
vec3 transformed = vec3(position) * alive();`;

  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  material.onBeforeCompile = s => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader.replace("#include <common>", `#include <common>\n${vert}`).replace("#include <begin_vertex>", body);
  };
  material.customProgramCacheKey = () => "premia-trees";
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = s => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader.replace("#include <common>", `#include <common>\n${vert}`).replace("#include <begin_vertex>", body);
  };
  depth.customProgramCacheKey = () => "premia-trees-depth";

  const geos = shapes();
  // Bucket records by tile and kind.
  const buckets = new Map<string, number[]>();
  const d = trees.data;
  for (let i = 0; i < trees.count; i++) {
    const x = d[i * 7], n = d[i * 7 + 1], kind = d[i * 7 + 4] | 0;
    const ti = Math.min(Math.max(Math.floor((x + half) / tileSize), 0), TILES - 1);
    const tj = Math.min(Math.max(Math.floor((half - n) / tileSize), 0), TILES - 1);
    const key = `${ti},${tj},${kind}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = []));
    b.push(i);
  }
  const group = new THREE.Group();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (const [key, list] of buckets) {
    const [ti, tj, kind] = key.split(",").map(Number);
    const geo = geos[kind] ?? geos[0];
    const mesh = new THREE.InstancedMesh(geo, material, list.length);
    mesh.customDepthMaterial = depth;
    const life = new Float32Array(list.length * 3);
    list.forEach((idx, k) => {
      const x = d[idx * 7], n = d[idx * 7 + 1], h = d[idx * 7 + 3];
      const seed = (Math.sin(idx * 12.9898) * 43758.5453) % 1;
      const r = Math.abs(seed);
      p.set(x, ground.height(x, n) - 0.1, -n);
      q.setFromAxisAngle(up, r * 6.283);
      const w = kind === 0 ? h * (0.55 + r * 0.25) : kind === 1 ? h * 0.9 : 1;
      s.set(w, h, w);
      m.compose(p, q, s);
      mesh.setMatrixAt(k, m);
      const from = d[idx * 7 + 5];
      life.set([kind === 0 && from <= -9000 ? -1e6 : from, d[idx * 7 + 6], r], k * 3);
    });
    mesh.geometry = geo.clone();
    mesh.geometry.setAttribute("aLife", new THREE.InstancedBufferAttribute(life, 3));
    mesh.castShadow = kind === 0;
    mesh.receiveShadow = false;
    // Culling per tile: a bounding sphere around the tile.
    const cx = (ti + 0.5) * tileSize - half;
    const cz = (tj + 0.5) * tileSize - half;
    mesh.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, 100, cz), tileSize * 0.75 + 150);
    mesh.computeBoundingSphere = () => { mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, 100, cz), tileSize * 0.75 + 150); };
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return {
    group,
    setYear(year: number) {
      uniforms.uYear.value = year;
      // In the glacial steppe only a few trees survive (illustrative).
      uniforms.uThin.value = THREE.MathUtils.smoothstep(-year, 9500, 13000) * 0.85;
    },
    setDensity(v: number) { uniforms.uDensity.value = v; },
  };
}
