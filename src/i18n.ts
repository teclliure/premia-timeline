// All user-facing strings live in src/locales/<lang>.json. To add Spanish or English, copy
// ca.json to es.json / en.json, translate the values and add the language to LANGS.
import ca from "./locales/ca.json";

const LANGS = { ca } as const;
export type Language = keyof typeof LANGS;

let language: Language = "ca";
try {
  const saved = localStorage.getItem("premia-lang");
  if (saved && saved in LANGS) language = saved as Language;
} catch { /* storage can be blocked */ }

const catalog = (): Record<string, string> => LANGS[language] as Record<string, string>;
const listeners = new Set<() => void>();

export const languages = Object.keys(LANGS) as Language[];
export const getLanguage = (): Language => language;
export const locale = (): string => ({ ca: "ca-ES" } as Record<string, string>)[language] ?? language;

/** Translate a key; {name} placeholders are filled from vars. Missing keys show the key itself. */
export function t(key: string, vars?: Record<string, string | number>): string {
  let s = catalog()[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export const has = (key: string): boolean => key in catalog();
export const formatNumber = (v: number, digits = 0): string =>
  new Intl.NumberFormat(locale(), { maximumFractionDigits: digits }).format(v);

export function setLanguage(next: Language): void {
  if (next === language) return;
  language = next;
  try { localStorage.setItem("premia-lang", next); } catch { /* ignore */ }
  document.documentElement.lang = next;
  listeners.forEach(f => f());
}
export const onLanguageChange = (f: () => void): void => { listeners.add(f); };

/** Fill every [data-i18n] (text) and [data-i18n-title] / [data-i18n-aria] (attributes) under root. */
export function applyTranslations(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n!); });
  root.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach(el => { el.title = t(el.dataset.i18nTitle!); });
  root.querySelectorAll<HTMLElement>("[data-i18n-aria]").forEach(el => { el.setAttribute("aria-label", t(el.dataset.i18nAria!)); });
}
