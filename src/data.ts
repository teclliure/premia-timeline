// Loaders for public/data/*. Local coordinates: x = metres east, n = metres north of the scene
// centre. World coordinates (Three.js): X = x, Y = elevation (m above today's sea level), Z = -n.

export interface Manifest {
  placeholder: boolean;
  orthos: Record<string, { year: number; file: string; source?: { url: string; layer: string } }>;
  hires: { file: string; box: { x0: number; y0: number; x1: number; y1: number } } | null;
  landscape?: string;
}

export interface Dem {
  rows: number;
  cols: number;
  size: number;
  cell: number;
  /** Elevation in metres, row 0 = north; negative = seabed. */
  h: Float32Array;
}

/** [year, floors, base elevation dm, rings (flat dm lists, first = outline), use, zone, Catastro year] */
export type PartRecord = [number, number, number, number[][], string, string, number];
export interface BuildingData { origin: { x: number; y: number; size: number }; parts: PartRecord[]; placeholder?: boolean }

export type Pt = [number, number];
export interface Features {
  lines: { railway: Pt[][]; n2: Pt[][]; c32: Pt[][]; streets: Pt[][]; breakwater: Pt[][]; pier?: Pt[][] };
  areas: { beach: Pt[][]; harbour: Pt[][] };
  pois: Partial<Record<"church" | "church_dalt" | "museu_roma" | "museu_estampacio" | "fabrica_lio" | "vallpremia" | "frigorifics" | "station" | "can_manent" | "can_sanpere" | "can_gravada" | "carrer_aurora" | "fundacio_crit", Pt>>;
  chimneys: Pt[];
  attribution: string;
}

export interface Coastline {
  segments: number;
  band: number;
  axis: Pt;
  origin: Pt;
  range: Pt;
  keys: Array<{ year: number; offsets: number[]; kind: string }>;
}

export interface GalleryItem {
  id: string; year: number; title: string; author: string; licence: string;
  licence_url?: string; source_url: string; file: string; thumb: string;
}

/** Tree records: x, n, z, height, kind (0 tree, 1 orchard, 2 vine), from, until. */
export interface Trees { data: Float32Array; count: number }

const json = async <T>(path: string): Promise<T> => {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json() as Promise<T>;
};
const bin = async (path: string): Promise<ArrayBuffer> => {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.arrayBuffer();
};

export const loadManifest = () => json<Manifest>("data/manifest.json");
export const loadBuildings = () => json<BuildingData>("data/buildings.json");
export const loadFeatures = () => json<Features>("data/features.json");
export const loadCoastline = () => json<Coastline>("data/coastline.json");
export interface PlacePhoto { title: string; author: string; licence: string; licence_url?: string; source_url: string; file: string; thumb: string; year?: number | null }
export const loadPlacePhotos = () => json<Record<string, PlacePhoto>>("data/places.json").catch(() => ({} as Record<string, PlacePhoto>));
export const loadGallery = () => json<GalleryItem[]>("data/gallery.json").catch(() => [] as GalleryItem[]);

export async function loadDem(): Promise<Dem> {
  const meta = await json<{ rows: number; cols: number; size: number }>("data/dem.json");
  const raw = new Int16Array(await bin("data/dem.bin"));
  const h = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) h[i] = raw[i] / 10;
  return { rows: meta.rows, cols: meta.cols, size: meta.size, cell: meta.size / meta.cols, h };
}

export async function loadTrees(): Promise<Trees> {
  const data = new Float32Array(await bin("data/trees.bin"));
  return { data, count: Math.floor(data.length / 7) };
}

/** Bilinear elevation at local x (east), n (north); clamps outside the box. */
export function elevation(dem: Dem, x: number, n: number): number {
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
