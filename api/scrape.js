// Vercel serverless function: server-side design-token scraper.
// The browser's web_fetch tool only returns "readable" body content and drops the <head> +
// linked stylesheets, so it misses fonts/colours that live in theme CSS (Shopify, Woo, etc.).
// This endpoint fetches the page server-side (no CORS, real User-Agent), follows its linked
// stylesheets, and regex-extracts CSS custom properties, @font-face families, font imports and
// the theme-color meta — the same static pass the local scraper skill uses. Gated by the shared
// passphrase, same as /api/anthropic.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const MAX_SHEETS = 10; // how many linked stylesheets to fetch
const MAX_CSS_BYTES = 600 * 1024; // cap combined CSS so the payload stays sane
const FETCH_TIMEOUT_MS = 7000;
const MAX_VARS = 150;

// Block obvious SSRF targets (loopback, private ranges, link-local/metadata). Passphrase-gated
// too, but this is cheap hygiene.
function isBlockedHost(host) {
  const h = (host || "").toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return true;
  if (h === "::1" || h === "0.0.0.0") return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  return false;
}

async function fetchText(url, maxBytes) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "User-Agent": UA, Accept: "text/html,text/css,*/*" },
    });
    const buf = await r.arrayBuffer();
    let text = Buffer.from(buf).toString("utf8");
    if (maxBytes && text.length > maxBytes) text = text.slice(0, maxBytes);
    return { ok: r.ok, status: r.status, finalUrl: r.url || url, text };
  } finally {
    clearTimeout(t);
  }
}

module.exports = async (req, res) => {
  const gate = (process.env.BRAND_STUDIO_PASSPHRASE || "").trim();
  if (gate) {
    const provided = (req.headers["x-brand-passphrase"] || "").trim();
    if (provided !== gate) {
      res.status(401).json({ error: { message: "Invalid or missing passphrase" } });
      return;
    }
  }

  let target = (req.query && req.query.url) || "";
  if (!target && req.method === "POST") {
    try { target = (typeof req.body === "string" ? JSON.parse(req.body) : req.body || {}).url || ""; } catch (e) {}
  }
  target = String(target || "").trim();
  if (!target) { res.status(400).json({ error: { message: "Missing ?url=" } }); return; }
  if (!/^https?:\/\//i.test(target)) target = "https://" + target;

  let pageUrl;
  try { pageUrl = new URL(target); } catch (e) { res.status(400).json({ error: { message: "Invalid URL" } }); return; }
  if (pageUrl.protocol !== "http:" && pageUrl.protocol !== "https:") {
    res.status(400).json({ error: { message: "Only http/https URLs are allowed" } }); return;
  }
  if (isBlockedHost(pageUrl.hostname)) {
    res.status(400).json({ error: { message: "Refusing to fetch a private/loopback host" } }); return;
  }

  try {
    const page = await fetchText(pageUrl.href, 1.5 * 1024 * 1024);
    const html = page.text || "";
    const base = page.finalUrl || pageUrl.href;

    // Inline <style> blocks
    let css = "";
    for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) css += "\n" + m[1];

    // theme-color meta
    let themeColor = null;
    const tc = html.match(/<meta[^>]*name=["']theme-color["'][^>]*>/i);
    if (tc) { const c = tc[0].match(/content=["']([^"']+)["']/i); if (c) themeColor = c[1].trim(); }

    // <link> tags: stylesheets to fetch, and Google/Bunny font imports to record
    const sheetUrls = [];
    const fontImports = [];
    for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
      const tag = m[0];
      const relM = tag.match(/rel=["']?([^"'>\s]+)/i);
      const hrefM = tag.match(/href=["']([^"']+)["']/i);
      if (!hrefM) continue;
      let href;
      try { href = new URL(hrefM[1], base).href; } catch (e) { continue; }
      const rel = (relM ? relM[1] : "").toLowerCase();
      const isFont = /fonts\.googleapis\.com|fonts\.bunny\.net|use\.typekit/i.test(href);
      if (isFont) { if (!fontImports.includes(href)) fontImports.push(href); continue; }
      const asStyle = /as=["']?style/i.test(tag);
      if ((rel.includes("stylesheet") || (rel.includes("preload") && asStyle)) && /\.css(\?|$)/i.test(href)) {
        if (!sheetUrls.includes(href)) sheetUrls.push(href);
      }
    }

    // Fetch the linked stylesheets (bounded), skipping blocked hosts
    const fetched = [];
    for (const u of sheetUrls.slice(0, MAX_SHEETS)) {
      if (css.length > MAX_CSS_BYTES) break;
      let host;
      try { host = new URL(u).hostname; } catch (e) { continue; }
      if (isBlockedHost(host)) continue;
      try {
        const r = await fetchText(u, MAX_CSS_BYTES);
        if (r.ok && r.text) { css += "\n" + r.text; fetched.push(u); }
      } catch (e) {}
    }
    if (css.length > MAX_CSS_BYTES) css = css.slice(0, MAX_CSS_BYTES);

    // CSS custom properties (--x: value) declared anywhere
    const cssVars = {};
    for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+)[;}]/g)) {
      const name = m[1].trim();
      const val = m[2].trim();
      if (val && val.length < 120 && !(name in cssVars)) cssVars[name] = val;
      if (Object.keys(cssVars).length >= MAX_VARS) break;
    }

    // @font-face family names
    const fontFaces = [];
    for (const m of css.matchAll(/@font-face\s*{([^}]*)}/gi)) {
      const fam = m[1].match(/font-family\s*:\s*([^;]+);/i);
      if (fam) {
        const name = fam[1].replace(/["']/g, "").trim();
        if (name && !fontFaces.includes(name)) fontFaces.push(name);
      }
    }

    // @import font URLs inside the CSS itself
    for (const m of css.matchAll(/@import\s+url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
      const u = m[1].trim();
      if (/fonts\.googleapis\.com|fonts\.bunny\.net/i.test(u) && !fontImports.includes(u)) fontImports.push(u);
    }

    res.status(200).json({
      finalUrl: base,
      themeColor,
      cssVars,
      fontFaces,
      fontImports,
      stylesheetsFetched: fetched,
      counts: { vars: Object.keys(cssVars).length, fontFaces: fontFaces.length, sheets: fetched.length },
    });
  } catch (e) {
    res.status(502).json({ error: { message: "Scrape failed: " + String(e && e.message ? e.message : e) } });
  }
};
