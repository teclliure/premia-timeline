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
    id: "can_manent", poi: "can_manent", from: 1618, to: 3000, sources: ["manent", "manentArch", "rectoria", "aeccImages"],
    events: [
      { year: 1618, key: "first" }, { year: 1700, key: "lands", estimate: true }, { year: 1836, key: "church" },
      { year: 1977, key: "bought" }, { year: 1984, key: "library" }, { year: 1986, key: "museum" },
      { year: 1986.5, key: "roman" }, { year: 2001, key: "museumEnd" }, { year: 2010, key: "libraryEnd" },
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

export const placeById = (id: string): Place | undefined => PLACES.find(p => p.id === id);

export function placesIn(from: number, to: number, pois: Record<string, Pt | undefined>): Place[] {
  return PLACES.filter(p => pois[p.poi] && p.from < to && p.to > from);
}
