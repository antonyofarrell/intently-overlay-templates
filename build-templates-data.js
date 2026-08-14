/* =====================================================
   build-templates-data.js

   Regenerates templates-data.js for brand-studio.html.

   It gathers overlay source from two places and picks the
   best COMPLETE source per reference code:

   1) overlay-design-templates/output/<REF>/style.css + index.html
      (the bulk export; folder "RD0016-2" maps to ref "RD0016b")
   2) <anything>/<REF>/<REF>.css (+ <REF>.html)   — hand-added folders

   A source counts as a full live-render only if its HTML
   contains </smc-bg> (i.e. it isn't a truncated extract).
   Truncated exports are skipped and listed at the end.

   Usage:  node build-templates-data.js
   ===================================================== */
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const REF_RE = /^(DB|PR|RD|RV|MS)\d{3,}[a-z]?$/i;

function read(p) { try { return fs.readFileSync(p, "utf8"); } catch (e) { return null; } }
function isComplete(html) { return !!html && /<\/smc-bg>/i.test(html); }

function cleanBody(html) {
  if (!html) return null;
  const m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  let body = m ? m[1] : html;
  body = body
    .replace(/<div class="smc-theme-switcher"[\s\S]*?<\/div>\s*(?=<!--|<smc-bg)/i, "")
    .replace(/<div class="smc-theme-switcher"[\s\S]*?<\/div>/i, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "");
  return body.trim();
}

// ref -> list of candidate {css, html, complete, source}
// Which <smc-option> the overlay shows in production (the "Type" set in the overlay manager).
// The template markup ships every option block, so we can't tell from presence alone UNLESS the
// template has been trimmed to a single option (then it's unambiguous). Otherwise fall back to the
// type named in the _meta.txt title's 2nd "||" segment. Order matters: the email-* patterns must
// beat the bare "redirect"/"reveal" ones.
function optionFor(css, html, title) {
  if (!html) return "smc-clickRedirect";
  const present = [
    ...new Set(
      [...html.matchAll(/smc-option\s+class="([^"]*)"/gi)]
        .map((m) => (m[1].match(/smc-[A-Za-z]+/) || [""])[0])
        .filter(Boolean),
    ),
  ];
  if (present.length === 1) return present[0]; // trimmed template — the only option is the answer
  // The template hides ALL options in its own CSS (a standalone `smc-option{display:none}` rule,
  // not a comma-grouped layout rule). Its CTA is the product tiles / smc-cta buttons, not an
  // smc-option — so show NONE ("" tells the preview not to force any option visible).
  if (/(?:^|}|;|\*\/)\s*smc-option\s*\{[^}]*display\s*:\s*none/i.test(css || "")) return "";
  const seg = (String(title || "").split("||")[1] || "").toLowerCase();
  const rules = [
    [/giftcloud/, "smc-emailToGiftCloud"],
    [/email\s*to\s*reveal/, "smc-emailToReveal"],
    [/email\s*to\s*redirect/, "smc-emailToReveal"],
    [/email\s*voucher/, "smc-email"],
    [/copy\s*to\s*reveal|click\s*to\s*reveal/, "smc-clickToReveal"],
    [/data\s*consent/, "smc-dataConsent"],
    [/request\s*notif/, "smc-requestNotifications"],
    [/survey|dynamic\s*form|\bform\b/, "smc-dynamicForm"],
    [/click\s*to\s*redirect|dynamic\s*basket|redirect/, "smc-clickRedirect"],
  ];
  for (const [re, cls] of rules) if (re.test(seg)) return cls;
  return "smc-clickRedirect"; // safe default (a plain CTA button)
}

// Per-ref option overrides for templates whose title doesn't map cleanly to a Type.
// Set from the actual "Type" in the overlay manager (production).
const OPTION_OVERRIDES = {
  MS0004: "smc-email", // "Email to Redirect" in the title, but it's an Email Voucher
  MS0007: "smc-email", // "Basket Backup / Opt In" in the title, but it's an Email Voucher
};

const cand = {};
function add(ref, css, html, source, title) {
  if (!css || !css.trim()) return;
  // keep the ref exactly as data.js uses it (e.g. "RD0016b" — uppercase base, lowercase variant suffix)
  (cand[ref] = cand[ref] || []).push({ css, html: html || null, complete: isComplete(html), source, title: title || "" });
}

// (1) bulk export folder
const OUT = path.join(ROOT, "overlay-design-templates", "output");
if (fs.existsSync(OUT)) {
  for (const name of fs.readdirSync(OUT)) {
    const dir = path.join(OUT, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    const ref = name.replace(/-2$/, "b").replace(/-3$/, "c"); // RD0016-2 -> RD0016b
    const meta = read(path.join(dir, "_meta.txt")) || "";
    const tm = meta.match(/title:\s*(.+)/i);
    add(ref, read(path.join(dir, "style.css")), read(path.join(dir, "index.html")), "export", tm ? tm[1].trim() : "");
  }
}

// (2) hand-added <REF>/<REF>.css folders anywhere in the tree
(function walk(dir) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name === "node_modules" || e.name.startsWith(".") || e.name === "images" || e.name === "output") continue;
    const full = path.join(dir, e.name);
    if (REF_RE.test(e.name)) {
      add(e.name, read(path.join(full, e.name + ".css")), read(path.join(full, e.name + ".html")), "local", "");
    }
    walk(full);
  }
})(ROOT);

// choose best usable source per ref
const assets = {};
const skipped = [];
Object.keys(cand).forEach((ref) => {
  // usable = a complete export, or any hand-added local folder (trusted)
  const usable = cand[ref].filter((c) => c.complete || c.source === "local");
  if (!usable.length) { skipped.push(ref); return; }
  // prefer the one with the most HTML (full render beats css-only)
  usable.sort((a, b) => (b.html ? b.html.length : 0) - (a.html ? a.html.length : 0));
  const best = usable[0];
  assets[ref] = {
    css: best.css,
    html: best.complete ? cleanBody(best.html) : null,
    opt: ref in OPTION_OVERRIDES ? OPTION_OVERRIDES[ref] : optionFor(best.css, best.html, best.title),
  };
});

const pageStyles = read(path.join(ROOT, "reference", "page-styles.css")) || "";
const banner =
  "/* AUTO-GENERATED by build-templates-data.js — do not edit by hand.\n" +
  "   PAGE_STYLES = reference/page-styles.css ; OVERLAY_ASSETS[ref] = {css, html|null, opt}. */\n";
fs.writeFileSync(
  path.join(ROOT, "templates-data.js"),
  banner + "const PAGE_STYLES = " + JSON.stringify(pageStyles) + ";\nconst OVERLAY_ASSETS = " + JSON.stringify(assets) + ";\n"
);

const full = Object.keys(assets).filter((r) => assets[r].html).sort();
const cssOnly = Object.keys(assets).filter((r) => !assets[r].html).sort();
console.log("Wrote templates-data.js —", Object.keys(assets).length, "overlays populated");
console.log("  full live render (css+html):", full.length, "→", full.join(", "));
console.log("  css-only (fields + output):", cssOnly.length, "→", cssOnly.join(", "));
console.log("  SKIPPED (truncated export, no complete source):", skipped.length, "→", skipped.sort().join(", "));
