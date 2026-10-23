// Vercel serverless function: RENDERED brand extraction (the "Rendered" method in Brand Studio's
// Compare mode). Instead of reading stylesheets, it loads the page in a real browser (Firecrawl,
// which also gets past most bot protection) and runs PROBE() inside it: the script finds the real
// add-to-cart button, headline and body text and returns the colours, fonts and shapes the browser
// actually painted, plus the font files really loaded. Mapping onto the overlay's --smc-* variables
// happens client-side in brand-studio.html (deterministic, no model call).
//
// Env: FIRECRAWL_API_KEY (recommended; without it Firecrawl's keyless tier is used, which is
// rate-limited). Gated by BRAND_STUDIO_PASSPHRASE like the other /api routes.

const FIRECRAWL_URL = "https://api.firecrawl.dev/v2/scrape";
const TOTAL_BUDGET_MS = 52000; // Vercel maxDuration is 60s — leave headroom for the response
const FIRST_TIMEOUT_MS = 30000;
const MIN_SECOND_MS = 15000; // only hop to a product page if at least this much time is left

function isBlockedHost(host) {
  const h = (host || "").toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return true;
  if (h === "::1" || h === "0.0.0.0") return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  return false;
}

// ---------------------------------------------------------------------------------------------
// PROBE runs INSIDE the target page (serialised with .toString()). Keep it self-contained:
// no closures over module scope, plain ES2019 so any Chromium runs it.
// ---------------------------------------------------------------------------------------------
function PROBE() {
  const cs = (el) => getComputedStyle(el);
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    const s = cs(el);
    return r.width > 4 && r.height > 4 && s.visibility !== "hidden" && s.display !== "none" && +s.opacity > 0.1;
  };
  // Normalise any CSS colour (oklch, color-mix, named…) to rgb() by painting one pixel.
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  const norm = (c) => {
    if (!c || c === "transparent") return null;
    cx.clearRect(0, 0, 1, 1);
    cx.fillStyle = "#000";
    cx.fillStyle = c;
    cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    if (d[3] === 0) return null;
    return d[3] < 250
      ? "rgba(" + d[0] + ", " + d[1] + ", " + d[2] + ", " + (d[3] / 255).toFixed(2) + ")"
      : "rgb(" + d[0] + ", " + d[1] + ", " + d[2] + ")";
  };
  const rgbOf = (c) => {
    const m = String(c || "").match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] };
  };
  const opaqueBg = (el) => {
    while (el && el !== document.documentElement) {
      const c = norm(cs(el).backgroundColor);
      const p = rgbOf(c);
      if (p && p.a > 0.5) return c;
      el = el.parentElement;
    }
    return norm(cs(document.documentElement).backgroundColor) || "rgb(255, 255, 255)";
  };
  const pick = (el, keys) => {
    const s = cs(el);
    const o = {};
    keys.forEach((k) => (o[k] = /olor$/.test(k) ? norm(s[k]) : s[k]));
    return o;
  };
  const BTN = ["backgroundColor", "color", "borderTopLeftRadius", "paddingTop", "paddingRight", "fontSize", "fontWeight",
    "fontFamily", "textTransform", "letterSpacing", "borderTopWidth", "borderTopColor", "height"];
  const TXT = ["fontFamily", "fontSize", "fontWeight", "color", "letterSpacing", "textTransform"];
  const label = (b) => (b.innerText || b.value || b.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ");
  const isDis = (b) => !!(b && (b.disabled || b.getAttribute("aria-disabled") === "true"));

  // ---- primary CTA: the real add-to-cart (or the product page's primary action) --------------
  const ctaRe = /add to (bag|cart|basket|trolley)|^buy now$|^notify me$|^select (a )?size$|^add$|in den warenkorb|ajouter au panier|añadir a la cesta|aggiungi al carrello|toevoegen aan winkelwagen|agregar al carrito/i;
  const sane = (b) => {
    const r = b.getBoundingClientRect();
    return r.height >= 28 && r.height <= 90 && r.width <= 700 && cs(b).borderTopStyle !== "outset" &&
      !b.querySelector("img") && label(b).length > 1 &&
      !/cookie|consent|accept( all)?$|reject|agree|got it|newsletter|sign ?up|subscribe/i.test(label(b)) &&
      !b.closest("[id*=cookie i], [class*=cookie i], [id*=consent i], [class*=consent i], [id*=onetrust i]");
  };
  const clickables = Array.from(document.querySelectorAll("button, input[type=submit], a[class*=btn], a[class*=button], [role=button]")).filter(vis);
  let cta = clickables.filter(sane).find((b) => ctaRe.test(label(b)));
  let ctaSource = cta ? "add-to-cart button" : null;
  if (cta && isDis(cta)) {
    // Visible CTA is disabled until a variant is picked: sites usually also ship the enabled
    // state (sticky bar / mobile drawer). Use an enabled, filled add-to-cart button's styles.
    const alt = Array.from(document.querySelectorAll("button, input[type=submit]")).filter((b) =>
      /add to (bag|cart|basket)/i.test(label(b)) && !isDis(b)).find((b) => {
      const p = rgbOf(norm(cs(b).backgroundColor));
      return p && p.a > 0.9 && (p.r + p.g + p.b) / 3 < 235;
    });
    if (alt) { cta = alt; ctaSource = "enabled add-to-cart (visible one was disabled until a size is chosen)"; }
  }
  if (!cta) {
    const filled = clickables.filter(sane).filter((b) => {
      const p = rgbOf(norm(cs(b).backgroundColor));
      return p && p.a > 0.8 && (p.r + p.g + p.b) / 3 < 245;
    }).map((b) => ({ b: b, area: b.getBoundingClientRect().width * b.getBoundingClientRect().height }))
      .sort((x, y) => y.area - x.area);
    if (filled[0]) { cta = filled[0].b; ctaSource = "largest filled button"; }
  }
  let ctaStyle = null;
  if (cta) {
    ctaStyle = pick(cta, BTN);
    ctaStyle.text = label(cta).slice(0, 40);
    ctaStyle.source = ctaSource;
    ctaStyle.disabled = isDis(cta);
  }

  // ---- body text: most-used text styles by character count -----------------------------------
  const tally = {};
  document.querySelectorAll("p, li, span, a, div, td, label").forEach((el) => {
    if (!vis(el)) return;
    const own = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join("");
    if (own.length < 3) return;
    const s = cs(el);
    const k = s.fontFamily + "|" + norm(s.color) + "|" + s.fontSize + "|" + s.fontWeight;
    tally[k] = (tally[k] || 0) + own.length;
  });
  const text = Object.keys(tally).sort((a, b) => tally[b] - tally[a]).slice(0, 6).map((k) => {
    const p = k.split("|");
    return { fontFamily: p[0], color: p[1], fontSize: p[2], fontWeight: p[3], chars: tally[k] };
  });

  // ---- headline: H1 first, else the largest heading-like text ---------------------------------
  const hAll = Array.from(document.querySelectorAll("h1, h2, h3, [class*=heading], [class*=title]")).filter(vis)
    .filter((e) => (e.innerText || "").trim().length > 2 && !/^(cart|basket|bag)\b|\(\d+\)$/i.test((e.innerText || "").trim()));
  const big = hAll.filter((e) => parseFloat(cs(e).fontSize) >= 22).sort((a, b) => parseFloat(cs(b).fontSize) - parseFloat(cs(a).fontSize));
  // Prefer the H1 unless it's much smaller than the page's display headings (e.g. a small hero tagline).
  const h1 = hAll.filter((e) => e.tagName === "H1")[0];
  const bigSize = big[0] ? parseFloat(cs(big[0]).fontSize) : 0;
  const hEl = (h1 && parseFloat(cs(h1).fontSize) >= 0.75 * bigSize ? h1 : big[0]) || h1 || hAll[0];
  const heading = hEl ? Object.assign(pick(hEl, TXT), { tag: hEl.tagName, text: hEl.innerText.trim().slice(0, 50) }) : null;

  // ---- surfaces: painted background colours by visible area (image placeholders excluded) -----
  const surf = {};
  document.querySelectorAll("body *").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 200 || r.height < 30 || r.bottom < 0 || r.top > innerHeight * 3) return;
    const c = norm(cs(el).backgroundColor);
    const p = rgbOf(c);
    if (!p || p.a < 0.9) return;
    let media = 0;
    el.querySelectorAll("img, video, picture, canvas, iframe").forEach((m) => {
      const q = m.getBoundingClientRect();
      media += q.width * q.height;
    });
    if (media > 0.4 * r.width * r.height) return;
    surf[c] = (surf[c] || 0) + r.width * Math.min(r.height, 800);
  });
  const surfaces = Object.keys(surf).sort((a, b) => surf[b] - surf[a]).slice(0, 8).map((c) => ({ color: c, area: Math.round(surf[c]) }));

  // ---- card / image radii --------------------------------------------------------------------
  const radii = {};
  document.querySelectorAll("[class*=card], [class*=product] img, [class*=tile], [class*=panel]").forEach((el) => {
    if (!vis(el)) return;
    const r = cs(el).borderTopLeftRadius;
    if (r && r !== "0px" && /px$/.test(r) && parseFloat(r) <= 40) radii[r] = (radii[r] || 0) + 1;
  });

  // ---- fonts the browser actually loaded, and the files behind them ---------------------------
  const loaded = [];
  document.fonts.forEach((f) => {
    if (f.status === "loaded") loaded.push({ family: f.family.replace(/["']/g, ""), weight: String(f.weight), style: f.style });
  });
  const faces = [];
  const absSrc = (src, base) => src.replace(/url\(\s*["']?([^"')]+)["']?\s*\)/g, (m, u) => {
    try { return 'url("' + new URL(u, base).href + '")'; } catch (e) { return m; }
  });
  const walk = (rules, base) => {
    for (const r of rules) {
      if (r.type === 5) {
        faces.push({
          family: r.style.getPropertyValue("font-family").replace(/["']/g, "").trim(),
          weight: r.style.getPropertyValue("font-weight") || "400",
          style: r.style.getPropertyValue("font-style") || "normal",
          src: absSrc(r.style.getPropertyValue("src"), base).replace(/local\([^)]*\),?\s*/g, "").slice(0, 600),
        });
      } else if (r.cssRules) {
        try { walk(r.cssRules, base); } catch (e) {}
      }
    }
  };
  for (const ss of Array.from(document.styleSheets)) {
    let rules;
    try { rules = ss.cssRules; } catch (e) { continue; } // cross-origin sheet without CORS
    walk(rules, ss.href || location.href);
  }

  // ---- product (JSON-LD, then Open Graph) ------------------------------------------------------
  let product = null;
  const findP = (n, d) => {
    if (!n || d > 6) return null;
    if (Array.isArray(n)) { for (const x of n) { const f = findP(x, d + 1); if (f) return f; } return null; }
    if (typeof n !== "object") return null;
    const t = [].concat(n["@type"] || []).join(" ");
    if (/\bProduct\b/.test(t)) return n;
    return n["@graph"] ? findP(n["@graph"], d + 1) : null;
  };
  for (const s of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
    try {
      const p = findP(JSON.parse(s.textContent), 0);
      if (!p) continue;
      let off = [].concat(p.offers || [])[0] || {};
      if (off.offers) off = [].concat(off.offers)[0] || {};
      let img = [].concat(p.image || [])[0];
      if (img && typeof img === "object") img = img.url || img.contentUrl;
      product = { name: p.name || "", image: img || "", price: off.price != null ? String(off.price) : (off.lowPrice != null ? String(off.lowPrice) : ""), oldPrice: "", currency: off.priceCurrency || "" };
      break;
    } catch (e) {}
  }
  if (!product) {
    const og = (k) => (document.querySelector('meta[property="' + k + '"]') || {}).content || "";
    if (og("og:type") === "product" || og("product:price:amount"))
      product = { name: og("og:title"), image: og("og:image"), price: og("product:price:amount"), oldPrice: "", currency: og("product:price:currency") };
  }

  // ---- a product page to hop to, when this page has no add-to-cart -----------------------------
  // Hop whenever this isn't a product page (no Product data) — a homepage's quick-add buttons and
  // hero taglines are a worse source than the real product page.
  let productUrl = null;
  if (!product || !ctaSource || ctaSource === "largest filled button") {
    const links = Array.from(document.querySelectorAll("a[href]")).map((a) => a.href).filter((h) => h.indexOf(location.origin) === 0);
    const pats = [/\/products\/[^/?#]+$/, /\/products?\/[^?#]+/, /\/p\/[^?#]+/, /-p\d+(\.html)?$|\/dp\//];
    for (const re of pats) { const f = links.find((h) => re.test(h)); if (f) { productUrl = f; break; } }
  }

  const bodyText = (document.body && document.body.innerText) || "";
  return {
    href: location.href,
    title: document.title,
    textLength: bodyText.trim().length,
    challenge: /just a moment|attention required|verify you are human|access denied|captcha/i.test(bodyText.slice(0, 600)),
    pageBg: opaqueBg(document.querySelector("main") || document.body),
    cta: ctaStyle,
    text: text,
    heading: heading,
    surfaces: surfaces,
    radii: Object.keys(radii).sort((a, b) => radii[b] - radii[a]).slice(0, 4),
    loaded: loaded,
    faces: faces.slice(0, 60),
    product: product,
    productUrl: productUrl,
    themeColor: (document.querySelector("meta[name=theme-color]") || {}).content || null,
  };
}
const PROBE_SRC = "(" + PROBE.toString() + ")()";

async function firecrawl(url, timeoutMs, apiKey) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs + 3000);
  try {
    const headers = { "Content-Type": "application/json" };
    if (apiKey) headers.Authorization = "Bearer " + apiKey;
    const r = await fetch(FIRECRAWL_URL, {
      method: "POST",
      signal: ctrl.signal,
      headers,
      body: JSON.stringify({
        url,
        formats: ["branding"], // Firecrawl's own brand summary, kept as a cross-check
        onlyMainContent: false,
        blockAds: true,
        proxy: "auto", // basic first, stealth automatically when the site blocks bots
        timeout: timeoutMs,
        actions: [
          { type: "wait", milliseconds: 2500 },
          { type: "executeJavascript", script: PROBE_SRC },
        ],
      }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok || !body.success) {
      return { ok: false, status: r.status, error: (body && (body.error || body.message)) || "HTTP " + r.status };
    }
    const d = body.data || {};
    const ret = ((d.actions || {}).javascriptReturns || [])[0];
    return {
      ok: true,
      probe: ret && ret.value && typeof ret.value === "object" ? ret.value : null,
      branding: d.branding || null,
      proxyUsed: (d.metadata || {}).proxyUsed || null,
      credits: (d.metadata || {}).creditsUsed || null,
      statusCode: (d.metadata || {}).statusCode || null,
    };
  } catch (e) {
    return { ok: false, status: 0, error: e && e.name === "AbortError" ? "Timed out" : String(e && e.message ? e.message : e) };
  } finally {
    clearTimeout(t);
  }
}

module.exports = async (req, res) => {
  const started = Date.now();
  const gate = (process.env.BRAND_STUDIO_PASSPHRASE || "").trim();
  if (gate) {
    const provided = (req.headers["x-brand-passphrase"] || "").trim();
    if (provided !== gate) {
      res.status(401).json({ error: { message: "Invalid or missing passphrase" } });
      return;
    }
  }
  let target = String((req.query && req.query.url) || "").trim();
  if (!target) { res.status(400).json({ error: { message: "Missing ?url=" } }); return; }
  if (!/^https?:\/\//i.test(target)) target = "https://" + target;
  let pageUrl;
  try { pageUrl = new URL(target); } catch (e) { res.status(400).json({ error: { message: "Invalid URL" } }); return; }
  if (!/^https?:$/.test(pageUrl.protocol) || isBlockedHost(pageUrl.hostname)) {
    res.status(400).json({ error: { message: "Refusing to fetch that URL" } });
    return;
  }

  const apiKey = (process.env.FIRECRAWL_API_KEY || "").trim();
  const first = await firecrawl(pageUrl.href, FIRST_TIMEOUT_MS, apiKey);
  if (!first.ok || !first.probe) {
    res.status(first.status === 429 ? 429 : 502).json({
      error: { message: "Rendered scrape failed: " + (first.error || "no data returned") + (apiKey ? "" : " (no FIRECRAWL_API_KEY set — keyless tier is rate-limited)") },
    });
    return;
  }
  const pages = [{ url: pageUrl.href, probe: first.probe, branding: first.branding, proxyUsed: first.proxyUsed }];
  let credits = first.credits || 0;

  // No add-to-cart here (e.g. a homepage)? Hop to a product page if there's time left.
  const left = TOTAL_BUDGET_MS - (Date.now() - started);
  if (first.probe.productUrl && left > MIN_SECOND_MS) {
    const second = await firecrawl(first.probe.productUrl, Math.min(left - 3000, 30000), apiKey);
    if (second.ok && second.probe) {
      pages.push({ url: first.probe.productUrl, probe: second.probe, branding: second.branding, proxyUsed: second.proxyUsed });
      credits += second.credits || 0;
    }
  }

  res.status(200).json({
    method: "rendered",
    pages, // [entry page, product page?] — the client prefers the product page's CTA/headline
    keyless: !apiKey,
    credits,
    ms: Date.now() - started,
  });
};

module.exports.PROBE = PROBE; // exported for local testing
