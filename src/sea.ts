// Animated sea: a large plane at the sea level of the current year. Depth, foam and the
// shoreline come from the same ground function as the terrain, so the water meets the beach
// exactly wherever the coast is in that year.
import * as THREE from "three";
import { GROUND_GLSL, type Ground } from "./ground";

export interface Sea {
  mesh: THREE.Mesh;
  setLevel(level: number): void;
  tick(seconds: number): void;
  setLight(sunDir: THREE.Vector3, sunColor: THREE.Color, sky: THREE.Color, horizon: THREE.Color, light: number): void;
}

export function createSea(ground: Ground): Sea {
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uLevel: { value: 0 },
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0.3, 0.6, 0.2) },
    uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
    uSky: { value: new THREE.Color(0.45, 0.62, 0.85) },
    uHorizon: { value: new THREE.Color(0.75, 0.82, 0.9) },
    uLight: { value: 1 },
  }]);
  // Ground uniforms are shared objects (offsets change every year); attach them by reference.
  Object.assign(uniforms, ground.uniforms);

  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    fog: true,
    vertexShader: /* glsl */ `
#include <fog_pars_vertex>
uniform float uLevel;
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position.x, uLevel, position.z, 1.0);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`,
    fragmentShader: /* glsl */ `
#include <common>
#include <fog_pars_fragment>
${GROUND_GLSL}
uniform float uLevel, uTime, uLight;
uniform vec3 uSunDir, uSunColor, uSky, uHorizon;
varying vec3 vWorld;

float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float waves(vec2 p) {
  float t = uTime;
  return vnoise(p * 0.08 + vec2(t * 0.05, t * 0.03)) * 0.5
       + vnoise(p * 0.21 - vec2(t * 0.09, -t * 0.04)) * 0.3
       + vnoise(p * 0.6 + vec2(-t * 0.2, t * 0.13)) * 0.2;
}
void main() {
  vec2 p = vec2(vWorld.x, -vWorld.z);
  float depth = uLevel - groundH(p);
  if (depth < -0.02) discard;
  float dist = length(cameraPosition - vWorld);
  float e = 0.6;
  float amp = 1.2 / (1.0 + dist * 0.0015);
  float w0 = waves(p);
  vec3 n = normalize(vec3(-(waves(p + vec2(e, 0.0)) - w0) * amp / e, 1.0, (waves(p + vec2(0.0, e)) - w0) * amp / e));
  vec3 V = normalize(cameraPosition - vWorld);
  float fres = 0.03 + 0.9 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
  vec3 deep = vec3(0.015, 0.10, 0.17);
  vec3 shallow = vec3(0.08, 0.36, 0.40);
  vec3 water = mix(shallow, deep, 1.0 - exp(-max(depth, 0.0) / 5.0)) * (0.35 + 0.65 * uLight);
  vec3 R = reflect(-V, n);
  vec3 refl = mix(uHorizon, uSky, clamp(R.y * 2.0, 0.0, 1.0)) * (0.3 + 0.7 * uLight);
  vec3 col = mix(water, refl, fres);
  col += uSunColor * pow(max(dot(R, normalize(uSunDir)), 0.0), 240.0) * 2.5 * uLight;
  float surf = smoothstep(0.7, 0.0, depth) * (0.55 + 0.45 * sin(uTime * 1.3 + dot(p, uSeaN) * 0.25 + vnoise(p * 0.1) * 6.0));
  float foam = clamp(surf, 0.0, 1.0) * smoothstep(0.35, 0.65, vnoise(p * 0.35 + uTime * 0.4));
  col = mix(col, vec3(0.92) * (0.4 + 0.6 * uLight), foam * 0.85);
  float alpha = mix(0.25, 0.94, smoothstep(0.0, 2.5, depth));
  alpha = max(alpha, foam * 0.9);
  gl_FragColor = vec4(col, alpha * smoothstep(-0.02, 0.08, depth));
  #include <fog_fragment>
}`,
  });
  const geo = new THREE.PlaneGeometry(60000, 60000, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  return {
    mesh,
    setLevel(level: number) { uniforms.uLevel.value = level; },
    tick(seconds: number) { uniforms.uTime.value = seconds; },
    setLight(sunDir, sunColor, sky, horizon, light) {
      uniforms.uSunDir.value.copy(sunDir);
      uniforms.uSunColor.value.copy(sunColor);
      uniforms.uSky.value.copy(sky);
      uniforms.uHorizon.value.copy(horizon);
      uniforms.uLight.value = light;
    },
  };
}
