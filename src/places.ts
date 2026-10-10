// Places with a history card: Can Manent, the gas works, the textile factories and the other
// landmarks. Texts are in src/locales/*.json under place.<id>.*; dates and sources live here.
// Clicking a label opens the card; the era card lists the places that exist in that era.
import type { Pt } from "./data";
import type { SourceId } from "./timeline";

export interface PlaceEvent { year: number; key: string; estimate?: boolean }

export interface Place {
  id: string;
  /** features.json POI key that positions the place. */
  poi: string;
  /** Years the place is shown (label and card). */
  from: number;
  to: number;
  events: PlaceEvent[];
  sources: SourceId[];
}

export const PLACES: Place[] = [
  {
    id: "can_manent", poi: "can_manent", from: 1616, to: 3000,
    sources: ["manent", "manentArch", "rectoria", "aeccImages", "manentAjunt", "manentCapgros", "manentPremiaMedia", "manentCrida"],
    events: [
      { year: 1616, key: "built" }, { year: 1618, key: "first" }, { year: 1700, key: "lands", estimate: true }, { year: 1836, key: "church" },
      { year: 1977, key: "bought" }, { year: 1984, key: "library" }, { year: 1986, key: "museum" },
      { year: 1986.5, key: "roman" }, { year: 2001, key: "museumEnd" }, { year: 2010, key: "libraryEnd" },
      { year: 2011, key: "debolit" }, { year: 2022.2, key: "works" }, { year: 2023.15, key: "crida" },
      { year: 2026.37, key: "festa" }, { year: 2026.43, key: "mostra" },
    ],
  },
  {
    id: "gas", poi: "museu_estampacio", from: 1853, to: 3000, sources: ["gas", "museumCollection", "gasArch"],
    events: [
      { year: 1853, key: "land" }, { year: 1884.1, key: "start" }, { year: 1913, key: "catalana" },
      { year: 1914, key: "war" }, { year: 1941, key: "end" }, { year: 1971, key: "natural" },
      { year: 1983, key: "closed" }, { year: 1996, key: "roman" }, { year: 2002.3, key: "museum" },
    ],
  },
  {
    id: "fabrica_lio", poi: "fabrica_lio", from: 1898, to: 3000, sources: ["lio", "aurora"],
    events: [
      { year: 1898, key: "founded" }, { year: 1910, key: "workers", estimate: true }, { year: 1928, key: "conflict" },
      { year: 1930, key: "lio" }, { year: 1979, key: "closing" }, { year: 1985, key: "school" },
    ],
  },
  {
    id: "can_sanpere", poi: "can_sanpere", from: 1842, to: 3000,
    sources: ["sanpere", "mayolas", "sanpereAssoc", "sanpereDirecta", "sanpereCapgros"],
    events: [
      { year: 1842, key: "mayolas" }, { year: 1850, key: "looms1850" }, { year: 1862, key: "dye" },
      { year: 1867, key: "paris" }, { year: 1885, key: "company" }, { year: 1898, key: "founded" },
      { year: 1901, key: "workers" }, { year: 1930, key: "building" }, { year: 1934, key: "sa" },
      { year: 1936.5, key: "war" }, { year: 1998.55, key: "closed" },
      { year: 1999, key: "nunez", estimate: true }, { year: 2001, key: "platform" }, { year: 2005, key: "licence" },
      { year: 2013.3, key: "occupied" }, { year: 2014, key: "consulta" }, { year: 2017, key: "bcil" },
      { year: 2018, key: "fabrika" }, { year: 2018.5, key: "poum" }, { year: 2019.96, key: "eviction" },
      { year: 2022, key: "association" }, { year: 2023, key: "festa" }, { year: 2024, key: "expropriation" },
      { year: 2025.9, key: "demolition" }, { year: 2026, key: "plan" },
    ],
  },
  {
    id: "can_gravada", poi: "can_gravada", from: 1908, to: 3000, sources: ["gravada"],
    events: [
      { year: 1908, key: "built", estimate: true }, { year: 1912, key: "colomer" }, { year: 1918, key: "mujal" },
      { year: 1970, key: "saker", estimate: true }, { year: 1985, key: "tripol", estimate: true }, { year: 2010, key: "housing", estimate: true },
    ],
  },
  {
    id: "aurora", poi: "carrer_aurora", from: 1898, to: 3000, sources: ["aurora"],
    events: [{ year: 1898, key: "factory" }, { year: 1928, key: "water" }],
  },
  {
    id: "church", poi: "church", from: 1798, to: 3000, sources: ["church", "rectoria"],
    events: [
      { year: 1798, key: "stone" }, { year: 1820.5, key: "mass" }, { year: 1841, key: "parish" },
      { year: 1854, key: "done" }, { year: 1936.5, key: "burned", estimate: true }, { year: 1939, key: "rebuild" },
    ],
  },
];

// Places added from the "Llocs d'interès" list (Terra, aigua i racons, 2019), positioned and dated
// with the Diputació de Barcelona heritage records.
PLACES.push(
  {
    id: "cami_mig", poi: "cami_mig", from: -150, to: 3000,
    sources: ["camiMig", "camiMigCajal", "camiMigMontserrat", "magdalena", "estimada"],
    events: [
      { year: -100, key: "roman", estimate: true }, { year: 1941, key: "magdalena" }, { year: 1970, key: "mosaic" },
      { year: 1979, key: "finds" }, { year: 2010, key: "bcil" },
    ],
  },
  {
    id: "nucli_historic", poi: "nucli_historic", from: 1700, to: 3000, sources: ["nucli", "pratRiba", "rectoria", "estimada"],
    events: [
      { year: 1750, key: "guild", estimate: true }, { year: 1861, key: "plan" }, { year: 1920.7, key: "pratriba" },
      { year: 1928, key: "water" }, { year: 1939, key: "franco", estimate: true }, { year: 2000.95, key: "facades" }, { year: 2010, key: "poum" },
    ],
  },
  {
    id: "riera", poi: "frigorifics", from: -9700, to: 3000, sources: ["frigorifics", "nucli", "rieraColl", "estimada"],
    events: [
      { year: -4000, key: "neolithic", estimate: true }, { year: 1900, key: "streets", estimate: true },
      { year: 1998.3, key: "edificiMar" }, { year: 1999, key: "excavation" },
    ],
  },
  {
    id: "cases_barates", poi: "cases_barates", from: 1922, to: 3000, sources: ["casesBarates"],
    events: [{ year: 1922, key: "built", estimate: true }, { year: 2010, key: "bcil" }],
  },
  {
    id: "caseta_aigues", poi: "caseta_aigues", from: 1928, to: 3000, sources: ["aigues", "nucli"],
    events: [{ year: 1928, key: "dosrius" }],
  },
);

export const placeById = (id: string): Place | undefined => PLACES.find(p => p.id === id);

export function placesIn(from: number, to: number, pois: Record<string, Pt | undefined>): Place[] {
  return PLACES.filter(p => pois[p.poi] && p.from < to && p.to > from);
}
