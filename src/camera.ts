// Camera modes: Cinema (automatic tour), Orbit, Fly and Walk, preset views and animated fly-to.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Features, Pt } from "./data";
import type { Ground } from "./ground";

export type Mode = "cinema" | "orbit" | "fly" | "walk";
export interface View { pos: THREE.Vector3; target: THREE.Vector3 }
export const VIEW_IDS = ["overview", "core", "beach", "port", "villa", "dalt", "sea", "shelf"] as const;
export type ViewId = (typeof VIEW_IDS)[number];

export interface CameraRig {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  views: Record<ViewId, View>;
  mode: Mode;
  setMode(m: Mode): void;
  flyTo(pos: THREE.Vector3, target: THREE.Vector3, seconds?: number): void;
  view(id: ViewId, seconds?: number): void;
  /** Returns true while the camera is moving (the frame must be drawn). */
  update(dt: number, seaLevel: number): boolean;
  state(): string;
  restore(s: string): boolean;
  onModeChange(f: (m: Mode) => void): void;
}

export function createCamera(dom: HTMLElement, ground: Ground, f: Features): CameraRig {
  const camera = new THREE.PerspectiveCamera(45, 1, 1, 80000);
  const controls = new OrbitControls(camera, dom);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = THREE.MathUtils.degToRad(86);
  controls.minDistance = 20;
  controls.maxDistance = 12000;
  controls.screenSpacePanning = false;
  controls.zoomToCursor = true;

  const sea = ground.seaN;
  const axis = ground.coast.axis;
  const H = (x: number, n: number) => Math.max(ground.height(x, n), 0);
  const v3 = (p: Pt, up: number, ds = 0, da = 0) => {
    const x = p[0] + sea[0] * ds + axis[0] * da;
    const n = p[1] + sea[1] * ds + axis[1] * da;
    return new THREE.Vector3(x, H(x, n) + up, -n);
  };
  const centre: Pt = [0, 0];
  const church = f.pois.church ?? centre;
  const portP = f.lines.breakwater[0]?.[Math.floor((f.lines.breakwater[0].length - 1) / 2)] ?? centre;
  const rail = f.lines.railway[0];
  const beachP = rail ? rail.reduce((best, p) => (Math.hypot(p[0] - church[0], p[1] - church[1]) < Math.hypot(best[0] - church[0], best[1] - church[1]) ? p : best)) : church;
  const views: Record<ViewId, View> = {
    overview: { target: v3(centre, 20, -300), pos: v3(centre, 1150, 2300, -700) },
    core: { target: v3(church, 8), pos: v3(church, 150, 300, -180) },
    beach: { target: v3(beachP, 3), pos: v3(beachP, 32, 110, 190) },
    port: { target: v3(portP, 2), pos: v3(portP, 190, 420, 300) },
    villa: { target: v3(f.pois.museu_roma ?? church, 4), pos: v3(f.pois.museu_roma ?? church, 95, 170, 130) },
    dalt: { target: v3(f.pois.church_dalt ?? centre, 10), pos: v3(f.pois.church_dalt ?? centre, 260, 700, -200) },
    sea: { target: v3(centre, 0, -400), pos: v3(centre, 420, 3800, 600) },
    // Looking out to sea from above the town: the exposed shelf in the glacial eras.
    shelf: { target: new THREE.Vector3(sea[0] * 7000, -110, -sea[1] * 7000), pos: v3(centre, 750, -1400, -900) },
  };

  let mode: Mode = "orbit";
  const listeners: Array<(m: Mode) => void> = [];
  let anim: { from: View; to: View; t: number; dur: number } | null = null;
  // Fly / walk state.
  let yaw = 0, pitch = 0;
  const keys = new Set<string>();
  let dragging = false;
  let last = [0, 0];
  let cinemaT = 0;

  const syncAngles = () => {
    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
    yaw = e.y;
    pitch = e.x;
  };

  const setMode = (m: Mode) => {
    if (m === mode) return;
    mode = m;
    controls.enabled = m === "orbit";
    if (m === "orbit") {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const dist = Math.max(80, camera.position.y - H(camera.position.x, -camera.position.z)) * 2.2;
      controls.target.copy(camera.position).addScaledVector(dir, dist);
      controls.target.y = H(controls.target.x, -controls.target.z);
      controls.update();
    } else syncAngles();
    if (m === "walk") {
      // Walking starts on dry land: step inland from wherever the camera was.
      const p = camera.position;
      for (let k = 0; k < 600 && ground.height(p.x, -p.z) < 0.6; k++) { p.x -= sea[0] * 5; p.z += sea[1] * 5; }
      p.y = H(p.x, -p.z) + 1.7;
      pitch = 0;
    }
    if (m === "cinema") cinemaT = 0;
    listeners.forEach(l => l(m));
  };

  dom.addEventListener("pointerdown", e => {
    if (mode === "cinema") setMode("orbit");
    if (mode === "fly" || mode === "walk") { dragging = true; last = [e.clientX, e.clientY]; dom.setPointerCapture(e.pointerId); }
    anim = null;
  });
  dom.addEventListener("pointermove", e => {
    if (!dragging) return;
    yaw -= (e.clientX - last[0]) * 0.004;
    pitch = THREE.MathUtils.clamp(pitch - (e.clientY - last[1]) * 0.004, -1.45, 1.45);
    last = [e.clientX, e.clientY];
  });
  const endDrag = () => { dragging = false; };
  dom.addEventListener("pointerup", endDrag);
  dom.addEventListener("pointercancel", endDrag);
  dom.addEventListener("wheel", () => { anim = null; }, { passive: true });
  window.addEventListener("keydown", e => {
    if ((e.target as HTMLElement)?.tagName === "INPUT" && (e.target as HTMLInputElement).type === "text") return;
    keys.add(e.code);
  });
  window.addEventListener("keyup", e => keys.delete(e.code));
  window.addEventListener("blur", () => keys.clear());

  const flyTo = (pos: THREE.Vector3, target: THREE.Vector3, seconds = 2.2) => {
    if (mode === "cinema" || mode === "walk") setMode("orbit");
    const tgt = mode === "fly" ? camera.position.clone().add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(200)) : controls.target.clone();
    anim = { from: { pos: camera.position.clone(), target: tgt }, to: { pos: pos.clone(), target: target.clone() }, t: 0, dur: seconds };
  };

  const cinemaPath = (["overview", "core", "beach", "port", "sea", "dalt"] as ViewId[]).map(id => views[id]);
  const posCurve = new THREE.CatmullRomCurve3(cinemaPath.map(v => v.pos), true, "centripetal");
  const tgtCurve = new THREE.CatmullRomCurve3(cinemaPath.map(v => v.target), true, "centripetal");

  const rig: CameraRig = {
    camera, controls, views,
    get mode() { return mode; },
    setMode,
    flyTo,
    view(id, seconds) { const v = views[id]; flyTo(v.pos, v.target, seconds); },
    update(dt, seaLevel) {
      let moving = false;
      const floor = (x: number, z: number) => Math.max(ground.height(x, -z), seaLevel);
      if (anim) {
        anim.t += dt / anim.dur;
        const k = anim.t >= 1 ? 1 : 1 - Math.pow(1 - anim.t, 3);
        // Arc: rise above the straight path so long flights don't clip the hills.
        const lift = Math.sin(Math.PI * k) * anim.from.pos.distanceTo(anim.to.pos) * 0.15;
        camera.position.lerpVectors(anim.from.pos, anim.to.pos, k).y += lift;
        const tg = new THREE.Vector3().lerpVectors(anim.from.target, anim.to.target, k);
        if (mode === "orbit") { controls.target.copy(tg); controls.update(); }
        else { camera.lookAt(tg); syncAngles(); }
        if (anim.t >= 1) anim = null;
        moving = true;
      } else if (mode === "orbit") {
        moving = controls.update();
      } else if (mode === "cinema") {
        cinemaT = (cinemaT + dt / 90) % 1;
        camera.position.copy(posCurve.getPointAt(cinemaT));
        camera.lookAt(tgtCurve.getPointAt(cinemaT));
        moving = true;
      } else {
        camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, "YXZ"));
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        if (mode === "walk") { fwd.y = 0; fwd.normalize(); right.y = 0; right.normalize(); }
        const alt = camera.position.y - floor(camera.position.x, camera.position.z);
        const run = keys.has("ShiftLeft") || keys.has("ShiftRight");
        const speed = mode === "walk" ? (run ? 7 : 1.8) : Math.max(15, alt * 0.9) * (run ? 3 : 1);
        const mv = new THREE.Vector3();
        if (keys.has("KeyW")) mv.add(fwd);
        if (keys.has("KeyS")) mv.sub(fwd);
        if (keys.has("KeyD")) mv.add(right);
        if (keys.has("KeyA")) mv.sub(right);
        if (mode === "fly" && keys.has("KeyE")) mv.y += 1;
        if (mode === "fly" && keys.has("KeyQ")) mv.y -= 1;
        if (mv.lengthSq() > 0) { camera.position.addScaledVector(mv.normalize(), speed * dt); moving = true; }
        if (dragging) moving = true;
        if (mode === "walk") camera.position.y = floor(camera.position.x, camera.position.z) + 1.7;
      }
      const min = floor(camera.position.x, camera.position.z) + (mode === "walk" ? 1.7 : 4);
      if (camera.position.y < min) camera.position.y = min;
      return moving;
    },
    state() {
      const p = camera.position, t = mode === "orbit" ? controls.target : camera.position.clone().add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(100));
      return [p.x, p.y, p.z, t.x, t.y, t.z].map(v => Math.round(v)).join(",");
    },
    restore(s) {
      const v = s.split(",").map(Number);
      if (v.length !== 6 || v.some(x => !Number.isFinite(x))) return false;
      camera.position.set(v[0], v[1], v[2]);
      controls.target.set(v[3], v[4], v[5]);
      camera.lookAt(controls.target);
      controls.update();
      return true;
    },
    onModeChange(fn) { listeners.push(fn); },
  };
  return rig;
}
