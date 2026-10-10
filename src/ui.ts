// Time bar, era card, camera / view buttons, scene controls and the "Notes i fonts" panel.
import { t, formatNumber } from "./i18n";
import { ERAS, MILESTONES, NOW, SOURCES, eraAt, formatYear, posAt, type Era } from "./timeline";
import { VIEW_IDS, type Mode, type ViewId } from "./camera";

export interface UIHandlers {
  onSeek(pos: number): void;
  onPlay(): void;
  onMode(m: Mode): void;
  onView(v: ViewId): void;
  onLookClose(): void;
  onGallery(): void;
  onHour(h: number): void;
  onDetail(q: Quality): void;
  onAuto(on: boolean): void;
  onLabels(on: boolean): void;
  onPlace(id: string): void;
}
export type Quality = "low" | "medium" | "high";

export interface YearInfo {
  year: number;
  places: string[];
  seaLevel: number;
  coastKm: number | null;
  photo: number | null;
  partial: boolean;
  census: [number, number] | null;
  galleryCount: number;
}

export interface UI {
  setYear(info: YearInfo): void;
  setPlaying(p: boolean): void;
  setMode(m: Mode): void;
  setQuality(q: Quality, auto: boolean): void;
  flash(msg: string): void;
  labelsRoot: HTMLElement;
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", html = ""): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

function sourceList(ids: Array<keyof typeof SOURCES>): string {
  return `<ul class="sources">${ids.map(id => `<li><a href="${esc(SOURCES[id].url)}" target="_blank" rel="noopener">${esc(SOURCES[id].title)}</a></li>`).join("")}</ul>`;
}

export function createUI(h: UIHandlers, placeholder: boolean): UI {
  const app = document.getElementById("app")!;
  const labelsRoot = el("div", "labels");
  app.appendChild(labelsRoot);

  if (placeholder) app.appendChild(el("div", "banner", esc(t("app.placeholder"))));

  // ---------------------------------------------------------------- era card
  const card = el("section", "card");
  card.innerHTML = `
<div class="card-year"><span class="year"></span><span class="era-dates"></span><button class="fold" aria-label="−">−</button></div>
<h1 class="era-title"></h1>
<p class="era-subtitle"></p>
<p class="era-text"></p>
<div class="era-more" hidden></div>
<div class="facts"></div>
<div class="places"></div>
<div class="card-actions">
  <button class="more"></button>
  <button class="close-look">${esc(t("ui.lookClose"))}</button>
  <button class="notes-btn">${esc(t("ui.notes"))}</button>
  <button class="gallery-btn"></button>
</div>`;
  app.appendChild(card);
  const q = <T extends HTMLElement>(s: string, r: ParentNode = card) => r.querySelector(s) as T;
  let expanded = false;
  const moreBtn = q<HTMLButtonElement>(".more");
  const more = q<HTMLDivElement>(".era-more");
  moreBtn.addEventListener("click", () => { expanded = !expanded; more.hidden = !expanded; moreBtn.textContent = t(expanded ? "ui.readLess" : "ui.readMore"); });
  moreBtn.textContent = t("ui.readMore");
  const fold = q<HTMLButtonElement>(".fold");
  const setFold = (on: boolean) => { card.classList.toggle("min", on); fold.textContent = on ? "+" : "−"; };
  fold.addEventListener("click", () => setFold(!card.classList.contains("min")));
  if (matchMedia("(max-width: 720px)").matches) setFold(true);
  q(".close-look").addEventListener("click", h.onLookClose);
  q(".notes-btn").addEventListener("click", () => openNotes(placeholder));
  q(".gallery-btn").addEventListener("click", h.onGallery);

  // ---------------------------------------------------------------- time bar
  const bar = el("footer", "timebar");
  bar.innerHTML = `
<button class="play" aria-label="${esc(t("ui.play"))}"><svg viewBox="0 0 24 24" width="20" height="20"><path class="ico" d="M7 5v14l11-7z"/></svg></button>
<div class="track" role="slider" tabindex="0" aria-label="${esc(t("app.title"))}">
  <div class="eras">${ERAS.map(e => `<div class="seg" style="left:${posAt(e.from) * 100}%;width:${(posAt(e.to) - posAt(e.from)) * 100}%;background:${e.color}" title="${esc(t(`eras.${e.id}.title`))}"><span>${esc(t(`eras.${e.id}.title`))}</span></div>`).join("")}</div>
  <div class="ticks">${MILESTONES.map(m => `<i style="left:${posAt(m.year) * 100}%" title="${esc(`${m.estimate ? t("year.approx") + " " : ""}${formatYear(Math.floor(m.year))} · ${t(`ms.${m.id}`)}`)}"></i>`).join("")}</div>
  <div class="handle"><span></span></div>
</div>
<div class="status"></div>`;
  app.appendChild(bar);
  const track = q<HTMLDivElement>(".track", bar);
  const handle = q<HTMLDivElement>(".handle", bar);
  const playBtn = q<HTMLButtonElement>(".play", bar);
  const status = q<HTMLDivElement>(".status", bar);
  playBtn.addEventListener("click", h.onPlay);
  let dragging = false;
  const seekFrom = (e: PointerEvent) => {
    const r = track.getBoundingClientRect();
    h.onSeek(Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1));
  };
  track.addEventListener("pointerdown", e => { dragging = true; track.setPointerCapture(e.pointerId); seekFrom(e); });
  track.addEventListener("pointermove", e => { if (dragging) seekFrom(e); });
  track.addEventListener("pointerup", () => { dragging = false; });
  track.querySelectorAll<HTMLElement>(".ticks i").forEach((tk, i) => tk.addEventListener("pointerdown", e => { e.stopPropagation(); h.onSeek(posAt(MILESTONES[i].year)); }));

