// Sky dome, sun, ambient light and fog for an hour of the day ("Llum" control).
import * as THREE from "three";

export interface Lighting {
  sky: THREE.Mesh;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  sunDir: THREE.Vector3;
  sunColor: THREE.Color;
  zenith: THREE.Color;
  horizon: THREE.Color;
  /** 0 = night … 1 = full day */
  light: number;
  night: number;
  setHour(h: number): void;
  follow(target: THREE.Vector3, radius: number): void;
}

export function createLighting(scene: THREE.Scene): Lighting {
  // Gradient dome: zenith -> horizon colour plus a sun glow. Matches the fog colour at the
  // horizon so distant terrain melts into the sky.
  const su = {
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color() },
    uDay: { value: 1 },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(70000, 32, 16), new THREE.ShaderMaterial({
    uniforms: su,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }`,
    fragmentShader: `uniform vec3 uZenith, uHorizon, uSunDir, uSunColor; uniform float uDay; varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  vec3 c = mix(uHorizon, uZenith, pow(h, 0.55));
  c = mix(c, uHorizon * 0.8, smoothstep(0.0, -0.15, d.y));
  float s = max(dot(d, normalize(uSunDir)), 0.0);
  c += uSunColor * (pow(s, 900.0) * 6.0 + pow(s, 12.0) * 0.25) * uDay;
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
  }));
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  scene.add(sky);

  const sun = new THREE.DirectionalLight(0xffffff, 2.6);
  sun.castShadow = true;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xbfd4ee, 0x5a5040, 0.9);
  scene.add(hemi);
  scene.fog = new THREE.FogExp2(0xc8d4e0, 0.00007);

  const L: Lighting = {
    sky, sun, hemi,
    sunDir: new THREE.Vector3(),
    sunColor: new THREE.Color(),
    zenith: new THREE.Color(),
    horizon: new THREE.Color(),
    light: 1,
    night: 0,
    setHour(h: number) {
      // Premià (41.5° N) around the equinox: sun rises in the east, culminates ~48° in the south.
      const k = (h - 6) / 12;
      const elev = Math.sin(Math.PI * k) * 48;
      const az = Math.PI / 2 + Math.PI * k; // azimuth from north: east 90° -> south 180° -> west 270°
      const phi = THREE.MathUtils.degToRad(90 - elev);
      // x = sin(theta), z = cos(theta); north is -Z, east is +X in this scene.
      L.sunDir.setFromSphericalCoords(1, phi, Math.PI - az).normalize();
      su.uSunDir.value.copy(L.sunDir);
      const day = THREE.MathUtils.smoothstep(elev, -6, 12);
      const warm = 1 - THREE.MathUtils.smoothstep(elev, 4, 28);
      L.light = Math.max(day, 0.06);
      L.night = 1 - THREE.MathUtils.smoothstep(elev, -4, 6);
      L.sunColor.setRGB(1, 0.93 - warm * 0.25, 0.85 - warm * 0.45);
      sun.color.copy(L.sunColor);
      sun.intensity = 2.8 * day;
      hemi.intensity = 0.45 + 0.55 * day;
      // Night keeps a cold moonlit ambient so the town stays readable.
      hemi.color.setRGB(0.25 + 0.5 * day, 0.32 + 0.5 * day, 0.55 + 0.35 * day);
      L.zenith.setRGB(0.20 * day + 0.02, 0.38 * day + 0.03, 0.75 * day + 0.08);
      L.horizon.setRGB(0.70 * day + 0.25 * warm * day + 0.04, 0.78 * day + 0.05, 0.88 * day + 0.08);
      (scene.fog as THREE.FogExp2).color.copy(L.horizon);
      su.uZenith.value.copy(L.zenith);
      su.uHorizon.value.copy(L.horizon);
      su.uSunColor.value.copy(L.sunColor);
      su.uDay.value = day;
    },
    follow(target: THREE.Vector3, radius: number) {
      const snap = 40;
      const tx = Math.round(target.x / snap) * snap, tz = Math.round(target.z / snap) * snap;
      sun.target.position.set(tx, 0, tz);
      sun.position.set(tx, 0, tz).addScaledVector(L.sunDir, 3000);
      const c = sun.shadow.camera;
      c.left = c.bottom = -radius;
      c.right = c.top = radius;
      c.near = 100;
      c.far = 6000;
      c.updateProjectionMatrix();
      sun.target.updateMatrixWorld();
    },
  };
  return L;
}
