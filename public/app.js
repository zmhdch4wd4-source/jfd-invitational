/* JFD 70's Invitational — client */

const $ = (s, r = document) => r.querySelector(s);
const el = (h) => { const d = document.createElement("div"); d.innerHTML = h.trim(); return d.firstElementChild; };
const esc = (t) => { const d = document.createElement("span"); d.textContent = t == null ? "" : String(t); return d.innerHTML; };
const ls = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} },
};
const U = (p) => (window.IMGMAP && window.IMGMAP[p]) || "/" + p;
const EQ = { b: { nom: "Les Bleus", cls: "b" }, v: { nom: "Les Verts", cls: "v" } };

const S = {
  st: null, tab: "board", boardSel: "cumul", carnetRound: "r3", carnetHole: 1,
  step: 0, more: {}, inflight: 0, sheet: null,
};

/* ------------------------------------------------------------------ api */
function authHeader() {
  const a = ls.get("jfd.admin"); if (a) return "admin:" + a;
  const p = ls.get("jfd.me"); if (p) return "player:" + p;
  const t = ls.get("jfd.token"); if (t) return "token:" + t;
  return "";
}
async function api(path, body) {
  if (window.demoApi) return window.demoApi(path, body);
  const h = { "x-jfd-auth": authHeader() };
  let opt = { headers: h };
  if (body !== undefined) {
    opt = { method: "POST", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify(body) };
  }
  const r = await fetch("/api/" + path, opt);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Erreur réseau");
  return d;
}
let toastT;
function toast(msg, err) {
  const old = $(".toast"); if (old) old.remove();
  const t = el(`<div class="toast${err ? " err" : ""}">${esc(msg)}</div>`);
  document.body.appendChild(t);
  clearTimeout(toastT); toastT = setTimeout(() => t.remove(), err ? 4200 : 1800);
}

/* -------------------------------------------------------------- calculs */
const round = (id) => S.st.rounds.find((r) => r.id === id) || S.st.rounds[0];
const player = (id) => S.st.players.find((p) => p.id === id) || null;
/* Les journées portent le nom du parcours ; celle dont le parcours reste à
   choisir garde « Jour 1 », d'où les deux tournures ci-dessous. */
const rTBD = (R) => /^Jour/i.test(R.nom || "");
const rLe = (R) => (rTBD(R) ? "le " + R.nom.toLowerCase() : R.nom);
const rDe = (R) => rTBD(R) ? "du " + R.nom.toLowerCase()
  : (/^[aeiouyàâéèêîïôöùû]/i.test(R.nom) ? "d'" : "de ") + R.nom;

/* Départ de Vélines : mardi 16 mars 2027 à 8 h (heure d'hiver, +01:00). */
const DEPART = new Date("2027-03-16T08:00:00+01:00");
function untilDepart() {
  let s = Math.floor((DEPART.getTime() - Date.now()) / 1000);
  if (s <= 0) return null;
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60);
  return { d, h, m, s: s - m * 60 };
}
function countdownHtml() {
  const c = untilDepart();
  if (!c) return "";
  const cell = (v, l) => `<div><b>${String(v).padStart(2, "0")}</b><span>${l}</span></div>`;
  return `<div class="cdlead">Départ dans</div><div class="cdown" id="cdown">` +
    cell(c.d, c.d > 1 ? "jours" : "jour") + cell(c.h, "heures") +
    cell(c.m, "minutes") + cell(c.s, "secondes") + `</div>`;
}
const nH = (r) => round(r).trous.length;
const parTotal = (r) => round(r).trous.reduce((a, t) => a + t.par, 0);
const card = (r, p) => S.st.scores[r + "-" + p] || {};
const announce = (r, p) => S.st.announces[r + "-" + p] ?? null;
const played = (r, p) => Object.keys(card(r, p)).length;
const gross = (r, p) => Object.values(card(r, p)).reduce((a, b) => a + b, 0);
const done = (r, p) => played(r, p) === nH(r);
const rendus = (r, p) => { const q = player(p); return q ? Math.round(q.ix * nH(r) / 18) : 0; };
const net = (r, p) => gross(r, p) - rendus(r, p);
function toPar(r, p) {
  const T = round(r).trous, c = card(r, p); let t = 0;
  for (let i = 1; i <= T.length; i++) if (c[i]) t += c[i] - T[i - 1].par;
  return t;
}
function proph(r, p) {
  const a = announce(r, p);
  return a == null || !done(r, p) ? null : Math.abs(a - gross(r, p));
}
function cumul(p) {
  let g = 0, n = 0, pr = 0, cnt = 0, any = false;
  for (const R of S.st.rounds) {
    if (!done(R.id, p)) continue;
    cnt++; g += gross(R.id, p); n += net(R.id, p);
    const q = proph(R.id, p); if (q != null) { pr += q; any = true; }
  }
  return { g, n, pr: any ? pr : null, cnt };
}
const dTxt = (d) => (d === 0 ? "=" : d > 0 ? "+" + d : String(d));
const dCls = (d) => (d <= -2 ? "e2" : d === -1 ? "e1" : d === 1 ? "b1" : d >= 2 ? "b2" : "");
const sumPar = (r, a, b) => round(r).trous.slice(a - 1, b).reduce((x, t) => x + t.par, 0);
function sumRange(r, p, a, b) {
  const c = card(r, p); let t = 0, full = true;
  for (let i = a; i <= b; i++) { if (!c[i]) full = false; t += c[i] || 0; }
  return { t, full };
}
function myFlights() { return (S.st && S.st.myFlights) || []; }
function markRound() {
  const g = myFlights();
  if (!g.length) return null;
  if (!g.some((x) => x.round === S.markRound)) S.markRound = g[0].round;
  return S.markRound;
}
function myFlight() {
  const r = markRound(); if (!r) return null;
  const g = myFlights().find((x) => x.round === r);
  return (S.st.flights[r] || []).find((x) => x.id === g.id) || null;
}

/* ------------------------------------------------------------ chargement */
async function load(silent) {
  try {
    const st = await api("state");
    if (S.inflight > 0 && silent) return;
    S.st = st;
    render();
    maybeWelcome();
  } catch (e) {
    if (!silent) $("#view").innerHTML = `<div class="card"><div class="empty">Impossible de joindre le serveur.<br>${esc(e.message)}</div></div>`;
  }
}
async function write(path, body, okMsg) {
  S.inflight++;
  try { await api(path, body); if (okMsg) toast(okMsg); }
  catch (e) { toast(e.message, true); await load(); }
  finally { S.inflight--; }
}

/* ------------------------------------------------------------------ vues */
const identified = () => !!(ls.get("jfd.me") || ls.get("jfd.admin") || ls.get("jfd.guest"));

function identityHtml() {
  return `<div class="card idcard"><div class="ph1" style="background:none;border-bottom:1px solid var(--rule)">
      <span class="ey">16–19 mars 2027 · La Rioja</span><h2>Qui êtes-vous ?</h2>
      <p>Choisissez votre nom. Si vous marquez une partie aujourd'hui, la saisie s'ouvrira toute seule.</p></div>
    <div class="idgrid">` +
    S.st.players.map((p) => `<button data-iam="${p.id}"><span class="dot ${EQ[p.eq].cls}"></span>${esc(p.nom)}</button>`).join("") +
    `</div><div class="pad"><button class="btn ghost" data-act="guest">Je ne suis pas dans la liste</button></div></div>`;
}

