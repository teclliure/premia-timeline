// Lightbox of historical images tied to the current era (public/data/gallery.json).
import type { GalleryItem } from "./data";
import { t } from "./i18n";
import { eraAt, formatYear } from "./timeline";

export interface Gallery { open(year: number): void; countFor(year: number): number }

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export function createGallery(items: GalleryItem[]): Gallery {
  const root = document.createElement("div");
  root.className = "modal gallery";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  document.body.appendChild(root);
  let list: GalleryItem[] = [];
  let index = 0;
  let all = false;
  let year = 2026;

  const forEra = (y: number) => {
    const e = eraAt(y);
    return items.filter(i => i.year >= e.from && i.year < e.to);
  };

  const render = () => {
    const cur = list[index];
    root.innerHTML = `
<div class="modal-card">
  <header><h2>${esc(all ? t("gallery.all") : t("gallery.era"))}</h2>
    <button class="link toggle-all">${esc(all ? t("gallery.era") : t("gallery.all"))}</button>
    <button class="close" aria-label="${esc(t("ui.close"))}">×</button></header>
  ${cur ? `
  <figure>
    <img src="${esc(cur.file)}" alt="${esc(cur.title)}">
    <figcaption>
      <strong>${esc(cur.title)}</strong> · ${esc(formatYear(cur.year))}<br>
      ${esc(t("gallery.author"))}: ${esc(cur.author)} · ${esc(t("gallery.licence"))}:
      ${cur.licence_url ? `<a href="${esc(cur.licence_url)}" target="_blank" rel="noopener">${esc(cur.licence)}</a>` : esc(cur.licence)} ·
      <a href="${esc(cur.source_url)}" target="_blank" rel="noopener">${esc(t("gallery.source"))}</a>
    </figcaption>
  </figure>
  <div class="thumbs">${list.map((g, i) => `<button data-i="${i}" class="${i === index ? "on" : ""}"><img src="${esc(g.thumb)}" alt="" loading="lazy"></button>`).join("")}</div>`
  : `<p class="empty">${esc(t("gallery.empty"))}</p>`}
</div>`;
    root.querySelector(".close")!.addEventListener("click", () => { root.hidden = true; });
    root.querySelector(".toggle-all")!.addEventListener("click", () => { all = !all; list = all ? items : forEra(year); index = 0; render(); });
    root.querySelectorAll<HTMLButtonElement>(".thumbs button").forEach(b => b.addEventListener("click", () => { index = Number(b.dataset.i); render(); }));
  };
  root.addEventListener("click", e => { if (e.target === root) root.hidden = true; });
  window.addEventListener("keydown", e => {
    if (root.hidden) return;
    if (e.key === "Escape") root.hidden = true;
    if (e.key === "ArrowRight" && list.length) { index = (index + 1) % list.length; render(); e.stopImmediatePropagation(); }
    if (e.key === "ArrowLeft" && list.length) { index = (index - 1 + list.length) % list.length; render(); e.stopImmediatePropagation(); }
  }, true);

  return {
    open(y: number) {
      year = y;
      all = false;
      list = forEra(y);
      index = 0;
      render();
      root.hidden = false;
      (root.querySelector(".close") as HTMLButtonElement).focus();
    },
    countFor: (y: number) => forEra(y).length,
  };
}
