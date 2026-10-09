// Time scale, eras, milestones and the sea-level curve. Texts live in src/locales/*.json under
// eras.<id>.* and ms.<id>; sources are listed here because URLs do not change with language.
import { t, formatNumber } from "./i18n";

export const START = -25000;
export const NOW = 2026;

/** Non-linear scale: [slider position 0..1, year]. Prehistory is compressed, 1800–today expanded. */
const KEYS: Array<[number, number]> = [
  [0, START], [0.07, -9700], [0.13, -650], [0.2, -150], [0.27, 476], [0.34, 1798],
  [0.44, 1848], [0.53, 1898], [0.62, 1939], [0.75, 1972], [0.87, 2000], [1, NOW],
];

export function yearAt(pos: number): number {
  const p = Math.min(Math.max(pos, 0), 1);
  for (let i = 1; i < KEYS.length; i++) {
    const [p0, y0] = KEYS[i - 1];
    const [p1, y1] = KEYS[i];
    if (p <= p1) return y0 + ((p - p0) / (p1 - p0)) * (y1 - y0);
  }
  return NOW;
}

export function posAt(year: number): number {
  const y = Math.min(Math.max(year, START), NOW);
  for (let i = 1; i < KEYS.length; i++) {
    const [p0, y0] = KEYS[i - 1];
    const [p1, y1] = KEYS[i];
    if (y <= y1) return p0 + ((y - y0) / (y1 - y0)) * (p1 - p0);
  }
  return 1;
}

/** Years covered by one small slider step at this year: buildings rise over about this span. */
export function yearsPerStep(year: number, step = 0.004): number {
  const p = posAt(year);
  return Math.max(yearAt(Math.min(p + step, 1)) - yearAt(Math.max(p - step, 0)), 0.6);
}

export function formatYear(y: number): string {
  const r = Math.round(y);
  if (r < 0) return `${formatNumber(-r)} ${t("year.bc")}`;
  if (r < 1000) return `${r} ${t("year.ad")}`;
  return String(r);
}

export interface Source { title: string; url: string }

export const SOURCES = {
  lambeck: { title: "Lambeck et al. (2014), PNAS · Nivell del mar i volum de gel des del màxim glacial", url: "https://doi.org/10.1073/pnas.1411762111" },
  clark: { title: "Clark et al. (2009), Science · The Last Glacial Maximum", url: "https://doi.org/10.1126/science.1172873" },
  frigorifics: { title: "Inventari del Patrimoni Cultural (Diputació de Barcelona) · Els Frigorífics / Illa de Premià", url: "https://patrimonicultural.diba.cat/print/pdf/node/58252" },
  vallpremia: { title: "Inventari del Patrimoni Cultural (Diputació de Barcelona) · Vallpremià", url: "https://patrimonicultural.diba.cat/print/pdf/node/58261" },
  villa: { title: "ICAC · La vil·la romana de la Gran Via – Can Ferrerons", url: "https://icac.cat/recerca/projectes-de-recerca/projecte/la-vil%C2%B7la-romana-de-la-gran-via-can-ferrerons-premia-de-mar-maresme/" },
  museu: { title: "Ajuntament de Premià de Mar · Museu de l'Estampació", url: "https://premiademar.cat/ks-museu" },
  torrassa: { title: "Ajuntament de Premià de Mar · Bases del concurs de la Torrassa del Port (antecedents històrics)", url: "https://premiademar.cat/ARXIUS/webs/torrassa_port/documents/Bases_concurs_Torrassa_Port.pdf" },
  church: { title: "Inventari del Patrimoni Cultural (Diputació de Barcelona) · Església de Sant Cristòfol", url: "https://patrimonicultural.diba.cat/print/pdf/node/58197" },
  rectoria: { title: "Inventari del Patrimoni Cultural (Diputació de Barcelona) · Rectoria", url: "https://patrimonicultural.diba.cat/print/pdf/node/58198" },
  lio: { title: "Inventari del Patrimoni Cultural (Diputació de Barcelona) · Fàbrica Lió", url: "https://patrimonicultural.diba.cat/print/pdf/node/58196" },
  kiddle: { title: "Premià de Mar (article derivat de la Viquipèdia, Kiddle)", url: "https://ninos.kiddle.co/Premi%C3%A1_de_Mar" },
  wiki: { title: "Wikipedia · Premià de Mar (població històrica)", url: "https://en.wikipedia.org/wiki/Premi%C3%A0_de_Mar" },
  rail: { title: "Forbes / Renfe · 175 anys del primer viatge en tren a la Península (28-10-1848)", url: "https://forbes.es/ultima-hora/357642/renfe-celebra-los-175-anos-del-primer-viaje-en-tren-en-la-peninsula-que-unio-barcelona-y-mataro/" },
  port: { title: "Ajuntament de Premià de Mar · Antecedents i història del port", url: "https://premiademar.cat/document.php?id=11273" },
  manent: { title: "Inventari del Patrimoni Cultural (Diputació de Barcelona) · Can Manent", url: "https://patrimonicultural.diba.cat/print/pdf/node/58219" },
  manentArch: { title: "Inventari del Patrimoni Cultural (Diputació de Barcelona) · Can Manent, jaciment", url: "https://patrimonicultural.diba.cat/print/pdf/node/58324" },
  aeccImages: { title: "Inventari del Patrimoni Cultural (Diputació de Barcelona) · Fons d'imatges de l'AECC (Can Manent)", url: "https://patrimonicultural.diba.cat/print/pdf/node/58385" },
  gas: { title: "Inventari del Patrimoni Cultural (Diputació de Barcelona) · Propagadora del Gas", url: "https://patrimonicultural.diba.cat/print/pdf/node/58199" },
  gasArch: { title: "Inventari del Patrimoni Cultural (Diputació de Barcelona) · Fàbrica del gas, jaciment", url: "https://patrimonicultural.diba.cat/print/pdf/node/58253" },
  museumCollection: { title: "Inventari del Patrimoni Cultural (Diputació de Barcelona) · Col·lecció del Museu de l'Estampació", url: "https://patrimonicultural.diba.cat/print/pdf/node/58296" },
  gravada: { title: "Inventari del Patrimoni Cultural (Diputació de Barcelona) · Magatzem al carrer Gibraltar (Can Gravada)", url: "https://patrimonicultural.diba.cat/print/pdf/node/58202" },
  aurora: { title: "Inventari del Patrimoni Cultural (Diputació de Barcelona) · Carrer Aurora", url: "https://patrimonicultural.diba.cat/print/pdf/node/58287" },
  nucli: { title: "Inventari del Patrimoni Cultural (Diputació de Barcelona) · Nucli històric", url: "https://patrimonicultural.diba.cat/print/pdf/node/58275" },
} satisfies Record<string, Source>;
export type SourceId = keyof typeof SOURCES;

