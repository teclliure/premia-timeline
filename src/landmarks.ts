// Hand-modelled features placed on the real positions from features.json: railway (1848) and a
// moving train, Camí Ral / N-II, C-32 (1969), port breakwaters (1972–75), Sant Cristòfol (1798,
// burned in the Civil War, rebuilt from 1939), factory chimneys, a Late Roman octagonal building
// on the Can Ferrerons villa, boats on the beach and in the port, and the HTML labels.
import * as THREE from "three";
import { elevation, type Features, type Pt } from "./data";
import type { Ground } from "./ground";
import { t } from "./i18n";

export interface Label { key: string; at: Pt; lift: number; from: number; to: number; text: (year: number) => string; place?: string; el?: HTMLElement }

export interface Landmarks {
  group: THREE.Group;
  labels: Label[];
  setYear(year: number): void;
  tick(seconds: number, year: number): boolean;
}

const lamb = (color: number) => new THREE.MeshLambertMaterial({ color });

function resample(line: Pt[], step: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i + 1 < line.length; i++) {
    const [ax, an] = line[i];
    const [bx, bn] = line[i + 1];
    const len = Math.hypot(bx - ax, bn - an);
    const k = Math.max(1, Math.ceil(len / step));
    for (let j = 0; j < k; j++) out.push([ax + ((bx - ax) * j) / k, an + ((bn - an) * j) / k]);
  }
  if (line.length) out.push(line[line.length - 1]);
  return out;
}

/** Strip of `width` m draped on the ground along each polyline, `lift` m above it. */
function ribbon(lines: Pt[][], width: number, lift: number, ground: Ground, offset = 0): THREE.BufferGeometry {
  const pos: number[] = [];
  for (const raw of lines) {
    const line = resample(raw, 6);
    for (let i = 0; i + 1 < line.length; i++) {
      const pts = [line[i], line[i + 1]];
      const dir = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]];
      const len = Math.hypot(dir[0], dir[1]) || 1;
      const nx = -dir[1] / len, nn = dir[0] / len;
      const corner = (p: Pt, side: number) => {
        const x = p[0] + nx * (offset + side * width / 2);
        const n = p[1] + nn * (offset + side * width / 2);
        return [x, Math.max(ground.height(x, n), 0.2) + lift, -n];
      };
      const a = corner(pts[0], -1), b = corner(pts[0], 1), c = corner(pts[1], -1), d = corner(pts[1], 1);
      pos.push(...a, ...b, ...c, ...b, ...d, ...c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function lineLength(line: Pt[]): number {
  let s = 0;
  for (let i = 0; i + 1 < line.length; i++) s += Math.hypot(line[i + 1][0] - line[i][0], line[i + 1][1] - line[i][1]);
  return s;
}

function pointAt(line: Pt[], dist: number): { p: Pt; dir: Pt } {
  let s = 0;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i], b = line[i + 1];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (s + l >= dist || i === line.length - 2) {
      const k = l ? Math.min(Math.max((dist - s) / l, 0), 1) : 0;
      return { p: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], dir: [(b[0] - a[0]) / (l || 1), (b[1] - a[1]) / (l || 1)] };
    }
    s += l;
  }
  return { p: line[0], dir: [1, 0] };
}

function gableHouse(w: number, l: number, h: number, rise: number, wall: number, roof: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), lamb(wall));
  body.position.y = h / 2;
  g.add(body);
  const shape = new THREE.Shape([new THREE.Vector2(-w / 2 - 0.4, 0), new THREE.Vector2(w / 2 + 0.4, 0), new THREE.Vector2(0, rise)]);
  const r = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: l + 0.8, bevelEnabled: false }), lamb(roof));
  r.position.set(0, h, -l / 2 - 0.4);
  g.add(r);
  g.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

