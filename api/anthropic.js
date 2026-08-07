// Vercel serverless function: same-origin proxy to the Anthropic API.
// The real Anthropic key lives ONLY here, in process.env.ANTHROPIC_API_KEY — it never ships
// to the browser. Callers authenticate with a shared passphrase (process.env.BRAND_STUDIO_PASSPHRASE),
// sent as the x-brand-passphrase header; the proxy checks it, then calls Anthropic server-to-server.
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: { message: "POST only" } });
    return;
  }

  // Real key: prefer the server env var; fall back to a caller-supplied header (local dev only).
  const apiKey = process.env.ANTHROPIC_API_KEY || req.headers["x-api-key"];
  const gate = process.env.BRAND_STUDIO_PASSPHRASE;

  // If a passphrase is configured, require the caller to present the matching one.
  if (gate) {
    const provided = req.headers["x-brand-passphrase"] || "";
    if (provided !== gate) {
      res.status(401).json({ error: { message: "Invalid or missing passphrase" } });
      return;
    }
  }

  if (!apiKey) {
    res.status(400).json({ error: { message: "Server API key not configured (set ANTHROPIC_API_KEY in Vercel)." } });
    return;
  }

  try {
    const body = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": req.headers["anthropic-version"] || "2023-06-01",
      },
      body: body,
    });
    const text = await upstream.text();
    res.status(upstream.status).setHeader("content-type", "application/json").send(text);
  } catch (e) {
    res.status(502).json({ error: { message: "Proxy error: " + String(e) } });
  }
};
