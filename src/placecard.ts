// History card for a place: photo (freely licensed, with attribution), text, dated events with
// the ones already past at the current year highlighted, sources, and a button to fly there.
import type { PlacePhoto } from "./data";
import { t } from "./i18n";
import { placeById } from "./places";
import { SOURCES, formatYear } from "./timeline";

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export interface PlaceCard { open(id: string, year: number): void }

export function createPlaceCard(photos: Record<string, PlacePhoto>, onFly: (id: string) => void): PlaceCard {
  const root = document.createElement("div");
  root.className = "modal place";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  document.body.appendChild(root);
  root.addEventListener("click", e => { if (e.target === root) root.hidden = true; });
  window.addEventListener("keydown", e => { if (e.key === "Escape") root.hidden = true; });

  return {
    open(id, year) {
      const p = placeById(id);
      if (!p) return;
      const ph = photos[id];
      root.innerHTML = `<div class="modal-card">
<header><h2>${esc(t(`place.${id}.title`))}</h2><button class="close" aria-label="${esc(t("ui.close"))}">×</button></header>
<p class="era-subtitle">${esc(t(`place.${id}.subtitle`))}</p>
${ph ? `<figure><img src="${esc(ph.file)}" alt="${esc(ph.title)}"><figcaption>${esc(ph.title)}${ph.year ? ` · ${ph.year}` : ""} · ${esc(t("gallery.author"))}: ${esc(ph.author)} ·
  ${ph.licence_url ? `<a href="${esc(ph.licence_url)}" target="_blank" rel="noopener">${esc(ph.licence)}</a>` : esc(ph.licence)} ·
  <a href="${esc(ph.source_url)}" target="_blank" rel="noopener">${esc(t("gallery.source"))}</a></figcaption></figure>`
    : `<p class="empty">${esc(t("ui.noPhoto"))}</p>`}
<p>${esc(t(`place.${id}.text`))}</p>
<h3>${esc(t("ui.history"))}</h3>
<ol class="events">${p.events.map(e => `<li class="${e.year <= year ? "past" : ""}"><b>${e.estimate ? t("year.approx") + " " : ""}${esc(formatYear(Math.floor(e.year)))}</b> ${esc(t(`place.${id}.e.${e.key}`))}</li>`).join("")}</ol>
<h3>${esc(t("ui.sources"))}</h3>
<ul class="sources">${p.sources.map(s => `<li><a href="${esc(SOURCES[s].url)}" target="_blank" rel="noopener">${esc(SOURCES[s].title)}</a></li>`).join("")}</ul>
<div class="card-actions"><button class="fly">${esc(t("ui.flyTo"))}</button></div>
</div>`;
      root.querySelector(".close")!.addEventListener("click", () => { root.hidden = true; });
      root.querySelector(".fly")!.addEventListener("click", () => { root.hidden = true; onFly(id); });
      root.hidden = false;
    },
  };
}
