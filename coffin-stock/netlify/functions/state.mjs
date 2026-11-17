// Shared state for the Coffin Stock app.
// GET  /api/state                   -> { role, state }  (state is null if never saved)
// PUT  /api/state {version, state}  -> saved state, or 409 with current if someone else saved first
//
// Every request carries header x-app-pin.
//   APP_PIN      (required) staff PIN: may only add / edit / delete funerals (and their history).
//   MANAGER_PIN  (optional) manager PIN: full access. If not set, APP_PIN has full access.
import { getStore } from "@netlify/blobs";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

// Fields staff are allowed to change. Everything else must stay exactly as it was.
const STAFF_EDITABLE = new Set(["requirements", "archive", "log", "version", "updatedAt"]);

function staffChangesAllowed(current, next) {
  if (!current) return true; // first-ever save (app setting itself up)
  const keys = new Set([...Object.keys(current), ...Object.keys(next)]);
  for (const k of keys) {
    if (STAFF_EDITABLE.has(k)) continue;
    if (JSON.stringify(current[k] ?? null) !== JSON.stringify(next[k] ?? null)) return false;
  }
  return true;
}

export default async (req) => {
  const staffPin = Netlify.env.get("APP_PIN");
  const managerPin = Netlify.env.get("MANAGER_PIN");
  if (!staffPin) return json({ error: "APP_PIN is not set on the Netlify site." }, 500);

  const pin = req.headers.get("x-app-pin") || "";
  let role = null;
  if (managerPin && pin === managerPin) role = "manager";
  else if (pin === staffPin) role = managerPin ? "staff" : "manager";
  if (!role) return json({ error: "Wrong PIN" }, 401);

  const store = getStore({ name: "coffin-stock", consistency: "strong" });
  const current = await store.get("state", { type: "json" });

  if (req.method === "GET") return json({ role, state: current ?? null });

  if (req.method === "PUT") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "Bad JSON" }, 400); }
    const curVersion = current?.version ?? 0;
    if (body?.version !== curVersion) return json({ error: "Changed by someone else", current }, 409);
    if (role === "staff" && !staffChangesAllowed(current, body.state || {}))
      return json({ error: "Only managers can change stock, orders or settings." }, 403);
    const next = { ...body.state, version: curVersion + 1, updatedAt: new Date().toISOString() };
    await store.setJSON("state", next);
    // Keep a dated backup of each day's last state.
    await store.setJSON(`backup-${next.updatedAt.slice(0, 10)}`, next);
    return json(next);
  }

  return json({ error: "Method not allowed" }, 405);
};

export const config = { path: "/api/state" };
