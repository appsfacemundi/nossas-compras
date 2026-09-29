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
  if (obj && obj.ok === false) console.log("reject", code, obj.error);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": ORIGIN, "Vary": "Origin", "Access-Control-Allow-Methods": "POST, GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" });
  res.end(JSON.stringify(obj));
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));


const hex = (v, d) => /^#[0-9a-fA-F]{6}$/.test(String(v || "")) ? v : d;
const LOGO_URL = ORIGIN + "/logo.png";
function buildHtml(p) {
  const cats = Array.isArray(p.cats) ? p.cats.slice(0, 8) : [];
  const date = esc(String(p.date || "").slice(0, 40));
  const total = Math.min(parseInt(p.total, 10) || 0, 500);
  let body = "";
  for (const c of cats) {
    const col = hex(c.c, "#c2410c"), soft = hex(c.s, "#ffedd5");
    const items = Array.isArray(c.items) ? c.items.slice(0, 100) : [];
    if (!items.length) continue;
    body += `<tr><td style="padding:22px 24px 0"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-radius:16px;overflow:hidden;background:#ffffff;border:2px solid ${soft}">
      <tr><td style="background:${col};padding:12px 18px;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:.3px">${esc(String(c.e || "").slice(0, 8))}&nbsp; ${esc(String(c.name || "").slice(0, 40))} <span style="float:right;font-weight:600;opacity:.9">${items.length}</span></td></tr>`;
    items.forEach((it, i) => {
      const note = it.note ? `<div style="margin-top:4px;font-size:14px;color:#475569;font-weight:600">${esc(String(it.note).slice(0, 140))}</div>` : "";
      const best = it.best ? `<div style="margin-top:4px;font-size:13px;color:#15803d;font-weight:600">💡 ${esc(String(it.best).slice(0, 120))}</div>` : "";
      body += `<tr><td style="padding:12px 18px;${i ? "border-top:1px solid " + soft : ""}"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
        <td width="60" valign="middle"><div style="width:52px;height:52px;line-height:52px;border-radius:26px;background:${soft};text-align:center;font-size:30px">${esc(String(it.e || "🛒").slice(0, 8))}</div></td>
        <td valign="middle" style="font-size:19px;font-weight:700;color:#1f2937;padding-left:6px">${esc(String(it.name || "").slice(0, 80))}${note}${best}</td>
        <td width="86" align="right" valign="middle"><span style="display:inline-block;background:${col};color:#ffffff;font-size:18px;font-weight:800;border-radius:999px;padding:7px 16px;white-space:nowrap">× ${esc(String(it.qty || "1").slice(0, 10))}</span></td>
      </tr></table></td></tr>`;
    });
    body += `</table></td></tr>`;
  }
  const save = String(p.save || "").slice(0, 40);
  const savebox = save ? `<tr><td style="padding:22px 24px 0"><div style="background:#dcfce7;border:2px solid #86efac;border-radius:16px;padding:16px 18px;color:#14532d;font-size:17px;line-height:1.4"><b>💰 Poupança possível: ${esc(save)}</b><br><span style="font-size:14px">Comprando cada artigo no mercado mais barato que registaste.</span></div></td></tr>` : "";
  const rep = Array.isArray(p.report) ? p.report.slice(0, 14).map(l => String(l).slice(0, 400)) : [];
  const repbox = rep.length ? `<tr><td style="padding:22px 24px 0"><div style="background:#ffffff;border:2px solid #fcd34d;border-radius:16px;padding:16px 18px;color:#1f2937;font-size:16px;line-height:1.5"><div style="font-size:18px;font-weight:800;margin-bottom:8px">📊 Comparação de preços</div>${rep.map((l, i) => `<div style="padding:6px 0;${i ? "border-top:1px dashed #fde68a" : ""}">${esc(l)}</div>`).join("")}</div></td></tr>` : "";
  return `<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"></head>
<body style="margin:0;padding:0;background:#fff8ee;font-family:'Segoe UI',system-ui,-apple-system,Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fff8ee"><tr><td align="center" style="padding:16px 8px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff8ee">
<tr><td style="background:#ff8a5c;background-image:linear-gradient(135deg,#ffb347,#ff5f8f);border-radius:22px;padding:24px;text-align:center">
  <img src="${LOGO_URL}" width="120" alt="Família Manico 360º" style="display:block;margin:0 auto 12px;border-radius:18px;background:#ffffff;max-width:120px;height:auto">
  <div style="font-size:30px;font-weight:800;color:#ffffff;line-height:1.15">${esc(String(p.head || "🛒 Nossas Compras").slice(0, 60))}</div>
  ${p.sub ? `<div style="font-size:19px;font-weight:700;color:#ffffff;margin-top:6px">${esc(String(p.sub).slice(0, 120))}</div>` : ""}
  <div style="font-size:16px;color:#ffffff;opacity:.95;margin-top:6px">${date}</div>
  <div style="display:inline-block;margin-top:14px;background:#ffffff;color:#c2410c;font-weight:800;font-size:16px;border-radius:999px;padding:7px 18px">${total} ${total === 1 ? "artigo" : "artigos"} na lista</div>
</td></tr>
${body}${repbox}${savebox}
<tr><td style="padding:24px;text-align:center;color:#6b7280;font-size:13px">Enviado pela app <b>Nossas Compras</b> · Família Manico 360º<br>Boas compras! 🧺</td></tr>
</table></td></tr></table></body></html>`;
}

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
        body: JSON.stringify({ from: FROM, to, subject, text, html: (b.payload && typeof b.payload === "object") ? buildHtml(b.payload) : `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;white-space:pre-wrap">${esc(text)}</div>` })
      });
      if (!r.ok) { console.error("resend", r.status, await r.text()); return send(res, 502, { ok: false, error: "provider" }); }
      return send(res, 200, { ok: true });
    } catch (e) { console.error(e); return send(res, 502, { ok: false, error: "provider" }); }
  });
}).listen(PORT, () => console.log("nossas-compras-api on " + PORT));
