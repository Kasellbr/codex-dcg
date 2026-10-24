/* Codex DCG — v2
   Application de révision hors ligne (GitHub Pages).
   Données : data/base.json (fiches, cartes, QCM, cas) + semaines/AAAA-MM-JJ.json (programme de la semaine, généré chaque dimanche).
   Progression : localStorage (clé codex_dcg_v4), exportable depuis l'onglet Progrès. */
'use strict';

const APP_VERSION = '2.0.0';
const STORAGE_KEY = 'codex_dcg_v4';
const LEGACY_KEY = 'dcg_app_state_v3';
const BOX_DAYS = [1, 2, 4, 7, 14, 30];
const TIMER_PRESETS = [15, 30, 45, 60, 90, 180, 240];
const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const JOURS_COURTS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/* ============================== DATES (heure locale) ============================== */
const params = new URLSearchParams(location.search);
function isoOf(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function parseISO(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); }
function today() { const forced = params.get('jour'); return /^\d{4}-\d{2}-\d{2}$/.test(forced || '') ? forced : isoOf(new Date()); }
function addDays(iso, n) { const d = parseISO(iso); d.setDate(d.getDate() + n); return isoOf(d); }
function mondayOf(iso) { const d = parseISO(iso); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return isoOf(d); }
function longDate(iso) { const d = parseISO(iso); return JOURS[d.getDay()] + ' ' + d.getDate() + ' ' + MOIS[d.getMonth()]; }
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
function shortDate(iso) { const d = parseISO(iso); return d.getDate() + ' ' + MOIS_COURTS[d.getMonth()]; }

/* ============================== OUTILS ============================== */
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function inline(s) {
  return esc(s)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}
function md(text) {
  if (!text) return '';
  const out = []; let list = null;
  const flush = () => { if (list) { out.push(`<${list.t}>` + list.items.map(i => `<li>${inline(i)}</li>`).join('') + `</${list.t}>`); list = null; } };
  let para = [];
  const flushP = () => { if (para.length) { out.push('<p>' + para.map(inline).join('<br>') + '</p>'); para = []; } };
  for (const raw of String(text).split('\n')) {
    const l = raw.trim();
    if (!l) { flushP(); flush(); continue; }
    let m;
    if ((m = l.match(/^(#{2,4})\s+(.*)$/))) { flushP(); flush(); out.push(m[1].length === 2 ? `<h3>${inline(m[2])}</h3>` : `<h4>${inline(m[2])}</h4>`); continue; }
    if ((m = l.match(/^[-•]\s+(.*)$/))) { flushP(); if (!list || list.t !== 'ul') { flush(); list = { t: 'ul', items: [] }; } list.items.push(m[1]); continue; }
    if ((m = l.match(/^\d+[.)]\s+(.*)$/))) { flushP(); if (!list || list.t !== 'ol') { flush(); list = { t: 'ol', items: [] }; } list.items.push(m[1]); continue; }
    flush(); para.push(l);
  }
  flushP(); flush();
  return out.join('');
}
function $(sel) { return document.querySelector(sel); }
let toastTimer = null;
function toast(msg, action) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status');
  t.innerHTML = `<span>${esc(msg)}</span>` + (action ? `<button type="button">${esc(action.label)}</button>` : '');
  if (action) t.querySelector('button').onclick = () => { t.remove(); action.run(); };
  document.body.appendChild(t);
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), action ? 12000 : 3200);
}
function ueLabel(id) { const u = DATA.base.ues.find(x => x.id === id); return u ? u.label : id; }
function ueShort(id) { const u = DATA.base.ues.find(x => x.id === id); return u ? u.short : id; }
function ueTag(id) { return id ? `<span class="ue-tag ${esc(id)}">${esc(id.replace('UE', 'UE '))}</span>` : ''; }

/* ============================== ÉTAT ============================== */
let state = null;
function freshState() {
  return { v: 4, cards: {}, custom: [], weekCards: {}, quiz: {}, done: {}, activeChaps: {},
    stats: { streak: 0, lastActiveDate: null, totalReviews: 0, sessionsDone: 0, days: {} }, timerEnd: null, migrated: false };
}
function loadState() {
  try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) { state = Object.assign(freshState(), JSON.parse(raw)); state.stats = Object.assign(freshState().stats, state.stats || {}); return; } } catch (e) { console.error(e); }
  state = freshState();
}
function saveState() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { toast('Sauvegarde impossible : mémoire du navigateur pleine ou bloquée.'); } }