function render() {
  const st = S.st;
  if (!identified()) {
    $("#roleBadge").hidden = true;
    $("#tabs").hidden = true;
    $("#view").innerHTML = identityHtml();
    return;
  }
  const badge = $("#roleBadge");
  const lbl = st.role === "admin" ? "Administrateur" : st.role === "marker" ? "Marqueur" : "";
  badge.textContent = lbl; badge.hidden = !lbl;

  const tabs = [["board", "Classement", `<path d="M4 19V9M10 19V4M16 19v-7"/>`], ["carnet", "Carnet", `<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3Z"/><path d="M5 17h14"/>`]];
  if (myFlights().length) tabs.push(["mark", "Ma partie", `<path d="M5 3v18"/><path d="M5 4h12l-2 4 2 4H5"/>`]);
  if (st.captainOf) tabs.push(["cap", "Composition", `<path d="M9 7a2.5 2.5 0 1 1 5 0 2.5 2.5 0 0 1-5 0Z"/><path d="M4 20a5 5 0 0 1 5-5h5a5 5 0 0 1 5 5"/><path d="M17 4h4m-2-2v4"/>`]);
  if (st.role === "admin") tabs.push(["admin", "Réglages", `<circle cx="12" cy="12" r="3"/><path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6l1.4 1.4m10 10 1.4 1.4m0-12.8-1.4 1.4m-10 10L5.6 18.4"/>`]);
  if (!tabs.some((t) => t[0] === S.tab)) S.tab = "board";
  const nav = $("#tabs");
  nav.hidden = false;
  nav.innerHTML = tabs.map(([id, n, p]) =>
    `<button data-tab="${id}" aria-selected="${S.tab === id}"><svg viewBox="0 0 24 24">${p}</svg>${esc(n)}</button>`).join("");

  const v = $("#view");
  v.innerHTML = S.tab === "board" ? boardHtml()
    : S.tab === "carnet" ? carnetTabHtml()
    : S.tab === "mark" ? markHtml()
    : S.tab === "cap" ? capHtml()
    : adminHtml();
}

/* ------------------------------------------------------------- classement */
/* ------------------------------------------------------------- accueil */
function teamNet(e, sel) {
  const vals = S.st.players.filter((p) => p.eq === e).map((p) =>
    sel === "cumul" ? (cumul(p.id).cnt ? cumul(p.id).n : null) : (done(sel, p.id) ? net(sel, p.id) : null)
  ).filter((x) => x != null).sort((a, b) => a - b);
  const used = S.st.teamMode === "best4" ? vals.slice(0, 4) : vals;
  return used.length ? { tot: used.reduce((a, b) => a + b, 0), n: used.length } : null;
}
/** Le parcours « du moment » : le dernier où quelqu'un a saisi un score. */
function liveRound() {
  let best = null;
  for (const R of S.st.rounds) {
    const any = S.st.players.some((p) => played(R.id, p.id));
    if (any) best = R.id;
  }
  return best;
}
function greetingParts() {
  const st = S.st, me = player(st.me);
  if (!me) return null;
  const cap = st.captainOf;
  const f = myFlight();
  const r = liveRound();

  const hello = cap ? `Bonjour Capitaine ${esc(me.nom)}` : `Bonjour ${esc(me.nom)}`;
  const lines = [];

  /* sa situation du jour */
  if (r && played(r, me.id)) {
    const j = played(r, me.id), tp = toPar(r, me.id), R = round(r);
    if (done(r, me.id)) {
      const q = proph(r, me.id);
      lines.push(`Carte rentrée à ${esc(R.lieu)} : <b>${gross(r, me.id)} brut</b>, ${net(r, me.id)} net.` +
        (q == null ? "" : q === 0 ? ` Annonce exacte au Prophète — la tournée est pour vous.` : ` Prophète : ${q} point${q > 1 ? "s" : ""}.`));
    } else {
      lines.push(`Après ${j} trou${j > 1 ? "s" : ""} à ${esc(R.lieu)}, vous êtes à <b>${dTxt(tp)}</b>.`);
    }
  }

  /* son rôle du jour */
  if (f) {
    const names = f.players.filter((x) => x !== me.id).map((x) => (player(x) || {}).nom).filter(Boolean);
    lines.push(`Vous tenez la carte aujourd'hui, avec ${esc(names.join(", "))}.`);
  }

  /* le duel */
  const sel = r || "cumul";
  const tb = teamNet("b", sel), tv = teamNet("v", sel);
  if (tb && tv) {
    const d = Math.abs(tb.tot - tv.tot), lead = tb.tot < tv.tot ? "b" : "v";
    const mine = lead === me.eq;
    lines.push(d === 0
      ? `${EQ[me.eq].nom} et ${EQ[me.eq === "b" ? "v" : "b"].nom} sont à égalité parfaite.`
      : mine ? `${EQ[lead].nom} mènent de <b>${d} coup${d > 1 ? "s" : ""}</b>. Tenez bon.`
             : `${EQ[lead].nom} mènent de <b>${d} coup${d > 1 ? "s" : ""}</b>. Il y a du travail.`);
  }

  /* ce qu'il reste à faire */
  if (cap) {
    const manque = st.rounds.filter((R) => {
      const g = ((st.proposals || {})[R.id] || {})[cap] || [];
      return g.filter((x) => (x || []).length === 2).length < 3;
    });
    if (manque.length) lines.push(`Votre composition reste à faire pour ${esc(manque.map(rLe).join(" et "))}.`);
  }
  if (f && announce(markRound(), me.id) == null)
    lines.push(`Pensez à recueillir les annonces du Prophète avant le départ du 1.`);
  /* avant le premier coup de départ : le compte à rebours remplace la phrase d'attente */
  const cd = !r && untilDepart() !== null;
  if (!lines.length && !cd) lines.push(`Le séjour n'a pas encore commencé. Bonne route.`);
  return { hello, cap, cd, prenom: me.nom, lines: lines.slice(0, 3) };
}

/* page d'accueil plein écran, refermée d'une touche */
let welcomed = false;
try { welcomed = sessionStorage.getItem("jfd.hello") === "1"; } catch {}
function maybeWelcome() {
  if (welcomed || $("#splash") || !S.st || !identified()) return;
  const g = greetingParts();
  if (!g) return;
  welcomed = true;
  try { sessionStorage.setItem("jfd.hello", "1"); } catch {}
  const o = el(`<div id="welcome"><div class="inner">
      <img src="/logo-mark.png" alt="">
      <h2>${g.hello}</h2>
      ${g.cap ? `<div class="cap">Capitaine · ${esc(EQ[g.cap].nom)}</div>` : ""}
      <div class="rule"></div>
      ${g.cd ? countdownHtml() +
        `<p class="cdfoot">Mardi 16 mars 2027, 8 h — en route pour la Rioja, ${esc(g.prenom)}.</p>` : ""}
      ${g.lines.map((l) => `<p>${l}</p>`).join("")}
    </div><div class="tap">Touchez l'écran pour continuer</div></div>`);
  let tick = 0;
  const close = () => {
    if (tick) clearInterval(tick);
    o.classList.add("out"); setTimeout(() => o.remove(), 380);
  };
  if (g.cd) tick = setInterval(() => {
    const c = untilDepart(), b = o.querySelectorAll("#cdown b");
    if (!c || !b.length) return clearInterval(tick);
    [c.d, c.h, c.m, c.s].forEach((v, i) => { b[i].textContent = String(v).padStart(2, "0"); });
  }, 1000);
  o.addEventListener("click", close);
  document.body.appendChild(o);
}

