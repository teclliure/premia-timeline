// Terrain: 8 x 8 tiles with distance-based LOD (+ skirts against cracks) over the 4 km box and a
// coarse far ring to the horizon. Heights come from the DEM texture in the vertex shader (see
// ground.ts), colour from the orthophotos of the two eras around the current year.
import * as THREE from "three";
import { GROUND_GLSL, type Ground } from "./ground";
import { asset, type Manifest } from "./data";

const TILES = 8;
const LODS = [128, 64, 32, 16];

export interface Terrain {
  group: THREE.Group;
  material: THREE.MeshLambertMaterial;
  setYear(year: number, seaLevel: number): { photo: number | null; partial: boolean };
  update(camera: THREE.Camera, bias: number): void;
}

/** Grid in the XZ plane of `size` metres with `seg` segments, plus a skirt ring (marked y = -1). */
function tileGeometry(size: number, seg: number): THREE.BufferGeometry {
  const n = seg + 1;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) pos.push((i / seg - 0.5) * size, 0, (j / seg - 0.5) * size);
  for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) {
    const a = j * n + i;
    idx.push(a, a + n, a + 1, a + 1, a + n, a + n + 1);
  }
  // Skirt: duplicate the border, pushed down in the shader.
  const border: number[] = [];
  for (let i = 0; i < seg; i++) border.push(i);
  for (let j = 0; j < seg; j++) border.push(j * n + seg);
  for (let i = seg; i > 0; i--) border.push(seg * n + i);
  for (let j = seg; j > 0; j--) border.push(j * n);
  const base = pos.length / 3;
  for (const b of border) pos.push(pos[b * 3], -1, pos[b * 3 + 2]);
  for (let k = 0; k < border.length; k++) {
    const a = border[k];
    const b = border[(k + 1) % border.length];
    const a2 = base + k;
    const b2 = base + ((k + 1) % border.length);
    idx.push(a, b, a2, b, b2, a2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 100, 0), size * 0.75 + 300);
  return g;
}

function loadTex(url: string, srgb = true): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => new THREE.TextureLoader().load(asset(url), t => {
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    t.flipY = false;
    resolve(t);
  }, undefined, reject));
}