/* Reprise de la progression de l'ancienne version (cartes révisées, cartes perso). */
function migrateLegacy() {
  if (state.migrated) return;
  state.migrated = true;
  let old = null;
  try { old = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null'); } catch (e) { old = null; }
  if (!old || !Array.isArray(old.flashcards)) return;
  const byQ = new Map(DATA.base.cards.map(c => [c.q.trim(), c]));
  let kept = 0;
  for (const c of old.flashcards) {
    if (c.custom) { state.custom.push({ id: 'u-' + (c.id || Math.random().toString(36).slice(2)), ue: c.ue, chapId: c.chapId, q: c.question, a: c.answer, created: today() }); kept++; continue; }
    const b = byQ.get((c.question || '').trim());
    if (b && c.lastReviewed) { state.cards[b.id] = { box: c.box || 0, due: c.due || today(), last: c.lastReviewed, reviews: 1 }; state.activeChaps[b.chapId] = true; kept++; }
  }
  if (old.stats) { state.stats.streak = old.stats.streak || 0; state.stats.lastActiveDate = old.stats.lastActiveDate || null; state.stats.totalReviews = old.stats.totalReviews || 0; state.stats.sessionsDone = old.stats.sessionsCompleted || 0; }
  if (kept) setTimeout(() => toast(`Progression de l'ancienne version reprise (${kept} cartes).`), 600);
}

/* ============================== DONNÉES ============================== */
const DATA = { base: null, weeks: {}, weekErrors: {} };
async function getJSON(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(r.status + ' ' + url);
  return r.json();
}
async function loadWeek(monday) {
  if (DATA.weeks[monday] || DATA.weekErrors[monday]) return DATA.weeks[monday];
  try {
    const w = await getJSON('semaines/' + monday + '.json');
    DATA.weeks[monday] = w; importWeekCards(w); return w;
  } catch (e) { DATA.weekErrors[monday] = true; return null; }
}
function importWeekCards(w) {
  let added = 0;
  for (const j of w.jours || []) for (const s of j.seances || []) {
    if (s.chapId && j.date <= today()) state.activeChaps[s.chapId] = true;
    for (const c of s.flashcards || []) {
      if (!c || !c.id || state.weekCards[c.id]) continue;
      state.weekCards[c.id] = { id: c.id, ue: s.ue || null, chapId: s.chapId || null, q: c.q, a: c.a, date: j.date, seance: s.id, titre: s.titre };
      added++;
    }
  }
  if (added) saveState();
}
function allSeances() {
  const list = [];
  for (const w of Object.values(DATA.weeks)) for (const j of w.jours || []) for (const s of j.seances || []) list.push(Object.assign({ date: j.date }, s));
  return list.sort((a, b) => (a.date + a.heure).localeCompare(b.date + b.heure));
}
function findSeance(id) { return allSeances().find(s => s.id === id); }

/* ============================== CARTES ============================== */
function allCards() {
  const list = [];
  for (const c of DATA.base.cards) list.push(Object.assign({ src: 'base' }, c));
  for (const c of Object.values(state.weekCards)) list.push(Object.assign({ src: 'semaine' }, c));
  for (const c of state.custom) list.push(Object.assign({ src: 'perso' }, c));
  return list;
}
function prog(id) { return state.cards[id] || null; }
function isActive(card) {
  if (card.src === 'perso') return true;
  if (card.src === 'semaine') return card.date <= today();
  return !!state.activeChaps[card.chapId];
}
function isDue(card) {
  if (!isActive(card)) return false;
  const p = prog(card.id);
  return !p || !p.due || p.due <= today();
}
function dueCards(filterUE) { return allCards().filter(c => isDue(c) && (!filterUE || filterUE === 'all' || c.ue === filterUE)); }
function rate(card, r) {
  const p = state.cards[card.id] || { box: 0, due: today(), last: null, reviews: 0 };
  if (r === 'dur') p.box = 0; else if (r === 'facile') p.box = Math.min(p.box + 1, BOX_DAYS.length - 1);
  p.due = addDays(today(), r === 'dur' ? 1 : BOX_DAYS[p.box]);
  p.last = today(); p.reviews = (p.reviews || 0) + 1;
  state.cards[card.id] = p;
  state.stats.totalReviews++;
  state.stats.days[today()] = (state.stats.days[today()] || 0) + 1;
  markActive(); saveState();
}
function markActive() {
  const t = today();
  if (state.stats.lastActiveDate === t) return;
  state.stats.streak = state.stats.lastActiveDate === addDays(t, -1) ? state.stats.streak + 1 : 1;
  state.stats.lastActiveDate = t;
}
function currentStreak() { const l = state.stats.lastActiveDate; return (l === today() || l === addDays(today(), -1)) ? state.stats.streak : 0; }
function mastery(cards) { const act = cards.filter(isActive); if (!act.length) return { n: 0, pct: 0 }; const ok = act.filter(c => (prog(c.id) || {}).box >= 3).length; return { n: act.length, ok, pct: Math.round(100 * ok / act.length) }; }

/* ============================== INTERFACE ============================== */
const ui = { route: 'jour', arg: null, day: null, ueFilter: 'all', review: null, quiz: null, caseOpen: {}, timer: { total: 0 } };

function routeFromHash() {
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  const [r, ...rest] = h.split('/');
  ui.route = ['jour', 'cartes', 'cours', 'exercices', 'progres', 'revue', 'quiz', 'cas'].includes(r) ? r : 'jour';
  ui.arg = rest.join('/') || null;
  if (ui.route === 'jour') ui.day = ui.arg && /^\d{4}-\d{2}-\d{2}$/.test(ui.arg) ? ui.arg : (ui.day || today());
}
function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }

const TABS = [
  { id: 'jour', label: "Aujourd'hui", icon: '📅' }, { id: 'cartes', label: 'Cartes', icon: '🃏' },
  { id: 'cours', label: 'Cours', icon: '📘' }, { id: 'exercices', label: 'Exercices', icon: '✍️' }, { id: 'progres', label: 'Progrès', icon: '📈' }
];
function tabOf(route) { return { revue: 'cartes', quiz: 'exercices', cas: 'exercices' }[route] || route; }

function render() {
  let content = '';
  try {
    if (!DATA.base) content = `<div class="empty-state"><div class="big">⏳</div>Chargement…</div>`;
    else content = ({ jour: viewJour, cartes: viewCartes, revue: viewRevue, cours: viewCours, exercices: viewExercices, quiz: viewQuiz, cas: viewCas, progres: viewProgres })[ui.route]();
  } catch (e) { console.error(e); content = `<div class="card"><h3>Oups</h3><p class="muted">Une erreur d'affichage : ${esc(e.message)}</p><button class="btn btn-secondary" data-act="home">Revenir à l'accueil</button></div>`; }
  const due = DATA.base ? dueCards().length : 0;
  const active = tabOf(ui.route);
  document.getElementById('root').innerHTML = `
    <header class="topbar">
      <div class="brand"><div class="seal">§</div><div><h1>Codex DCG</h1><div class="sub">UE 1 · 5 · 8 · 9 · 12 — DCG 2028</div></div></div>
      <div class="streak-badge" title="Jours de révision d'affilée"><span class="flame">🔥</span> ${DATA.base ? currentStreak() : 0}</div>
    </header>
    <main class="view">${content}</main>
    <nav class="tabbar" aria-label="Navigation">${TABS.map(t => `<button class="tab-btn ${active === t.id ? 'active' : ''}" data-go="#/${t.id}" aria-current="${active === t.id ? 'page' : 'false'}"><span class="ic">${t.icon}</span>${t.label}${t.id === 'cartes' && due ? ` (${due})` : ''}</button>`).join('')}</nav>
    ${timerLeft() > 0 && ui.route !== 'exercices' ? `<div class="mini-timer" data-go="#/exercices" id="mini-timer">⏱️ ${fmt(timerLeft())}</div>` : ''}`;
  const key = ui.route + '|' + (ui.arg || '') + '|' + (ui.route === 'jour' ? ui.day : '');
  if (key !== lastViewKey) { window.scrollTo(0, 0); lastViewKey = key; }
}
let lastViewKey = '';