function boardHtml() {
  const st = S.st;
  let h = "";
  if (!st.hasAdmin) {
    h += `<div class="card"><h2>Première mise en route</h2><div class="pad">
      <p class="sm muted" style="margin-top:0">Choisissez le code d'administration du séjour. Il vous donnera seul
      le droit de composer les parties et de désigner les marqueurs. Notez-le quelque part.</p>
      <label class="fl" for="newCode">Code d'administration</label>
      <input id="newCode" type="text" autocomplete="off" placeholder="au moins 4 caractères">
      <div style="height:9px"></div><button class="btn" data-act="claim">Enregistrer le code</button></div></div>`;
  }
  const sel = S.boardSel;
  h += `<div class="pills">` +
    [["cumul", "Cumul"], ...st.rounds.map((r) => [r.id, r.nom])]
      .map(([id, n]) => `<button data-sel="${id}" aria-pressed="${sel === id}">${esc(n)}</button>`).join("") +
    `</div>`;

  /* le duel des équipes ouvre la page, avant le détail individuel */
  const teams = ["b", "v"].map((e) => {
    const vals = st.players.filter((p) => p.eq === e).map((p) =>
      sel === "cumul" ? (cumul(p.id).cnt ? cumul(p.id).n : null) : (done(sel, p.id) ? net(sel, p.id) : null)
    ).filter((x) => x != null).sort((a, b) => a - b);
    const used = st.teamMode === "best4" ? vals.slice(0, 4) : vals;
    return { e, tot: used.reduce((a, b) => a + b, 0), n: used.length, have: vals.length };
  });
  const lo = Math.min(...teams.filter((t) => t.n).map((t) => t.tot));
  h += `<div class="card"><h2>Équipes <span class="sub">${st.teamMode === "best4" ? "4 meilleurs nets" : "somme des nets"}</span></h2>` +
    (teams.some((t) => t.n)
      ? teams.map((t) => `<div class="team"><span class="swatch ${EQ[t.e].cls}"></span>
          <span class="nm">${esc(EQ[t.e].nom)}<br><span class="muted sm">${t.n ? t.n + " carte" + (t.n > 1 ? "s" : "") + " sur " + t.have : "en attente"}</span></span>
          <span class="sc"${t.n && t.tot === lo ? ' style="color:var(--jaune)"' : ""}>${t.n ? t.tot : "—"}</span></div>`).join("")
      : `<div class="empty">Aucune carte complète pour l'instant.</div>`) + `</div>`;

  h += sel === "cumul"
    ? `<div class="card"><h2>Tableau du séjour <span class="sub">trois parcours</span></h2>${gridCumul()}</div>`
    : `<div class="card"><h2>Tableau de marque <span class="sub">${esc(round(sel).lieu)}</span></h2>${gridRound(sel)}</div>`;

  /* net / prophète */
  const rows = (fn) => st.players.map((p) => fn(p)).filter(Boolean).sort((a, b) => a.v - b.v);
  const nets = rows((p) => sel === "cumul"
    ? (cumul(p.id).cnt ? { p, v: cumul(p.id).n, d: "brut " + cumul(p.id).g } : null)
    : (done(sel, p.id) ? { p, v: net(sel, p.id), d: "brut " + gross(sel, p.id) + " · −" + rendus(sel, p.id) } : null));
  const props = rows((p) => {
    if (sel === "cumul") { const c = cumul(p.id); return c.pr == null ? null : { p, v: c.pr, d: c.cnt + " annonce" + (c.cnt > 1 ? "s" : "") }; }
    const q = proph(sel, p.id);
    return q == null ? null : { p, v: q, d: "annoncé " + announce(sel, p.id) + " · joué " + gross(sel, p.id) };
  });
  h += rankCard("Net", "les coups rendus déduits", nets, "Net");
  h += rankCard("Le Prophète", "écart à l'annonce", props, "Pts");

  const me = player(ls.get("jfd.me"));
  h += `<div class="whoami">` +
    (me ? `Vous êtes <b>${esc(me.nom)}</b>` : `Vous suivez le séjour en spectateur`) +
    ` · <button data-act="changeme">changer</button>` +
    (st.role === "admin" ? ` · <button data-act="logout">quitter l'administration</button>`
                         : ` · <button data-act="adminlogin">administration</button>`) + `</div>`;
  return h;
}
function rankCard(title, sub, rows, unit) {
  if (!rows.length) return `<div class="card"><h2>${esc(title)} <span class="sub">${esc(sub)}</span></h2><div class="empty">Aucun parcours terminé.</div></div>`;
  let pos = 0, prev = null, n = 0, body = "";
  for (const r of rows) {
    n++; if (prev === null || r.v !== prev) { pos = n; prev = r.v; }
    body += `<tr${pos === 1 ? ' class="lead"' : ""}><td class="l pos">${pos}</td>
      <td class="l"><span class="dot ${EQ[r.p.eq].cls}"></span> ${esc(r.p.nom)}${r.p.cap ? ' <span class="tag">Cap.</span>' : ""}</td>
      <td style="font-weight:600">${r.v}</td><td class="muted sm">${esc(r.d)}</td></tr>`;
  }
  return `<div class="card"><h2>${esc(title)} <span class="sub">${esc(sub)}</span></h2>
    <table class="rank"><thead><tr><th class="l" colspan="2">Joueur</th><th>${esc(unit)}</th><th>Détail</th></tr></thead>
    <tbody>${body}</tbody></table></div>`;
}
function gridRound(r) {
  const T = round(r).trous, n = T.length, full18 = n === 18;
  const ord = S.st.players.map((p) => ({ p, j: played(r, p.id), tp: toPar(r, p.id) }))
    .sort((a, b) => (!a.j !== !b.j ? (a.j ? -1 : 1) : a.tp - b.tp));
  let h = `<div class="gridwrap"><table class="grid"><tbody><tr class="hd"><th class="nm">Trou</th>`;
  for (let i = 1; i <= n; i++) h += `<th>${i}</th>` + (full18 && i === 9 ? `<th class="t">Aller</th>` : "");
  h += (full18 ? `<th class="t">Retour</th>` : "") + `<th class="t">Tot</th><th class="tp">±</th></tr><tr class="par"><td class="nm">Par</td>`;
  for (let i = 1; i <= n; i++) h += `<td>${T[i - 1].par}</td>` + (full18 && i === 9 ? `<td class="t">${sumPar(r, 1, 9)}</td>` : "");
  h += (full18 ? `<td class="t">${sumPar(r, 10, 18)}</td>` : "") + `<td class="t">${parTotal(r)}</td><td class="tp">—</td></tr>`;
  for (const o of ord) {
    const c = card(r, o.p.id);
    h += `<tr><td class="nm"><span class="dot ${EQ[o.p.eq].cls}"></span> ${esc(o.p.nom)}</td>`;
    for (let i = 1; i <= n; i++) {
      const v = c[i] || 0, d = v ? v - T[i - 1].par : null;
      h += `<td class="${v ? dCls(d) : "nos"}">${v || "·"}</td>`;
      if (full18 && i === 9) { const a = sumRange(r, o.p.id, 1, 9); h += `<td class="t">${a.full ? a.t : "·"}</td>`; }
    }
    if (full18) { const b = sumRange(r, o.p.id, 10, 18); h += `<td class="t">${b.full ? b.t : "·"}</td>`; }
    h += `<td class="t">${o.j ? gross(r, o.p.id) : "·"}</td><td class="tp">${o.j ? dTxt(o.tp) : "·"}</td></tr>`;
  }
  return h + `</tbody></table></div><div class="leg">
    <span><i class="e2"></i>Eagle ou mieux</span><span><i class="e1"></i>Birdie</span>
    <span><i class="b1"></i>Bogey</span><span><i class="b2"></i>Double ou pire</span>
    <span>± = écart au par sur les trous joués</span></div>`;
}
function gridCumul() {
  const rows = S.st.players.map((p) => ({ p, c: cumul(p.id) }))
    .sort((a, b) => (!a.c.cnt !== !b.c.cnt ? (a.c.cnt ? -1 : 1) : a.c.n - b.c.n));
  let h = `<div class="gridwrap"><table class="grid"><tbody><tr class="hd"><th class="nm">Joueur</th>` +
    S.st.rounds.map((R) => `<th style="min-width:46px">${esc(R.nom.replace("Jour ", "J"))}</th>`).join("") +
    `<th class="t">Brut</th><th class="t">Net</th><th class="tp">Proph.</th></tr>`;
  for (const o of rows) {
    h += `<tr><td class="nm"><span class="dot ${EQ[o.p.eq].cls}"></span> ${esc(o.p.nom)}</td>`;
    for (const R of S.st.rounds) {
      const j = played(R.id, o.p.id), f = done(R.id, o.p.id);
      h += `<td class="${f ? "" : "nos"}">${f ? gross(R.id, o.p.id) : j ? j + "tr" : "·"}</td>`;
    }
    h += `<td class="t">${o.c.cnt ? o.c.g : "·"}</td><td class="t">${o.c.cnt ? o.c.n : "·"}</td>
      <td class="tp">${o.c.pr == null ? "·" : o.c.pr}</td></tr>`;
  }
  return h + `</tbody></table></div><div class="leg"><span>Seuls les parcours terminés comptent ; un parcours en cours affiche le nombre de trous joués.</span></div>`;
}

