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

// ---- Product extraction -------------------------------------------------
// Pull name / image / price from a product page so the overlay's <smc-cart>
// demo product can be replaced with the real one. Structured data first
// (JSON-LD Product), then Open Graph / product meta, then microdata.
function absUrl(u, base) { try { return new URL(u, base).href; } catch (e) { return u || ""; } }

function firstImage(img) {
  if (!img) return "";
  if (typeof img === "string") return img;
  if (Array.isArray(img)) return firstImage(img[0]);
  if (typeof img === "object") return img.url || img.contentUrl || "";
  return "";
}

function pickOffer(offers) {
  if (!offers) return null;
  if (Array.isArray(offers)) return pickOffer(offers[0]);
  if (typeof offers === "object") return offers;
  return null;
}

// Walk arbitrarily-nested JSON-LD (arrays, @graph) for the first Product node.
function findProductNode(node, depth) {
  if (!node || depth > 6) return null;
  if (Array.isArray(node)) {
    for (const n of node) { const f = findProductNode(n, depth + 1); if (f) return f; }
    return null;
  }
  if (typeof node !== "object") return null;
  const t = node["@type"];
  if (t && (t === "Product" || (Array.isArray(t) && t.includes("Product")))) return node;
  if (node["@graph"]) return findProductNode(node["@graph"], depth + 1);
  return null;
}

