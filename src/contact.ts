// "Contacte / Aporta": report errors or send images and information. The site is static, so the form
// posts to FormSubmit (formsubmit.co), which emails it, attachments included, to CONTACT_EMAIL.
// The first submission triggers an activation email from FormSubmit; after activating, replace
// CONTACT_EMAIL with the random alias FormSubmit gives so the address is not in the page source.
import { t } from "./i18n";
import { formatYear } from "./timeline";

export const CONTACT_EMAIL = "marc@teclliure.net";
const ENDPOINT = `https://formsubmit.co/${CONTACT_EMAIL}`;
const MAX_MB = 10;

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export interface Contact { open(context: { year: number; place?: string; placeTitle?: string }): void }

export function createContact(): Contact {
  const root = document.createElement("div");
  root.className = "modal contact";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  document.body.appendChild(root);
  root.addEventListener("click", e => { if (e.target === root) root.hidden = true; });
  window.addEventListener("keydown", e => { if (e.key === "Escape") root.hidden = true; });

  return {
    open({ year, place, placeTitle }) {
      const back = new URL(location.href);
      back.searchParams.set("enviat", "1");
      const about = placeTitle ? `${placeTitle} · ${formatYear(year)}` : formatYear(year);
      root.innerHTML = `<div class="modal-card">
<header><h2>${esc(t("contact.title"))}</h2><button type="button" class="close" aria-label="${esc(t("ui.close"))}">×</button></header>
<p>${esc(t("contact.intro"))}</p>
<form action="${ENDPOINT}" method="POST" enctype="multipart/form-data">
  <input type="hidden" name="_subject" value="Premià a través del temps · ${esc(about)}">
  <input type="hidden" name="_next" value="${esc(back.toString())}">
  <input type="hidden" name="_template" value="table">
  <input type="hidden" name="Context" value="${esc(about)}${place ? ` (${esc(place)})` : ""} · ${esc(location.href)}">
  <input type="text" name="_honey" class="honey" tabindex="-1" autocomplete="off">
  <label>${esc(t("contact.type"))}
    <select name="Tipus" required>
      <option value="Error">${esc(t("contact.type.error"))}</option>
      <option value="Informació">${esc(t("contact.type.info"))}</option>
      <option value="Imatges">${esc(t("contact.type.images"))}</option>
      <option value="Altres">${esc(t("contact.type.other"))}</option>
    </select>
  </label>
  <label>${esc(t("contact.about"))}<input type="text" name="Sobre" value="${esc(about)}"></label>
  <label>${esc(t("contact.message"))}<textarea name="Missatge" rows="5" required placeholder="${esc(t("contact.message.ph"))}"></textarea></label>
  <label>${esc(t("contact.files"))}<input type="file" name="attachment" accept="image/*,.pdf" multiple></label>
  <p class="hint">${esc(t("contact.files.hint", { mb: MAX_MB }))}</p>
  <label>${esc(t("contact.name"))}<input type="text" name="Nom" autocomplete="name"></label>
  <label>${esc(t("contact.email"))}<input type="email" name="email" autocomplete="email"></label>
  <label class="check"><input type="checkbox" name="Permís per publicar" value="Sí"> ${esc(t("contact.licence"))}</label>
  <p class="hint">${esc(t("contact.privacy"))}</p>
  <p class="error" hidden></p>
  <div class="card-actions">
    <button type="submit" class="send">${esc(t("contact.send"))}</button>
    <a class="link" href="mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`Premià a través del temps · ${about}`)}">${esc(t("contact.mailto"))}</a>
  </div>
</form></div>`;
      root.querySelector(".close")!.addEventListener("click", () => { root.hidden = true; });
      const form = root.querySelector("form")!;
      form.addEventListener("submit", e => {
        const files = (form.querySelector("input[type=file]") as HTMLInputElement).files;
        const total = files ? [...files].reduce((s, f) => s + f.size, 0) : 0;
        if (total > MAX_MB * 1024 * 1024) {
          e.preventDefault();
          const err = root.querySelector(".error") as HTMLElement;
          err.textContent = t("contact.tooBig", { mb: MAX_MB });
          err.hidden = false;
        }
      });
      root.hidden = false;
      (root.querySelector("textarea") as HTMLTextAreaElement).focus();
    },
  };
}

/** After FormSubmit redirects back with ?enviat=1, thank the user and clean the URL. */
export function consumeSentFlag(flash: (msg: string) => void): void {
  const u = new URL(location.href);
  if (u.searchParams.get("enviat") !== "1") return;
  u.searchParams.delete("enviat");
  history.replaceState(null, "", u.toString());
  flash(t("contact.thanks"));
}
