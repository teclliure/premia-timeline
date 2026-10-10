import * as THREE from "three";
import "./style.css";
import { applyTranslations, t } from "./i18n";
import { loadBuildings, loadCoastline, loadDem, loadFeatures, loadGallery, loadManifest, loadPlacePhotos, loadTrees } from "./data";
import { createPlaceCard } from "./placecard";
import { consumeSentFlag, createContact } from "./contact";
import { placeById, placesIn } from "./places";
import { createGround, pickGround } from "./ground";
import { createTerrain } from "./terrain";
import { createSea } from "./sea";
import { createBuildings } from "./buildings";
import { createTrees } from "./trees";
import { createLandmarks } from "./landmarks";
import { createCamera, VIEW_IDS, type Mode, type ViewId } from "./camera";
import { createLighting } from "./sky";
import { createUI, type Quality } from "./ui";
import { createGallery } from "./gallery";
import { NOW, censusBefore, eraAt, playSpeed, posAt, seaLevel, yearAt, yearsPerStep } from "./timeline";

const QUALITY: Record<Quality, { ratio: number; shadow: number; trees: number; lod: number }> = {
  low: { ratio: 1, shadow: 0, trees: 0.35, lod: 2.2 },
  medium: { ratio: 1.5, shadow: 2048, trees: 0.7, lod: 1.4 },
  high: { ratio: 2, shadow: 4096, trees: 1, lod: 1 },
};
const ORDER: Quality[] = ["low", "medium", "high"];

