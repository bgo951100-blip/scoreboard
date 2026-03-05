const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,X-Admin-Token",
  "Cache-Control": "no-store"
};

const DEFAULT_STATE = {
  gameId: 1,
  periodIndex: 1,
  home: { name: "ทีมเหย้า", score: 0, fouls: 0, timeouts: 2 },
  away: { name: "ทีมเยือน", score: 0, fouls: 0, timeouts: 2 },
  possession: "home",
  gameClockT: 10 * 60 * 10,
  shotPreset: 24,
  shotClockT: 24 * 10,
  running: false,
  muted: false,
  hornAt: 0
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders
    }
  });
}

function normalizeState(input) {
  const base = JSON.parse(JSON.stringify(DEFAULT_STATE));
  if (!input || typeof input !== "object") return base;
  Object.assign(base, input);
  if (input.home && typeof input.home === "object") {
    base.home = { ...base.home, ...input.home };
  }
  if (input.away && typeof input.away === "object") {
    base.away = { ...base.away, ...input.away };
  }
  return base;
}

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") {
    return new Response("", { status: 204, headers: corsHeaders });
  }

  if (!env.SCOREBOARD) {
    return json({ ok: false, error: "Missing KV binding: SCOREBOARD" }, 500);
  }

  if (request.method === "GET") {
    const raw = await env.SCOREBOARD.get("state");
    let payload = null;
    if (raw) {
      try {
        payload = JSON.parse(raw);
      } catch (e) {
        payload = null;
      }
    }
    if (!payload || !payload.state) {
      payload = { state: DEFAULT_STATE, rev: 0, updatedAt: 0 };
    }
    return json({ ok: true, ...payload, serverTime: Date.now() });
  }

  if (request.method === "POST") {
    const requiredToken = env.ADMIN_TOKEN;
    const providedToken = request.headers.get("X-Admin-Token") || "";
    if (requiredToken && providedToken !== requiredToken) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    let body = null;
    try {
      body = await request.json();
    } catch (e) {
      return json({ ok: false, error: "Invalid JSON" }, 400);
    }

    const incoming = body && body.state ? body.state : body;
    const nextState = normalizeState(incoming);

    let rev = 0;
    const prevRaw = await env.SCOREBOARD.get("state");
    if (prevRaw) {
      try {
        rev = JSON.parse(prevRaw).rev || 0;
      } catch (e) {
        rev = 0;
      }
    }

    const now = Date.now();
    const payload = { state: nextState, rev: rev + 1, updatedAt: now };
    await env.SCOREBOARD.put("state", JSON.stringify(payload));
    return json({ ok: true, ...payload, serverTime: now });
  }

  return json({ ok: false, error: "Method not allowed" }, 405);
}
