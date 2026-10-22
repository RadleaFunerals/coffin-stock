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

function brisbaneDay(offset = 0) {
  const name = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Brisbane", weekday: "long" }).format(new Date());
  return DAYS[(DAYS.indexOf(name) + offset) % 7];
}

function analyse(state) {
  const lines = [];
  const need = {};
  for (const q of state.requirements || []) need[q.modelId] = (need[q.modelId] || 0) + 1;
  for (const m of state.models || []) {
    let total = 0, counted = 0, low = [];
    for (const a of state.areas) {
      const c = state.stock?.[m.id]?.[a] || {};
      if (c.on_hand != null) { total += c.on_hand; counted++; }
      if (c.on_hand != null && c.reorder_at != null && c.on_hand <= c.reorder_at) low.push(`${a} ${c.on_hand} (reorder at ${c.reorder_at})`);
    }
    const committed = need[m.id] || 0;
    const free = counted ? total - committed : null;
    if (free != null && free < 0) lines.push({ supplier: m.supplier, text: `SHORT  ${m.name}: on hand ${total}, booked ${committed}, short ${-free}` });
    else if (low.length) lines.push({ supplier: m.supplier, text: `REORDER  ${m.name}: ${low.join("; ")}` });
  }
  return lines;
}

export default async () => {
  const store = getStore({ name: "coffin-stock", consistency: "strong" });
  const state = await store.get("state", { type: "json" });
  if (!state) return;

  const today = brisbaneDay(0), tomorrow = brisbaneDay(1);
  const due = (state.schedule || []).filter((s) => s.order_day === today || s.order_day === tomorrow);
  if (!due.length) return;

  const lines = analyse(state);
  const parts = [];
  for (const s of due) {
    const when = s.order_day === today ? "TODAY" : "TOMORROW";
    parts.push(`${s.supplier} order due ${when} (${s.order_day} ${s.order_time || ""}). Delivery ${s.delivery_day || "TBC"} ${s.delivery_time || ""}.`.replace(/\s+/g, " "));
    const mine = lines.filter((l) => l.supplier === s.supplier).map((l) => "  - " + l.text);
    parts.push(mine.length ? mine.join("\n") : "  - Nothing flagged as short or at reorder level. Check the app before ordering.");
    parts.push("");
  }
  const url = Netlify.env.get("APP_URL");
  if (url) parts.push(`Open the stock app: ${url}`);

  const subject = `Coffin order reminder – ${due.map((s) => s.supplier + (s.order_day === today ? " today" : " tomorrow")).join(", ")}`;
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
