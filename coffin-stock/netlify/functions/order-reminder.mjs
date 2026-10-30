// Daily 7:00am (Brisbane) check. On a supplier's order day, or the day before,
// emails a reminder with what is short, at reorder level, or not covered.
// Sends through EmailJS (same service as the timesheet app).
//
// Environment variables (Netlify > Site configuration > Environment variables):
//   EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY
//   REMINDER_TO   - comma-separated email addresses
//   APP_URL       - optional, link included in the email
import { getStore } from "@netlify/blobs";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const isoDays = (iso) => Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000);
const brisbaneISO = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Brisbane" }).format(new Date());

// Days until the supplier's next order day (0 = today), or null if not set.
function daysUntilOrder(s) {
  const today = isoDays(brisbaneISO());
  if (s.frequency === "fortnightly") {
    if (!s.anchor_date) return null;
    return (((isoDays(s.anchor_date) - today) % 14) + 14) % 14;
  }
  const od = DAYS.indexOf(s.order_day);
  if (od < 0) return null;
  const dow = new Date(today * 86400000).getUTCDay();
  return (od - dow + 7) % 7;
}

function analyse(state) {
  const lines = [];
  const need = {}, onOrder = {};
  for (const q of state.requirements || []) need[q.modelId] = (need[q.modelId] || 0) + 1;
  for (const o of state.orders || []) if (o.status === "open")
    for (const l of o.lines || []) onOrder[l.modelId] = (onOrder[l.modelId] || 0) + Math.max(0, (l.qty || 0) - (l.received || 0));
  for (const m of state.models || []) {
    let total = 0, counted = 0, low = [];
    for (const a of state.areas) {
      const c = state.stock?.[m.id]?.[a] || {};
      if (c.on_hand != null) { total += c.on_hand; counted++; }
      if (c.on_hand != null && c.reorder_at != null && c.on_hand <= c.reorder_at) low.push(`${a} ${c.on_hand} (reorder at ${c.reorder_at})`);
    }
    const committed = need[m.id] || 0, oo = onOrder[m.id] || 0;
    const free = counted ? total - committed : null;
    const ooTxt = oo ? `, on order ${oo}` : "";
    if (free != null && free + oo < 0) lines.push({ supplier: m.supplier, text: `SHORT  ${m.name}: on hand ${total}, booked ${committed}${ooTxt}, short ${-(free + oo)}` });
    else if (low.length) lines.push({ supplier: m.supplier, text: `REORDER  ${m.name}: ${low.join("; ")}${ooTxt}` });
  }
  const tbc = (state.requirements || []).filter((q) => !q.date).length;
  if (tbc) lines.push({ supplier: "*", text: `${tbc} funeral(s) arranged with date TBC — coffins counted as needed any day` });
  return lines;
}

export default async () => {
  const store = getStore({ name: "coffin-stock", consistency: "strong" });
  const state = await store.get("state", { type: "json" });
  if (!state) return;

  const due = (state.schedule || []).map((s) => ({ ...s, until: daysUntilOrder(s) })).filter((s) => s.until === 0 || s.until === 1);
  if (!due.length) return;

  const lines = analyse(state);
  const parts = [];
  for (const s of due) {
    const when = s.until === 0 ? "TODAY" : "TOMORROW";
    parts.push(`${s.supplier} order due ${when} (${s.order_day} ${s.order_time || ""}${s.frequency === "fortnightly" ? ", fortnightly" : ""}). Delivery ${s.delivery_day || "TBC"} ${s.delivery_time || ""}.`.replace(/\s+/g, " "));
    const mine = lines.filter((l) => l.supplier === s.supplier || l.supplier === "*").map((l) => "  - " + l.text);
    parts.push(mine.length ? mine.join("\n") : "  - Nothing flagged as short or at reorder level. Check the app before ordering.");
    parts.push("");
  }
  const url = Netlify.env.get("APP_URL");
  if (url) parts.push(`Open the stock app: ${url}`);

  const subject = `Coffin order reminder – ${due.map((s) => s.supplier + (s.until === 0 ? " today" : " tomorrow")).join(", ")}`;
  const to = (Netlify.env.get("REMINDER_TO") || "").split(",").map((x) => x.trim()).filter(Boolean);

  for (const email of to) {
    const r = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        service_id: Netlify.env.get("EMAILJS_SERVICE_ID"),
        template_id: Netlify.env.get("EMAILJS_TEMPLATE_ID"),
        user_id: Netlify.env.get("EMAILJS_PUBLIC_KEY"),
        accessToken: Netlify.env.get("EMAILJS_PRIVATE_KEY"),
        template_params: { to_email: email, subject, message: parts.join("\n") },
      }),
    });
    if (!r.ok) console.error("EmailJS failed", email, r.status, await r.text());
  }
};

// 21:00 UTC = 07:00 Brisbane (no daylight saving in QLD)
export const config = { schedule: "0 21 * * *" };