/* ---------------------------------------------------------------- carnet */
function carnetTabHtml() {
  const r = S.carnetRound;
  let h = `<div class="pills">` + S.st.rounds.map((R) =>
    `<button data-croud="${R.id}" aria-pressed="${r === R.id}">${esc(R.nom)}</button>`).join("") + `</div>`;
  h += `<div class="card"><h2>${esc(round(r).lieu)} <span class="sub">${esc(round(r).jour)}</span></h2>
    <div class="pad sm muted" style="padding-top:9px">Par ${parTotal(r)} · ${nH(r)} trous. Touchez un trou pour voir le plan, les repères de distance et le profil.</div>
    <table class="rank"><thead><tr><th class="l">Trou</th><th>Par</th><th>Blancs</th><th>Jaunes</th></tr></thead><tbody>`;
  round(r).trous.forEach((t, i) => {
    h += `<tr data-hole="${i + 1}" style="cursor:pointer"><td class="l"><b>${i + 1}</b>${t.nom ? ` <span class="muted sm">${esc(t.nom)}</span>` : ""}</td>
      <td>${t.par}</td><td>${t.no ? "<b>" + t.no + "</b>" : t.bl || "—"}</td><td>${t.no ? "noires" : t.ja || "—"}</td></tr>`;
  });
  return h + `</tbody></table></div>`;
}
function holeSheet(r, i) {
  const t = round(r).trous[i - 1];
  let h = `<div class="sheet" id="sheet"><div class="sh"><div class="in">
      <h3>Trou ${i} · par ${t.par}</h3><button data-act="closesheet">Fermer</button></div></div><div class="body">`;
  h += `<div class="whites"><b>Distances depuis les repères blancs</b>` +
    (t.corr ? `<span>Depuis les jaunes, retrancher <b>${esc(t.corr)} m</b></span>` : "") + `</div>`;
  h += t.img
    ? `<div class="vis" data-zoom="${t.img}"><img src="${U(t.img)}" alt="Vue du trou ${i}"><span class="zx">Agrandir</span></div>`
    : `<div class="vis" style="cursor:default"><div class="empty">Pas encore de visuel pour ce parcours.</div></div>`;
  if (t.bl || t.no) h += `<div class="blk"><div class="bc"><div class="tees" style="padding:0;border:0">` +
    (t.no ? `<div class="tee no" style="flex:2"><span class="k">Départ unique — barres noires</span><span class="v">${t.no} m</span></div>`
          : `<div class="tee"><span class="k">Blancs</span><span class="v">${t.bl}</span></div>
             <div class="tee ja"><span class="k">Jaunes</span><span class="v">${t.ja}</span></div>`) + `</div></div></div>`;
  if (t.prof || t.pt || t.dn != null) {
    h += `<div class="blk"><div class="bt">Profil</div><div class="bc">` +
      (t.prof ? `<img class="pimg" src="${U(t.prof)}" alt="Profil du trou ${i}">` : "") +
      (t.pt ? `<p>${esc(t.pt)}</p>` : "") +
      (t.dn != null ? `<p class="muted">Dénivelé départ → green <b style="color:var(--ink)">${t.dn > 0 ? "+" + t.dn : t.dn} m</b></p>` : "") +
      `</div></div>`;
  }
  if (t.obs && t.obs.length) h += `<div class="blk"><div class="bt">Repères depuis les blancs</div><div class="bc">` +
    t.obs.map((o) => `<div class="ob"><span>${esc(o[0])}</span><span class="r">${esc(String(o[1]).replace("reste ", "→ "))}</span></div>`).join("") + `</div></div>`;
  if (t.gr || t.corr || t.oy) {
    h += `<div class="blk"><div class="bc">`;
    if (t.gr) h += `<div class="ob"><span>Profondeur du green</span><span class="r">${esc(t.gr)} m</span></div>`;
    if (t.oy) h += `<div class="oy"><b>OpenYardage</b> · ${esc(t.oy)}${/aucun/.test(t.oy) ? "" : " m"}</div>`;
    h += `</div></div>`;
  }
  if (t.desc) h += `<div class="blk"><div class="bt">Le trou, selon le club</div><div class="bc"><p>${esc(t.desc)}</p></div></div>`;
  return h + `</div></div>`;
}

