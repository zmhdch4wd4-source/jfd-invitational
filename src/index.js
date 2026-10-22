// JFD 70's Invitational — serveur
// Trois rôles : administrateur (code), marqueur (jeton de partie), lecteur (rien).
import { ROUNDS, PLAYERS } from "./courses.js";

const JSONH = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: JSONH });
const bad = (m, s = 400) => json({ error: m }, s);

/* ------------------------------------------------------------------ base */
let ready = false;
async function init(db) {
  if (ready) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS scores (
        round TEXT NOT NULL, player TEXT NOT NULL, hole INTEGER NOT NULL,
        strokes INTEGER NOT NULL, PRIMARY KEY (round, player, hole))`),
    db.prepare(`CREATE TABLE IF NOT EXISTS announces (
        round TEXT NOT NULL, player TEXT NOT NULL, value INTEGER NOT NULL,
        PRIMARY KEY (round, player))`),
  ]);
  ready = true;
}
async function getSetting(db, key, fallback) {
  const r = await db.prepare(`SELECT value FROM settings WHERE key = ?`).bind(key).first();
  if (!r) return fallback;
  try { return JSON.parse(r.value); } catch { return fallback; }
}
const setSetting = (db, key, value) =>
  db.prepare(`INSERT INTO settings (key, value) VALUES (?1, ?2)
              ON CONFLICT(key) DO UPDATE SET value = ?2`).bind(key, JSON.stringify(value)).run();

/* ------------------------------------------------------------ sécurité */
async function sha(text) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
function token(n = 12) {
  const a = "abcdefghjkmnpqrstuvwxyz23456789";
  return [...crypto.getRandomValues(new Uint8Array(n))].map((x) => a[x % a.length]).join("");
}
/**
 * Résout le rôle du porteur :
 *   "admin"                                   — le code d'administration
 *   {kind:"marker", id, grants:[{round,flight}]} — désigné marqueur, ou porteur d'un jeton
 *   {kind:"player", id}                       — identifié, mais ne marque rien aujourd'hui
 *   null                                      — anonyme
 */
async function auth(req, db) {
  const h = req.headers.get("x-jfd-auth") || "";
  if (h.startsWith("admin:")) {
    const stored = await getSetting(db, "adminHash", null);
    if (stored && (await sha(h.slice(6))) === stored) return "admin";
    return null;
  }
  const flights = await getSetting(db, "flights", {});
  const grantsFor = (test) => {
    const g = [];
    for (const [round, list] of Object.entries(flights))
      for (const f of list) if (test(f)) g.push({ round, flight: f });
    return g;
  };
  if (h.startsWith("token:")) {
    const t = h.slice(6);
    const g = grantsFor((f) => f.token === t);
    return g.length ? { kind: "marker", id: g[0].flight.marker, grants: g } : null;
  }
  if (h.startsWith("player:")) {
    const id = h.slice(7);
    const players = await getSetting(db, "players", PLAYERS);
    if (!players.some((p) => p.id === id)) return null;
    const g = grantsFor((f) => f.marker === id);
    return g.length ? { kind: "marker", id, grants: g } : { kind: "player", id };
  }
  return null;
}
/** Un marqueur n'écrit que pour les joueurs de sa partie, et seulement sur la journée concernée. */
function mayWrite(role, round, player) {
  if (role === "admin") return true;
  if (!role || role.kind !== "marker") return false;
  return role.grants.some((g) => g.round === round && g.flight.players.includes(player));
}

/* -------------------------------------------------------------- lecture */
async function readState(db, role) {
  const [players, teamMode, r1pars, flights, adminHash, proposals, sc, an] = await Promise.all([
    getSetting(db, "players", PLAYERS),
    getSetting(db, "teamMode", "best4"),
    getSetting(db, "r1pars", null),
    getSetting(db, "flights", {}),
    getSetting(db, "adminHash", null),
    getSetting(db, "proposals", {}),
    db.prepare(`SELECT round, player, hole, strokes FROM scores`).all(),
    db.prepare(`SELECT round, player, value FROM announces`).all(),
  ]);
  const rounds = ROUNDS.map((R) =>
    R.id === "r1" && Array.isArray(r1pars)
      ? { ...R, trous: R.trous.map((t, i) => ({ ...t, par: r1pars[i] ?? t.par })) }
      : R);

  const scores = {};
  for (const r of sc.results || []) {
    const k = r.round + "-" + r.player;
    (scores[k] || (scores[k] = {}))[r.hole] = r.strokes;
  }
  const announces = {};
  for (const r of an.results || []) announces[r.round + "-" + r.player] = r.value;

  // Les jetons ne sortent que pour l'administrateur.
  const safeFlights = {};
  for (const [round, list] of Object.entries(flights))
    safeFlights[round] = list.map((f) =>
      role === "admin" ? f : { id: f.id, players: f.players, marker: f.marker });

  const meId = role && role !== "admin" ? role.id : null;
  const mePl = meId ? players.find((p) => p.id === meId) : null;
  return {
    hasAdmin: !!adminHash,
    role: role === "admin" ? "admin" : role && role.kind === "marker" ? "marker" : role ? "player" : "reader",
    me: meId,
    captainOf: mePl && mePl.cap ? mePl.eq : null,
    proposals,
    myFlights: role && role !== "admin" && role.kind === "marker"
      ? role.grants.map((g) => ({ round: g.round, id: g.flight.id })) : [],
    players, teamMode, rounds, flights: safeFlights, scores, announces,
  };
}

/* --------------------------------------------------------------- routes */
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    if (!env.DB) return bad("Base de données non reliée.", 500);
    await init(env.DB);
    const db = env.DB;
    const role = await auth(req, db);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

    try {
      switch (url.pathname) {
        case "/api/state":
          return json(await readState(db, role));

        /* --- première mise en route : on fixe le code d'administration --- */
        case "/api/claim": {
          if (await getSetting(db, "adminHash", null)) return bad("Déjà configuré.", 409);
          const code = String(body.code || "");
          if (code.length < 4) return bad("Code trop court : 4 caractères au minimum.");
          await setSetting(db, "adminHash", await sha(code));
          return json({ ok: true });
        }
        case "/api/login":
          return json({ ok: (await sha(String(body.code || ""))) === (await getSetting(db, "adminHash", "")) });

        /* --- saisie --- */
        case "/api/score": {
          const { round, player, hole } = body;
          const strokes = Number(body.strokes);
          if (!mayWrite(role, round, player)) return bad("Vous ne marquez pas ce joueur.", 403);
          if (!round || !player || !hole) return bad("Requête incomplète.");
          if (strokes > 0)
            await db.prepare(`INSERT INTO scores (round,player,hole,strokes) VALUES (?1,?2,?3,?4)
                              ON CONFLICT(round,player,hole) DO UPDATE SET strokes = ?4`)
              .bind(round, player, hole, Math.min(20, Math.max(1, strokes))).run();
          else
            await db.prepare(`DELETE FROM scores WHERE round=? AND player=? AND hole=?`)
              .bind(round, player, hole).run();
          return json({ ok: true });
        }
        case "/api/announce": {
          const { round, player } = body;
          const v = Number(body.value);
          if (!mayWrite(role, round, player)) return bad("Vous ne marquez pas ce joueur.", 403);
          if (v > 0)
            await db.prepare(`INSERT INTO announces (round,player,value) VALUES (?1,?2,?3)
                              ON CONFLICT(round,player) DO UPDATE SET value = ?3`)
              .bind(round, player, Math.min(200, Math.max(30, v))).run();
          else
            await db.prepare(`DELETE FROM announces WHERE round=? AND player=?`).bind(round, player).run();
          return json({ ok: true });
        }

        /* --- proposition d'un capitaine : ses six joueurs répartis dans les trois parties --- */
        case "/api/proposal": {
          const players = await getSetting(db, "players", PLAYERS);
          const me = role && role !== "admin" ? players.find((p) => p.id === role.id) : null;
          const team = String(body.team || "");
          if (role !== "admin" && !(me && me.cap && me.eq === team))
            return bad("Réservé au capitaine de cette équipe.", 403);
          if (!body.round) return bad("Parcours manquant.");
          const mine = new Set(players.filter((p) => p.eq === team).map((p) => p.id));
          const groups = (body.flights || []).slice(0, 3).map((g) =>
            (g || []).filter((x) => mine.has(x)).slice(0, 2));
          const seen = new Set();
          for (const g of groups) for (const x of g) {
            if (seen.has(x)) return bad("Un joueur figure dans deux parties.");
            seen.add(x);
          }
          const all = await getSetting(db, "proposals", {});
          all[body.round] = { ...(all[body.round] || {}), [team]: groups };
          await setSetting(db, "proposals", all);
          return json({ ok: true });
        }

        /* --- administration --- */
        case "/api/players": {
          if (role !== "admin") return bad("Réservé à l'administrateur.", 403);
          if (!Array.isArray(body.players)) return bad("Liste de joueurs attendue.");
          await setSetting(db, "players", body.players);
          if (body.teamMode) await setSetting(db, "teamMode", body.teamMode);
          if (Array.isArray(body.r1pars)) await setSetting(db, "r1pars", body.r1pars);
          return json({ ok: true });
        }
        case "/api/flights": {
          if (role !== "admin") return bad("Réservé à l'administrateur.", 403);
          const all = await getSetting(db, "flights", {});
          const prev = all[body.round] || [];
          all[body.round] = (body.flights || []).map((f, i) => ({
            id: f.id || "p" + (i + 1),
            players: (f.players || []).filter(Boolean),
            marker: f.marker || null,
            // on conserve le jeton d'une partie déjà créée, sauf demande explicite
            token: (!f.rotate && (prev.find((p) => p.id === (f.id || "p" + (i + 1))) || {}).token) || token(),
          }));
          await setSetting(db, "flights", all);
          return json({ ok: true, flights: all[body.round] });
        }
        case "/api/clear": {
          if (role !== "admin") return bad("Réservé à l'administrateur.", 403);
          if (!body.round) return bad("Parcours manquant.");
          await db.batch([
            db.prepare(`DELETE FROM scores WHERE round = ?`).bind(body.round),
            db.prepare(`DELETE FROM announces WHERE round = ?`).bind(body.round),
          ]);
          return json({ ok: true });
        }
        default:
          return bad("Route inconnue.", 404);
      }
    } catch (e) {
      return bad("Erreur serveur : " + (e && e.message ? e.message : String(e)), 500);
    }
  },
};
