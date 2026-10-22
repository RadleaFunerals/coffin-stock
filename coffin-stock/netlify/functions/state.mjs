// Shared state for the Coffin Stock app.
// GET  /api/state            -> current state (or null if never saved)
// PUT  /api/state {version, state} -> saves if version matches, else 409 with current
// Every request must carry header x-app-pin matching the APP_PIN environment variable.
import { getStore } from "@netlify/blobs";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export default async (req) => {
  const pin = Netlify.env.get("APP_PIN");
  if (!pin) return json({ error: "APP_PIN is not set on the Netlify site." }, 500);
  if (req.headers.get("x-app-pin") !== pin) return json({ error: "Wrong PIN" }, 401);

  const store = getStore({ name: "coffin-stock", consistency: "strong" });
  const current = await store.get("state", { type: "json" });

  if (req.method === "GET") return json(current ?? null);

  if (req.method === "PUT") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "Bad JSON" }, 400); }
    const curVersion = current?.version ?? 0;
    if (body?.version !== curVersion) return json({ error: "Changed by someone else", current }, 409);
    const next = { ...body.state, version: curVersion + 1, updatedAt: new Date().toISOString() };
    await store.setJSON("state", next);
    // Keep a dated backup of each day's last state (cheap insurance for a manual system).
    await store.setJSON(`backup-${next.updatedAt.slice(0, 10)}`, next);
    return json(next);
  }

  return json({ error: "Method not allowed" }, 405);
};

export const config = { path: "/api/state" };
