// "Contacte / Aporta": report errors or send images and information. The site is static, so the form
// is sent in the background to FormSubmit (formsubmit.co), which emails it, attachments included,
// to the owner's inbox through the alias below. If sending fails, "o escriu un correu" opens an
// email draft with the message already written.
import { t } from "./i18n";
import { formatYear } from "./timeline";

// FormSubmit alias of the inbox, so the address is not in the page source. The AJAX route for an
// "el/" alias is not documented: both forms are tried, a 404 / non-JSON answer moves to the next.
const ALIAS = "henune";
const ENDPOINTS = [`https://formsubmit.co/ajax/el/${ALIAS}`, `https://formsubmit.co/ajax/${ALIAS}`];
/** Mail address for the fallback link, assembled only when needed (not greppable in the bundle). */
const mailAddress = (): string => [String.fromCharCode(109, 97, 114, 99), ["teclliure", "net"].join(".")].join("@");
const MAX_MB = 10;

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export interface Contact { open(context: { year: number; place?: string; placeTitle?: string }): void }

export function createContact(flash?: (msg: string) => void): Contact {
  const root = document.createElement("div");
  root.className = "modal contact";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  document.body.appendChild(root);
  root.addEventListener("click", e => { if (e.target === root) root.hidden = true; });
  window.addEventListener("keydown", e => { if (e.key === "Escape") root.hidden = true; });

  return {
    open({ year, place, placeTitle }) {
      const about = placeTitle ? `${placeTitle} · ${formatYear(year)}` : formatYear(year);
      root.innerHTML = `<div class="modal-card">
<header><h2>${esc(t("contact.title"))}</h2><button type="button" class="close" aria-label="${esc(t("ui.close"))}">×</button></header>
<p>${esc(t("contact.intro"))}</p>
<form method="POST" enctype="multipart/form-data">
  <input type="hidden" name="_subject" value="Premià a través del temps · ${esc(about)}">
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
  <p class="status" hidden></p>
  <div class="card-actions">
    <button type="submit" class="send">${esc(t("contact.send"))}</button>
    <a class="link mailto" href="#">${esc(t("contact.mailto"))}</a>
  </div>
</form></div>`;
      root.querySelector(".close")!.addEventListener("click", () => { root.hidden = true; });
      const form = root.querySelector("form")!;
      const status = root.querySelector(".status") as HTMLElement;
      const send = root.querySelector(".send") as HTMLButtonElement;
      const mailto = root.querySelector(".mailto") as HTMLAnchorElement;
      const show = (msg: string, kind: "info" | "ok" | "error") => { status.textContent = msg; status.className = `status ${kind}`; status.hidden = false; };
      /** mailto link carrying what the visitor typed, for when the service fails. */
      const draft = () => {
        const fd = new FormData(form);
        const body = ["Tipus", "Sobre", "Missatge", "Nom", "email", "Context"].map(k => `${k}: ${fd.get(k) ?? ""}`).join("\n");
        return `mailto:${mailAddress()}?subject=${encodeURIComponent(`Premià a través del temps · ${about}`)}&body=${encodeURIComponent(body)}`;
      };
      mailto.addEventListener("click", () => { mailto.href = draft(); });
      form.addEventListener("submit", async e => {
        e.preventDefault();
        const files = (form.querySelector("input[type=file]") as HTMLInputElement).files;
        const total = files ? [...files].reduce((sum, f) => sum + f.size, 0) : 0;
        if (total > MAX_MB * 1024 * 1024) { show(t("contact.tooBig", { mb: MAX_MB }), "error"); return; }
        send.disabled = true;
        show(t("contact.sending"), "info");
        try {
          let r: Response | null = null;
          let res: { success?: string | boolean; message?: string } = {};
          for (const url of ENDPOINTS) {
            const ctl = new AbortController();
            const timer = setTimeout(() => ctl.abort(), 45000);
            r = await fetch(url, { method: "POST", body: new FormData(form), headers: { Accept: "application/json" }, signal: ctl.signal });
            clearTimeout(timer);
            res = await r.json().catch(() => ({}));
            if (r.status !== 404 && "success" in res) break;
          }
          if (!r) throw new Error("no endpoint");
          if (r.ok && String(res.success) === "true") {
            show(t("contact.thanks"), "ok");
            form.reset();
            setTimeout(() => { root.hidden = true; flash?.(t("contact.thanks")); }, 1800);
          } else {
            throw new Error(res.message || `HTTP ${r.status}`);
          }
        } catch (err) {
          mailto.href = draft();
          show(`${t("contact.failed")} (${(err as Error).name === "AbortError" ? "timeout" : (err as Error).message})`, "error");
        } finally {
          send.disabled = false;
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