/* ------------------------------------------------------- saisie marqueur */
function markHtml() {
  const f = myFlight();
  if (!f) {
    return `<div class="card"><h2>Ma partie</h2><div class="empty">
      Vous n'êtes marqueur d'aucune partie pour le moment.<br>
      ${S.st.role === "admin" ? "Composez les parties dans Réglages." : "Quentin désigne les marqueurs la veille au soir."}</div></div>`;
  }
  const r = markRound(), R = round(r);
  const mk = player(f.marker);
  const g = myFlights();
  const picker = g.length > 1
    ? `<div class="pills">` + g.map((x) => `<button data-mround="${x.round}" aria-pressed="${x.round === r}">${esc(round(x.round).nom)}</button>`).join("") + `</div>`
    : "";
  const head = picker + `<div class="hbar"><button data-act="prevstep"${S.step === 0 ? " disabled" : ""}>‹</button>
    <span class="who">${esc(R.lieu)} · ${S.step === 0 ? "Prophète" : "Trou " + S.step}</span>
    <button data-act="recap">Récap</button></div>`;

  if (S.step === 0) {
    let h = head + `<div class="card" style="border-color:var(--jaune);border-width:1.5px">
      <div class="ph1"><span class="ey">Avant le départ du trou 1</span><h2>Le Prophète</h2>
        <p>${esc(R.lieu)} · ${nH(r)} trous · par ${parTotal(r)}${mk ? " · marqueur : " + esc(mk.nom) : ""}</p></div>
      <div class="rules"><ol>
        <li>Chacun annonce à voix haute le score total qu'il va faire.</li>
        <li>À l'arrivée, les points sont l'écart entre l'annoncé et le réalisé, dans un sens comme dans l'autre.</li>
        <li>Le plus petit cumul sur les trois parcours est sacré Prophète du séjour.</li>
        <li>Annonce exacte : tournée offerte.</li></ol></div>`;
    for (const pid of f.players) {
      const p = player(pid); if (!p) continue;
      const hint = Math.round(parTotal(r) + p.ix * nH(r) / 18);
      h += `<div class="anrow"><span class="nm"><span class="dot ${EQ[p.eq].cls}"></span> ${esc(p.nom)}
        <span class="hint">index ${String(p.ix).replace(".", ",")} · par + index ≈ ${hint}</span></span>
        <input type="number" inputmode="numeric" min="30" max="200" placeholder="—"
          data-an="${pid}" value="${announce(r, pid) ?? ""}"></div>`;
    }
    return h + `</div><div class="pnav"><button class="go" data-act="nextstep">Commencer au trou 1 ›</button></div>`;
  }

  if (S.step === 99) return head + recapHtml(r, f);

  const i = S.step, t = R.trous[i - 1];
  let h = head + `<div class="card">
    <div class="hhead"><span class="n">${i}</span><span class="meta">
      ${t.nom ? `<span class="nom">${esc(t.nom)}</span>` : ""}
      <span class="pr">Par ${t.par}${t.hcp ? " · hcp " + t.hcp : ""}</span></span>
      <span class="cnt">Trou ${i}/${nH(r)}</span></div>`;
  h += `<div class="tees">` + (t.no
    ? `<div class="tee no" style="flex:2"><span class="k">Départ unique — barres noires</span><span class="v">${t.no} m</span></div>`
    : t.bl ? `<div class="tee"><span class="k">Blancs</span><span class="v">${t.bl}</span></div>
             <div class="tee ja"><span class="k">Jaunes</span><span class="v">${t.ja}</span></div>`
           : `<div class="tee"><span class="k">Distances</span><span class="v">—</span></div>`) + `</div>`;
  if (t.img) h += `<button class="seehole" data-sheet="${i}"><img src="${U(t.img)}" alt="">
    <span class="t">Voir le trou, les repères et le profil</span><span class="c">›</span></button>`;

  let all = true;
  for (const pid of f.players) {
    const p = player(pid); if (!p) continue;
    const c = card(r, pid), v = c[i] || 0; if (!v) all = false;
    const tp = toPar(r, pid), j = played(r, pid);
    h += `<div class="pl"><div class="top"><span class="nm"><span class="dot ${EQ[p.eq].cls}"></span> ${esc(p.nom)}</span>
      <span class="tot">${j ? `${j} tr · <b>${gross(r, pid)}</b> · ${dTxt(tp)}` : "pas encore joué"}</span></div>`;
    h += `<div class="chips">`;
    const labs = ["−2", "−1", "PAR", "+1", "+2", "+3"];
    for (let k = 0; k < 6; k++) {
      const s = t.par - 2 + k;
      if (s < 1) { h += `<span></span>`; continue; }
      const on = v === s, cl = s < t.par ? "g" : s > t.par ? "r" : "";
      h += `<button data-sc="${pid}" data-v="${s}" class="${on ? "on " + cl : ""}"><small>${labs[k]}</small>${s}</button>`;
    }
    const over = v > t.par + 3;
    h += `<button class="more ${over ? "on r" : ""}" data-more="${pid}">${over ? v : "…"}</button></div>`;
    if (S.more[pid] || over) {
      h += `<div class="chips" style="grid-template-columns:repeat(7,1fr);margin-top:4px">` +
        [4, 5, 6, 7, 8, 9, 10].map((k) => {
          const s = t.par + k; if (s > 20) return `<span></span>`;
          return `<button data-sc="${pid}" data-v="${s}" class="${v === s ? "on r" : ""}">${s}</button>`;
        }).join("") + `</div>`;
    }
    h += `</div>`;
  }
  h += `</div>`;
  if (all) h += `<div class="allin" style="border:1px solid var(--rule);margin-top:-14px">Les quatre scores sont saisis.</div>`;
  h += `<div class="pnav">
    <button data-act="prevstep">${i === 1 ? "‹ Prophète" : "‹ Trou " + (i - 1)}</button>
    <button class="${all ? "go" : ""}" data-act="nextstep">${i === nH(r) ? "Récapitulatif ›" : "Trou " + (i + 1) + " ›"}</button></div>`;
  return h;
}
function recapHtml(r, f) {
  const R = round(r), n = R.trous.length;
  let h = `<div class="card"><h2>Carte de la partie <span class="sub">${esc(R.jour)}</span></h2>
    <div class="gridwrap"><table class="grid"><tbody><tr class="hd"><th class="nm">Trou</th>`;
  for (let i = 1; i <= n; i++) h += `<th>${i}</th>`;
  h += `<th class="t">Tot</th><th class="tp">±</th></tr><tr class="par"><td class="nm">Par</td>`;
  for (let i = 1; i <= n; i++) h += `<td>${R.trous[i - 1].par}</td>`;
  h += `<td class="t">${parTotal(r)}</td><td class="tp">—</td></tr>`;
  for (const pid of f.players) {
    const p = player(pid); if (!p) continue;
    const c = card(r, pid);
    h += `<tr><td class="nm"><span class="dot ${EQ[p.eq].cls}"></span> ${esc(p.nom)}</td>`;
    for (let i = 1; i <= n; i++) {
      const v = c[i] || 0;
      h += `<td class="${v ? dCls(v - R.trous[i - 1].par) : "nos"}">${v || "·"}</td>`;
    }
    h += `<td class="t">${played(r, pid) ? gross(r, pid) : "·"}</td><td class="tp">${played(r, pid) ? dTxt(toPar(r, pid)) : "·"}</td></tr>`;
  }
  h += `</tbody></table></div>`;
  h += `<table class="rank"><thead><tr><th class="l">Joueur</th><th>Brut</th><th>Rendus</th><th>Net</th><th>Prophète</th></tr></thead><tbody>`;
  for (const pid of f.players) {
    const p = player(pid); if (!p) continue;
    const q = proph(r, pid);
    h += `<tr><td class="l">${esc(p.nom)}</td><td>${played(r, pid) ? gross(r, pid) : "—"}</td>
      <td class="muted">${rendus(r, pid)}</td><td style="font-weight:600">${done(r, pid) ? net(r, pid) : "—"}</td>
      <td>${q == null ? "—" : q === 0 ? '<span class="tag" style="border-color:var(--jaune);color:var(--jaune)">Exact</span>' : q}</td></tr>`;
  }
  return h + `</tbody></table></div>
    <div class="pnav"><button data-act="backholes">‹ Revenir aux trous</button></div>`;
}

/* ------------------------------------------------------- les capitaines */
/* Les compositions en cours d'édition vivent dans S.draft, jamais dans S.st :
   le rafraîchissement automatique remplace S.st et effacerait la saisie. */