export interface Era {
  id: string;
  from: number;
  to: number;
  color: string;
  /** Seconds of playback the era gets. */
  seconds: number;
  /** How much of what is shown is measured: 0 illustrative … 3 measured. */
  confidence: 0 | 1 | 2 | 3;
  approximateStart?: boolean;
  /** Camera preset for "Mirar de prop". */
  view: string;
  sources: SourceId[];
}

export const ERAS: Era[] = [
  { id: "glacial", from: START, to: -9700, color: "#7d8b99", seconds: 8, confidence: 1, view: "shelf", sources: ["lambeck", "clark"] },
  { id: "holocene", from: -9700, to: -550, color: "#5f7a5a", seconds: 9, confidence: 1, view: "overview", sources: ["lambeck", "frigorifics"] },
  { id: "iberian", from: -550, to: -150, color: "#8a6a45", seconds: 7, confidence: 0, approximateStart: true, view: "core", sources: ["frigorifics", "vallpremia"] },
  { id: "roman", from: -150, to: 476, color: "#9b4a35", seconds: 12, confidence: 0, view: "villa", sources: ["vallpremia", "frigorifics", "villa", "museu"] },
  { id: "medieval", from: 476, to: 1798, color: "#6e5a7e", seconds: 9, confidence: 0, view: "dalt", sources: ["torrassa", "rectoria", "manent", "nucli"] },
  { id: "barri", from: 1798, to: 1848, color: "#b07a3a", seconds: 12, confidence: 2, view: "core", sources: ["church", "rectoria", "kiddle"] },
  { id: "tren", from: 1848, to: 1898, color: "#4f6b8a", seconds: 12, confidence: 2, view: "beach", sources: ["rail", "kiddle", "torrassa", "gas", "nucli", "wiki"] },
  { id: "fabriques", from: 1898, to: 1939, color: "#8a4b4b", seconds: 12, confidence: 2, view: "core", sources: ["lio", "gas", "gravada", "aurora", "church", "wiki"] },
  { id: "creixement", from: 1939, to: 1972, color: "#5a7d6d", seconds: 14, confidence: 3, view: "overview", sources: ["wiki"] },
  { id: "port", from: 1972, to: 2000, color: "#3f7c95", seconds: 12, confidence: 3, view: "port", sources: ["port", "lio", "museu", "wiki"] },
  { id: "avui", from: 2000, to: NOW, color: "#4a6b9b", seconds: 10, confidence: 3, view: "port", sources: ["port", "villa", "kiddle", "wiki"] },
];