export async function createTerrain(ground: Ground, manifest: Manifest): Promise<Terrain> {
  const eras = Object.entries(manifest.orthos).map(([key, e]) => ({ key, ...e })).sort((a, b) => a.year - b.year);
  const photos = await Promise.all(eras.map(e => loadTex(e.file)));
  const landscape = await loadTex(manifest.landscape ?? eras[0].file);
  const urban = await loadTex("textures/urban_year.png", false);
  urban.minFilter = THREE.LinearFilter;
  urban.generateMipmaps = false;
  const hires = manifest.hires ? await loadTex(manifest.hires.file) : null;
  const size = ground.dem.size;
  const box = manifest.hires?.box ?? { x0: 0, y0: 0, x1: 0, y1: 0 };

  const uniforms = {
    ...ground.uniforms,
    uPhotoA: { value: photos[0] },
    uPhotoB: { value: photos[0] },
    uLandscape: { value: landscape },
    uUrban: { value: urban },
    uHires: { value: hires ?? photos[photos.length - 1] },
    uHiresBox: { value: new THREE.Vector4(box.x0, box.y0, box.x1, box.y1) },
    uHiresOn: { value: 0 },
    uYear: { value: 2026 },
    uYearA: { value: eras[0].year },
    uMix: { value: 0 },
    uBefore: { value: 0 },
    uGrayA: { value: 0 },
    uGrayB: { value: 0 },
    uGrayL: { value: eras[0].year < 1960 ? 1 : 0 },
    uNatural: { value: 0 },
    uGlacial: { value: 0 },
    uSeaLevel: { value: 0 },
    uFar: { value: 0 },
  };

  const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
${GROUND_GLSL}
uniform float uFar;
varying vec2 vP;
varying float vH;`)
      .replace("#include <beginnormal_vertex>", `
vec4 wp0 = modelMatrix * vec4(position.x, 0.0, position.z, 1.0);
vec2 p0 = vec2(wp0.x, -wp0.z);
float e = uFar > 0.5 ? 120.0 : uCell;
float hx = groundH(p0 + vec2(e, 0.0)) - groundH(p0 - vec2(e, 0.0));
float hn = groundH(p0 + vec2(0.0, e)) - groundH(p0 - vec2(0.0, e));
vec3 objectNormal = normalize(vec3(-hx, 2.0 * e, hn));`)
      .replace("#include <begin_vertex>", `
vec3 transformed = vec3(position.x, groundH(p0) + (position.y < -0.5 ? -4.0 : 0.0), position.z);
vP = p0;
vH = transformed.y;`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
${GROUND_GLSL}
uniform sampler2D uPhotoA, uPhotoB, uLandscape, uUrban, uHires;
uniform vec4 uHiresBox;
uniform float uHiresOn, uYear, uYearA, uMix, uBefore, uGrayA, uGrayB, uGrayL, uNatural, uGlacial, uSeaLevel, uFar;
varying vec2 vP;
varying float vH;

float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }
/** Black-and-white flights get a gentle colour from luminance so 1946 does not look like the moon. */
vec3 colorize(vec3 c, float on) {
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  vec3 tint = l < 0.45 ? mix(vec3(0.07, 0.10, 0.05), vec3(0.30, 0.33, 0.18), l / 0.45)
                       : mix(vec3(0.30, 0.33, 0.18), vec3(0.78, 0.72, 0.60), (l - 0.45) / 0.55);
  return mix(c, tint, on * 0.7);
}
float urbanYear(vec2 uv) {
  float b = texture(uUrban, uv).r * 255.0;
  return b > 254.5 ? 99999.0 : (b < 0.5 ? 1600.0 : 1700.0 + (b - 1.0) / 253.0 * 330.0);
}
vec3 naturalColor(vec2 p, float h) {
  float n = fbm(p * 0.012) * 0.7 + fbm(p * 0.09) * 0.3;
  vec3 forest = mix(vec3(0.10, 0.16, 0.08), vec3(0.20, 0.25, 0.12), n);
  vec3 meadow = mix(vec3(0.33, 0.35, 0.20), vec3(0.45, 0.42, 0.28), n);
  vec3 c = mix(meadow, forest, smoothstep(0.35, 0.6, n + h * 0.002));
  vec3 steppe = mix(vec3(0.30, 0.30, 0.21), vec3(0.42, 0.40, 0.29), n);
  return mix(c, steppe, uGlacial * (0.6 + 0.4 * smoothstep(0.3, 0.7, n)));
}`)
      .replace("#include <map_fragment>", `
if (uFar > 0.5 && abs(vP.x) < 0.5 * uSize - 2.0 && abs(vP.y) < 0.5 * uSize - 2.0) discard;
vec2 pp = photoPoint(vP);
vec2 uv = boxUv(pp);
bool inBox = uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0;
vec3 col;
float hNow = vH;
if (inBox) {
  vec3 a = colorize(texture(uPhotoA, uv).rgb, uGrayA);
  vec3 b = colorize(texture(uPhotoB, uv).rgb, uGrayB);
  if (uHiresOn > 0.5 && pp.x > uHiresBox.x && pp.x < uHiresBox.z && pp.y > uHiresBox.y && pp.y < uHiresBox.w) {
    vec2 hu = vec2((pp.x - uHiresBox.x) / (uHiresBox.z - uHiresBox.x), (uHiresBox.w - pp.y) / (uHiresBox.w - uHiresBox.y));
    b = texture(uHires, hu).rgb;
  }
  float uy = urbanYear(uv);
  if (uBefore > 0.5) {
    vec3 l = colorize(texture(uLandscape, uv).rgb, uGrayL);
    col = mix(l, a, smoothstep(uYear + 1.0, uYear - 1.0, uy));
  } else {
    float builtSince = step(uYearA, uy) * smoothstep(uYear + 1.0, uYear - 1.0, uy);
    col = mix(a, b, max(builtSince, uMix));
  }
} else {
  col = naturalColor(vP, hNow) * 0.9;
}
col = mix(col, naturalColor(vP, hNow), uNatural * smoothstep(-0.3, 1.5, hNow));
// Ground that the current sea leaves dry below today's shoreline: sand near the coast, then
// steppe on the old shelf. Ground under water: seabed sand (the sea shader adds depth colour).
float n2 = fbm(vP * 0.05);
vec3 sand = mix(vec3(0.60, 0.55, 0.43), vec3(0.68, 0.62, 0.50), n2);
vec3 shelf = mix(sand, naturalColor(vP, hNow) * 0.95, smoothstep(-3.0, -12.0, hNow));
float exposed = smoothstep(0.2, -0.3, hNow) * step(uSeaLevel + 0.05, hNow);
col = mix(col, shelf, exposed);
col = mix(col, sand * 0.85, step(hNow, uSeaLevel));
diffuseColor.rgb *= col;`);
  };
  material.customProgramCacheKey = () => "premia-terrain";

  const group = new THREE.Group();
  const tileSize = size / TILES;
  const geos = LODS.map(s => tileGeometry(tileSize, s));
  const tiles: THREE.Mesh[] = [];
  for (let j = 0; j < TILES; j++) for (let i = 0; i < TILES; i++) {
    const m = new THREE.Mesh(geos[LODS.length - 1], material);
    m.position.set((i + 0.5) * tileSize - size / 2, 0, (j + 0.5) * tileSize - size / 2);
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    tiles.push(m);
    group.add(m);
  }
  // Far ring: one coarse mesh to the horizon; it discards fragments inside the box.
  const farMat = material.clone();
  farMat.onBeforeCompile = shader => {
    material.onBeforeCompile(shader, undefined as unknown as THREE.WebGLRenderer);
    shader.uniforms.uFar = { value: 1 };
  };
  farMat.customProgramCacheKey = () => "premia-terrain-far";
  const far = new THREE.Mesh(tileGeometry(60000, 240), farMat);
  far.frustumCulled = false;
  far.receiveShadow = false;
  group.add(far);

  return {
    group,
    material,
    setYear(year: number, seaLevel: number) {
      uniforms.uYear.value = year;
      uniforms.uSeaLevel.value = seaLevel;
      // Fields fade out going back before the Iberian period; the Holocene is woodland, the glacial steppe.
      uniforms.uNatural.value = THREE.MathUtils.smoothstep(-year, 500, 4000) * 0.8 + THREE.MathUtils.smoothstep(-year, 3000, 9000) * 0.2;
      uniforms.uGlacial.value = THREE.MathUtils.smoothstep(-year, 9500, 12500);
      let photo: number | null = null;
      let partial = false;
      const first = eras[0];
      if (year < first.year) {
        uniforms.uBefore.value = 1;
        uniforms.uPhotoA.value = photos[0];
        uniforms.uGrayA.value = first.year < 1960 ? 1 : 0;
        uniforms.uYearA.value = first.year;
        photo = year > 1700 ? first.year : null;
        partial = true;
      } else {
        uniforms.uBefore.value = 0;
        let k = eras.findIndex(e => e.year > year);
        if (k === -1) k = eras.length - 1;
        const a = Math.max(k - 1, 0);
        const ea = eras[a];
        const eb = eras[k];
        uniforms.uPhotoA.value = photos[a];
        uniforms.uPhotoB.value = photos[k];
        uniforms.uYearA.value = ea.year;
        uniforms.uGrayA.value = ea.year < 1960 ? 1 : 0;
        uniforms.uGrayB.value = eb.year < 1960 ? 1 : 0;
        const t = eb.year === ea.year ? 1 : (year - ea.year) / (eb.year - ea.year);
        // Photos switch texel by texel where something was built; the rest cross-fades late.
        uniforms.uMix.value = THREE.MathUtils.smoothstep(t, 0.55, 1);
        photo = uniforms.uMix.value > 0.5 ? eb.year : ea.year;
        uniforms.uHiresOn.value = hires && eb.key === "now" && uniforms.uMix.value > 0.5 ? 1 : 0;
      }
      return { photo, partial };
    },
    update(camera: THREE.Camera, bias: number) {
      const c = camera.position;
      for (const m of tiles) {
        const dx = Math.max(Math.abs(c.x - m.position.x) - tileSize / 2, 0);
        const dz = Math.max(Math.abs(c.z - m.position.z) - tileSize / 2, 0);
        const d = Math.hypot(dx, dz, Math.max(c.y - 150, 0)) * bias;
        const lod = d < 350 ? 0 : d < 900 ? 1 : d < 2200 ? 2 : 3;
        m.geometry = geos[lod];
      }
    },
  };
}