/* ---------- Aujourd'hui ---------- */
function viewJour() {
  const day = ui.day || today();
  const monday = mondayOf(day);
  const w = DATA.weeks[monday];
  if (!w && !DATA.weekErrors[monday]) { loadWeek(monday).then(render); }
  const jour = w ? (w.jours || []).find(j => j.date === day) : null;
  const seances = jour ? jour.seances || [] : [];
  const due = dueCards().length;
  const strip = [0, 1, 2, 3, 4, 5, 6].map(i => {
    const iso = addDays(monday, i); const d = parseISO(iso);
    const js = w ? ((w.jours || []).find(j => j.date === iso) || { seances: [] }).seances : [];
    const dots = js.slice(0, 4).map(s => `<span class="dot ${state.done[s.id] ? 'on' : ''}"></span>`).join('');
    return `<button class="day-btn ${iso === day ? 'active' : ''} ${iso === today() ? 'today' : ''}" data-go="#/jour/${iso}" aria-label="${longDate(iso)}"><span class="dn">${JOURS_COURTS[d.getDay()]}</span><span class="dd">${d.getDate()}</span><span class="dots">${dots}</span></button>`;
  }).join('');
  let body;
  if (!w && !DATA.weekErrors[monday]) body = `<div class="empty-state"><div class="big">⏳</div>Chargement du programme…</div>`;
  else if (!w) body = `<div class="card"><div class="eyebrow">Programme</div><h3>Pas encore de programme pour cette semaine</h3><p class="muted small">Le fichier <span class="mono">semaines/${monday}.json</span> est préparé chaque dimanche soir. Une fois déposé sur le site, il apparaît ici automatiquement.</p></div>`;
  else if (!seances.length) body = `<div class="card center"><div class="big" style="font-size:34px">🌿</div><h3>${parseISO(day).getDay() === 0 ? 'Dimanche : repos' : 'Rien de prévu ce jour-là'}</h3><p class="muted small">${esc(jour && jour.message || 'Profite pour réviser quelques cartes si tu en as envie.')}</p></div>`;
  else body = (jour.message && parseISO(day).getDay() !== 0 ? `<div class="day-msg">${esc(jour.message)}</div>` : '') + seances.map(seanceCard).join('');
  return `
    <div class="week-nav"><button class="icon-btn" data-go="#/jour/${addDays(monday, -7)}" aria-label="Semaine précédente">‹</button>
      <span class="lbl">Semaine du ${shortDate(monday)} au ${shortDate(addDays(monday, 6))}</span>
      <button class="icon-btn" data-go="#/jour/${addDays(monday, 7)}" aria-label="Semaine suivante">›</button></div>
    <div class="week-strip">${strip}</div>
    <div class="section-title"><h2>${day === today() ? "Aujourd'hui" : esc(longDate(day))}</h2>${day !== today() ? `<button class="btn btn-ghost btn-sm" data-go="#/jour/${today()}">Revenir à aujourd'hui</button>` : `<span class="muted small">${esc(longDate(day))}</span>`}</div>
    ${body}
    <div class="card accent">
      <div class="row"><div><div class="eyebrow">Révision espacée</div><h3 style="margin:2px 0 0">${due ? due + ' carte' + (due > 1 ? 's' : '') + ' à revoir' : 'Aucune carte en attente'}</h3></div><div class="spacer"></div></div>
      <p class="muted small" style="margin-top:6px">Les cartes d'un chapitre entrent dans tes révisions le jour de sa première séance.</p>
      <button class="btn btn-primary" data-act="review-due" ${due ? '' : 'disabled'}>Réviser maintenant</button>
    </div>`;
}
function resumeBlock(text, open) {
  let label = "L'essentiel", body = String(text).trim();
  const m = body.match(/^#{2,4}\s+(.+)\n?/);
  if (m) { label = m[1]; body = body.slice(m[0].length); }
  return `<details class="resume" ${open ? 'open' : ''}><summary>${esc(label)}</summary><div class="md">${md(body)}</div></details>`;
}
function seanceCard(s) {
  const done = !!state.done[s.id];
  const nCards = (s.flashcards || []).length, nQ = (s.qcm || []).length;
  const actions = [
    s.notion ? `<a class="btn btn-primary" href="${esc(s.notion)}" target="_blank" rel="noopener">📓 Séance Notion</a>` : '',
    s.video ? `<a class="btn btn-secondary" href="${esc(s.video)}" target="_blank" rel="noopener">🎬 Vidéo</a>` : '',
    nCards ? `<button class="btn btn-secondary" data-act="review-seance" data-id="${esc(s.id)}">🃏 ${nCards} carte${nCards > 1 ? 's' : ''}</button>` : '',
    nQ ? `<button class="btn btn-gold" data-go="#/quiz/w:${esc(s.id)}">✍️ QCM (${nQ})</button>` : ''
  ].filter(Boolean).join('');
  const best = state.quiz['w:' + s.id];
  return `<article class="card seance ${esc(s.ue || '')} ${done ? 'done' : ''}">
    <div class="s-head"><span class="s-time">${esc(s.heure || '')}</span>${ueTag(s.ue)}<span class="type-tag">${esc(s.type || '')}</span>${best ? `<span class="badge-static">QCM ${best.best}/100</span>` : ''}</div>
    <h3>${esc(s.titre || '')}</h3>
    ${s.manuel ? `<div class="s-manuel">📚 ${esc(s.manuel)}</div>` : ''}
    ${s.resume ? resumeBlock(s.resume, !done) : ''}
    <div class="s-actions">${actions}</div>
    <label class="check-row"><input type="checkbox" data-act="toggle-done" data-id="${esc(s.id)}" ${done ? 'checked' : ''}><span><strong>Séance faite</strong><br><span class="muted small">Coche aussi « Fait » et note ton score dans Notion.</span></span></label>
  </article>`;
}

/* ---------- Cartes ---------- */
function ueChips(current, act) {
  const ues = ['all'].concat(DATA.base.ues.map(u => u.id));
  return `<div class="ue-filter">${ues.map(u => `<button class="ue-chip ${current === u ? 'active' : ''}" data-act="${act}" data-ue="${u}">${u === 'all' ? 'Tout' : esc(u.replace('UE', 'UE ') + ' · ' + ueShort(u))}</button>`).join('')}</div>`;
}
function viewCartes() {
  const f = ui.ueFilter;
  const cards = allCards().filter(c => f === 'all' || c.ue === f);
  const due = cards.filter(isDue);
  const act = cards.filter(isActive);
  const chaps = DATA.base.chapters.filter(c => f === 'all' || c.ue === f);
  return `
    ${ueChips(f, 'filter-cards')}
    <div class="stat-grid">
      <div class="stat-box"><div class="num">${due.length}</div><div class="lbl">🃏 à revoir</div></div>
      <div class="stat-box"><div class="num">${act.length}</div><div class="lbl">📚 en révision</div></div>
    </div>
    <div class="btn-row" style="margin-bottom:14px">
      <button class="btn btn-primary" data-act="review-due" ${due.length ? '' : 'disabled'}>Réviser les ${due.length} cartes</button>
    </div>
    <button class="btn btn-ghost btn-block" data-act="review-all" style="margin-bottom:18px">Entraînement libre (toutes les cartes actives)</button>
    <div class="section-title"><h2>Par chapitre</h2></div>
    <div class="card">${chaps.map(ch => {
      const cc = allCards().filter(c => c.chapId === ch.id);
      if (!cc.length) return '';
      const on = cc.some(isActive); const m = mastery(cc); const d = cc.filter(isDue).length;
      return `<div class="chapter-row" data-go="#/cours/${ch.id}"><div class="ch-main"><span class="ch-title">${ueTag(ch.ue)} ${esc(ch.title)}</span><span class="ch-meta">${cc.length} cartes · ${on ? `${m.pct} % maîtrisées · ${d} à revoir` : 'pas encore commencé'}</span></div><span class="chev">›</span></div>`;
    }).join('') || '<p class="muted">Aucune carte pour cette UE pour l\'instant.</p>'}</div>
    <div class="section-title"><h2>Ajouter une carte</h2></div>
    <div class="card">
      <div class="field"><label for="nc-ch">UE et chapitre</label><select id="nc-ch">${DATA.base.chapters.map(c => `<option value="${c.id}">${esc(c.ue)} · ${esc(c.title)}</option>`).join('')}</select></div>
      <div class="field"><label for="nc-q">Question</label><textarea id="nc-q" placeholder="Ex. : Qu'est-ce que la partie double ?"></textarea></div>
      <div class="field"><label for="nc-a">Réponse</label><textarea id="nc-a"></textarea></div>
      <button class="btn btn-secondary btn-block" data-act="add-card">Ajouter la carte</button>
    </div>`;
}
function startReview(cards, label) {
  if (!cards.length) { toast('Aucune carte à réviser.'); return; }
  const q = cards.slice().sort(() => Math.random() - .5).slice(0, 60);
  ui.review = { queue: q.map(c => c.id), index: 0, flipped: false, label, results: { dur: 0, moyen: 0, facile: 0 }, again: [] };
  go('#/revue');
}
function viewRevue() {
  const r = ui.review;
  if (!r) return `<div class="empty-state"><div class="big">🃏</div>Aucune révision en cours.<br><br><button class="btn btn-secondary" data-go="#/cartes">Voir les cartes</button></div>`;
  const map = new Map(allCards().map(c => [c.id, c]));
  if (r.index >= r.queue.length) {
    const tot = r.results.dur + r.results.moyen + r.results.facile;
    return `<div class="card center"><div class="big" style="font-size:42px">🎉</div><h2>Révision terminée</h2>
      <p class="muted">${tot} réponse${tot > 1 ? 's' : ''} · ${r.results.facile} facile · ${r.results.moyen} moyen · ${r.results.dur} difficile</p>
      <div class="btn-row"><button class="btn btn-secondary" data-go="#/cartes">Retour aux cartes</button><button class="btn btn-primary" data-go="#/jour">Aujourd'hui</button></div></div>`;
  }
  const c = map.get(r.queue[r.index]);
  if (!c) { r.index++; return viewRevue(); }
  const ch = DATA.base.chapters.find(x => x.id === c.chapId);
  return `<button class="back-link" data-act="end-review">← Arrêter</button>
    <div class="progress-line">${esc(r.label || 'Révision')} · ${r.index + 1} / ${r.queue.length}</div>
    <div class="flip-wrap"><div class="flip-card ${r.flipped ? 'flipped' : ''}" data-act="flip" role="button" aria-label="Retourner la carte">
      <div class="flip-face front"><span class="face-tag">${ueTag(c.ue)}</span><div class="q">${esc(c.q)}</div><div class="hint">Touchez pour voir la réponse</div></div>
      <div class="flip-face back"><span class="face-tag"><span class="art-tag">Réponse</span></span><div class="a">${esc(c.a)}</div><div class="hint">${esc(ch ? ch.title : (c.titre || ''))}</div></div>
    </div></div>
    <div id="rate-area">${rateArea()}</div>`;
}
function rateArea() {
  return ui.review && ui.review.flipped
    ? `<div class="rate-row"><button class="rate-btn rate-hard" data-act="rate" data-r="dur">Difficile<br><small>revoir demain</small></button><button class="rate-btn rate-mid" data-act="rate" data-r="moyen">Moyen<br><small>même rythme</small></button><button class="rate-btn rate-easy" data-act="rate" data-r="facile">Facile<br><small>plus tard</small></button></div>`
    : `<button class="btn btn-primary" data-act="flip">Voir la réponse</button>`;
}