export function eraAt(year: number): Era {
  return ERAS.find(e => year < e.to) ?? ERAS[ERAS.length - 1];
}

export interface Milestone {
  year: number;
  id: string;
  sources: SourceId[];
  /** True when the year is a convention, a range midpoint or otherwise approximate. */
  estimate?: boolean;
}

export const MILESTONES: Milestone[] = [
  { year: -19000, id: "lgm", sources: ["lambeck", "clark"], estimate: true },
  { year: -5000, id: "highstand", sources: ["lambeck"], estimate: true },
  { year: -100, id: "frigorifics", sources: ["frigorifics"], estimate: true },
  { year: 0, id: "vallpremia", sources: ["vallpremia"], estimate: true },
  { year: 350, id: "villa", sources: ["villa"], estimate: true },
  { year: 1618, id: "manent1618", sources: ["manent"] },
  { year: 1798, id: "church1798", sources: ["church"] },
  { year: 1820, id: "mass1820", sources: ["church"] },
  { year: 1836, id: "seg1836", sources: ["kiddle"] },
  { year: 1841, id: "parish1841", sources: ["church", "rectoria"] },
  { year: 1848.82, id: "rail1848", sources: ["rail"] },
  { year: 1854, id: "church1854", sources: ["kiddle"] },
  { year: 1861, id: "plan1861", sources: ["nucli"] },
  { year: 1884.1, id: "gas1884", sources: ["gas"] },
  { year: 1898, id: "lio1898", sources: ["lio"] },
  { year: 1930, id: "lio1930", sources: ["lio"] },
  { year: 1936.5, id: "war1936", sources: ["church"], estimate: true },
  { year: 1939, id: "rebuild1939", sources: ["church"] },
  { year: 1941, id: "gas1941", sources: ["gas"] },
  { year: 1946, id: "photo1946", sources: [] },
  { year: 1956, id: "photo1956", sources: [] },
  { year: 1969, id: "c32", sources: ["wiki"] },
  { year: 1974, id: "port1974", sources: ["port"] },
  { year: 1979, id: "museu1979", sources: ["museu", "lio"] },
  { year: 1985, id: "school1985", sources: ["lio"] },
  { year: 1986, id: "manent1986", sources: ["manent", "manentArch"] },
  { year: 1991.3, id: "port1991", sources: ["port"] },
  { year: 2010.55, id: "portplan2010", sources: ["port"] },
  { year: 2002.3, id: "gas2002", sources: ["museumCollection"] },
  { year: 2015, id: "museu2015", sources: ["museu"] },
  { year: 2018, id: "port2018", sources: ["kiddle"] },
  { year: 2025, id: "pop2025", sources: ["wiki"] },
];

/** Census figures (Wikipedia, historical population table). */
export const POPULATION: Array<[number, number]> = [
  [1900, 2239], [1930, 3380], [1950, 3947], [1970, 11284], [1986, 20069], [2007, 27590], [2025, 29431],
];

export function censusBefore(year: number): [number, number] | null {
  let best: [number, number] | null = null;
  for (const c of POPULATION) if (c[0] <= year) best = c;
  return best;
}

/** Global mean sea level relative to today (m), after Lambeck et al. 2014 (years CE). */
const SEA: Array<[number, number]> = [
  [-25000, -123], [-19000, -130], [-14700, -118], [-12500, -92], [-11500, -70], [-9700, -58],
  [-8000, -40], [-6500, -15], [-5000, -4], [-3000, -1.8], [-1000, -0.8], [500, -0.3], [1850, -0.15], [NOW, 0],
];

export function seaLevel(year: number): number {
  if (year <= SEA[0][0]) return SEA[0][1];
  for (let i = 1; i < SEA.length; i++) {
    const [y0, h0] = SEA[i - 1];
    const [y1, h1] = SEA[i];
    if (year <= y1) {
      const k = (year - y0) / (y1 - y0);
      const s = k * k * (3 - 2 * k);
      return h0 + (h1 - h0) * (0.5 * k + 0.5 * s);
    }
  }
  return 0;
}

/** Playback: slider units per second inside each era, so each era lasts `seconds`. */
export function playSpeed(year: number): number {
  const e = eraAt(year);
  return (posAt(e.to) - posAt(e.from)) / e.seconds;
}