async function main() {
  applyTranslations();
  document.title = t("app.title");
  const loading = document.getElementById("loading")!;
  loading.textContent = t("app.loading");
  const canvas = document.createElement("canvas");
  if (!canvas.getContext("webgl2")) { loading.textContent = t("app.webgl"); return; }

  const [manifest, dem, coast, features, buildingData, treeData, galleryItems, placePhotos] = await Promise.all([
    loadManifest(), loadDem(), loadCoastline(), loadFeatures(), loadBuildings(), loadTrees(), loadGallery(), loadPlacePhotos(),
  ]);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: new URLSearchParams(location.search).has("shot") });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const app = document.getElementById("app")!;
  app.prepend(canvas);

  const scene = new THREE.Scene();
  const lighting = createLighting(scene);
  const ground = await createGround(dem, coast);
  const terrain = await createTerrain(ground, manifest);
  const sea = createSea(ground);
  const exclude = [
    ...(features.pois.church ? [{ at: features.pois.church, r: 24 }] : []),
    ...(features.pois.can_manent ? [{ at: features.pois.can_manent, r: 14 }] : []),
  ];
  const buildings = createBuildings(buildingData, ground, exclude);
  const trees = createTrees(treeData, ground);
  const landmarks = createLandmarks(features, ground);
  scene.add(terrain.group, sea.mesh, buildings.mesh, trees.group, landmarks.group);
  const rig = createCamera(canvas, ground, features);
  const gallery = createGallery(galleryItems);
  const pois = features.pois as Record<string, [number, number] | undefined>;
  const flyToPlace = (id: string) => {
    const p = placeById(id);
    const at = p && pois[p.poi];
    if (!at) return;
    const h = Math.max(ground.height(at[0], at[1]), 0);
    const target = new THREE.Vector3(at[0], h + 6, -at[1]);
    const pos = new THREE.Vector3(at[0] + ground.seaN[0] * 120 - ground.coast.axis[0] * 60, h + 75, -(at[1] + ground.seaN[1] * 120 - ground.coast.axis[1] * 60));
    rig.flyTo(pos, target);
  };
  const contact = createContact();
  const placeCard = createPlaceCard(placePhotos, flyToPlace, (id, title) => contact.open({ year: yearAt(pos), place: id, placeTitle: title }));

  // ------------------------------------------------------------------ state
  const params = new URLSearchParams(location.hash.slice(1));
  let pos = posAt(Number(params.get("year") ?? NOW) || NOW);
  let playing = false;
  let quality: Quality = (localStorage.getItem("premia-quality") as Quality) || (matchMedia("(max-width: 720px)").matches ? "low" : "medium");
  if (!ORDER.includes(quality)) quality = "medium";
  let autoQuality = true;
  let hour = Number(params.get("h") ?? 11);
  let labelsOn = true;
  let dirty = true;
  let shadowsDirty = true;
  let yearDirty = true;

  const ui = createUI({
    onSeek(p) { pos = p; playing = false; ui.setPlaying(false); yearDirty = true; },
    onPlay() { playing = !playing; if (playing && pos >= 1) pos = 0; ui.setPlaying(playing); dirty = true; },
    onMode(m: Mode) { rig.setMode(m); dirty = true; },
    onView(v: ViewId) { rig.view(v); },
    onLookClose() { rig.view(eraAt(yearAt(pos)).view as ViewId); },
    onGallery() { gallery.open(yearAt(pos)); },
    onHour(h) { hour = h; applyLight(); },
    onDetail(q) { setQuality(q); autoQuality = false; ui.setQuality(quality, false); },
    onAuto(on) { autoQuality = on; },
    onLabels(on) { labelsOn = on; dirty = true; },
    onPlace(id) { placeCard.open(id, yearAt(pos)); },
    onContact() { contact.open({ year: yearAt(pos) }); },
  }, manifest.placeholder || Boolean(buildingData.placeholder) || Boolean((features as { placeholder?: boolean }).placeholder));
  rig.onModeChange(m => ui.setMode(m));
  ui.setMode(rig.mode);
  (document.querySelector(".hour") as HTMLInputElement).value = String(hour);

  function setQuality(q: Quality) {
    quality = q;
    const cfg = QUALITY[q];
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, cfg.ratio));
    lighting.sun.castShadow = cfg.shadow > 0;
    if (cfg.shadow) {
      lighting.sun.shadow.mapSize.set(cfg.shadow, cfg.shadow);
      lighting.sun.shadow.map?.dispose();
      lighting.sun.shadow.map = null as unknown as THREE.WebGLRenderTarget;
    }
    trees.setDensity(cfg.trees);
    try { localStorage.setItem("premia-quality", q); } catch { /* ignore */ }
    shadowsDirty = dirty = true;
  }
  setQuality(quality);
  ui.setQuality(quality, autoQuality);

  function applyLight() {
    lighting.setHour(hour);
    sea.setLight(lighting.sunDir, lighting.sunColor, lighting.zenith, lighting.horizon, lighting.light);
    buildings.setNight(lighting.night);
    shadowsDirty = dirty = true;
  }
  applyLight();

  const camParam = params.get("cam");
  if (!camParam || !rig.restore(camParam)) {
    const v = rig.views[(params.get("view") as ViewId) ?? "overview"] ?? rig.views.overview;
    rig.camera.position.copy(v.pos);
    rig.controls.target.copy(v.target);
    rig.controls.update();
  }
  if (params.get("mode") && ["cinema", "orbit", "fly", "walk"].includes(params.get("mode")!)) rig.setMode(params.get("mode") as Mode);

  // ------------------------------------------------------------------ year
  function coastDistanceKm(level: number): number | null {
    if (level > -0.5) return null;
    const [ox, on] = coast.origin;
    for (let d = 0; d < 40000; d += 25) if (ground.height(ox + ground.seaN[0] * d, on + ground.seaN[1] * d) <= level) return d / 1000;
    return 40;
  }
  function applyYear() {
    const year = yearAt(pos);
    const level = seaLevel(year);
    ground.setYear(year);
    const photo = terrain.setYear(year, level);
    sea.setLevel(level);
    buildings.setYear(year, playing ? Math.max(yearsPerStep(year, 0.006) * 1.5, 1) : 0.001);
    trees.setYear(year);
    landmarks.setYear(year);
    ui.setYear({ places: placesIn(eraAt(year).from, eraAt(year).to, pois).map(p => p.id), year, seaLevel: level, coastKm: coastDistanceKm(level), photo: photo.photo, partial: photo.partial, census: censusBefore(year), galleryCount: gallery.countFor(year) });
    scheduleHash();
    shadowsDirty = dirty = true;
  }

  let hashTimer = 0;
  function scheduleHash() {
    clearTimeout(hashTimer);
    hashTimer = window.setTimeout(() => {
      const p = new URLSearchParams();
      { const y = yearAt(pos); p.set("year", String(Math.abs(y) < 3000 ? Math.round(y * 100) / 100 : Math.round(y))); }
      p.set("cam", rig.state());
      if (hour !== 11) p.set("h", String(hour));
      history.replaceState(null, "", `#${p.toString()}`);
    }, 250);
  }
  window.addEventListener("hashchange", () => {
    const p = new URLSearchParams(location.hash.slice(1));
    const y = Number(p.get("year"));
    if (Number.isFinite(y) && Math.abs(posAt(y) - pos) > 1e-4) { pos = posAt(y); yearDirty = true; }
    if (p.get("cam")) rig.restore(p.get("cam")!);
    dirty = true;
  });

  // ------------------------------------------------------------------ input
  window.addEventListener("keydown", e => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    if (e.code === "Space") { e.preventDefault(); playing = !playing; if (playing && pos >= 1) pos = 0; ui.setPlaying(playing); dirty = true; }
    if (e.code === "ArrowRight" || e.code === "ArrowLeft") {
      e.preventDefault();
      pos = Math.min(Math.max(pos + (e.code === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 0.02 : 0.004), 0), 1);
      yearDirty = true;
    }
    if (e.code.startsWith("Digit")) {
      const v = VIEW_IDS[Number(e.code.slice(5)) - 1];
      if (v) rig.view(v);
    }
  });
  canvas.addEventListener("dblclick", e => {
    const r = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, rig.camera);
    const hit = pickGround(ground, ray.ray, seaLevel(yearAt(pos)));
    if (!hit) return;
    const back = rig.camera.position.clone().sub(hit).setY(0).normalize();
    const dist = Math.min(Math.max(rig.camera.position.distanceTo(hit) * 0.35, 90), 700);
    const to = hit.clone().addScaledVector(back, dist * 0.8);
    to.y = hit.y + dist * 0.55;
    rig.flyTo(to, hit);
  });
  const resize = () => {
    renderer.setSize(app.clientWidth, app.clientHeight, false);
    rig.camera.aspect = app.clientWidth / Math.max(app.clientHeight, 1);
    rig.camera.updateProjectionMatrix();
    dirty = true;
  };
  window.addEventListener("resize", resize);
  resize();

  // ------------------------------------------------------------------ labels
  const v = new THREE.Vector3();
  function placeLabels(year: number) {
    for (const l of landmarks.labels) {
      if (!l.el) {
        l.el = document.createElement(l.place ? "button" : "div");
        l.el.className = l.place ? "label link-label" : "label";
        if (l.place) { const id = l.place; l.el.addEventListener("click", () => placeCard.open(id, yearAt(pos))); }
        ui.labelsRoot.appendChild(l.el);
      }
      const show = labelsOn && year >= l.from && year < l.to;
      if (!show) { l.el.style.display = "none"; continue; }
      v.set(l.at[0], Math.max(ground.height(l.at[0], l.at[1]), 0) + l.lift, -l.at[1]);
      const dist = v.distanceTo(rig.camera.position);
      v.project(rig.camera);
      if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1 || dist > 7000) { l.el.style.display = "none"; continue; }
      l.el.style.display = "";
      l.el.textContent = l.text(year);
      l.el.style.transform = `translate(-50%, -100%) translate(${((v.x + 1) / 2) * app.clientWidth}px, ${((1 - v.y) / 2) * app.clientHeight}px)`;
      l.el.style.opacity = String(Math.min(1, Math.max(0.35, 1.6 - dist / 3500)));
    }
  }

  // ------------------------------------------------------------------ loop
  const clock = new THREE.Clock();
  let frames: number[] = [];
  let lastShadowTarget = new THREE.Vector3(1e9, 0, 0);
  consumeSentFlag(msg => ui.flash(msg));
  loading.remove();
  document.body.classList.add("ready");

  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.1);
    const elapsed = clock.elapsedTime;
    if (playing) {
      pos = Math.min(pos + playSpeed(yearAt(pos)) * dt, 1);
      if (pos >= 1) { playing = false; ui.setPlaying(false); }
      yearDirty = true;
    }
    if (yearDirty) { applyYear(); yearDirty = false; }
    const year = yearAt(pos);
    const moving = rig.update(dt, seaLevel(year));
    if (moving) { dirty = true; scheduleHash(); }
    const continuous = rig.mode !== "orbit" || playing;
    if (!dirty && !continuous) { frames = []; return; }

    sea.tick(elapsed);
    landmarks.tick(elapsed, year);
    terrain.update(rig.camera, QUALITY[quality].lod);
    const target = rig.mode === "orbit" ? rig.controls.target : rig.camera.position;
    const radius = THREE.MathUtils.clamp(rig.camera.position.distanceTo(target) * 0.9, 350, 1800);
    if (target.distanceTo(lastShadowTarget) > radius * 0.25) { lastShadowTarget = target.clone(); shadowsDirty = true; }
    if (shadowsDirty && lighting.sun.castShadow) {
      lighting.follow(lastShadowTarget, radius);
      renderer.shadowMap.needsUpdate = true;
    }
    shadowsDirty = false;
    renderer.render(scene, rig.camera);
    placeLabels(year);
    dirty = false;

    if (autoQuality && continuous) {
      frames.push(dt);
      if (frames.length >= 50) {
        const avg = frames.reduce((a, b) => a + b, 0) / frames.length;
        frames = [];
        const i = ORDER.indexOf(quality);
        if (avg > 0.034 && i > 0) { setQuality(ORDER[i - 1]); ui.setQuality(quality, true); ui.flash(t("ctl.downgraded")); }
      }
    }
  }
  frame();
  (window as unknown as { premia: unknown }).premia = { rig, setYear: (y: number) => { pos = posAt(y); yearDirty = true; }, scene, renderer };
}

main().catch(err => {
  console.error(err);
  const l = document.getElementById("loading");
  if (l) l.textContent = String(err);
});