function propOf(round, team) {
  const d = ((S.draftProp || {})[round] || {})[team];
  const g = d || ((S.st.proposals || {})[round] || {})[team] || [];
  return [0, 1, 2].map((i) => [(g[i] || [])[0] || "", (g[i] || [])[1] || ""]);
}
function setProp(round, team, g) {
  S.draftProp = S.draftProp || {};
  S.draftProp[round] = { ...(S.draftProp[round] || {}), [team]: g };
}
function flightsOf(round) {
  return (S.draftFlights || {})[round] || S.st.flights[round] || [];
}
function setFlights(round, list) {
  S.draftFlights = S.draftFlights || {};
  S.draftFlights[round] = list;
}
function capHtml() {
  const team = S.st.captainOf;
  const sel = S.capRound || (S.capRound = S.st.rounds[0].id);
  const squad = S.st.players.filter((p) => p.eq === team);
  const g = propOf(sel, team);
  const placed = g.flat().filter(Boolean);
  const reste = squad.filter((p) => !placed.includes(p.id));

  const lock = !!((S.st.locked || {})[sel]);
  let h = `<div class="hi" style="margin-bottom:14px"><h2>${esc(EQ[team].nom)}</h2>
    <p>${lock
      ? "Cette journée a été validée par Quentin : la composition est figée. Les autres journées restent modifiables."
      : "Répartissez vos six joueurs dans les trois parties. Quentin assemble ensuite votre composition avec celle de l'autre capitaine."}</p></div>`;
  h += `<div class="pills">` + S.st.rounds.map((R) => {
    const done3 = propOf(R.id, team).filter((x) => x[0] && x[1]).length === 3;
    const lk = !!((S.st.locked || {})[R.id]);
    return `<button data-capround="${R.id}" aria-pressed="${sel === R.id}">${esc(R.nom)}${lk ? " 🔒" : done3 ? " ✓" : ""}</button>`;
  }).join("") + `</div>`;

  const dirtyC = !!((S.draftProp || {})[sel] || {})[team];
  h += `<div class="card"><h2>${esc(round(sel).lieu)} <span class="sub">${
    lock ? '<span style="color:var(--jaune)">validée</span>'
         : dirtyC ? '<span class="unsaved">non enregistré</span>' : esc(round(sel).jour)}</span></h2>`;
  for (let k = 0; k < 3; k++) {
    if (lock) {
      h += `<div class="team"><span class="swatch ${EQ[team].cls}"></span><span class="nm">Partie ${k + 1}<br>
        <span class="muted sm">${esc(g[k].map((x) => (player(x) || {}).nom || "—").join(" et "))}</span></span></div>`;
      continue;
    }
    h += `<div class="pad" style="padding-bottom:4px"><b>Partie ${k + 1}</b></div>`;
    for (let s = 0; s < 2; s++) {
      const cur = g[k][s];
      h += `<div class="fl2"><span class="n">${s + 1}</span><select data-cp="${k}|${s}">
        <option value="">—</option>` + squad.map((p) => {
        const taken = placed.includes(p.id) && p.id !== cur;
        return `<option value="${p.id}"${p.id === cur ? " selected" : ""}>${esc(p.nom)} · ${String(p.ix).replace(".", ",")}${taken ? " ⇄" : ""}</option>`;
      }).join("") + `</select></div>`;
    }
  }
  if (!lock && reste.length) h += `<p class="note" style="padding-top:10px">Pas encore placés : ${esc(reste.map((p) => p.nom).join(", "))}.</p>`;
  h += lock ? `<p class="note" style="padding-top:12px">Pour rouvrir cette journée, demandez à Quentin.</p></div>` : `<div class="pad"><button class="btn" data-saveprop="${sel}">Enregistrer ma composition</button>
    <div style="height:8px"></div>
    <button class="btn ghost" data-capsuggest="${sel}">Proposer une répartition</button>
    <div style="height:8px"></div>
    <button class="btn ghost" data-clearprop="${sel}">Effacer ma composition</button></div>
    <p class="note">La répartition proposée évite de refaire jouer ensemble deux joueurs déjà associés un autre jour, et équilibre les index entre les trois parties.</p></div>`;

  /* ce que l'autre capitaine a fait */
  const other = team === "b" ? "v" : "b";
  const og = propOf(sel, other);
  h += `<div class="card"><h2>En face <span class="sub">${esc(EQ[other].nom)}</span></h2>`;
  h += og.every((x) => !x[0] && !x[1])
    ? `<div class="empty">${esc(EQ[other].nom)} n'ont pas encore annoncé leur composition.</div>`
    : og.map((pair, k) => `<div class="team"><span class="swatch ${EQ[other].cls}"></span>
        <span class="nm">Partie ${k + 1}<br><span class="muted sm">${esc(pair.map((x) => (player(x) || {}).nom || "—").join(" et "))}</span></span></div>`).join("");
  return h + `</div>`;
}
function capSuggest(roundId, team) {
  const squad = S.st.players.filter((p) => p.eq === team).map((p) => p.id);
  const seen = new Map();
  for (const [rid, byTeam] of Object.entries(S.st.proposals || {})) {
    if (rid === roundId) continue;
    for (const pair of (byTeam[team] || [])) {
      const [a, b] = pair || [];
      if (a && b) { seen.set(a + "|" + b, 1); seen.set(b + "|" + a, 1); }
    }
  }
  let best = null;
  for (let t = 0; t < 400; t++) {
    const pool = squad.slice();
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const pairs = [pool.slice(0, 2), pool.slice(2, 4), pool.slice(4, 6)];
    let cost = 0;
    for (const [a, b] of pairs) cost += (seen.get(a + "|" + b) || 0) * 10;
    const sums = pairs.map(([a, b]) => (player(a) || {}).ix + (player(b) || {}).ix);
    cost += Math.max(...sums) - Math.min(...sums);
    if (best === null || cost < best.cost) best = { cost, pairs };
  }
  return best.pairs;
}

/* --------------------------------------------------------- administration */
function adminHtml() {
  const st = S.st;
  const sel = S.adminRound || (S.adminRound = st.rounds[0].id);
  let h = `<div class="pills">` + st.rounds.map((R) => {
    const n = (st.flights[R.id] || []).filter((f) => f.players.filter(Boolean).length === 4).length;
    return `<button data-around="${R.id}" aria-pressed="${sel === R.id}">${esc(R.nom)}${n === 3 ? " ✓" : ""}</button>`;
  }).join("") + `</div>`;
  for (const R of st.rounds) {
    if (R.id !== sel) continue;
    const list = flightsOf(R.id);
    h += `<div class="card"><h2>${esc(R.nom)} <span class="sub">${
      (S.draftFlights || {})[R.id] ? '<span class="unsaved">non enregistré</span>'
        : esc(rTBD(R) ? R.lieu : R.jour)}</span></h2>`;
    /* ce que les capitaines ont proposé */
    const pb = propOf(R.id, "b"), pv = propOf(R.id, "v");
    const full = (g) => g.filter((x) => x[0] && x[1]).length === 3;
    h += `<div class="props"><div class="pt">Propositions des capitaines</div>`;
    for (const [tm, g] of [["b", pb], ["v", pv]]) {
      h += `<div class="pr"><span class="swatch ${EQ[tm].cls}"></span><span class="nm">${esc(EQ[tm].nom)}<br>
        <span class="muted sm">${full(g)
          ? g.map((x, i) => (i + 1) + ". " + x.map((y) => (player(y) || {}).nom || "—").join(" + ")).join(" · ")
          : "en attente"}</span></span></div>`;
    }
    h += (full(pb) && full(pv))
      ? `<div class="pad" style="padding-top:8px"><button class="btn gold" data-useprop="${R.id}">Reprendre les deux compositions</button></div>`
      : `<p class="note" style="padding:8px 14px 12px">Vous pouvez composer sans attendre : reprendre les propositions ne fait que pré-remplir les places.</p>`;
    const lk = !!((st.locked || {})[R.id]);
    h += `<div class="pad" style="padding-top:0">
      <button class="btn ghost" data-lock="${R.id}|${lk ? 0 : 1}">${lk
        ? "🔒 Journée verrouillée — rouvrir aux capitaines"
        : "Verrouiller la composition des capitaines"}</button>`;
    if (pb.some((x) => x[0] || x[1]) || pv.some((x) => x[0] || x[1]))
      h += `<div style="height:8px"></div><button class="btn ghost" data-clearprops="${R.id}">Effacer les propositions des deux capitaines</button>`;
    h += `</div>`;
    h += `</div>`;
    const used = new Set();
    list.forEach((f) => f.players.forEach((p) => used.add(p)));
    for (let k = 0; k < 3; k++) {
      const f = list[k] || { id: "p" + (k + 1), players: [], marker: null };
      h += `<div class="pad" style="padding-bottom:4px"><b>Partie ${k + 1}</b></div>`;
      for (let s = 0; s < 4; s++) {
        const cur = f.players[s] || "";
        h += `<div class="fl2"><span class="n">${s + 1}</span><select data-fp="${R.id}|${k}|${s}">
          <option value="">—</option>` +
          st.players.map((p) => {
            const taken = used.has(p.id) && p.id !== cur;
            return `<option value="${p.id}"${p.id === cur ? " selected" : ""}>${esc(p.nom)}${taken ? " ⇄" : ""}</option>`;
          }).join("") + `</select></div>`;
      }
      h += `<div class="fl2"><span class="n" style="font-size:12px">M</span>
        <select data-fm="${R.id}|${k}"><option value="">Marqueur —</option>` +
        f.players.filter(Boolean).map((p) => `<option value="${p}"${f.marker === p ? " selected" : ""}>${esc((player(p) || {}).nom || p)}</option>`).join("") +
        `</select></div>`;
      if (f.token) {
        const url = location.origin + "/#m=" + f.token;
        h += `<div class="link"><code>${esc(url)}</code>
          <button data-copy="${esc(url)}">Copier</button>
          <button data-rotate="${R.id}|${k}">Nouveau</button></div>`;
      }
    }
    const sansMk = list.filter((f) => (f.players || []).filter(Boolean).length && !f.marker).length;
    if (sansMk) h += `<p class="note" style="padding:4px 14px 10px;color:var(--rouge)">
      ${sansMk === 1 ? "Une partie n'a pas de marqueur" : sansMk + " parties n'ont pas de marqueur"} :
      personne ne pourra y saisir de score.</p>`;
    h += `<div class="pad"><button class="btn" data-saveflights="${R.id}">Enregistrer les parties ${esc(rDe(R))}</button>
      <div style="height:8px"></div>
      <button class="btn ghost" data-suggest="${R.id}">Proposer une rotation</button></div>`;
    h += `<p class="note">La rotation proposée évite de replacer ensemble deux joueurs qui l'étaient déjà un autre jour.</p></div>`;
  }

  h += `<div class="card"><h2>Les joueurs <span class="sub">index et équipe</span></h2>
    <div class="pad" style="padding-top:4px"><table class="cfg"><tr><th>Joueur</th><th>Index</th><th>Équipe</th></tr>` +
    st.players.map((p) => `<tr><td>${esc(p.nom)}${p.cap ? ' <span class="tag">Cap.</span>' : ""}</td>
      <td class="ix"><input type="number" step="0.1" min="0" max="54" value="${p.ix}" data-ix="${p.id}"></td>
      <td class="tm"><select data-eq="${p.id}">
        <option value="b"${p.eq === "b" ? " selected" : ""}>Bleus</option>
        <option value="v"${p.eq === "v" ? " selected" : ""}>Verts</option></select></td></tr>`).join("") +
    `</table></div>
    <div class="pad"><label class="fl" for="tmode">Classement par équipe</label>
      <select id="tmode"><option value="best4"${st.teamMode === "best4" ? " selected" : ""}>Les 4 meilleurs nets</option>
      <option value="all"${st.teamMode === "all" ? " selected" : ""}>La somme des 6 nets</option></select></div>
    <div class="pad" style="padding-top:0"><label class="fl">Jour 1 — pars du parcours, à confirmer</label>
      <div class="parrow">` + st.rounds[0].trous.map((t, i) =>
        `<label>${i + 1}<br><input type="number" min="3" max="6" value="${t.par}" data-par="${i}"></label>`).join("") +
    `</div></div><div class="pad" style="padding-top:0"><button class="btn" data-act="saveplayers">Enregistrer</button></div></div>`;

  h += `<div class="card"><h2>Zone sensible</h2>
    <div class="pad">` + st.rounds.map((R) =>
      `<button class="btn ghost" data-clear="${R.id}" style="margin-bottom:8px">Effacer tous les scores ${esc(rDe(R))}</button>`).join("") +
    `<button class="btn ghost" data-act="logout">Se déconnecter de l'administration</button></div></div>`;
  return h;
}
/* rotation évitant les paires déjà jouées */
function suggest(roundId) {
  const ids = S.st.players.map((p) => p.id);
  const seen = new Map();
  for (const [rid, list] of Object.entries(S.st.flights)) {
    if (rid === roundId) continue;
    for (const f of list) for (const a of f.players) for (const b of f.players)
      if (a !== b) seen.set(a + "|" + b, (seen.get(a + "|" + b) || 0) + 1);
  }
  let best = null;
  for (let tries = 0; tries < 600; tries++) {
    const pool = ids.slice();
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const fl = [pool.slice(0, 4), pool.slice(4, 8), pool.slice(8, 12)];
    let cost = 0;
    for (const g of fl) for (const a of g) for (const b of g) if (a !== b) cost += seen.get(a + "|" + b) || 0;
    // équilibre des index dans chaque partie
    const avg = fl.map((g) => g.reduce((s, x) => s + (player(x) || {}).ix, 0) / 4);
    cost += (Math.max(...avg) - Math.min(...avg)) * 0.4;
    if (best === null || cost < best.cost) best = { cost, fl };
    if (best.cost === 0) break;
  }
  return best.fl;
}

