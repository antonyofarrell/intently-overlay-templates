#!/usr/bin/env node
// Migrate overlay template CSS variable names to the canonical standard (see NAMING-STANDARD.md).
// Dry-run by default: prints what it WOULD change. Pass --apply to write files.
// High-confidence renames are automatic; ambiguous names are reported for a human decision.
//
//   node standardize-variables.js            # dry run (report only)
//   node standardize-variables.js --apply    # write changes, then run `npm run build`

const fs = require("fs");
const path = require("path");

const APPLY = process.argv.includes("--apply");
const ROOT = "overlay-design-templates/output";

// High-confidence, unconditional renames (old canonical → new canonical).
const RENAME = {
  "--smc-bg": "--smc-mainBkg",
  "--smc-bkg1": "--smc-mainBkg",
  "--smc-bg1": "--smc-mainBkg",
  "--smc-bkg2": "--smc-cardBkg",
  "--smc-bg2": "--smc-cardBkg",
  "--smc-mainBkg2": "--smc-cardBkg",
  "--smc-text": "--smc-textColour",
  "--smc-text2": "--smc-textColour2",
  "--smc-btn": "--smc-btnBkg",
  "--smc-button": "--smc-btnBkg",
  "--smc-btn-text": "--smc-btnText",
  "--smc-btnHover": "--smc-btnBkgHover",
  "--smc-buttonHover": "--smc-btnBkgHover",
  "--smc-brand": "--smc-accent",
  "--smc-font-sm": "--smc-fontSm",
  "--smc-font-rg": "--smc-fontRg",
  "--smc-font-lg": "--smc-fontLg",
  "--smc-text-size": "--smc-fontRg",
  "--smc-frameBorderInner": "--smc-cardBorderRadius",
  "--smc-text-dark": "--smc-textColour2",
  "--smc-borderColor": "--smc-borderColour",
};

// Names that hold a radius under the OLD scheme but should be *BorderRadius under the new one.
// Renamed only when their value actually looks like a radius (else reported).
const RADIUS_CANDIDATES = { "--smc-border": "--smc-frameBorderRadius", "--smc-frameBorder": "--smc-frameBorderRadius" };

// Ambiguous — never auto-renamed; reported so a human decides. (Accepted as-is: two-tone
// palettes and component-specific tints have no single-role canonical.)
const AMBIGUOUS = new Set([
  "--smc-dark", "--smc-light", "--smc-whiteBkg", "--smc-coverBkg", "--smc-coverBkgHover",
]);

// Structural / non-brand — left alone silently.
const KEEP = new Set([
  "--smc-overlayPadding", "--smc-length", "--smc-banner", "--smc-revealHeight",
  "--direction", "--marquee-speed",
]);

const isRadius = (v) => /^\s*[\d.]+\s*(px|rem|em|%|vw|vh|pt)?\s*$/.test(v);
const isBorderShorthand = (v) => /\b(solid|dashed|dotted|double|groove|ridge|none)\b/.test(v) || /\d+\s*(px|rem|em).*#|rgb/.test(v);
const isColour = (v) => /^\s*#([0-9a-f]{3,8})\s*$/i.test(v) || /^\s*(rgb|rgba|hsl|hsla)\(/i.test(v);

// mask /* */ comments so a commented value isn't used for inspection
function activeValue(css, name) {
  const nc = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let last = null;
  const re = new RegExp(name.replace(/[-]/g, "\\-") + "\\s*:\\s*([^;}]+)", "g");
  let m;
  while ((m = re.exec(nc))) last = m[1].trim();
  return last;
}

// rename a variable everywhere (declaration + var() usages), boundary-safe so --smc-btn
// never touches --smc-btnBkg
function renameVar(css, from, to) {
  const re = new RegExp(from.replace(/[-]/g, "\\-") + "(?![\\w-])", "g");
  return css.replace(re, to);
}

const dirs = fs.readdirSync(ROOT).filter((d) => fs.existsSync(path.join(ROOT, d, "style.css")));
let totalRenamed = 0, filesChanged = 0;
const ambiguousReport = {};

for (const d of dirs) {
  const file = path.join(ROOT, d, "style.css");
  let css = fs.readFileSync(file, "utf8");
  const declared = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const changes = [];
  const flags = [];

  for (const name of declared) {
    if (RENAME[name]) {
      const to = RENAME[name];
      if (declared.has(to)) { flags.push(`${name} → ${to} (SKIPPED: ${to} already exists)`); continue; }
      css = renameVar(css, name, to);
      declared.delete(name); declared.add(to);
      changes.push(`${name} → ${to}`);
    } else if (RADIUS_CANDIDATES[name]) {
      const val = activeValue(css, name);
      if (val != null && isRadius(val)) {
        const to = RADIUS_CANDIDATES[name];
        if (declared.has(to)) { flags.push(`${name} → ${to} (SKIPPED: ${to} already exists)`); continue; }
        css = renameVar(css, name, to);
        declared.delete(name); declared.add(to);
        changes.push(`${name} → ${to}  (radius "${val}")`);
      } else if (val != null && isBorderShorthand(val)) {
        // genuine border on the frame → the canonical --smc-frameBorder name already fits
        if (name !== "--smc-frameBorder") {
          if (declared.has("--smc-frameBorder")) { flags.push(`${name} → --smc-frameBorder (SKIPPED: already exists)`); continue; }
          css = renameVar(css, name, "--smc-frameBorder");
          declared.delete(name); declared.add("--smc-frameBorder");
          changes.push(`${name} → --smc-frameBorder  (border "${val}")`);
        }
      } else if (val != null && isColour(val)) {
        // a bare border COLOUR (e.g. #eee) → the border-colour slot
        if (declared.has("--smc-borderColour")) { flags.push(`${name} → --smc-borderColour (SKIPPED: already exists)`); continue; }
        css = renameVar(css, name, "--smc-borderColour");
        declared.delete(name); declared.add("--smc-borderColour");
        changes.push(`${name} → --smc-borderColour  (colour "${val}")`);
      } else {
        flags.push(`${name} = "${val}" (AMBIGUOUS radius/border — review)`);
      }
    } else if (AMBIGUOUS.has(name)) {
      flags.push(`${name} = "${activeValue(css, name)}" (AMBIGUOUS — review)`);
    }
  }

  if (changes.length || flags.length) {
    console.log(`\n${d}`);
    changes.forEach((c) => console.log("  ✓ " + c));
    flags.forEach((f) => console.log("  ⚠ " + f));
  }
  if (flags.length) ambiguousReport[d] = flags;
  if (changes.length) {
    totalRenamed += changes.length;
    filesChanged++;
    if (APPLY) fs.writeFileSync(file, css);
  }
}

console.log(`\n${"─".repeat(50)}`);
console.log(`${APPLY ? "APPLIED" : "DRY RUN"} — ${totalRenamed} renames across ${filesChanged} templates.`);
const ambCount = Object.values(ambiguousReport).reduce((n, a) => n + a.length, 0);
if (ambCount) console.log(`${ambCount} ambiguous/flagged names left for manual review (see ⚠ above).`);
if (APPLY) console.log("Now run:  npm run build   (regenerate templates-data.js)");
else console.log("Re-run with --apply to write these changes.");