  // ---------------------------------------------------------------- side panel
  const side = el("aside", "side");
  side.innerHTML = `
<div class="modes">${(["cinema", "orbit", "fly", "walk"] as Mode[]).map(m => `<button data-mode="${m}">${esc(t(`cam.${m}`))}</button>`).join("")}</div>
<details class="views"><summary>${esc(t("cam.views"))}</summary>
  ${VIEW_IDS.map(v => `<button data-view="${v}">${esc(t(`view.${v}`))}</button>`).join("")}
</details>
<details class="controls" open>
  <summary>${esc(t("ctl.light"))} · ${esc(t("ctl.detail"))} · ${esc(t("ctl.labels"))}</summary>
  <label>${esc(t("ctl.light"))} <input type="range" class="hour" min="5" max="21" step="0.25" value="11"></label>
  <label>${esc(t("ctl.detail"))}
    <select class="detail"><option value="low">${esc(t("ctl.low"))}</option><option value="medium">${esc(t("ctl.medium"))}</option><option value="high">${esc(t("ctl.high"))}</option></select>
  </label>
  <label class="check"><input type="checkbox" class="auto" checked> ${esc(t("ctl.auto"))}</label>
  <label class="check"><input type="checkbox" class="labels-on" checked> ${esc(t("ctl.labels"))}</label>
</details>
<p class="help"></p>`;
  app.appendChild(side);
  side.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach(b => b.addEventListener("click", () => h.onMode(b.dataset.mode as Mode)));
  side.querySelectorAll<HTMLButtonElement>("[data-view]").forEach(b => b.addEventListener("click", () => { h.onView(b.dataset.view as ViewId); (side.querySelector(".views") as HTMLDetailsElement).open = false; }));
  const hour = q<HTMLInputElement>(".hour", side);
  hour.addEventListener("input", () => h.onHour(Number(hour.value)));
  const detail = q<HTMLSelectElement>(".detail", side);
  detail.addEventListener("change", () => h.onDetail(detail.value as Quality));
  const auto = q<HTMLInputElement>(".auto", side);
  auto.addEventListener("change", () => h.onAuto(auto.checked));
  const labelsOn = q<HTMLInputElement>(".labels-on", side);
  labelsOn.addEventListener("change", () => { labelsRoot.hidden = !labelsOn.checked; h.onLabels(labelsOn.checked); });
  if (matchMedia("(max-width: 720px)").matches) (side.querySelector(".controls") as HTMLDetailsElement).open = false;

  const toast = el("div", "toast");
  app.appendChild(toast);
  let toastTimer = 0;

  // ---------------------------------------------------------------- notes panel
  const notes = el("div", "modal notes");
  notes.hidden = true;
  document.body.appendChild(notes);
  function openNotes(ph: boolean) {
    const allSources = [...new Set(ERAS.flatMap(e => e.sources))];
    notes.innerHTML = `<div class="modal-card"><header><h2>${esc(t("notes.title"))}</h2><button class="close" aria-label="${esc(t("ui.close"))}">×</button></header>
<p>${esc(t("notes.intro"))}</p>
${ph ? `<p class="warn">${esc(t("notes.placeholder"))}</p>` : ""}
<h3>${esc(t("notes.measured.title"))}</h3><p>${esc(t("notes.measured"))}</p>
<h3>${esc(t("notes.reconstructed.title"))}</h3><p>${esc(t("notes.reconstructed"))}</p>
<h3>${esc(t("notes.years.title"))}</h3><p>${esc(t("notes.years"))}</p>
<h3>${esc(t("notes.sea.title"))}</h3><p>${esc(t("notes.sea"))}</p>
<h3>${esc(t("notes.datasets.title"))}</h3>
<ul>${["icgc", "ign", "emodnet", "catastro", "osm", "commons", "three", "model"].map(k => `<li>${esc(t(`ds.${k}`))}</li>`).join("")}</ul>
<h3>${esc(t("notes.history.title"))}</h3>${sourceList(allSources)}
</div>`;
    notes.hidden = false;
    notes.querySelector(".close")!.addEventListener("click", () => { notes.hidden = true; });
  }
  notes.addEventListener("click", e => { if (e.target === notes) notes.hidden = true; });
  window.addEventListener("keydown", e => { if (e.key === "Escape") notes.hidden = true; });

