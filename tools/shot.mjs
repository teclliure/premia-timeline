// Screenshots with headless Chrome + Playwright, for checking each build step.
//
//   npm run dev &                         # or `npm run preview` after a build
//   node tools/shot.mjs [url] [shots...]
//   node tools/shot.mjs http://localhost:5173 1848:core 1975:port:19 -20000:sea
//
// Each shot is year[:view[:hour[:WxH]]]. Output: shots/<year>_<view>.png plus console errors.
// CHROME=/path/to/chrome overrides the browser; without a GPU, SwiftShader renders WebGL 2.
import { chromium } from "playwright-core";
import { mkdirSync, existsSync } from "node:fs";

const url = process.argv[2] ?? "http://localhost:5173";
const specs = process.argv.slice(3).length ? process.argv.slice(3) : ["2026:overview", "1848:core", "1960:overview", "1975:port", "-19000:sea", "100:villa"];
const candidates = [process.env.CHROME, "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"];
const executablePath = candidates.find(p => p && existsSync(p));
mkdirSync("shots", { recursive: true });

const browser = await chromium.launch({
  executablePath,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"],
});
let failed = false;
for (const spec of specs) {
  const [year, view = "overview", hour = "11", size = "1400x860"] = spec.split(":");
  const [w, h] = size.split("x").map(Number);
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = [];
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on("pageerror", e => errors.push(String(e)));
  page.on("requestfailed", r => { if (!/fonts\.(googleapis|gstatic)/.test(r.url())) errors.push(`failed ${r.url()}`); });
  page.on("response", r => { if (r.status() >= 400 && !r.url().endsWith("favicon.ico")) errors.push(`${r.status()} ${r.url()}`); });
  await page.goto(`${url}/?shot#year=${year}&view=${view}&h=${hour}`);
  await page.waitForSelector("body.ready", { timeout: 120000 });
  await page.waitForTimeout(2500);
  const out = `shots/${year}_${view}${hour !== "11" ? "_h" + hour : ""}${w < 800 ? "_phone" : ""}.png`;
  await page.screenshot({ path: out });
  console.log(out, errors.length ? `ERRORS: ${errors.join(" | ")}` : "ok");
  if (errors.length) failed = true;
  await page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