/* ---------- Cours ---------- */
function viewCours() {
  if (ui.arg) return viewChapitre(ui.arg);
  return DATA.base.ues.map(u => {
    const chs = DATA.base.chapters.filter(c => c.ue === u.id);
    return `<div class="section-title"><h2>${ueTag(u.id)} ${esc(u.label)}</h2></div><div class="card">${chs.map(ch => {
      const nf = DATA.base.fiches.filter(f => f.chapIds.includes(ch.id)).length;
      const ns = allSeances().filter(s => s.chapId === ch.id).length;
      return `<div class="chapter-row" data-go="#/cours/${ch.id}"><div class="ch-main"><span class="ch-title">${esc(ch.title)}</span><span class="ch-meta">${ch.hours ? ch.hours + ' h au programme · ' : ''}${nf} fiche${nf > 1 ? 's' : ''}${ns ? ' · ' + ns + ' séance' + (ns > 1 ? 's' : '') : ''}</span></div><span class="chev">›</span></div>`;
    }).join('')}</div>`;
  }).join('');
}
function viewChapitre(id) {
  const ch = DATA.base.chapters.find(c => c.id === id);
  if (!ch) return `<p>Chapitre introuvable.</p>`;
  const fiches = DATA.base.fiches.filter(f => f.chapIds.includes(id));
  const quizzes = DATA.base.quizzes.filter(q => q.chapIds.includes(id));
  const cases = DATA.base.cases.filter(c => c.chapIds.includes(id));
  const seances = allSeances().filter(s => s.chapId === id);
  const cc = allCards().filter(c => c.chapId === id);
  const m = mastery(cc); const on = !!state.activeChaps[id];
  const ann = (DATA.base.annales[ch.ue] || []);
  return `<button class="back-link" data-go="#/cours">← Tous les chapitres</button>
    <div class="card accent"><div class="row">${ueTag(ch.ue)}<span class="muted small">${esc(ueLabel(ch.ue))}</span></div>
      <h2 style="margin-top:6px">${esc(ch.title)}</h2>
      ${ch.notion && ch.notion.length ? `<div class="subhead" style="margin-top:8px">Chapitres du programme</div><ul class="notion-list">${ch.notion.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
      <div class="pill-row"><span class="pill">${cc.length} cartes</span>${on ? `<span class="pill">${m.pct} % maîtrisées</span>` : ''}${ch.hours ? `<span class="pill">${ch.hours} h</span>` : ''}</div>
      ${cc.length ? (on ? `<button class="btn btn-secondary btn-block" data-act="review-chap" data-id="${id}">Réviser les cartes du chapitre</button>` : `<button class="btn btn-secondary btn-block" data-act="activate" data-id="${id}">Ajouter ces cartes à mes révisions</button>`) : ''}
    </div>
    ${seances.length ? `<div class="section-title"><h2>Séances</h2></div><div class="card">${seances.map(s => `<div class="chapter-row" data-go="#/jour/${s.date}"><div class="ch-main"><span class="ch-title">${esc(s.titre)}</span><span class="ch-meta">${esc(longDate(s.date))} · ${esc(s.heure)}${state.done[s.id] ? ' · ✅ faite' : ''}</span></div><span class="chev">›</span></div>`).join('')}</div>` : ''}
    ${fiches.map(f => `<div class="section-title"><h2>📘 ${esc(f.title)}</h2></div><div class="card"><div class="md">${md(f.md)}</div>
      ${f.pdf ? `<button class="btn btn-primary btn-block" data-act="pdf" data-href="${esc(f.pdf)}" style="margin-top:6px">📄 Télécharger le cours complet (PDF)</button>` : ''}
      <div class="nblm-box"><div class="eyebrow">🎧 NotebookLM</div><div class="steps">1. Copie la fiche → 2. Ouvre NotebookLM → 3. Colle-la comme source → 4. « Résumé audio » ou « Résumé vidéo »</div>
      <div class="btn-row"><button class="btn btn-gold btn-sm" data-act="copy-fiche" data-id="${esc(f.id)}">📋 Copier la fiche</button><a class="btn btn-secondary btn-sm" href="https://notebooklm.google.com/" target="_blank" rel="noopener">Ouvrir NotebookLM ↗</a></div></div></div>`).join('')}
    ${!fiches.length ? `<div class="card"><p class="muted">La fiche de ce chapitre arrivera avec les séances de la semaine (résumé « L'essentiel » de chaque séance) et le cours complet dans Notion.</p></div>` : ''}
    ${quizzes.length || cases.length ? `<div class="section-title"><h2>S'entraîner</h2></div><div class="card">${quizzes.map(q => `<div class="chapter-row" data-go="#/quiz/${q.id}"><div class="ch-main"><span class="ch-title">✍️ QCM · ${esc(q.title)}</span><span class="ch-meta">${q.questions.length} questions${state.quiz[q.id] ? ' · meilleur score ' + state.quiz[q.id].best + '/100' : ''}</span></div><span class="chev">›</span></div>`).join('')}${cases.map(c => `<div class="chapter-row" data-go="#/cas/${c.id}"><div class="ch-main"><span class="ch-title">⚖️ Cas pratique · ${esc(c.title)}</span><span class="ch-meta">à faire sur feuille, corrigé inclus</span></div><span class="chev">›</span></div>`).join('')}</div>` : ''}
    ${ann.length ? `<div class="section-title"><h2>Annales</h2></div><div class="card">${ann.map(a => `<a class="link-row" href="${esc(a.url)}" target="_blank" rel="noopener"><div><div class="ll-title">${esc(a.title)}</div><div class="ll-note">${esc(a.note || '')}</div></div><span class="arrow">↗</span></a>`).join('')}<p class="muted small" style="margin-top:8px">Attention : les annales avant 2028 suivent l'ancien programme.</p></div>` : ''}`;
}

/* ---------- Exercices ---------- */
function viewExercices() {
  const weekly = allSeances().filter(s => (s.qcm || []).length && s.date <= today()).reverse();
  return `
    <div class="card accent timer-card"><div class="eyebrow">Minuteur d'épreuve</div>
      <div class="timer-display" id="timer-display">${fmt(timerLeft() > 0 ? timerLeft() : ui.timer.total)}</div>
      <div class="preset-row">${TIMER_PRESETS.map(m => `<button class="preset-btn" data-act="timer" data-min="${m}">${m < 60 ? m + ' min' : Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + (m % 60) : '')}</button>`).join('')}</div>
      ${timerLeft() > 0 ? `<button class="btn btn-ghost btn-block" data-act="timer-stop" style="margin-top:8px">Arrêter</button>` : ''}
      <p class="muted small" style="margin-top:8px">UE 9 : 4 h · UE 1 : 3 h. Le minuteur continue même si tu changes d'onglet.</p></div>
    ${weekly.length ? `<div class="section-title"><h2>QCM des séances</h2></div><div class="card">${weekly.map(s => `<div class="chapter-row" data-go="#/quiz/w:${esc(s.id)}"><div class="ch-main"><span class="ch-title">${ueTag(s.ue)} ${esc(s.titre)}</span><span class="ch-meta">${esc(longDate(s.date))} · ${s.qcm.length} questions${state.quiz['w:' + s.id] ? ' · ' + state.quiz['w:' + s.id].best + '/100' : ''}</span></div><span class="chev">›</span></div>`).join('')}</div>` : ''}
    ${DATA.base.ues.map(u => {
      const qs = DATA.base.quizzes.filter(q => DATA.base.chapters.find(c => c.id === q.chapIds[0] && c.ue === u.id));
      const cs = DATA.base.cases.filter(q => DATA.base.chapters.find(c => c.id === q.chapIds[0] && c.ue === u.id));
      if (!qs.length && !cs.length) return '';
      return `<div class="section-title"><h2>${ueTag(u.id)} ${esc(u.label)}</h2></div><div class="card">${qs.map(q => `<div class="chapter-row" data-go="#/quiz/${q.id}"><div class="ch-main"><span class="ch-title">✍️ ${esc(q.title)}</span><span class="ch-meta">QCM · ${q.questions.length} questions${state.quiz[q.id] ? ' · ' + state.quiz[q.id].best + '/100' : ''}</span></div><span class="chev">›</span></div>`).join('')}${cs.map(c => `<div class="chapter-row" data-go="#/cas/${c.id}"><div class="ch-main"><span class="ch-title">⚖️ ${esc(c.title)}</span><span class="ch-meta">Cas pratique</span></div><span class="chev">›</span></div>`).join('')}</div>`;
    }).join('')}
    <p class="muted small center">Les QCM et cas de l'UE 8, l'UE 9 et l'UE 12 arrivent avec les séances de chaque semaine.</p>`;
}
function quizById(id) {
  if (id.startsWith('w:')) { const s = findSeance(id.slice(2)); return s ? { id, title: s.titre, questions: s.qcm || [], ue: s.ue } : null; }
  const q = DATA.base.quizzes.find(x => x.id === id); return q ? Object.assign({ ue: (DATA.base.chapters.find(c => c.id === q.chapIds[0]) || {}).ue }, q) : null;
}
function viewQuiz() {
  const q = quizById(ui.arg || '');
  if (!q) return `<button class="back-link" data-go="#/exercices">← Exercices</button><p class="muted">QCM introuvable (le fichier de la semaine n'est peut-être pas encore chargé).</p>`;
  if (!ui.quiz || ui.quiz.id !== q.id) ui.quiz = { id: q.id, answers: {} };
  const A = ui.quiz.answers; const n = q.questions.length;
  const answered = Object.keys(A).length;
  const good = q.questions.filter((x, i) => A[i] === x.correctIndex).length;
  const finished = answered === n;
  return `<button class="back-link" data-act="back">← Retour</button>
    <div class="card accent"><div class="row">${ueTag(q.ue)}<span class="eyebrow">QCM</span></div><h2 style="margin-top:6px">${esc(q.title)}</h2><p class="muted small">${answered}/${n} réponses · ${good} juste${good > 1 ? 's' : ''}</p></div>
    ${finished ? `<div class="score-box"><div class="big">${Math.round(100 * good / n)}/100</div><div class="muted small">${good} bonne${good > 1 ? 's' : ''} réponse${good > 1 ? 's' : ''} sur ${n}</div></div>` : ''}
    <div class="card">${q.questions.map((x, i) => {
      const a = A[i];
      return `<div class="quiz-q"><div class="qtext">${i + 1}. ${esc(x.question)}</div>${x.options.map((o, k) => {
        let cls = ''; if (a !== undefined) { if (k === x.correctIndex) cls = 'correct'; else if (k === a) cls = 'incorrect'; }
        return `<button class="quiz-opt ${cls}" data-act="answer" data-q="${i}" data-k="${k}" ${a !== undefined ? 'disabled' : ''}>${esc(o)}</button>`;
      }).join('')}${a !== undefined && x.explication ? `<div class="explication">${esc(x.explication)}</div>` : ''}</div>`;
    }).join('')}
    <button class="btn btn-secondary btn-block" data-act="quiz-reset">↻ Recommencer</button></div>`;
}
function viewCas() {
  const c = DATA.base.cases.find(x => x.id === ui.arg);
  if (!c) return `<p>Cas introuvable.</p>`;
  const i = c.md.indexOf('## Corrigé');
  const en = i < 0 ? c.md : c.md.slice(0, i), co = i < 0 ? '' : c.md.slice(i);
  const open = !!ui.caseOpen[c.id];
  return `<button class="back-link" data-act="back">← Retour</button>
    <div class="card accent"><div class="eyebrow">Cas pratique · à faire sur feuille</div><h2 style="margin-top:6px">${esc(c.title)}</h2>
      <div class="btn-row" style="margin-top:8px"><button class="btn btn-secondary btn-sm" data-act="timer" data-min="30">⏱️ 30 min</button><button class="btn btn-secondary btn-sm" data-act="timer" data-min="45">⏱️ 45 min</button></div></div>
    <div class="card"><div class="md">${md(en)}</div></div>
    ${co ? (open ? `<div class="card"><div class="md">${md(co)}</div></div>` : `<button class="btn btn-gold btn-block" data-act="case-open" data-id="${esc(c.id)}">Afficher le corrigé</button>`) : ''}`;
}

/* ---------- Progrès ---------- */
function viewProgres() {
  const days = []; for (let i = 13; i >= 0; i--) days.push(addDays(today(), -i));
  const lv = n => !n ? '' : n < 10 ? 'l1' : n < 30 ? 'l2' : 'l3';
  const doneCount = Object.values(state.done).filter(Boolean).length;
  return `
    <div class="stat-grid">
      <div class="stat-box"><div class="num">${currentStreak()}</div><div class="lbl">🔥 jours d'affilée</div></div>
      <div class="stat-box"><div class="num">${state.stats.totalReviews}</div><div class="lbl">🃏 cartes révisées</div></div>
      <div class="stat-box"><div class="num">${doneCount}</div><div class="lbl">✅ séances faites</div></div>
      <div class="stat-box"><div class="num">${Object.keys(state.quiz).length}</div><div class="lbl">✍️ QCM terminés</div></div>
    </div>
    <div class="card"><div class="eyebrow">14 derniers jours</div><div class="heat" style="margin-top:10px">${days.map(d => `<span class="${lv(state.stats.days[d])}" title="${d} : ${state.stats.days[d] || 0} cartes"></span>`).join('')}</div></div>
    <div class="card"><div class="eyebrow">Maîtrise des cartes par UE</div><p class="muted small">Une carte est « maîtrisée » quand tu l'as réussie au moins 3 fois de suite.</p>
      ${DATA.base.ues.map(u => { const m = mastery(allCards().filter(c => c.ue === u.id)); return `<div class="mastery-row"><div class="ml"><span>${ueTag(u.id)} ${esc(u.label)}</span><span class="mono">${m.n ? m.pct + ' %' : '—'}</span></div><div class="bar ${u.id}"><span style="width:${m.pct}%"></span></div></div>`; }).join('')}
    </div>
    <div class="card"><div class="eyebrow">Sauvegarde</div>
      <p class="small muted">Ta progression est enregistrée sur cet appareil uniquement. Exporte-la de temps en temps (ou pour passer de l'ordinateur au téléphone).</p>
      <div class="btn-row"><button class="btn btn-secondary btn-sm" data-act="export">⬇️ Exporter</button><button class="btn btn-secondary btn-sm" data-act="import">⬆️ Importer</button></div>
      <input type="file" id="import-file" accept="application/json,.json" class="hidden">
    </div>
    <div class="card"><div class="eyebrow">Installer l'appli</div>
      <p class="small">Sur iPhone : ouvre le site dans Safari → bouton Partager → « Sur l'écran d'accueil ». Sur Android : menu ⋮ → « Installer l'application ». Le site fonctionne ensuite hors connexion.</p></div>
    <div class="card"><div class="eyebrow">À propos</div><p class="small muted">Codex DCG v${APP_VERSION} · contenu de base : ${DATA.base.cards.length} cartes, ${DATA.base.fiches.length} fiches · semaines chargées : ${Object.keys(DATA.weeks).sort().join(', ') || 'aucune'}.</p>
      <div class="btn-row"><button class="btn btn-ghost btn-sm" data-act="update">🔄 Chercher une mise à jour</button><button class="btn btn-ghost btn-sm" data-act="reset">Réinitialiser</button></div></div>`;
}

/* ============================== MINUTEUR ============================== */
function timerLeft() { return state && state.timerEnd ? Math.max(0, Math.round((state.timerEnd - Date.now()) / 1000)) : 0; }
function fmt(s) { s = Math.max(0, s | 0); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), r = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(r).padStart(2, '0'); }
function beep() { try { const c = new (window.AudioContext || window.webkitAudioContext)(); [0, .35, .7].forEach(t => { const o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.frequency.value = 880; g.gain.setValueAtTime(.18, c.currentTime + t); g.gain.exponentialRampToValueAtTime(.001, c.currentTime + t + .3); o.start(c.currentTime + t); o.stop(c.currentTime + t + .3); }); } catch (e) { } }
setInterval(() => {
  if (!state || !state.timerEnd) return;
  const left = timerLeft();
  const t = fmt(left);
  const a = document.getElementById('timer-display'); if (a) a.textContent = t;
  const b = document.getElementById('mini-timer'); if (b) b.textContent = '⏱️ ' + t;
  if (left <= 0) { state.timerEnd = null; saveState(); beep(); toast("⏱️ Temps écoulé !"); if (navigator.vibrate) navigator.vibrate([300, 150, 300]); render(); }
}, 1000);