function extractProduct(html, base) {
  let name = "", image = "", price = "", oldPrice = "", currency = "";

  // 1) JSON-LD Product
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data; try { data = JSON.parse(m[1].trim()); } catch (e) { continue; }
    const p = findProductNode(data, 0);
    if (!p) continue;
    if (!name && typeof p.name === "string") name = p.name.trim();
    if (!image) image = firstImage(p.image);
    const off = pickOffer(p.offers);
    if (off) {
      const spec = off.priceSpecification || {};
      const pr = off.price != null ? off.price : (off.lowPrice != null ? off.lowPrice : spec.price);
      if (pr != null && price === "") price = String(pr).trim();
      currency = currency || off.priceCurrency || spec.priceCurrency || "";
    }
    if (name || price) break;
  }

  // 2) Open Graph / product price meta
  const meta = (prop) => {
    const r = html.match(new RegExp('<meta[^>]*(?:property|name)=["\']' + prop + '["\'][^>]*>', "i"));
    if (!r) return "";
    const c = r[0].match(/content=["']([^"']+)["']/i);
    return c ? c[1].trim() : "";
  };
  if (!name) name = meta("og:title");
  if (!image) image = meta("og:image");
  if (!price) price = meta("product:price:amount") || meta("og:price:amount");
  if (!currency) currency = meta("product:price:currency") || meta("og:price:currency");

  // 3) Microdata
  if (!price) { const r = html.match(/itemprop=["']price["'][^>]*content=["']([^"']+)["']/i); if (r) price = r[1].trim(); }
  if (!currency) { const r = html.match(/itemprop=["']priceCurrency["'][^>]*content=["']([^"']+)["']/i); if (r) currency = r[1].trim(); }

  image = image ? absUrl(image, base) : "";
  name = name.replace(/\s+/g, " ").trim();
  if (!name && !price && !image) return null;
  return { name, image, price, oldPrice, currency };
}

// Build the CSS sample sent to the model. Instead of blindly truncating the first N bytes (which,
// on a big site, is framework/reset CSS — the real button/brand rules get cut), surface the rules
// most likely to carry brand styling FIRST: selectors mentioning button/cta/primary/action/accent
// etc. (e.g. VTEX/Tachyons `.bg-action-primary{background-color:#d6001c}`) and custom-property
// blocks. Then fill the remaining budget with the head of the stylesheet.
function buildCssSample(rawCss, budget) {
  const noComments = rawCss.replace(/\/\*[\s\S]*?\*\//g, " ");
  const REL =
    /(?:button|\bbtn\b|\bcta\b|\bbuy\b|comprar|kaufen|acheter|add[-_ ]?to[-_ ]?cart|addtocart|primary|secondary|\baction\b|accent|\bbrand\b|checkout|purchase|emphasis|\bc-link\b|\btheme\b|:root)/i;
  const picked = [];
  const seen = new Set();
  let pickedLen = 0;
  const cap = Math.floor(budget * 0.6);
  for (const m of noComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (pickedLen >= cap) break;
    const sel = m[1];
    const body = m[2];
    if (!/#[0-9a-f]{3,8}|rgb|hsl|border-radius|font-family|--[\w-]+\s*:/i.test(body)) continue;
    if (!REL.test(sel) && !/--[\w-]+\s*:/.test(body)) continue;
    const rule = (sel + "{" + body + "}").replace(/\s+/g, " ").trim();
    if (rule.length > 600 || seen.has(rule)) continue;
    seen.add(rule);
    picked.push(rule);
    pickedLen += rule.length + 1;
  }
  const head = noComments.replace(/\s+/g, " ").trim();
  const prioritized = picked.join("\n");
  const remaining = budget - prioritized.length - 1;
  return (prioritized + (remaining > 0 ? "\n" + head.slice(0, remaining) : "")).slice(0, budget);
}

// Deterministically pick the PRIMARY button's corner radius. Big design systems declare many
// .button/.btn rules with different radii; the one that matters is the primary/action/brand CTA
// (the same button that carries the CTA colour, e.g. .vtex-button.bg-action-primary{border-radius:40px}).
// Prefer that; fall back to a buy/add-to-cart/checkout button; else give up (null).
function extractBtnRadius(css) {
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const grab = (re) => {
    const vals = [];
    for (const m of rules) {
      if (!re.test(m[1])) continue;
      const r = m[2].match(/border-radius\s*:\s*([^;}]+)/i);
      if (!r) continue;
      const v = r[1].trim();
      if (/inherit|unset|initial|revert|var\(|calc\(/i.test(v)) continue; // keep concrete lengths
      if (/^\d|^\.\d/.test(v)) vals.push(v);
    }
    return vals;
  };
  const mostCommon = (vals) => {
    if (!vals.length) return null;
    const f = {};
    vals.forEach((v) => (f[v] = (f[v] || 0) + 1));
    return Object.keys(f).sort((a, b) => f[b] - f[a])[0];
  };
  return (
    mostCommon(grab(/(action-primary|btn-primary|primary[-_]?(?:btn|button|cta)|(?:btn|button|cta)[-_]?primary)/i)) ||
    mostCommon(grab(/(buy|add[-_ ]?to[-_ ]?cart|addtocart|checkout|\bcta\b)/i)) ||
    null
  );
}

// Deterministically pick the brand's primary CTA colour from semantic utility classes
// (.bg-action-primary / .bg-emphasis / .btn-primary / buy / add-to-cart → background; else
// .c-action-primary / .c-emphasis / .c-link → color). Design systems like VTEX Storefront UI ship
// GENERIC scale tokens (--sl-color-blue-10 #0366dd) that a model easily mistakes for the brand —
// the real brand colour is the one wired to the semantic 'action/emphasis' role, which this finds.
function extractBtnColor(css) {
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const COLOUR = /(#[0-9a-f]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\))/i;
  const grab = (selRe, propRe) => {
    const vals = [];
    for (const m of rules) {
      if (!selRe.test(m[1])) continue;
      const d = m[2].match(propRe);
      if (!d) continue;
      const v = d[1].trim();
      if (/^#fff(f{0,3})?$|^#000(0{0,3})?$|transparent|inherit|currentcolor/i.test(v)) continue; // skip b/w/none
      vals.push(v);
    }
    return vals;
  };
  const common = (vals) => {
    if (!vals.length) return null;
    const f = {};
    vals.forEach((v) => (f[v.toLowerCase()] = (f[v.toLowerCase()] || 0) + 1));
    return Object.keys(f).sort((a, b) => f[b] - f[a])[0];
  };
  return (
    common(grab(/(bg-action-primary|bg-emphasis|action-primary[^{]*bg|btn-primary|\bbuy\b|add[-_ ]?to[-_ ]?cart|addtocart)/i, new RegExp("background(?:-color)?\\s*:\\s*" + COLOUR.source, "i"))) ||
    common(grab(/(c-action-primary|c-emphasis|\bc-link\b)/i, new RegExp("(?:^|;)\\s*color\\s*:\\s*" + COLOUR.source, "i"))) ||
    null
  );
}

// Most-common value of a given CSS property on the primary/action CTA button rules — used for
// button font-size and padding (same targeting as the colour/radius extractors).
function extractBtnProp(css, propName) {
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const propRe = new RegExp("(?:^|;)\\s*" + propName + "\\s*:\\s*([^;}]+)", "i");
  const grab = (selRe) => {
    const vals = [];
    for (const m of rules) {
      if (!selRe.test(m[1])) continue;
      const d = m[2].match(propRe);
      if (!d) continue;
      const v = d[1].trim();
      if (/inherit|unset|initial|revert|var\(|calc\(/i.test(v)) continue;
      // Reject a value with ANY zero component (e.g. "0", "0 0 15px", "0 20px") — those are resets
      // or container spacing, not a reliable button size. Callers fall back to the template baseline.
      if (v.split(/\s+/).some((p) => /^0(px|rem|em|%)?$/i.test(p))) continue;
      vals.push(v);
    }
    return vals;
  };
  const common = (vals) => {
    if (!vals.length) return null;
    const f = {};
    vals.forEach((v) => (f[v.toLowerCase()] = (f[v.toLowerCase()] || 0) + 1));
    const key = Object.keys(f).sort((a, b) => f[b] - f[a])[0];
    return vals.find((v) => v.toLowerCase() === key);
  };
  return (
    common(grab(/(action-primary|btn-primary|primary[-_]?(?:btn|button|cta)|(?:btn|button|cta)[-_]?primary)/i)) ||
    common(grab(/(buy|add[-_ ]?to[-_ ]?cart|addtocart|checkout|\bcta\b)/i)) ||
    null
  );
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

    // Fetch the linked stylesheets concurrently (bounded), skipping blocked hosts.
    // Parallel so total time is ~one fetch timeout, not the sum of all of them.
    const fetched = [];
    const toFetch = sheetUrls.slice(0, MAX_SHEETS).filter((u) => {
      try { return !isBlockedHost(new URL(u).hostname); } catch (e) { return false; }
    });
    const results = await Promise.all(
      toFetch.map((u) => fetchText(u, MAX_CSS_BYTES).then((r) => (r.ok && r.text ? { u, text: r.text } : null)).catch(() => null))
    );
    for (const r of results) {
      if (r && css.length < MAX_CSS_BYTES) { css += "\n" + r.text; fetched.push(r.u); }
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

    // font-family declarations actually used (catches the brand font even when its
    // @font-face lives in a sheet we didn't fetch). Ranked by how often each is referenced.
    const GENERIC = new Set([
      "inherit", "initial", "unset", "revert", "sans-serif", "serif", "monospace", "cursive",
      "fantasy", "system-ui", "-apple-system", "blinkmacsystemfont", "ui-sans-serif", "ui-serif",
      "ui-monospace", "segoe ui", "roboto", "helvetica", "arial", "helvetica neue",
      // monospace / code fonts are never a brand's display font — they leak in from <pre>/<code>
      "monaco", "consolas", "menlo", "courier", "courier new", "lucida console",
      "sf mono", "sfmono-regular", "andale mono", "dejavu sans mono", "liberation mono", "monospace",
    ]);
    const famCount = {};
    const famLabel = {}; // first-seen original casing per normalised key
    for (const m of css.matchAll(/font-family\s*:\s*([^;{}]+)[;}]/gi)) {
      let first = m[1].split(",")[0].replace(/!important/i, "").replace(/["']/g, "").trim();
      if (!first) continue;
      if (first.includes(":") || first.includes("(")) continue; // spurious matches (e.g. "object-fit: cover", var(...))
      const key = first.toLowerCase();
      if (key.startsWith("var")) continue;
      if (GENERIC.has(key)) continue;
      if (/icon|swiper|material|fontawesome|glyph/i.test(first)) continue; // skip icon fonts
      if (!famLabel[key]) famLabel[key] = first;
      famCount[key] = (famCount[key] || 0) + 1;
    }
    const fontFamilies = Object.keys(famCount).sort((a, b) => famCount[b] - famCount[a]).map((k) => famLabel[k]).slice(0, 8);

    // A sample of the raw combined CSS so the model can read real rules (button/text/link colours,
    // radii, fonts) on sites that don't expose CSS custom properties. Brand-relevant rules are
    // surfaced first so they aren't truncated out on large sites — see buildCssSample.
    const cssSample = buildCssSample(css, 90000);

    // The primary button's corner radius + brand colour (from the action/primary/CTA button rules).
    const btnRadius = extractBtnRadius(css);
    const btnColor = extractBtnColor(css);
    const btnFontSize = extractBtnProp(css, "font-size");
    const btnPadding = extractBtnProp(css, "padding");

    // Detect bot-protection / challenge / error interstitials — but PRECISELY. Many legitimate
    // pages (200, full content) embed a bot-management vendor's script (Cloudflare JSD, DataDome,
    // PerimeterX), so the vendor NAME alone is NOT a block. We trip only on:
    //   (a) a blocking HTTP status (401/403/429/503), or
    //   (b) an actual challenge/CAPTCHA marker on a SMALL page — a real interstitial is a few KB,
    //       whereas a full Shopify/product page that merely loads a bot script is hundreds of KB.
    const status = page.status || 0;
    const head = html.slice(0, 20000);
    const challengeMarker =
      /cf-browser-verification|id=["']cf-wrapper|__cf_chl_|_cf_chl_opt|window\._cf_chl|Attention Required!\s*\|\s*Cloudflare|Just a moment\.\.\.|Checking your browser before accessing|Enable JavaScript and cookies to continue|_Incapsula_Resource|Incapsula incident|px-captcha|distil_r_captcha|geo\.captcha-delivery\.com/i.test(head);
    const blocked =
      [401, 403, 429, 503].includes(status) ||
      (challengeMarker && html.length < 60000);

    // Product info for the overlay's demo <smc-cart> (skip on bot-block pages).
    const product = blocked ? null : extractProduct(html, base);

    res.status(200).json({
      finalUrl: base,
      blocked,
      product,
      themeColor: blocked ? null : themeColor,
      btnColor: blocked ? null : btnColor,
      btnRadius: blocked ? null : btnRadius,
      btnFontSize: blocked ? null : btnFontSize,
      btnPadding: blocked ? null : btnPadding,
      cssVars: blocked ? {} : cssVars,
      fontFaces: blocked ? [] : fontFaces,
      fontFamilies: blocked ? [] : fontFamilies,
      fontImports: blocked ? [] : fontImports,
      cssSample: blocked ? "" : cssSample,
      stylesheetsFetched: fetched,
      counts: { vars: Object.keys(cssVars).length, fontFaces: fontFaces.length, fontFamilies: fontFamilies.length, sheets: fetched.length, cssSampleChars: blocked ? 0 : cssSample.length, blocked },
    });
  } catch (e) {
    res.status(502).json({ error: { message: "Scrape failed: " + String(e && e.message ? e.message : e) } });
  }
};
