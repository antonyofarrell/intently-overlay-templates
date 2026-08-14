/* =====================================================
   check-keys.js

   Validates that every COPY_BY_REF and CONTENT_BY_REF key in brand-studio.html
   matches a real template reference. These maps are keyed by state.ref, so a
   typo (e.g. "MS00010" instead of "MS0010") silently does nothing — this catches
   that class of mistake at commit time.

   Valid refs = union of data.js TEMPLATES[].ref and templates-data.js
   OVERLAY_ASSETS keys. Exits non-zero with a clear message on any bad key.

   Usage:  node check-keys.js   (run by hooks/pre-commit)
   ===================================================== */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = __dirname;
const read = (p) => {
  try {
    return fs.readFileSync(path.join(ROOT, p), "utf8");
  } catch (e) {
    return "";
  }
};

// Collect the authoritative set of template refs.
const valid = new Set();
try {
  const box = {};
  vm.runInNewContext(
    read("data.js") + ';this.__T = (typeof TEMPLATES !== "undefined") ? TEMPLATES : [];',
    box,
  );
  (box.__T || []).forEach((t) => t && t.ref && valid.add(t.ref));
} catch (e) {}
try {
  const box = {};
  vm.runInNewContext(
    read("templates-data.js") + ';this.__A = (typeof OVERLAY_ASSETS !== "undefined") ? OVERLAY_ASSETS : {};',
    box,
  );
  Object.keys(box.__A || {}).forEach((r) => valid.add(r));
} catch (e) {}

if (!valid.size) {
  console.error("check-keys: couldn't read any template refs (data.js / templates-data.js) — skipping.");
  process.exit(0);
}

// Pull an object literal (COPY_BY_REF / CONTENT_BY_REF) out of brand-studio.html.
// Both close with a line that is exactly six spaces + "};"; nested entries close
// deeper-indented, so the non-greedy match stops at the real end.
const html = read("brand-studio.html");
function extract(name) {
  const m = html.match(new RegExp("const " + name + "\\s*=\\s*(\\{[\\s\\S]*?\\n      \\});"));
  if (!m) return undefined;
  try {
    return vm.runInNewContext("(" + m[1] + ")");
  } catch (e) {
    return null; // present but unparseable
  }
}

const bad = [];
for (const name of ["COPY_BY_REF", "CONTENT_BY_REF"]) {
  const obj = extract(name);
  if (obj === undefined) continue; // map not present — nothing to check
  if (obj === null) {
    console.error("check-keys: couldn't parse " + name + " in brand-studio.html — check its syntax.");
    process.exit(1);
  }
  for (const key of Object.keys(obj)) {
    if (!valid.has(key)) bad.push(name + ' → "' + key + '"');
  }
}

if (bad.length) {
  console.error(
    "check-keys: these keys don't match any template ref:\n  " +
      bad.join("\n  ") +
      "\nUse a real ref (e.g. MS0010, not MS00010), then commit again.",
  );
  process.exit(1);
}
console.log("check-keys: COPY_BY_REF / CONTENT_BY_REF keys all valid (" + valid.size + " known refs).");