/* ------------------------------------------------------------ évènements */
document.addEventListener("click", async (e) => {
  const z = e.target.closest("[data-zoom]");
  if (z) {
    const o = el(`<div id="zoom"><img src="${U(z.getAttribute("data-zoom"))}" alt=""></div>`);
    o.addEventListener("click", () => o.remove()); document.body.appendChild(o); return;
  }
  const b = e.target.closest("button,tr[data-hole]");
  if (!b) return;
  const act = b.getAttribute("data-act");

  if (b.dataset.tab) { S.tab = b.dataset.tab; if (S.tab === "mark") S.step = S.step || 0; render(); window.scrollTo(0, 0); return; }
  if (b.dataset.sel) { S.boardSel = b.dataset.sel; render(); return; }
  if (b.dataset.croud) { S.carnetRound = b.dataset.croud; render(); return; }
  if (b.dataset.around) { S.adminRound = b.dataset.around; render(); window.scrollTo(0, 0); return; }
  if (b.dataset.mround) { S.markRound = b.dataset.mround; S.step = 0; render(); window.scrollTo(0, 0); return; }
  if (b.dataset.capround) { S.capRound = b.dataset.capround; render(); window.scrollTo(0, 0); return; }
  if (b.dataset.capsuggest) {
    const rid = b.dataset.capsuggest, tm = S.st.captainOf;
    setProp(rid, tm, capSuggest(rid, tm));
    render(); toast("Répartition proposée — pensez à enregistrer.");
    return;
  }
  if (b.dataset.lock) {
    const [rid, v] = b.dataset.lock.split("|");
    await write("lock", { round: rid, locked: v === "1" },
      v === "1" ? "Journée verrouillée." : "Journée rouverte aux capitaines.");
    await load(); return;
  }
  if (b.dataset.clearprop) {
    const rid = b.dataset.clearprop, tm = S.st.captainOf;
    if (!window.confirm("Effacer votre composition pour cette journée ?")) return;
    if (S.draftProp && S.draftProp[rid]) delete S.draftProp[rid][tm];
    await write("proposal", { round: rid, team: tm, flights: [[], [], []] }, "Composition effacée.");
    await load(); return;
  }
  if (b.dataset.clearprops) {
    const rid = b.dataset.clearprops;
    if (!window.confirm("Effacer les propositions des deux capitaines pour cette journée ?")) return;
    if (S.draftProp) delete S.draftProp[rid];
    await write("proposal", { round: rid, team: "b", flights: [[], [], []] });
    await write("proposal", { round: rid, team: "v", flights: [[], [], []] }, "Propositions effacées.");
    await load(); return;
  }
  if (b.dataset.saveprop) {
    const rid = b.dataset.saveprop, tm = S.st.captainOf, g = propOf(rid, tm);
    if (g.some((x) => !x[0] || !x[1])) return toast("Il reste des places vides.", true);
    await write("proposal", { round: rid, team: tm, flights: g }, "Composition enregistrée.");
    if (S.draftProp && S.draftProp[rid]) delete S.draftProp[rid][tm];
    await load(); return;
  }
  if (b.dataset.useprop) {
    const rid = b.dataset.useprop, pb = propOf(rid, "b"), pv = propOf(rid, "v");
    setFlights(rid, [0, 1, 2].map((k) => ({
      ...(flightsOf(rid)[k] || {}), id: "p" + (k + 1),
      players: [pb[k][0], pv[k][0], pb[k][1], pv[k][1]].filter(Boolean),
      marker: (flightsOf(rid)[k] || {}).marker || null,
    })));
    render(); toast("Places pré-remplies — vérifiez et enregistrez.");
    return;
  }
  if (b.dataset.iam) { ls.set("jfd.me", b.dataset.iam); ls.del("jfd.guest"); S.tab = "board"; await load(); return; }
  if (act === "guest") { ls.set("jfd.guest", "1"); ls.del("jfd.me"); S.tab = "board"; await load(); return; }
  if (act === "changeme") { ls.del("jfd.me"); ls.del("jfd.guest"); ls.del("jfd.admin"); S.tab = "board"; await load(); return; }
  if (b.hasAttribute("data-hole")) { openSheet(S.carnetRound, +b.getAttribute("data-hole")); return; }
  if (b.dataset.sheet) { openSheet(markRound(), +b.dataset.sheet); return; }
  if (act === "closesheet") { closeSheet(); return; }

  if (act === "claim") {
    const code = $("#newCode").value.trim();
    if (code.length < 4) return toast("Quatre caractères au minimum.", true);
    try { await api("claim", { code }); ls.set("jfd.admin", code); toast("Code enregistré."); await load(); }
    catch (err) { toast(err.message, true); }
    return;
  }
  if (act === "adminlogin") {
    const code = window.prompt("Code d'administration");
    if (!code) return;
    try {
      const r = await api("login", { code });
      if (!r.ok) return toast("Code incorrect.", true);
      ls.set("jfd.admin", code); toast("Bonjour Quentin."); S.tab = "admin"; await load();
    } catch (err) { toast(err.message, true); }
    return;
  }
  if (act === "logout") { ls.del("jfd.admin"); S.tab = "board"; await load(); return; }

  /* saisie */
  if (b.dataset.sc) {
    const pid = b.dataset.sc, v = +b.dataset.v, r = markRound(), i = S.step;
    const k = r + "-" + pid;
    const cur = (S.st.scores[k] || {})[i] || 0;
    const nv = cur === v ? 0 : v;
    S.st.scores[k] = { ...(S.st.scores[k] || {}) };
    if (nv) S.st.scores[k][i] = nv; else delete S.st.scores[k][i];
    delete S.more[pid];
    render();
    await write("score", { round: r, player: pid, hole: i, strokes: nv });
    return;
  }
  if (b.dataset.more) { S.more[b.dataset.more] = !S.more[b.dataset.more]; render(); return; }
  if (act === "nextstep") {
    const n = nH(markRound());
    S.step = S.step === 0 ? 1 : S.step >= n ? 99 : S.step + 1;
    render(); window.scrollTo(0, 0); return;
  }
  if (act === "prevstep") { S.step = S.step === 99 ? nH(markRound()) : Math.max(0, S.step - 1); render(); window.scrollTo(0, 0); return; }
  if (act === "recap") { S.step = 99; render(); window.scrollTo(0, 0); return; }
  if (act === "backholes") { S.step = nH(markRound()); render(); window.scrollTo(0, 0); return; }

  /* administration */
  if (b.dataset.copy) {
    try { await navigator.clipboard.writeText(b.dataset.copy); toast("Lien copié."); }
    catch { toast("Copie impossible — sélectionnez le lien à la main.", true); }
    return;
  }
  if (b.dataset.suggest) {
    const rid = b.dataset.suggest, fl = suggest(rid);
    setFlights(rid, fl.map((players, k) => {
      const prev = (flightsOf(rid)[k] || {}).marker;
      /* on ne désigne jamais de marqueur tout seul : il reste à choisir */
      return { ...(flightsOf(rid)[k] || {}), id: "p" + (k + 1), players,
               marker: prev && players.includes(prev) ? prev : null };
    }));
    render(); toast("Rotation proposée — choisissez les marqueurs, puis enregistrez.");
    return;
  }
  if (b.dataset.rotate) {
    const [rid, k] = b.dataset.rotate.split("|");
    const list = flightsOf(rid).map((f, i) => ({ ...f, rotate: i === +k }));
    await write("flights", { round: rid, flights: list }, "Nouveau lien généré.");
    if (S.draftFlights) delete S.draftFlights[rid];
    await load(); return;
  }
  if (b.dataset.saveflights) {
    const rid = b.dataset.saveflights;
    const list = flightsOf(rid).map((f) => ({ id: f.id, players: (f.players || []).filter(Boolean), marker: f.marker || null }));
    const flat = list.flatMap((f) => f.players);
    if (new Set(flat).size !== flat.length) return toast("Un joueur figure dans deux parties.", true);
    await write("flights", { round: rid, flights: list }, "Parties enregistrées.");
    if (S.draftFlights) delete S.draftFlights[rid];
    await load(); return;
  }
  if (b.dataset.clear) {
    if (!window.confirm("Effacer tous les scores de cette journée ? C'est définitif.")) return;
    await write("clear", { round: b.dataset.clear }, "Scores effacés."); await load();
    return;
  }
  if (act === "saveplayers") {
    const players = S.st.players.map((p) => ({ ...p }));
    document.querySelectorAll("[data-ix]").forEach((i) => {
      const p = players.find((x) => x.id === i.dataset.ix); if (p && i.value) p.ix = parseFloat(i.value);
    });
    document.querySelectorAll("[data-eq]").forEach((s) => {
      const p = players.find((x) => x.id === s.dataset.eq); if (p) p.eq = s.value;
    });
    const r1pars = [...document.querySelectorAll("[data-par]")].map((i) => Math.max(3, Math.min(6, +i.value || 4)));
    await write("players", { players, teamMode: $("#tmode").value, r1pars }, "Enregistré."); await load();
    return;
  }
});