export function createLandmarks(f: Features, ground: Ground): Landmarks {
  const group = new THREE.Group();
  const labels: Label[] = [];
  const axis = ground.coast.axis;
  const coastAngle = Math.atan2(axis[1], axis[0]); // along-shore direction, radians from east
  const place = (o: THREE.Object3D, p: Pt, lift = 0, rot = coastAngle) => {
    o.position.set(p[0], ground.height(p[0], p[1]) + lift, -p[1]);
    o.rotation.y = rot;
  };

  // --- roads and railway
  const n2 = new THREE.Mesh(ribbon(f.lines.n2, 8, 0.25, ground), lamb(0x9b9078));
  n2.receiveShadow = true;
  const c32 = new THREE.Mesh(ribbon(f.lines.c32, 24, 0.4, ground), lamb(0x5d5e60));
  c32.receiveShadow = true;
  const ballast = new THREE.Mesh(ribbon(f.lines.railway, 4.5, 0.3, ground), lamb(0x77706a));
  ballast.receiveShadow = true;
  const railMat = lamb(0x3a3532);
  const rails = new THREE.Group();
  rails.add(new THREE.Mesh(ribbon(f.lines.railway, 0.18, 0.45, ground, -0.72), railMat), new THREE.Mesh(ribbon(f.lines.railway, 0.18, 0.45, ground, 0.72), railMat));
  group.add(n2, c32, ballast, rails);

  // --- today's shoreline, drawn while the sea is far lower (glacial and early Holocene)
  const shoreline: Pt[] = [];
  {
    const [ax, an] = ground.coast.axis;
    const [ox, on] = ground.coast.origin;
    const [sx, sn] = ground.seaN;
    const half = ground.dem.size / 2;
    for (let s = -half * 1.5; s <= half * 1.5; s += 20) {
      let x = ox + ax * s - sx * 400, n = on + an * s - sn * 400;
      let found = false;
      for (let k = 0; k < 160; k++, x += sx * 5, n += sn * 5) {
        if (Math.abs(x) > half || Math.abs(n) > half) break;
        if (elevation(ground.dem, x, n) <= 0) { found = true; break; }
      }
      if (found) shoreline.push([x, n]);
    }
  }
  const shoreMark = new THREE.Mesh(ribbon([shoreline], 3, 0.6, ground), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 }));
  group.add(shoreMark);

  // --- train
  const rail = f.lines.railway.length ? f.lines.railway.reduce((a, b) => (lineLength(b) > lineLength(a) ? b : a)) : [];
  const railLen = lineLength(rail);
  const train = new THREE.Group();
  const cars: THREE.Mesh[] = [];
  const steamMat = lamb(0x1d1d1f), coachOld = lamb(0x6b3a2a), coachNew = lamb(0xb9bcc0), stripe = lamb(0xa8302e);
  for (let i = 0; i < 5; i++) {
    const car = new THREE.Mesh(new THREE.BoxGeometry(i === 0 ? 9 : 14, 3.4, 2.9), i === 0 ? steamMat : coachOld);
    car.castShadow = true;
    cars.push(car);
    train.add(car);
  }
  const trainStripe = new THREE.Mesh(new THREE.BoxGeometry(14, 0.5, 2.95), stripe);
  train.add(trainStripe);
  group.add(train);

  // --- port breakwaters (built 1972–1975). When OSM maps the port only as a harbour area, its
  // seaward edges stand in for the breakwater.
  if (!f.lines.breakwater.length && f.areas.harbour[0]) {
    const ring = f.areas.harbour[0];
    let cur: Pt[] = [];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      if (ground.height((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) < 0.3) { if (!cur.length) cur.push(a); cur.push(b); }
      else if (cur.length) { f.lines.breakwater.push(cur); cur = []; }
    }
    if (cur.length) f.lines.breakwater.push(cur);
  }
  const bwMat = lamb(0x9a968c);
  const breakwaters = f.lines.breakwater.map(line => {
    const len = lineLength(line);
    const segs: Array<{ mesh: THREE.Mesh; at: number }> = [];
    const pts = resample(line, 10);
    let acc = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const mx = (a[0] + b[0]) / 2, mn = (a[1] + b[1]) / 2;
      const floor = Math.min(ground.height(mx, mn), -0.5);
      const top = 2.6;
      const m = new THREE.Mesh(new THREE.BoxGeometry(l + 1, top - floor, 11), bwMat);
      m.position.set(mx, (top + floor) / 2, -mn);
      m.rotation.y = Math.atan2(b[1] - a[1], b[0] - a[0]);
      m.castShadow = m.receiveShadow = true;
      group.add(m);
      segs.push({ mesh: m, at: acc / Math.max(len, 1) });
      acc += l;
    }
    return segs;
  });

  // --- marina pontoons (thin, from 1975)
  const pierMat = lamb(0x8a7f70);
  const piers = new THREE.Group();
  for (const line of f.lines.pier ?? []) {
    const pts = resample(line, 8);
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const m = new THREE.Mesh(new THREE.BoxGeometry(l + 0.5, 0.6, 2.5), pierMat);
      m.position.set((a[0] + b[0]) / 2, 0.6, -(a[1] + b[1]) / 2);
      m.rotation.y = Math.atan2(b[1] - a[1], b[0] - a[0]);
      m.receiveShadow = true;
      piers.add(m);
    }
  }
  group.add(piers);

  // --- boats moored in the harbour (from 1975) and pulled up on the beach (1800–1965)
  const hull = new THREE.ConeGeometry(1.1, 6, 6).rotateZ(Math.PI / 2).scale(1, 0.5, 1);
  const harbour = f.areas.harbour[0];
  const moored = new THREE.InstancedMesh(hull, lamb(0xf2f2ee), 120);
  let nm = 0;
  if (harbour) {
    const xs = harbour.map(p => p[0]), ns = harbour.map(p => p[1]);
    const inside = (x: number, n: number) => {
      let c = false;
      for (let i = 0, j = harbour.length - 1; i < harbour.length; j = i++) {
        const [xi, ni] = harbour[i], [xj, nj] = harbour[j];
        if ((ni > n) !== (nj > n) && x < ((xj - xi) * (n - ni)) / (nj - ni) + xi) c = !c;
      }
      return c;
    };
    const m = new THREE.Matrix4();
    for (let x = Math.min(...xs); x < Math.max(...xs) && nm < 120; x += 9) {
      for (let n = Math.min(...ns); n < Math.max(...ns) && nm < 120; n += 14) {
        if (!inside(x, n) || ground.height(x, n) > -1.5) continue;
        m.makeRotationY(coastAngle + Math.PI / 2).setPosition(x, 0.3, -n);
        moored.setMatrixAt(nm++, m);
      }
    }
  }
  moored.count = nm;
  group.add(moored);
  const beached = new THREE.InstancedMesh(hull, lamb(0x2f5d7c), 26);
  {
    // Along the beach in front of the church: find the 1.2 m contour seaward of each sample.
    const church = f.pois.church ?? [0, 0];
    const m = new THREE.Matrix4();
    const sea = ground.seaN;
    for (let k = 0; k < 26; k++) {
      const s = (k - 13) * 14 + (k % 3) * 3;
      let x = church[0] + axis[0] * s, n = church[1] + axis[1] * s;
      for (let step = 0; step < 200 && ground.height(x, n) > 1.4; step++) { x += sea[0] * 3; n += sea[1] * 3; }
      m.makeRotationY(coastAngle + Math.PI / 2 + (k % 2 ? 0.2 : -0.15)).setPosition(x, ground.height(x, n) + 0.35, -n);
      beached.setMatrixAt(k, m);
    }
  }
  group.add(beached);

  // --- Sant Cristòfol
  const church = new THREE.Group();
  const nave = gableHouse(15, 34, 13, 5, 0xd9cdb4, 0xa65a3a);
  const tower = new THREE.Mesh(new THREE.BoxGeometry(6, 30, 6), lamb(0xd2c4a6));
  tower.position.set(8.5, 15, 14);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(4.6, 5, 4).rotateY(Math.PI / 4), lamb(0x9b5638));
  cap.position.set(8.5, 32.5, 14);
  tower.castShadow = cap.castShadow = true;
  church.add(nave, tower, cap);
  const churchBody = new THREE.Group();
  churchBody.add(church);
  if (f.pois.church) { place(churchBody, f.pois.church, -0.5, coastAngle + Math.PI / 2); group.add(churchBody); }

  // --- Sant Pere de Premià (label only), factory chimneys
  const chimneys = f.chimneys.map((p, i) => {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.7, 32, 10).translate(0, 16, 0), lamb(0x9c5a3f));
    c.castShadow = true;
    place(c, p);
    group.add(c);
    const isLio = f.pois.fabrica_lio ? Math.hypot(p[0] - f.pois.fabrica_lio[0], p[1] - f.pois.fabrica_lio[1]) < 60 : i === 0;
    return { mesh: c, from: isLio ? 1898 : 1890, to: isLio ? 2100 : 1985 };
  });

  // --- Late Roman octagonal building at Can Ferrerons (illustrative volume) and a farmhouse
  const villa = new THREE.Group();
  const oct = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 7, 8), lamb(0xd8c9a8));
  oct.position.y = 3.5;
  const octRoof = new THREE.Mesh(new THREE.ConeGeometry(11, 3.5, 8), lamb(0xa45c3c));
  octRoof.position.y = 8.75;
  const wing = gableHouse(9, 26, 5, 2, 0xd3c29d, 0xa45c3c);
  wing.position.set(0, 0, -20);
  oct.castShadow = octRoof.castShadow = true;
  villa.add(oct, octRoof, wing);
  if (f.pois.museu_roma) { place(villa, f.pois.museu_roma, -0.3); group.add(villa); }
  const farm = gableHouse(10, 18, 4.5, 2, 0xcfbf9c, 0xa45c3c);
  if (f.pois.vallpremia) { place(farm, f.pois.vallpremia, -0.3); group.add(farm); }

  // --- Can Manent: masia de tres crugies, documented from 1618 (DIBA 58219). Volume illustrative.
  const manent = new THREE.Group();
  if (f.pois.can_manent) {
    const body = gableHouse(15, 17, 8.5, 3.6, 0xe6dcc6, 0xa2593a);
    const wing = gableHouse(7, 10, 5, 1.8, 0xe0d4bb, 0xa2593a);
    wing.position.set(-11, 0, 3);
    manent.add(body, wing);
    place(manent, f.pois.can_manent, -0.3, coastAngle + Math.PI / 2);
    group.add(manent);
  }

  // --- gas works (La Propagadora del Gas, 1884): three gasometers and a chimney. After 1983 only
  // the containment structure of one gasometer remains (DIBA 58199).
  const gas = new THREE.Group();
  const gasTanks: THREE.Mesh[] = [];
  let gasFrame: THREE.Mesh | null = null;
  let gasChimney: THREE.Mesh | null = null;
  if (f.pois.museu_estampacio) {
    const tankMat = lamb(0x6f7378);
    for (let i = 0; i < 3; i++) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 11, 20).translate(0, 5.5, 0), tankMat);
      t.position.set(-24 + i * 18, 0, 22);
      t.castShadow = true;
      gasTanks.push(t);
      gas.add(t);
    }
    gasFrame = new THREE.Mesh(new THREE.CylinderGeometry(8.4, 8.4, 12, 20, 1, true).translate(0, 6, 0),
      new THREE.MeshLambertMaterial({ color: 0x4a4e52, wireframe: true }));
    gasFrame.position.copy(gasTanks[0].position);
    gas.add(gasFrame);
    gasChimney = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.5, 26, 10).translate(0, 13, 0), lamb(0x9c5a3f));
    gasChimney.position.set(14, 0, -6);
    gasChimney.castShadow = true;
    gas.add(gasChimney);
    place(gas, f.pois.museu_estampacio, -0.2, coastAngle);
    group.add(gas);
  }

  // --- Can Sanpere: 1930 rationalist building with a ~20 m brick chimney (DIBA 58375). The
  // building itself comes from the Catastro; only the chimney is modelled here.
  let sanpereChimney: THREE.Mesh | null = null;
  if (f.pois.can_sanpere) {
    sanpereChimney = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.4, 20, 10).translate(0, 10, 0), lamb(0xa15d40));
    sanpereChimney.castShadow = true;
    place(sanpereChimney, [f.pois.can_sanpere[0] + 6, f.pois.can_sanpere[1] + 4]);
    group.add(sanpereChimney);
  }

  // --- labels
  const L = (key: string, at: Pt | undefined, lift: number, from: number, to: number, text: (y: number) => string, place?: string) => {
    if (at) labels.push({ key, at, lift, from, to, text, place });
  };
  if (shoreline.length > 2) L("coast", shoreline[Math.floor(shoreline.length * 0.62)], 25, -1e6, -4500, () => t("label.coast"));
  L("church", f.pois.church, 40, 1798, 3000, y => (y >= 1936.5 && y < 1939 ? t("label.church.ruin") : t("label.church")), "church");
  L("can_manent", f.pois.can_manent, 16, 1616, 3000, y => t(y >= 2026.37 ? "label.can_manent.festa" : "label.can_manent"), "can_manent");
  L("gas", f.pois.museu_estampacio, 22, 1884.1, 3000, y => (y >= 2002.3 ? t("label.gas.museum") : t("label.gas")), "gas");
  L("cami_mig", f.pois.cami_mig, 12, -150, 3000, y => t(y < 476 ? "label.cami_mig.roman" : "label.cami_mig"), "cami_mig");
  L("nucli_historic", f.pois.nucli_historic, 18, 1750, 3000, () => t("label.nucli_historic"), "nucli_historic");
  L("riera", f.pois.frigorifics, 10, -9700, 3000, () => t("label.riera"), "riera");
  L("cases_barates", f.pois.cases_barates, 12, 1922, 3000, () => t("label.cases_barates"), "cases_barates");
  L("caseta_aigues", f.pois.caseta_aigues, 10, 1928, 3000, () => t("label.caseta_aigues"), "caseta_aigues");
  for (const [id, from] of [["vapor_vell", 1863], ["foneria_roura", 1881], ["can_galindo", 1840], ["ca_lescoda", 1940],
    ["carboniques_pujol", 1900], ["salvador_simo", 1936]] as Array<[string, number]>) {
    L(id, f.pois[id], 14, from, 3000, () => t(`place.${id}.title`), id);
  }
  L("can_sanpere", f.pois.can_sanpere, 26, 1930, 3000, y => t(y >= 2025.9 ? "label.can_sanpere.works" : y >= 2013.3 ? "label.can_sanpere.social" : "label.can_sanpere"), "can_sanpere");
  L("can_gravada", f.pois.can_gravada, 14, 1908, 3000, () => t("label.can_gravada"), "can_gravada");
  L("aurora", f.pois.carrer_aurora, 10, 1898, 3000, () => t("label.aurora"), "aurora");
  L("church_dalt", f.pois.church_dalt, 30, 1798, 3000, () => t("label.church_dalt"));
  L("station", f.pois.station, 12, 1848.8, 3000, () => t("label.station"));
  if (rail.length) L("railway", pointAt(rail, railLen * 0.72).p, 10, 1848.8, 3000, () => t("label.railway"));
  if (f.lines.n2[0]) L("n2", pointAt(f.lines.n2[0], lineLength(f.lines.n2[0]) * 0.3).p, 8, 1500, 3000, y => (y >= 1950 ? t("label.n2.modern") : t("label.n2")));
  if (f.lines.c32[0]) L("c32", pointAt(f.lines.c32[0], lineLength(f.lines.c32[0]) * 0.55).p, 10, 1969, 3000, () => t("label.c32"));
  if (f.lines.breakwater[0]) L("port", pointAt(f.lines.breakwater[0], lineLength(f.lines.breakwater[0]) * 0.6).p, 12, 1974, 3000, () => t("label.port"));
  L("fabrica_lio", f.pois.fabrica_lio, 38, 1898, 3000, () => t("label.fabrica_lio"), "fabrica_lio");
  L("villa", f.pois.museu_roma, 18, 250, 500, () => t("label.villa"));
  L("museu_roma", f.pois.museu_roma, 18, 2015, 3000, () => t("label.museu_roma"));
  L("vallpremia", f.pois.vallpremia, 14, -100, 100, () => t("label.vallpremia"));
  L("frigorifics", f.pois.frigorifics, 22, -125, 30, () => t("label.frigorifics"));

  const api: Landmarks = {
    group,
    labels,
    setYear(year: number) {
      shoreMark.visible = year < -4500;
      n2.visible = year >= 1500;
      (n2.material as THREE.MeshLambertMaterial).color.set(year >= 1950 ? 0x55575a : year >= 1900 ? 0x8a8478 : 0xa89a7c);
      c32.visible = year >= 1969;
      const railOn = year >= 1848.8;
      ballast.visible = rails.visible = railOn;
      train.visible = railOn && rail.length > 1;
      const modern = year >= 1960;
      cars.forEach((c, i) => { c.material = i === 0 && !modern ? steamMat : modern ? coachNew : coachOld; });
      trainStripe.visible = modern;
      const k = THREE.MathUtils.clamp((year - 1972) / 3, 0, 1);
      for (const segs of breakwaters) for (const s of segs) s.mesh.visible = k > 0 && s.at <= k;
      moored.visible = year >= 1975;
      piers.visible = year >= 1975;
      beached.visible = year >= 1800 && year < 1965;
      // Church: rising 1798–1820, standing, burned in 1936 (one metre of wall left), rebuilt
      // from 1939 (the end of the rebuilding is not dated; shown over six years).
      let cs = 0;
      if (year >= 1798 && year < 1820) cs = (year - 1798) / 22;
      else if (year >= 1820 && year < 1936.5) cs = 1;
      else if (year >= 1936.5 && year < 1939) cs = 0.07;
      else if (year >= 1939) cs = Math.min(0.07 + (year - 1939) / 6, 1);
      churchBody.visible = cs > 0;
      church.scale.set(1, Math.max(cs, 0.001), 1);
      // Roofs only on the finished building: the 1936 ruin and the building sites show bare walls.
      nave.children[1].visible = cap.visible = cs >= 0.999;
      for (const c of chimneys) c.mesh.visible = year >= c.from && year < c.to;
      villa.visible = year >= 250 && year < 500;
      manent.visible = year >= 1616;
      if (sanpereChimney) sanpereChimney.visible = year >= 1930;
      const gasOn = year >= 1884.1 && year < 1983;
      gas.visible = year >= 1884.1;
      gasTanks.forEach(t => { t.visible = gasOn; });
      if (gasFrame) gasFrame.visible = year >= 1983;
      if (gasChimney) gasChimney.visible = year >= 1884.1 && year < 1941;
      farm.visible = year >= -100 && year < 100;
    },
    tick(seconds: number, year: number) {
      if (!train.visible || railLen < 50) return false;
      // One train every ~70 s of screen time, both directions.
      const speed = year >= 1960 ? 22 : 12;
      const period = railLen / speed + 25;
      const tt = (seconds % period) * speed;
      const forward = Math.floor(seconds / period) % 2 === 0;
      let d = forward ? tt : railLen - tt;
      if (d < 0 || d > railLen) { train.visible = false; return false; }
      let gap = 0;
      cars.forEach((car, i) => {
        const len = i === 0 ? 9 : 14;
        const dd = forward ? d - gap - len / 2 : d + gap + len / 2;
        const { p, dir } = pointAt(rail, THREE.MathUtils.clamp(dd, 0, railLen));
        car.position.set(p[0], Math.max(ground.height(p[0], p[1]), 0.2) + 2.2, -p[1]);
        car.rotation.y = Math.atan2(dir[1], dir[0]);
        if (i === 1) { trainStripe.position.copy(car.position); trainStripe.position.y -= 0.4; trainStripe.rotation.copy(car.rotation); }
        gap += len + 0.8;
      });
      return true;
    },
  };
  return api;
}
