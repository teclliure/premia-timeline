// Time scale, eras, milestones and the sea-level curve. Texts live in src/locales/*.json under
// eras.<id>.* and ms.<id>; sources are listed here because URLs do not change with language.
import { t, formatNumber } from "./i18n";

export const START = -25000;
/** End of the timeline: today, as a fractional year (so events earlier this year are reachable). */
const today = new Date();
export const NOW = today.getFullYear() + (today.getMonth() + today.getDate() / 31) / 12;

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
  // Floor, not round: 1848.9 is still 1848, and the end of the bar shows the current year.
  const r = Math.floor(y + 1e-6);
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
  sanpere: { title: "Inventari del Patrimoni Cultural (Diputació de Barcelona) · Can Sanpere", url: "https://patrimonicultural.diba.cat/print/pdf/node/58375" },
  mayolas: { title: "Enciclopèdia.cat · Fàbriques i empresaris: els Mayolas i Claudi Sanpere", url: "https://www.enciclopedia.cat/fabriques-i-empresaris/els-mayolas-i-claudi-sanpere" },
  camiMig: { title: "Inventari del Patrimoni Cultural (Diputació de Barcelona) · Camí del Mig", url: "https://patrimonicultural.diba.cat/print/pdf/node/58222" },
  camiMigCajal: { title: "Inventari del Patrimoni Cultural (Diputació de Barcelona) · Cruïlla Ramon i Cajal – Camí del Mig", url: "https://patrimonicultural.diba.cat/print/pdf/node/58251" },
  camiMigMontserrat: { title: "Inventari del Patrimoni Cultural (Diputació de Barcelona) · Camí del Mig / Escola Verge de Montserrat", url: "https://patrimonicultural.diba.cat/print/pdf/node/58235" },
  magdalena: { title: "Inventari del Patrimoni Cultural (Diputació de Barcelona) · Ca la Magdalena Dòria", url: "https://patrimonicultural.diba.cat/print/pdf/node/58223" },
  pratRiba: { title: "Inventari del Patrimoni Cultural (Diputació de Barcelona) · Carrer Enric Prat de la Riba", url: "https://patrimonicultural.diba.cat/print/pdf/node/58276" },
  casesBarates: { title: "Inventari del Patrimoni Cultural (Diputació de Barcelona) · Cases Barates", url: "https://patrimonicultural.diba.cat/print/pdf/node/58210" },
  aigues: { title: "Inventari del Patrimoni Cultural (Diputació de Barcelona) · Caseta de les aigües", url: "https://patrimonicultural.diba.cat/print/pdf/node/58377" },
  rieraColl: { title: "R. Coll Monteagudo · Intervencions arqueològiques a Premià de Mar (Sessió d'Estudis Mataronins)", url: "https://raco.cat/index.php/SessioEstudisMataronins/article/download/113156/140878/140932" },
  estimada: { title: "Terra, aigua i racons (Ramon Solé, 2019) · Llocs d'interès de Premià de Mar", url: "https://estimadaterra.wordpress.com/2019/08/23/llocs-dinteres-de-premia-de-mar/" },
  penjaculpes: { title: "Ajuntament de Premià de Mar · Festa Major d'Hivern: Els Penjaculpes", url: "https://festamajorhivern.pdm.cat/els-penjaculpes/" },
  catromCastell: { title: "Enciclopèdia Catalana · Catalunya Romànica: Castell de Premià de Dalt", url: "https://www.enciclopedia.cat/catalunya-romanica/castell-de-premia-de-dalt" },
  catromSantPere: { title: "Enciclopèdia Catalana · Catalunya Romànica: Sant Pere de Premià de Dalt", url: "https://www.enciclopedia.cat/catalunya-romanica/sant-pere-de-premia-de-dalt" },
  gecDalt: { title: "Gran Enciclopèdia Catalana · Premià de Dalt", url: "https://www.enciclopedia.cat/gran-enciclopedia-catalana/premia-de-dalt" },
  gecMar: { title: "Gran Enciclopèdia Catalana · Premià de Mar", url: "https://www.enciclopedia.cat/gran-enciclopedia-catalana/premia-de-mar" },
  gimferrer: { title: "I. Gimferrer · La vila Primiliano i el torrent de la Bassa de la Màdria (Trobada d'Entitats de Recerca Local del Maresme)", url: "https://raco.cat/index.php/TrobadaMaresme/article/download/335658/426471" },
  campaners: { title: "Campaners de Catalunya · Sant Pere de Premià de Dalt", url: "https://www.campaners.com/php/torrepdf.php?numer=7512" },
  canBatlle: { title: "Inventari del Patrimoni Cultural (Diputació de Barcelona) · Can Batlle", url: "https://patrimonicultural.diba.cat/print/pdf/node/58207" },
  memoria: { title: "Ajuntament de Premià de Mar · Mapa del patrimoni cultural, memòria", url: "https://premiademar.cat/ARXIUS/documents/patrimoni/memoria.pdf" },
  ajHist: { title: "Ajuntament de Premià de Mar · Història", url: "https://premiademar.cat/document.php?id=110" },
  cementiri: { title: "Inventari del Patrimoni Cultural (Diputació de Barcelona) · Cementiri", url: "https://patrimonicultural.diba.cat/print/pdf/node/58329" },
  assis: { title: "Inventari del Patrimoni Cultural (Diputació de Barcelona) · Escola Assís", url: "https://patrimonicultural.diba.cat/print/pdf/node/58195" },
  amistat: { title: "Inventari del Patrimoni Cultural (Diputació de Barcelona) · Centre de l'Amistat Obrera", url: "https://patrimonicultural.diba.cat/print/pdf/node/58328" },
  amistatSala: { title: "Inventari del Patrimoni Cultural (Diputació de Barcelona) · L'Amistat (sala)", url: "https://patrimonicultural.diba.cat/print/pdf/node/58204" },
  canTous: { title: "Inventari del Patrimoni Cultural (Diputació de Barcelona) · Can Tous", url: "https://patrimonicultural.diba.cat/print/pdf/node/58201" },
  laSalle: { title: "Inventari del Patrimoni Cultural (Diputació de Barcelona) · La Salle", url: "https://patrimonicultural.diba.cat/print/pdf/node/58200" },
  irla: { title: "Fundació Irla · Concepció Mayolas (opuscle)", url: "https://irla.cat/wp-content/uploads/2025/03/concepcio-mayolas-opuscle-fundacioirla.pdf" },
  coopUnio: { title: "Inventari del Patrimoni Cultural (Diputació de Barcelona) · Cooperativa La Unió", url: "https://patrimonicultural.diba.cat/print/pdf/node/58203" },
  fil: { title: "Enciclopèdia.cat · La plaga de la fil·loxera", url: "https://www.enciclopedia.cat/historia.-politica-societat-i-cultura-dels-paisos-catalans/la-plaga-de-la-filloxera" },
  alcaldes: { title: "Història de Premià · Alcaldes", url: "https://historiadepremia.com/alcaldes.htm" },
  amat: { title: "J. Amat · Consideracions sobre la violència a la rereguarda del Maresme", url: "https://raco.cat/index.php/TrobadaMaresme/article/download/314731/404889/446293" },
  solerCortada: { title: "Inventari del Patrimoni Cultural (Diputació de Barcelona) · Can Soler Cortada", url: "https://patrimonicultural.diba.cat/print/pdf/node/58345" },
  bunkerPort: { title: "Inventari del Patrimoni Cultural (Diputació de Barcelona) · Búnquer del port", url: "https://patrimonicultural.diba.cat/print/pdf/node/58295" },
  bunkerAgulles: { title: "Inventari del Patrimoni Cultural (Diputació de Barcelona) · Búnquers del canvi d'agulles", url: "https://patrimonicultural.diba.cat/print/pdf/node/58294" },
  arxiuParroquial: { title: "Inventari del Patrimoni Cultural (Diputació de Barcelona) · Arxiu parroquial de Sant Cristòfol", url: "https://patrimonicultural.diba.cat/print/pdf/node/58298" },
  esWiki: { title: "Wikipedia (es) · Premià de Mar", url: "https://es.wikipedia.org/wiki/Premi%C3%A1_de_Mar" },
  mapa: { title: "Diputació de Barcelona · Mapa de patrimoni cultural de Premià de Mar (memòria)", url: "https://patrimonicultural.diba.cat/sites/default/files/mapes/grups/adjunts/08172.pdf" },
  fmHivern: { title: "Inventari del Patrimoni Cultural (Diputació de Barcelona) · Festa Major d'Hivern", url: "https://patrimonicultural.diba.cat/print/pdf/node/58304" },
  pirates: { title: "Inventari del Patrimoni Cultural (Diputació de Barcelona) · Festa dels Pirates", url: "https://patrimonicultural.diba.cat/print/pdf/node/58303" },
  vp2007: { title: "Vila Primília, març 2007", url: "https://premiademar.cat/ARXIUS/2007/VP0307web1.pdf" },
  biblioteca: { title: "Biblioteca Martí Rosselló i Lloveras (Xarxa de Biblioteques Municipals)", url: "https://bibliotecavirtual.diba.cat/en/premia-de-mar-biblioteca-marti-rossello-i-lloveras" },
  temporal2018: { title: "Ajuntament de Premià de Mar · Temporal de maig de 2018", url: "https://premiademar.cat/document.php?id=14002" },
  platges2023: { title: "Ajuntament de Premià de Mar · Estabilització de les platges centrals (2023)", url: "https://premiademar.cat/document.php?id=24940" },
  vp2019: { title: "Vila Primília, 3r trimestre 2019", url: "https://premiademar.cat/ARXIUS/documents/vilaprimilia/vilaprimilia2019/VP_3t_2019_web.pdf" },
  temporal2026: { title: "Capgròs (20-01-2026) · Temporal al Maresme", url: "https://capgros.elnacional.cat/ca/maresme/galeria-video-temporal-maresme-arbres-murs-caiguts-inundacions-afectacions-trens_817565_102.html" },
  portGencat: { title: "Generalitat de Catalunya · Fitxa de la concessió del port de Premià", url: "http://www.gencat.cat/territori/transparencia/concessions/ports/fitxa_premia.pdf" },
  portNubiola: { title: "J. Nubiola (Círculo Histórico Miquel Biada) · Ports i platges del Maresme", url: "https://asihf.org/wp-content/uploads/2023/09/nubiola.pdf" },
  portEspais: { title: "M. J. Coral · Els ports esportius del Maresme (Espais, 11-12)", url: "https://raco.cat/index.php/Espais/article/download/91504/159278/159330" },
  port2004: { title: "Ajuntament de Premià de Mar · La construcció del nou port, més a prop (2004)", url: "https://premiademar.cat/document.php?id=1188" },
  port2006: { title: "Generalitat de Catalunya · Dragatge de sorra al port de Premià (2006)", url: "https://govern.cat/govern/docs/2010/11/02/16/54/c324f642-77b7-4586-a7bd-d8dcb822ac8b.pdf" },
  port2009: { title: "El Punt (via Bosc Verd) · Platges sense sorra (2009)", url: "https://boscverd.org/bv/index.php/utilitats-mainmenu-32/noticies-de-catalunya/170-platges-sense-sorra" },
  port2010: { title: "Premià Media · Les platges es queden sense sorra després del temporal (2010)", url: "https://premiamedia.cat/les-platges-de-premia-de-mar-es-queden-sense-sorra-despres-del-temporal/" },
  port2015: { title: "Premià Media · L'espai comercial del port (2015)", url: "https://premiamedia.cat/david-gutierrez-destaca-que-lespai-comercial-del-port-creara-450-llocs-de-treball-i-convida-ribet-a-explicar-que-sap-de-mercadona/" },
  port2016: { title: "Ajuntament de Premià de Mar · Primera pedra del nou port (2016)", url: "https://premiademar.cat/document.php?id=11934" },
  port2018: { title: "Ajuntament de Premià de Mar · Inauguració de la nova zona pública del port (2018)", url: "https://premiademar.cat/document.php?id=14148" },
  portClau: { title: "La Clau · S'inaugura la nova zona pública del port de Premià de Mar", url: "https://laclau.cat/sinaugura-la-nova-zona-publica-del-port-de-premia-de-mar/" },
  port2021: { title: "Capgròs (20-01-2021) · Oposició als nous espigons", url: "https://capgros.elnacional.cat/ca/maresme/oposicio-nous-espigons-evitar-perdua-sorra-platges-maresme_801759_102.html" },
  port2023: { title: "Capgròs (12-07-2023) · L'operació controvertida per salvar les platges del Maresme", url: "https://capgros.elnacional.cat/ca/maresme/operacio-controvertida-salvar-platges-maresme_810701_102.html" },
  port2024: { title: "Crónica Global (03-05-2024) · Els exgestors de Marina Premià", url: "https://cronicaglobal.elespanol.com/business/20240503/los-exgestores-de-marina-premia-millones-propiedad/852164925_0.html" },
  port2024b: { title: "elEconomista (2024) · GED entra en les marines esportives amb Gythio", url: "https://www.eleconomista.es/infraestructuras-servicios/noticias/12773859/04/24/ged-entra-con-su-fondo-de-infraestructuras-en-el-sector-de-las-marinas-deportivas-de-la-mano-de-gythio.html" },
  port2025: { title: "Premià Media (2025) · Nou espai polivalent de 3.000 m² al sector del port", url: "https://premiamedia.cat/construeixen-al-sector-del-port-un-nou-espai-polivalent-de-3-000-m2-que-aquest-estiu-ja-podria-acollir-la-fira-datraccions/" },
  torrassa2026: { title: "Ajuntament de Premià de Mar · Bases del concurs d'idees de la Torrassa del Port (2026)", url: "https://premiademar.cat/ARXIUS/webs/torrassa_port/documents/Bases_concurs_Torrassa_Port.pdf" },
  manentAjunt: { title: "Ajuntament de Premià de Mar · Can Manent, Casa de la Festa", url: "https://premiademar.cat/can-manent" },
  manentCapgros: { title: "Capgròs · La masia més antiga d'un poble del Maresme esdevé la nova Casa de la Festa", url: "https://capgros.elnacional.cat/ca/maresme/masia-mes-antiga-poble-maresme-esdeve-nova-casa-festa_818484_102.html" },
  manentPremiaMedia: { title: "Premià Media (17-03-2022) · Can Manent apunta a ser el 3r museu de Premià de Mar", url: "https://premiamedia.cat/can-manent-apunta-a-ser-el-3r-museu-de-premia-de-mar-un-centre-dinterpretacio-etnografica-sobre-letapa-preindustrial-del-municipi/" },
  manentCrida: { title: "Crida Premianenca (25-02-2023) · Can Manent, Casa de la Festa de Premià de Mar", url: "https://cridapremianenca.cat/2023/02/can-manent-casa-de-la-festa-de-premia-de-mar/" },
  sanpereAssoc: { title: "Associació de Can Sanpere · Història", url: "https://cansanpere.org/historia/" },
  sanpereDirecta: { title: "Directa (16-12-2019) · La fàbrica Can Sanpere afronta un nou intent de desallotjament", url: "https://directa.cat/la-fabrica-can-sanpere-de-premia-de-mar-afronta-un-nou-intent-de-desallotjament/" },
  sanpereCapgros: { title: "Capgròs / ACN (28-11-2025) · Can Sanpere per fi al terra: 20 anys de lluita", url: "https://capgros.elnacional.cat/ca/maresme/can-sanpere-fi-terra-20-anys-lluita-fer-hi-gran-zona-verda-nous-equipaments_817182_102.html" },
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
  { id: "roman", from: -150, to: 476, color: "#9b4a35", seconds: 12, confidence: 0, view: "villa", sources: ["vallpremia", "frigorifics", "villa", "museu", "camiMig"] },
  { id: "medieval", from: 476, to: 1798, color: "#6e5a7e", seconds: 9, confidence: 0, view: "dalt", sources: ["torrassa", "rectoria", "manent", "nucli", "catromCastell", "gecDalt", "gimferrer", "catromSantPere", "canBatlle"] },
  { id: "barri", from: 1798, to: 1848, color: "#b07a3a", seconds: 12, confidence: 2, view: "core", sources: ["church", "rectoria", "kiddle", "memoria", "gecMar"] },
  { id: "tren", from: 1848, to: 1898, color: "#4f6b8a", seconds: 12, confidence: 2, view: "beach", sources: ["rail", "kiddle", "torrassa", "mayolas", "gas", "penjaculpes", "nucli", "wiki", "memoria", "gecMar", "fil", "assis", "amistat"] },
  { id: "fabriques", from: 1898, to: 1939, color: "#8a4b4b", seconds: 12, confidence: 2, view: "core", sources: ["lio", "sanpere", "gas", "gravada", "aurora", "penjaculpes", "church", "wiki", "laSalle", "irla", "coopUnio", "canTous", "ajHist"] },
  { id: "creixement", from: 1939, to: 1972, color: "#5a7d6d", seconds: 14, confidence: 3, view: "overview", sources: ["wiki", "solerCortada", "bunkerPort", "amat", "esWiki", "mapa"] },
  { id: "port", from: 1972, to: 2000, color: "#3f7c95", seconds: 12, confidence: 3, view: "port", sources: ["port", "lio", "museu", "wiki", "alcaldes", "pirates"] },
  { id: "avui", from: 2000, to: NOW, color: "#4a6b9b", seconds: 10, confidence: 3, view: "port", sources: ["port", "villa", "sanpereAssoc", "sanpereCapgros", "manentAjunt", "kiddle", "wiki", "fmHivern", "biblioteca", "platges2023", "temporal2026"] },
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
  { year: 898, id: "castell898", sources: ["catromCastell"] },
  { year: 966.97, id: "santpere966", sources: ["gimferrer", "gecDalt"] },
  { year: 1358, id: "focs1358", sources: ["gecDalt", "gimferrer"] },
  { year: 1480, id: "reialenc1480", sources: ["gecDalt", "catromCastell"] },
  { year: 1588, id: "santpere1588", sources: ["catromSantPere", "campaners"], estimate: true },
  { year: 1626, id: "batlle1626", sources: ["canBatlle"] },
  { year: 1844, id: "vaixells1844", sources: ["memoria"] },
  { year: 1849, id: "madoz1849", sources: ["memoria"] },
  { year: 1857, id: "balaguer1857", sources: ["gecMar"] },
  { year: 1883, id: "filloxera1883", sources: ["fil"], estimate: true },
  { year: 1888, id: "assis1888", sources: ["assis"] },
  { year: 1892, id: "amistat1892", sources: ["amistat"] },
  { year: 1902, id: "tous1902", sources: ["canTous"] },
  { year: 1908.55, id: "lasalle1908", sources: ["laSalle"] },
  { year: 1909.57, id: "setmana1909", sources: ["irla", "laSalle"] },
  { year: 1912, id: "llum1912", sources: ["ajHist"] },
  { year: 1912.5, id: "torrentada1912", sources: ["memoria"], estimate: true },
  { year: 1928.5, id: "unio1928", sources: ["coopUnio"] },
  { year: 1931.28, id: "republica1931", sources: ["irla"] },
  { year: 1936.79, id: "ajuntament1936", sources: ["solerCortada"] },
  { year: 1937, id: "bunquers1937", sources: ["bunkerPort", "bunkerAgulles"] },
  { year: 1942.13, id: "neu1942", sources: ["esWiki"] },
  { year: 1979.3, id: "democracia1979", sources: ["alcaldes"] },
  { year: 1997, id: "pirates1997", sources: ["pirates"] },
  { year: 2006, id: "fmhivern2006", sources: ["fmHivern"] },
  { year: 2010.31, id: "biblioteca2010", sources: ["biblioteca"] },
  { year: 2018.39, id: "temporal2018", sources: ["temporal2018"] },
  { year: 2023.45, id: "platges2023", sources: ["platges2023"] },
  { year: 2026.05, id: "temporal2026", sources: ["temporal2026"] },
  { year: 1798, id: "church1798", sources: ["church"] },
  { year: 1820, id: "mass1820", sources: ["church"] },
  { year: 1836, id: "seg1836", sources: ["kiddle"] },
  { year: 1841, id: "parish1841", sources: ["church", "rectoria"] },
  { year: 1848.82, id: "rail1848", sources: ["rail"] },
  { year: 1854, id: "church1854", sources: ["kiddle"] },
  { year: 1861, id: "plan1861", sources: ["nucli"] },
  { year: 1863, id: "vapor1863", sources: ["penjaculpes"] },
  { year: 1881, id: "foneria1881", sources: ["penjaculpes"] },
  { year: 1884.1, id: "gas1884", sources: ["gas"] },
  { year: 1920.7, id: "pratriba1920", sources: ["pratRiba"] },
  { year: 1928, id: "aigues1928", sources: ["aigues"] },
  { year: 1898, id: "lio1898", sources: ["lio"] },
  { year: 1930, id: "lio1930", sources: ["lio"] },
  { year: 1934, id: "sanpere1934", sources: ["sanpere"] },
  { year: 1936.5, id: "war1936", sources: ["church"], estimate: true },
  { year: 1939, id: "rebuild1939", sources: ["church"] },
  { year: 1941, id: "gas1941", sources: ["gas"] },
  { year: 1946, id: "photo1946", sources: [] },
  { year: 1956, id: "photo1956", sources: [] },
  { year: 1969, id: "c32", sources: ["wiki"] },
  { year: 1971.45, id: "port1971", sources: ["portGencat"] },
  { year: 1974, id: "port1974", sources: ["port"] },
  { year: 1997.85, id: "platja1997", sources: ["portNubiola"] },
  { year: 2018.51, id: "port2018", sources: ["port2018", "portClau"] },
  { year: 1979, id: "museu1979", sources: ["museu", "lio"] },
  { year: 1985, id: "school1985", sources: ["lio"] },
  { year: 1986, id: "manent1986", sources: ["manent", "manentArch"] },
  { year: 1991.3, id: "port1991", sources: ["port"] },
  { year: 2010.55, id: "portplan2010", sources: ["port"] },
  { year: 1998.55, id: "sanpere1998", sources: ["sanpere"] },
  { year: 2013.3, id: "sanpere2013", sources: ["sanpereAssoc", "sanpereDirecta"] },
  { year: 2024, id: "sanpere2024", sources: ["sanpereCapgros", "sanpereAssoc"] },
  { year: 2025.9, id: "sanpere2025", sources: ["sanpereCapgros"] },
  { year: 2002.3, id: "gas2002", sources: ["museumCollection"] },
  { year: 2015, id: "museu2015", sources: ["museu"] },
  { year: 2018, id: "port2018", sources: ["kiddle"] },
  { year: 2025, id: "pop2025", sources: ["wiki"] },
  { year: 2026.37, id: "manent2026", sources: ["manentAjunt", "manentCapgros"] },
];

/** Population: Madoz 1849 (Ajuntament, memòria del mapa de patrimoni), 1860 (Gran Enciclopèdia Catalana), rest Wikipedia. */
export const POPULATION: Array<[number, number]> = [
  [1849, 1445], [1860, 1450], [1900, 2239], [1930, 3380], [1950, 3947], [1970, 11284], [1986, 20069], [2007, 27590], [2025, 29431],
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