  let era: Era | null = null;
  let lastPlaces = "";
  return {
    labelsRoot,
    setYear(info) {
      const { year } = info;
      handle.style.left = `${posAt(year) * 100}%`;
      track.setAttribute("aria-valuetext", formatYear(year));
      const e = eraAt(year);
      q(".year").textContent = formatYear(year);
      if (e !== era) {
        era = e;
        q(".era-title").textContent = t(`eras.${e.id}.title`);
        q(".era-subtitle").textContent = t(`eras.${e.id}.subtitle`);
        q(".era-text").textContent = t(`eras.${e.id}.text`);
        q(".era-dates").textContent = `${e.approximateStart ? t("year.approx") + " " : ""}${formatYear(e.from)} – ${formatYear(Math.min(e.to, NOW))}`;
        more.innerHTML = `<p>${esc(t(`eras.${e.id}.detail`))}</p>
<p><strong>${esc(t("ui.look"))}:</strong> ${esc(t(`eras.${e.id}.look`))}</p>
<p class="note"><strong>${esc(t("ui.note"))}:</strong> ${esc(t(`eras.${e.id}.note`))}</p>
<p class="conf conf-${e.confidence}"><strong>${esc(t("ui.confidence"))}:</strong> ${esc(t(`ui.confidence.${e.confidence}`))}</p>
<h4>${esc(t("ui.sources"))}</h4>${sourceList(e.sources)}`;
        card.style.setProperty("--era", e.color);
      }
      const facts: string[] = [];
      if (info.census) facts.push(`${esc(t("ui.population"))}: ${formatNumber(info.census[1])} <small>(${esc(t("ui.census", { year: info.census[0] }))})</small>`);
      if (info.seaLevel < -0.5) facts.push(esc(t("ui.seaLevel", { value: formatNumber(info.seaLevel, 0) })));
      if (info.coastKm !== null && info.coastKm > 0.3) facts.push(esc(t("ui.coastOffshore", { km: formatNumber(info.coastKm, 1) })) + ` <small>(${esc(t("ui.estimate"))})</small>`);
      q(".facts").innerHTML = facts.map(f => `<span>${f}</span>`).join("");
      const placesKey = info.places.join(",");
      if (placesKey !== lastPlaces) {
        lastPlaces = placesKey;
        const box = q<HTMLDivElement>(".places");
        box.innerHTML = info.places.length ? `<h4>${esc(t("ui.places"))}</h4>${info.places.map(id => `<button data-place="${id}">${esc(t(`place.${id}.title`))}</button>`).join("")}` : "";
        box.querySelectorAll<HTMLButtonElement>("[data-place]").forEach(b => b.addEventListener("click", () => h.onPlace(b.dataset.place!)));
      }
      status.textContent = info.photo ? t("ui.photoBlend", { photo: info.partial ? `${info.photo} (${t("ui.estimate")})` : info.photo }) : t("ui.photoNone");
      q(".gallery-btn").textContent = `${t("ui.gallery")} (${info.galleryCount})`;
    },
    setPlaying(p) {
      playBtn.setAttribute("aria-label", t(p ? "ui.pause" : "ui.play"));
      (playBtn.querySelector(".ico") as SVGPathElement).setAttribute("d", p ? "M6 5h4v14H6zM14 5h4v14h-4z" : "M7 5v14l11-7z");
    },
    setMode(m) {
      side.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach(b => b.classList.toggle("on", b.dataset.mode === m));
      q(".help", side).textContent = `${t(`cam.help.${m}`)} · ${t("keys.help")}`;
    },
    setQuality(qq, a) { detail.value = qq; auto.checked = a; },
    flash(msg) {
      toast.textContent = msg;
      toast.classList.add("on");
      clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => toast.classList.remove("on"), 2600);
    },
  };
}