/* ============================== ACTIONS ============================== */
async function downloadPdf(href) {
  const name = href.split('/').pop();
  try {
    const r = await fetch(href); if (!r.ok) throw new Error(r.status);
    const blob = await r.blob();
    const file = new File([blob], name, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
      await navigator.share({ files: [file], title: name }); return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch (e) { if (e && e.name === 'AbortError') return; toast('Téléchargement impossible hors connexion.'); }
}
function exportState() {
  const blob = new Blob([JSON.stringify({ app: 'codex-dcg', exported: new Date().toISOString(), state }, null, 1)], { type: 'application/json' });
  const name = 'codex-dcg-progression-' + today() + '.json';
  const file = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) { navigator.share({ files: [file], title: name }).catch(() => { }); return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
}
function importState(file) {
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const j = JSON.parse(fr.result); const s = j.state || j;
      if (!s || typeof s !== 'object' || !s.cards) throw new Error('format');
      if (!confirm('Remplacer la progression de cet appareil par celle du fichier ?')) return;
      state = Object.assign(freshState(), s); state.migrated = true; saveState(); toast('Progression importée.'); render();
    } catch (e) { toast("Ce fichier n'est pas une sauvegarde Codex DCG."); }
  };
  fr.readAsText(file);
}
document.addEventListener('click', e => {
  const g = e.target.closest('[data-go]');
  if (g) { e.preventDefault(); go(g.dataset.go); return; }
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act;
  if (act === 'toggle-done') return; // géré par 'change'
  if (el.tagName === 'A') return;
  switch (act) {
    case 'home': go('#/jour'); break;
    case 'back': history.length > 1 ? history.back() : go('#/jour'); break;
    case 'review-due': startReview(dueCards(ui.route === 'cartes' ? ui.ueFilter : 'all'), 'Cartes à revoir'); break;
    case 'review-all': startReview(allCards().filter(c => isActive(c) && (ui.ueFilter === 'all' || c.ue === ui.ueFilter)), 'Entraînement libre'); break;
    case 'review-seance': { const s = findSeance(el.dataset.id); if (s) startReview(allCards().filter(c => c.seance === s.id), s.titre); break; }
    case 'review-chap': startReview(allCards().filter(c => c.chapId === el.dataset.id && isActive(c)), 'Chapitre'); break;
    case 'activate': state.activeChaps[el.dataset.id] = true; saveState(); toast('Cartes ajoutées à tes révisions.'); render(); break;
    case 'filter-cards': ui.ueFilter = el.dataset.ue; render(); break;
    case 'flip': if (ui.review) { ui.review.flipped = !ui.review.flipped; const fc = document.querySelector('.flip-card'); if (fc) fc.classList.toggle('flipped', ui.review.flipped); const ra = document.getElementById('rate-area'); if (ra) ra.innerHTML = rateArea(); } break;
    case 'rate': {
      const r = ui.review; const card = allCards().find(c => c.id === r.queue[r.index]);
      if (card) { rate(card, el.dataset.r); r.results[el.dataset.r]++; if (el.dataset.r === 'dur' && !r.again.includes(card.id)) { r.again.push(card.id); r.queue.push(card.id); } }
      r.index++; r.flipped = false; render(); break;
    }
    case 'end-review': ui.review = null; go('#/cartes'); break;
    case 'add-card': {
      const q = $('#nc-q').value.trim(), a = $('#nc-a').value.trim(), chId = $('#nc-ch').value;
      if (!q || !a) { toast('Écris une question et une réponse.'); break; }
      const ch = DATA.base.chapters.find(c => c.id === chId);
      state.custom.push({ id: 'u-' + Date.now().toString(36), ue: ch.ue, chapId: chId, q, a, created: today() }); saveState(); toast('Carte ajoutée.'); render(); break;
    }
    case 'pdf': downloadPdf(el.dataset.href); break;
    case 'copy-fiche': {
      const f = DATA.base.fiches.find(x => x.id === el.dataset.id);
      const txt = '# ' + f.title + '\n\n' + f.md;
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast('Fiche copiée : colle-la dans NotebookLM.'), () => toast('Copie impossible : sélectionne le texte à la main.'));
      break;
    }
    case 'answer': {
      const i = +el.dataset.q, k = +el.dataset.k; ui.quiz.answers[i] = k;
      const q = quizById(ui.quiz.id);
      if (Object.keys(ui.quiz.answers).length === q.questions.length) {
        const score = Math.round(100 * q.questions.filter((x, j) => ui.quiz.answers[j] === x.correctIndex).length / q.questions.length);
        const prev = state.quiz[q.id]; state.quiz[q.id] = { best: Math.max(score, prev ? prev.best : 0), last: score, date: today() }; markActive(); saveState();
      }
      render(); break;
    }
    case 'quiz-reset': ui.quiz = null; render(); break;
    case 'case-open': ui.caseOpen[el.dataset.id] = true; render(); break;
    case 'timer': ui.timer.total = +el.dataset.min * 60; state.timerEnd = Date.now() + ui.timer.total * 1000; saveState(); toast('Minuteur lancé : ' + el.dataset.min + ' min.'); render(); break;
    case 'timer-stop': state.timerEnd = null; saveState(); render(); break;
    case 'export': exportState(); break;
    case 'import': $('#import-file').click(); break;
    case 'update': checkUpdate(true); break;
    case 'reset': if (confirm('Effacer toute ta progression sur cet appareil ? (Exporte-la avant si besoin.)')) { localStorage.removeItem(STORAGE_KEY); state = freshState(); state.migrated = true; saveState(); boot(); } break;
  }
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset && el.dataset.act === 'toggle-done') {
    const was = !!state.done[el.dataset.id];
    state.done[el.dataset.id] = el.checked; if (el.checked && !was) { state.stats.sessionsDone++; markActive(); }
    saveState(); render();
  }
  if (el.id === 'import-file' && el.files[0]) importState(el.files[0]);
});
window.addEventListener('hashchange', () => { routeFromHash(); render(); });

