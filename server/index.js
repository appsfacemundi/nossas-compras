// Nossas Compras — pequeno servidor que envia a lista por e-mail (via Resend).
// Variáveis de ambiente (definidas no Render, nunca no código):
//   RESEND_API_KEY  chave da conta Resend (obrigatória)
//   ALLOWED_TO      endereços de destino permitidos, separados por vírgula (obrigatória)
//   FROM_EMAIL      remetente (opcional; por omissão onboarding@resend.dev)
//   ALLOWED_ORIGIN  origem do site (opcional; por omissão https://nossas-compras.onrender.com)
const http = require("http");

const KEY = process.env.RESEND_API_KEY || "";
const ALLOWED_TO = (process.env.ALLOWED_TO || "").split(/[,;\s]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
const FROM = process.env.FROM_EMAIL || "Nossas Compras <onboarding@resend.dev>";
const ORIGIN = process.env.ALLOWED_ORIGIN || "https://nossas-compras.onrender.com";
const PORT = process.env.PORT || 10000;

const hits = []; // limite simples: 30 envios por hora
function limited() { const now = Date.now(); while (hits.length && now - hits[0] > 3600e3) hits.shift(); if (hits.length >= 30) return true; hits.push(now); return false; }

function send(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": ORIGIN, "Vary": "Origin", "Access-Control-Allow-Methods": "POST, GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" });
  res.end(JSON.stringify(obj));
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

http.createServer((req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, {});
  if (req.method === "GET" && (req.url === "/" || req.url === "/health")) return send(res, 200, { ok: true, ready: !!KEY && ALLOWED_TO.length > 0 });
  if (req.method !== "POST" || req.url !== "/send") return send(res, 404, { ok: false, error: "not_found" });
  if (req.headers.origin && req.headers.origin !== ORIGIN) return send(res, 403, { ok: false, error: "origin" });
  let raw = "";
  req.on("data", c => { raw += c; if (raw.length > 30000) req.destroy(); });
  req.on("end", async () => {
    let b; try { b = JSON.parse(raw); } catch (_) { return send(res, 400, { ok: false, error: "json" }); }
    if (!KEY || !ALLOWED_TO.length) return send(res, 503, { ok: false, error: "not_configured" });
    const to = String(b.to || "").split(/[,;\s]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
    const text = String(b.text || "").slice(0, 8000), subject = String(b.subject || "Lista de compras").slice(0, 200);
    if (!to.length || !text) return send(res, 400, { ok: false, error: "empty" });
    if (to.some(a => !ALLOWED_TO.includes(a))) return send(res, 403, { ok: false, error: "recipient_not_allowed" });
    if (limited()) return send(res, 429, { ok: false, error: "rate_limited" });
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": "Bearer " + KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM, to, subject, text, html: `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;white-space:pre-wrap">${esc(text)}</div>` })
      });
      if (!r.ok) { console.error("resend", r.status, await r.text()); return send(res, 502, { ok: false, error: "provider" }); }
      return send(res, 200, { ok: true });
    } catch (e) { console.error(e); return send(res, 502, { ok: false, error: "provider" }); }
  });
}).listen(PORT, () => console.log("nossas-compras-api on " + PORT));