document.addEventListener("change", async (e) => {
  const t = e.target;
  if (t.dataset.an) {
    const r = markRound(), v = parseInt(t.value, 10);
    S.st.announces[r + "-" + t.dataset.an] = isNaN(v) ? null : v;
    await write("announce", { round: r, player: t.dataset.an, value: isNaN(v) ? 0 : v });
    return;
  }
  if (t.dataset.cp) {
    const [k, s] = t.dataset.cp.split("|"), tm = S.st.captainOf, rid = S.capRound;
    const g = propOf(rid, tm);
    /* si le joueur choisi occupe déjà une place, on échange les deux */
    if (t.value) for (let a = 0; a < 3; a++) for (let b2 = 0; b2 < 2; b2++)
      if (g[a][b2] === t.value && !(a === +k && b2 === +s)) g[a][b2] = g[+k][+s];
    g[+k][+s] = t.value || "";
    setProp(rid, tm, g);
    render(); return;
  }
  if (t.dataset.fp) {
    const [rid, k, s] = t.dataset.fp.split("|");
    const list = flightsOf(rid).map((f) => ({ ...f, players: [...(f.players || [])] }));
    for (let i = 0; i < 3; i++) if (!list[i]) list[i] = { id: "p" + (i + 1), players: [], marker: null };
    setFlights(rid, list);
    const f = list[+k];
    /* échange si le joueur choisi est déjà placé ailleurs */
    if (t.value) for (const g2 of list) {
      const j = (g2.players || []).indexOf(t.value);
      if (j >= 0 && !(g2 === f && j === +s)) g2.players[j] = f.players[+s] || null;
    }
    f.players[+s] = t.value || null;
    render(); return;
  }
  if (t.dataset.fm) {
    const [rid, k] = t.dataset.fm.split("|");
    const l2 = flightsOf(rid).map((f) => ({ ...f }));
    if (!l2[+k]) l2[+k] = { id: "p" + (+k + 1), players: [], marker: null };
    l2[+k].marker = t.value || null;
    setFlights(rid, l2); return;
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { const z = $("#zoom"); if (z) return z.remove(); closeSheet(); }
});
function openSheet(r, i) {
  closeSheet();
  document.body.appendChild(el(holeSheet(r, i)));
  document.body.style.overflow = "hidden";
}
function closeSheet() {
  const s = $("#sheet"); if (s) s.remove();
  document.body.style.overflow = "";
}

/* ------------------------------------------------------------------ boot */
(function boot() {
  const m = location.hash.match(/^#m=([a-z0-9]+)$/i);
  if (m) { ls.set("jfd.token", m[1]); history.replaceState(null, "", location.pathname); }
  const splash = $("#splash");
  const seen = sessionStorage.getItem("jfd.splash");
  if (seen) splash.remove();
  else {
    sessionStorage.setItem("jfd.splash", "1");
    const close = () => {
      if (!$("#splash")) return;
      splash.classList.add("out");
      setTimeout(() => { splash.remove(); maybeWelcome(); }, 480);
    };
    setTimeout(close, 2000);
    splash.addEventListener("click", close);
  }
  load();
  setInterval(() => {
    if (document.visibilityState !== "visible") return;
    const a = document.activeElement;
    if (a && (a.tagName === "INPUT" || a.tagName === "SELECT")) return;
    if (S.inflight > 0) return;
    load(true);
  }, 8000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") load(true); });
})();