/* ============================== MISES À JOUR (service worker) ============================== */
let swReg = null;
function checkUpdate(manual) {
  if (!swReg) { if (manual) location.reload(); return; }
  swReg.update().then(() => { if (manual && !swReg.waiting) toast('Tu as déjà la dernière version.'); });
}
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost') && !params.has('nosw')) {
  navigator.serviceWorker.register('sw.js').then(reg => {
    swReg = reg;
    const ask = w => toast('Nouvelle version du site disponible.', { label: 'Mettre à jour', run: () => w.postMessage('skipWaiting') });
    if (reg.waiting) ask(reg.waiting);
    reg.addEventListener('updatefound', () => { const w = reg.installing; w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) ask(w); }); });
  }).catch(() => { });
  { let reloaded = false; navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } }); }
}

/* ============================== DÉMARRAGE ============================== */
async function boot() {
  loadState(); routeFromHash(); render();
  try { DATA.base = await getJSON('data/base.json'); }
  catch (e) { document.getElementById('root').innerHTML = `<div class="card" style="margin-top:40px"><h2>Contenu introuvable</h2><p class="muted">Impossible de charger <span class="mono">data/base.json</span>. Vérifie ta connexion, puis recharge la page.</p></div>`; return; }
  migrateLegacy();
  const m = mondayOf(today());
  await Promise.all([m, addDays(m, -7), addDays(m, -14), addDays(m, -21), addDays(m, 7)].map(loadWeek));
  saveState(); render();
}
boot();
