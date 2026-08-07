// Vercel serverless function: same-origin proxy to the Anthropic API.
// The browser calls /api/anthropic (no CORS) with its own x-api-key header; this relays to
// Anthropic server-to-server (no CORS there). The key is the user's own, sent over https.
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: { message: "POST only" } });
    return;
  }
  const apiKey = req.headers["x-api-key"];
  if (!apiKey) {
    res.status(400).json({ error: { message: "Missing x-api-key header" } });
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
