(() => {
'use strict';

/* ═════════ Constantes ═════════ */

const DAY = 864e5;
const KEY = 'cycle.v1';
const PILLS = {
  '21-7': { label: '21+7', pause: 7, help: '21 comprimés, puis 7 jours de pause. Vos règles surviennent pendant la pause.' },
  '24-4': { label: '24+4', pause: 4, help: '24 comprimés actifs, puis 4 comprimés placebo. Vos règles surviennent pendant les comprimés placebo.' },
  'continu': { label: 'Continu', pause: 0, help: 'Prise sans interruption ni pause : aucune règle n’est prévue.' },
};
const PILL_KEYS = Object.keys(PILLS);
const LIMITS = { periodLength: [2, 10], cycleLength: [21, 45] };
const DEFAULTS = { v: 1, lastStart: null, periodLength: 5, cycleLength: 28, pill: '21-7', marked: [], removed: [], onboarded: false };
const MONTHS_BEFORE = 6, MONTHS_AFTER = 24;

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
if (/[?&]sim\b/.test(location.search)) document.documentElement.classList.add('sim');

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

/* ═════════ Dates ═════════
   Un jour = nombre entier de jours depuis le 1er janvier 1970 (UTC) :
   aucun décalage possible avec les changements d'heure. */

const todayNum = () => { const n = new Date(); return Math.round(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) / DAY); };
const dateOf = d => new Date(d * DAY);
const dayOf = (y, m, dd) => Math.round(Date.UTC(y, m, dd) / DAY);
const mod = (a, b) => ((a % b) + b) % b;
const fmt = o => new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', ...o });
const F = {
  long: fmt({ weekday: 'long', day: 'numeric', month: 'long' }),
  longY: fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  dayMonth: fmt({ day: 'numeric', month: 'long' }),
  month: fmt({ month: 'long' }),
  wd: fmt({ weekday: 'short' }),
  shortY: fmt({ day: 'numeric', month: 'short', year: 'numeric' }),
};
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const sameYear = d => dateOf(d).getUTCFullYear() === dateOf(todayNum()).getUTCFullYear();
const longDate = d => cap((sameYear(d) ? F.long : F.longY).format(dateOf(d)));
const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
const relDays = n => n === 0 ? 'aujourd’hui' : n === 1 ? 'demain' : n === 2 ? 'après-demain' : `dans ${n} jours`;
const haptic = () => { try { if (navigator.vibrate) navigator.vibrate(10); } catch (_) { /* pas de vibration */ } };

/* ═════════ État (localStorage uniquement) ═════════ */

let S = load();
let M = new Set(S.marked);   // jours confirmés
let X = new Set(S.removed);  // jours prévus retirés

function sanitize(raw) {
  const s = { ...DEFAULTS, ...raw };
  const clamp = (v, [lo, hi], def) => Number.isInteger(v) ? Math.min(hi, Math.max(lo, v)) : def;
  s.periodLength = clamp(s.periodLength, LIMITS.periodLength, DEFAULTS.periodLength);
  s.cycleLength = clamp(s.cycleLength, LIMITS.cycleLength, DEFAULTS.cycleLength);
  if (!PILLS[s.pill]) s.pill = DEFAULTS.pill;
  if (!Number.isInteger(s.lastStart)) s.lastStart = null;
  s.marked = Array.isArray(s.marked) ? s.marked.filter(Number.isInteger) : [];
  s.removed = Array.isArray(s.removed) ? s.removed.filter(Number.isInteger) : [];
  s.onboarded = !!s.onboarded && s.lastStart !== null;
  return s;
}
function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && typeof raw === 'object') return sanitize(raw);
  } catch (_) { /* stockage indisponible */ }
  return sanitize({});
}
function save() {
  S.marked = [...M].sort((a, b) => a - b);
  S.removed = [...X].sort((a, b) => a - b);
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (_) { /* stockage indisponible */ }
}

/* ═════════ Modèle ═════════ */

const isContinu = () => S.pill === 'continu';
const cycleDay = d => mod(d - S.lastStart, S.cycleLength) + 1;
const predicted = d => !isContinu() && S.lastStart !== null && cycleDay(d) <= S.periodLength;
const status = d => M.has(d) ? 'c' : (predicted(d) && !X.has(d) ? 'p' : null);

// La pause de la plaquette commence le premier jour des règles.
function pack(d) {
  const L = S.cycleLength, pause = PILLS[S.pill].pause, active = L - pause;
  const day = mod(d - S.lastStart + (pause ? active : 0), L) + 1;
  return { day, L, pause, active, inPause: day > active, next: d + L - day + 1 };
}

function streak(d) {
  let a = d, b = d;
  while (a > d - 20 && status(a - 1)) a--;
  while (b < d + 20 && status(b + 1)) b++;
  return { start: a, end: b };
}

const nextStart = t => t - cycleDay(t) + 1 + S.cycleLength;

/* ═════════ Icônes ═════════ */

const I = {
  drop: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.4S4.6 8.4 4.6 12.4a5.4 5.4 0 0 0 10.8 0C15.4 8.4 10 2.4 10 2.4Z" fill="currentColor"/></svg>',
  pill: '<svg viewBox="0 0 20 20" aria-hidden="true"><g transform="rotate(-40 10 10)"><rect x="2.4" y="6.5" width="15.2" height="7" rx="3.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M10 6.5h4.1a3.5 3.5 0 0 1 0 7H10Z" fill="currentColor"/></g></svg>',
  cal: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.8" y="4" width="14.4" height="13" rx="3.2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M2.8 8.2h14.4M6.8 2.4v3M13.2 2.4v3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  infinity: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6.2 7.2a2.8 2.8 0 1 0 0 5.6c2.3 0 5.3-5.6 7.6-5.6a2.8 2.8 0 1 1 0 5.6c-2.3 0-5.3-5.6-7.6-5.6Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 8 14" aria-hidden="true"><path d="M1.5 1.5 6.5 7l-5 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  chevL: '<svg viewBox="0 0 11 18" aria-hidden="true"><path d="M9 1.5 1.8 9 9 16.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  chevR: '<svg viewBox="0 0 11 18" aria-hidden="true"><path d="M2 1.5 9.2 9 2 16.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  reset: '<svg viewBox="0 0 26 26" aria-hidden="true"><path d="M5.2 13a7.8 7.8 0 1 0 2.3-5.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M6.6 3.4v4.8h4.8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};
const head = (icon, title, chev = true) => `<div class="card-head">${icon}<span>${title}</span>${chev ? I.chev : ''}</div>`;

/* ═════════ Aujourd'hui ═════════ */

const R = 112, CIRC = 2 * Math.PI * R, SW = 24;
const arcs = [$('#ring-arc'), $('#ring-halo')];
const dot = $('#ring-dot');
let ticksFor = 0;

function renderTicks(L) {
  if (ticksFor === L) return;
  ticksFor = L;
  let html = '';
  for (let i = 0; i < L; i++) {
    const a = (i / L) * 2 * Math.PI, r = 86;
    html += `<circle class="ring-tick" cx="${(140 + r * Math.sin(a)).toFixed(2)}" cy="${(140 - r * Math.cos(a)).toFixed(2)}" r="${i % 7 === 0 ? 1.9 : 1.15}"/>`;
  }
  $('#ring-ticks').innerHTML = html;
}

function renderRing(t, intro) {
  const L = S.cycleLength, cont = isContinu();
  const cd = cont ? pack(t).day : cycleDay(t);
  // Mode continu : l'arc montre l'avancée dans la plaquette.
  const visible = cont ? (CIRC * (cd - 0.5)) / L : (CIRC * S.periodLength) / L;
  const len = Math.max(0.01, visible - SW);
  const angle = ((cd - 0.5) / L) * 360;
  renderTicks(L);

  arcs.forEach(a => {
    a.style.strokeDasharray = `${len} ${2 * CIRC}`;
  });
  
  if (intro && !reduceMotion.matches) {
    arcs.forEach(a => { a.style.transition = 'none'; a.style.strokeDashoffset = String(len + SW); });
    dot.style.transition = 'none';
    dot.style.transform = 'rotate(0deg)';
    dot.style.opacity = '0';
    dot.getBoundingClientRect();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      arcs.forEach(a => { a.style.transition = ''; a.style.strokeDashoffset = String(-SW / 2); });
      dot.style.transition = '';
      dot.style.transform = `rotate(${angle}deg)`;
      dot.style.opacity = '1';
    }));
  } else {
    arcs.forEach(a => { a.style.strokeDashoffset = String(-SW / 2); });
    dot.style.transform = `rotate(${angle}deg)`;
    dot.style.opacity = '1';
  }

  $('#ring-day').innerHTML = `<small>Jour</small>${cd}`;
  const st = status(t);
  let sub = cont ? 'de la plaquette' : `sur ${L} jours`;
  if (st) sub += `<br><span class="ring-chip">Règles · jour ${t - streak(t).start + 1}</span>`;
  $('#ring-sub').innerHTML = sub;

  $('#ring-stats').innerHTML = [
    [cont ? '—' : `${S.periodLength} j`, 'Règles'],
    [`${L} j`, cont ? 'Plaquette' : 'Cycle'],
    [PILLS[S.pill].label, 'Pilule'],
  ].map(([v, l]) => `<div><span class="stat-value">${v}</span><span class="stat-label">${l}</span></div>`).join('');
}

function renderNext(t) {
  const card = $('#card-next');
  if (isContinu()) {
    card.dataset.target = '';
    card.innerHTML = head(I.infinity, 'Mode continu') +
      '<div class="calm"><p><strong>Aucune règle prévue</strong>En prise continue, sans pause, les règles n’ont normalement pas lieu. Si des saignements surviennent, notez-les dans le Calendrier.</p></div>';
    return;
  }
  const st = status(t);
  if (st) {
    const { start, end } = streak(t);
    const day = t - start + 1, total = end - start + 1;
    card.dataset.target = String(start);
    let ticks = '';
    for (let i = 1; i <= total; i++) ticks += `<span class="${i === day ? 'is-on' : ''}">${i}</span>`;
    card.innerHTML = head(I.drop, 'Règles en cours') +
      `<div class="title-2 next-date tnum">Jour ${day} sur ${total}</div>
       <div class="progress"><i></i></div>
       <div class="progress-ticks" style="grid-template-columns:repeat(${total},1fr)">${ticks}</div>
       <p class="footnote" style="margin-top:10px">Fin ${st === 'c' && !predicted(end) ? 'notée' : 'prévue'} ${end === t ? 'aujourd’hui' : 'le ' + F.long.format(dateOf(end))}</p>`;
    const bar = $('.progress > i', card);
    const target = `translateX(${(-(1 - day / total) * 100).toFixed(2)}%)`;
    if (reduceMotion.matches) bar.style.transform = target;
    else requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.transform = target; }));
    return;
  }
  const next = nextStart(t);
  card.dataset.target = String(next);
  card.innerHTML = head(I.drop, 'Prochaines règles') +
    `<div class="title-2 next-date">${longDate(next)}</div>
     <div class="next-meta"><span class="pill">${cap(relDays(next - t))}</span></div>
     <p class="footnote" style="margin-top:10px">${plural(S.periodLength, 'jour')} prévus, jusqu’au ${F.long.format(dateOf(next + S.periodLength - 1))}</p>`;
}

function renderPack(t) {
  const p = pack(t), cont = isContinu();
  let main, state;
  if (S.pill === '21-7' && p.inPause) {
    main = `Pause <small>jour ${p.day - p.active} sur ${p.pause}</small>`;
    state = 'Semaine sans comprimé';
  } else if (p.inPause) {
    main = `Jour ${p.day} <small>sur ${p.L}</small>`;
    state = 'Comprimé placebo';
  } else {
    main = `Jour ${p.day} <small>sur ${S.pill === '21-7' ? p.active : p.L}</small>`;
    state = cont ? 'Prise continue' : 'Comprimé actif';
  }
  let cells = '';
  for (let i = 0; i < p.L; i++) {
    const cls = [i < p.day - 1 ? 'taken' : '', i === p.day - 1 ? 'now' : '', i >= p.active ? 'pause' : ''].filter(Boolean).join(' ');
    cells += `<i class="${cls}"></i>`;
  }
  const nextLabel = p.day === 1 ? 'Nouvelle plaquette' : 'Prochaine plaquette';
  const nextValue = p.day === 1 ? 'Aujourd’hui' : longDate(p.next);
  $('#card-pack').innerHTML = head(I.pill, 'Plaquette') +
    `<div class="pack-body">
       <div class="pack-main"><div class="title-2 tnum">${main}</div><p class="pack-state">${state}</p></div>
       <div class="blister" aria-hidden="true">${cells}</div>
     </div>
     <div class="pack-next"><span>${nextLabel}</span><span>${nextValue}</span></div>`;
}

function renderWeek(t) {
  let html = '';
  for (let i = 0; i < 7; i++) {
    const d = t + i, st = status(d);
    const name = cap(F.wd.format(dateOf(d)).replace('.', ''));
    html += `<button class="wday${i === 0 ? ' is-today' : ''}" data-d="${d}" aria-label="${longDate(d)}">
      <span class="wday-name">${name}</span>
      <span class="wday-num">${dateOf(d).getUTCDate()}</span>
      <span class="wday-dot ${st || ''}"></span></button>`;
  }
  $('#card-week').innerHTML = head(I.cal, '7 prochains jours', false) + `<div class="week">${html}</div>`;
}

function renderToday(intro = false) {
  const t = todayNum();
  $('#today-eyebrow').textContent = F.long.format(dateOf(t));
  renderRing(t, intro);
  renderNext(t);
  renderPack(t);
  renderWeek(t);
}

function playIntro() {
  const v = $('#view-today');
  v.classList.remove('intro');
  void v.offsetWidth;
  v.classList.add('intro');
  renderRing(todayNum(), true);
  setTimeout(() => v.classList.remove('intro'), 1200);
}

/* ═════════ Calendrier ═════════ */

const calScroller = $('#cal-scroller');
const calMonths = $('#cal-months');

function renderCalendar() {
  const t = todayNum(), td = dateOf(t);
  const ty = td.getUTCFullYear(), tm = td.getUTCMonth();
  let html = '';
  for (let i = -MONTHS_BEFORE; i <= MONTHS_AFTER; i++) {
    const first = dayOf(ty, tm + i, 1), fd = dateOf(first);
    const y = fd.getUTCFullYear(), m = fd.getUTCMonth();
    const len = dayOf(y, m + 1, 1) - first;
    const lead = (fd.getUTCDay() + 6) % 7;
    const current = i === 0;
    html += `<section class="month" data-m="${y}-${m}"><h2 class="month-title${current ? ' is-current' : ''}"><span class="month-name">${cap(F.month.format(fd))}</span><span class="month-year">${y}</span></h2><div class="card month-card"><div class="month-grid">`;
    for (let k = 0; k < lead; k++) html += '<span class="day is-empty"></span>';
    for (let n = 1; n <= len; n++) {
      const d = first + n - 1, st = status(d), col = (lead + n - 1) % 7;
      let cls = 'day', band = '', label = longDate(d);
      if (st) {
        const joinPrev = n > 1 && col > 0 && status(d - 1);
        const joinNext = n < len && col < 6 && status(d + 1);
        band = `<span class="band ${st}${joinPrev ? '' : ' s'}${joinNext ? '' : ' e'}"></span>`;
        cls += st === 'c' ? ' has-c' : ' has-p';
        label += st === 'c' ? ', règles confirmées' : ', règles prévues';
      }
      if (d === t) { cls += ' is-today'; label = 'Aujourd’hui, ' + label; }
      html += `<button class="${cls}" data-d="${d}" aria-label="${label}">${band}<span class="num">${n}</span></button>`;
    }
    html += '</div></div></section>';
  }
  calMonths.innerHTML = html;
}

function scrollCalendarTo(d, smooth, flash) {
  const dt = dateOf(d);
  const sec = $(`[data-m="${dt.getUTCFullYear()}-${dt.getUTCMonth()}"]`, calMonths);
  if (!sec) return;
  const top = sec.offsetTop - $('#cal-spacer').offsetHeight;
  calScroller.scrollTo({ top: Math.max(0, top), behavior: smooth && !reduceMotion.matches ? 'smooth' : 'auto' });
  if (flash) {
    const b = $(`.day[data-d="${d}"]`, sec);
    if (b) setTimeout(() => { b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash'); }, smooth ? 450 : 320);
  }
}

/* ═════════ Réglages ═════════ */

function renderControls() {
  $$('[data-show="periodLength"]').forEach(e => { e.textContent = plural(S.periodLength, 'jour'); });
  $$('[data-show="cycleLength"]').forEach(e => { e.textContent = plural(S.cycleLength, 'jour'); });
  $$('.stepper').forEach(st => {
    const k = st.dataset.key, [lo, hi] = LIMITS[k];
    const [minus, plus] = $$('button', st);
    minus.disabled = S[k] <= lo || (k === 'cycleLength' && S[k] <= S.periodLength + 1);
    plus.disabled = S[k] >= hi || (k === 'periodLength' && S[k] >= S.cycleLength - 1);
  });
  $$('.segmented').forEach(sg => {
    const idx = PILL_KEYS.indexOf(S.pill);
    $('.seg-thumb', sg).style.transform = `translateX(${idx * 100}%)`;
    $$('button', sg).forEach(b => b.setAttribute('aria-checked', String(b.dataset.v === S.pill)));
  });
  $$('[data-pill-help]').forEach(e => { e.textContent = PILLS[S.pill].help; });
  $('#val-last').textContent = S.lastStart === null ? '—' : F.shortY.format(dateOf(S.lastStart));
  $('#row-period').classList.toggle('row-disabled', isContinu());
  $('#cycle-label').textContent = isContinu() ? 'Durée de la plaquette' : 'Durée du cycle';
}

function renderAll() {
  renderToday();
  renderCalendar();
  renderControls();
}

/* ═════════ Onglets et barres ═════════ */

let currentTab = 'today';
function setTab(name) {
  const view = $(`.view[data-view="${name}"]`);
  if (name === currentTab) {
    $('.scroller', view).scrollTo({ top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    return;
  }
  currentTab = name;
  $$('.view').forEach(v => v.classList.toggle('is-active', v === view));
  $$('.tab').forEach(b => {
    const on = b.dataset.tab === name;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-selected', String(on));
  });
}

function bindLargeTitle(view) {
  const sc = $('.scroller', view), nav = $('.navbar', view), lt = $('.large-title', view);
  if (!lt) return;
  let ticking = false;
  sc.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const y = sc.scrollTop;
      nav.classList.toggle('is-scrolled', y > lt.offsetTop + lt.offsetHeight - nav.offsetHeight - 4);
      lt.style.transform = y < 0 ? `scale(${1 + Math.min(-y, 120) / 900})` : '';
    });
  }, { passive: true });
}

/* ═════════ Feuilles modales ═════════ */

function openSheet(html, cls = '') {
  const layer = document.createElement('div');
  layer.className = 'sheet-layer';
  layer.innerHTML = `<div class="sheet-backdrop"></div><div class="sheet ${cls}" role="dialog" aria-modal="true"><div class="grabber"></div>${html}</div>`;
  document.body.appendChild(layer);
  const sheet = $('.sheet', layer), backdrop = $('.sheet-backdrop', layer);
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    sheet.style.transition = '';
    backdrop.style.transition = '';
    sheet.style.transform = '';
    backdrop.style.opacity = '';
    layer.classList.remove('is-open');
    document.removeEventListener('keydown', onKey);
    let gone = false;
    const done = () => { if (!gone) { gone = true; layer.remove(); } };
    sheet.addEventListener('transitionend', e => { if (e.target === sheet) done(); });
    setTimeout(done, 700);
  };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('click', close);

  // Fermeture par glissement vers le bas
  let y0 = null, dy = 0, dragging = false, lastY = 0, lastT = 0, vel = 0, suppress = false;
  sheet.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    y0 = lastY = e.clientY; lastT = e.timeStamp; dy = 0; vel = 0; dragging = false; suppress = false;
  });
  sheet.addEventListener('pointermove', e => {
    if (y0 === null) return;
    dy = e.clientY - y0;
    if (!dragging) {
      if (Math.abs(dy) < 8) return;
      dragging = true;
      try { sheet.setPointerCapture(e.pointerId); } catch (_) { /* déjà relâché */ }
      sheet.style.transition = 'none';
      backdrop.style.transition = 'none';
    }
    const dt = Math.max(1, e.timeStamp - lastT);
    vel = 0.8 * ((e.clientY - lastY) / dt) + 0.2 * vel;
    lastY = e.clientY; lastT = e.timeStamp;
    const y = dy >= 0 ? dy : -12 * Math.log1p(-dy / 12);
    sheet.style.transform = `translateY(${y}px)`;
    backdrop.style.opacity = String(Math.max(0, 1 - Math.max(0, dy) / sheet.offsetHeight));
  });
  const end = () => {
    if (y0 === null) return;
    y0 = null;
    if (!dragging) return;
    dragging = false;
    suppress = true;
    if (dy > sheet.offsetHeight * 0.3 || (vel > 0.45 && dy > 20)) close();
    else {
      sheet.style.transition = '';
      backdrop.style.transition = '';
      sheet.style.transform = '';
      backdrop.style.opacity = '';
    }
  };
  sheet.addEventListener('pointerup', end);
  sheet.addEventListener('pointercancel', end);
  sheet.addEventListener('click', e => {
    if (suppress) { e.stopPropagation(); e.preventDefault(); suppress = false; }
  }, true);

  sheet.getBoundingClientRect();
  requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.add('is-open')));
  return { sheet, close };
}

function openDaySheet(d) {
  const t = todayNum(), st = status(d), pred = predicted(d), p = pack(d);
  const statusText = st === 'c' ? 'Règles confirmées'
    : st === 'p' ? `Règles prévues · jour ${cycleDay(d)} sur ${S.periodLength}`
    : pred ? 'Prévision retirée' : 'Aucune règle prévue';
  const packText = S.pill === '21-7' && p.inPause ? `Pause · jour ${p.day - p.active} sur ${p.pause}`
    : `Jour ${p.day} · ${p.inPause ? 'placebo' : 'comprimé actif'}`;
  let actions = '';
  if (st !== 'c') actions += '<button class="btn btn-primary" data-act="mark">Marquer comme règles</button>';
  if (st) actions += '<button class="btn btn-danger-tinted" data-act="remove">Retirer</button>';
  else if (pred) actions += '<button class="btn btn-plain" data-act="restore">Rétablir la prévision</button>';

  const { sheet, close } = openSheet(`
    <div class="sheet-day">
      ${d === t ? '<p class="eyebrow" style="color:var(--accent)">Aujourd’hui</p>' : ''}
      <h2 class="sheet-title">${longDate(d)}</h2>
      <p class="sheet-status"><i class="${st || ''}"></i>${statusText}</p>
      <div class="sheet-info"><span>Plaquette</span><span class="tnum">${packText}</span></div>
      <div class="sheet-actions">${actions}</div>
    </div>`);

  sheet.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'mark') { M.add(d); X.delete(d); haptic(); }
    if (act === 'remove') { M.delete(d); if (predicted(d)) X.add(d); haptic(); }
    if (act === 'restore') X.delete(d);
    save();
    renderAll();
    close();
  });
}

function openDateSheet() {
  let value = S.lastStart;
  const { sheet, close } = openSheet(`
    <div class="sheet-head">
      <button class="bar-btn" data-act="cancel">Annuler</button>
      <h2>Dernières règles</h2>
      <button class="bar-btn" data-act="ok">OK</button>
    </div>
    <div class="card picker-card"></div>
    <p class="sheet-note">Le premier jour de vos dernières règles. Toutes les prévisions seront recalculées.</p>`, 'sheet-grouped');
  mountPicker($('.picker-card', sheet), value, v => { value = v; });
  sheet.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'ok' && value !== null) { S.lastStart = value; save(); renderAll(); }
    close();
  });
}

function openResetSheet() {
  const { sheet, close } = openSheet(`
    <div class="sheet-alert">
      <div class="alert-icon">${I.reset}</div>
      <h2 class="sheet-title">Réinitialiser Cycle ?</h2>
      <p>Vos réglages et tous les jours marqués seront effacés de cet iPhone. Cette action est irréversible.</p>
      <div class="sheet-actions">
        <button class="btn btn-danger" data-act="reset">Réinitialiser</button>
        <button class="btn btn-plain" data-act="cancel">Annuler</button>
      </div>
    </div>`);
  sheet.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    close();
    if (b.dataset.act !== 'reset') return;
    try { localStorage.removeItem(KEY); } catch (_) { /* stockage indisponible */ }
    S = sanitize({});
    M = new Set(); X = new Set();
    haptic();
    setTimeout(() => {
      setTab('today');
      renderAll();
      startOnboarding();
    }, 280);
  });
}

/* ═════════ Sélecteur de date en ligne ═════════ */

function mountPicker(host, value, onChange) {
  const t = todayNum(), td = dateOf(t);
  const maxIdx = td.getUTCFullYear() * 12 + td.getUTCMonth(), minIdx = maxIdx - 12;
  const start = dateOf(value ?? t);
  let idx = start.getUTCFullYear() * 12 + start.getUTCMonth();
  let sel = value;

  host.innerHTML = `
    <div class="picker-head">
      <span class="picker-label"></span>
      <div class="picker-nav">
        <button data-nav="-1" aria-label="Mois précédent">${I.chevL}</button>
        <button data-nav="1" aria-label="Mois suivant">${I.chevR}</button>
      </div>
    </div>
    <div class="picker-wd" aria-hidden="true">${['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'].map(w => `<span>${w}</span>`).join('')}</div>
    <div class="picker-grid"></div>`;
  const grid = $('.picker-grid', host), label = $('.picker-label', host);
  const [prev, next] = $$('.picker-nav button', host);

  const draw = dir => {
    const y = Math.floor(idx / 12), m = idx % 12;
    const first = dayOf(y, m, 1), len = dayOf(y, m + 1, 1) - first;
    const lead = (dateOf(first).getUTCDay() + 6) % 7;
    label.textContent = `${cap(F.month.format(dateOf(first)))} ${y}`;
    let html = '';
    for (let k = 0; k < lead; k++) html += '<span></span>';
    for (let n = 1; n <= len; n++) {
      const d = first + n - 1;
      html += `<button class="pk${d === t ? ' is-today' : ''}${d === sel ? ' is-sel' : ''}" data-d="${d}"${d > t ? ' disabled' : ''} aria-label="${longDate(d)}"><span>${n}</span></button>`;
    }
    grid.innerHTML = html;
    prev.disabled = idx <= minIdx;
    next.disabled = idx >= maxIdx;
    if (dir) {
      grid.classList.remove('slide-l', 'slide-r');
      void grid.offsetWidth;
      grid.classList.add(dir > 0 ? 'slide-l' : 'slide-r');
    }
  };

  host.addEventListener('click', e => {
    const nav = e.target.closest('[data-nav]');
    if (nav && !nav.disabled) { idx += Number(nav.dataset.nav); draw(Number(nav.dataset.nav)); return; }
    const b = e.target.closest('.pk');
    if (!b || b.disabled) return;
    sel = Number(b.dataset.d);
    $$('.pk.is-sel', grid).forEach(x => x.classList.remove('is-sel'));
    b.classList.add('is-sel');
    haptic();
    onChange(sel);
  });
  draw(0);
}

/* ═════════ Onboarding ═════════ */

const ob = $('#onboarding'), obTrack = $('#ob-track'), obNext = $('#ob-next'), obBack = $('#ob-back');
const obPages = $$('.ob-page', ob), obDots = $$('#ob-dots i');
let obPage = 0;

function updateOnboarding() {
  obTrack.style.transform = `translateX(${(-obPage * 100) / 3}%)`;
  obPages.forEach((p, i) => {
    p.classList.toggle('is-current', i === obPage);
    p.inert = i !== obPage;
  });
  obDots.forEach((d, i) => d.classList.toggle('is-active', i === obPage));
  obBack.classList.toggle('is-hidden', obPage === 0);
  obNext.textContent = obPage === 2 ? 'Commencer' : 'Continuer';
  obNext.disabled = obPage === 1 && S.lastStart === null;
}

function startOnboarding() {
  obPage = 0;
  ob.hidden = false;
  ob.classList.remove('is-leaving');
  $('#app').inert = true;
  mountPicker($('#ob-picker'), S.lastStart, v => { S.lastStart = v; updateOnboarding(); });
  renderControls();
  updateOnboarding();
}

function finishOnboarding() {
  S.onboarded = true;
  save();
  renderAll();
  $('#app').inert = false;
  ob.classList.add('is-leaving');
  setTimeout(() => { ob.hidden = true; }, 620);
  scrollCalendarTo(todayNum(), false);
  setTimeout(playIntro, 120);
}

obNext.addEventListener('click', () => {
  if (obNext.disabled) return;
  if (obPage < 2) { obPage++; updateOnboarding(); } else finishOnboarding();
});
obBack.addEventListener('click', () => {
  if (obPage > 0) { obPage--; updateOnboarding(); }
});

/* ═════════ Événements ═════════ */

document.addEventListener('click', e => {
  const tab = e.target.closest('.tab');
  if (tab) { setTab(tab.dataset.tab); return; }

  const step = e.target.closest('.stepper button');
  if (step) {
    const k = step.closest('.stepper').dataset.key, [lo, hi] = LIMITS[k];
    const v = Math.min(hi, Math.max(lo, S[k] + Number(step.dataset.step)));
    if (v !== S[k]) { S[k] = v; save(); renderAll(); }
    return;
  }

  const seg = e.target.closest('.segmented button');
  if (seg) {
    if (seg.dataset.v !== S.pill) { S.pill = seg.dataset.v; haptic(); save(); renderAll(); }
    return;
  }

  if (e.target.closest('.sheet-layer')) return;

  const day = e.target.closest('.day[data-d], .wday[data-d]');
  if (day) { openDaySheet(Number(day.dataset.d)); return; }

  const next = e.target.closest('#card-next');
  if (next) {
    setTab('calendar');
    const target = Number(next.dataset.target) || todayNum();
    scrollCalendarTo(target, false, true);
    return;
  }

  const go = e.target.closest('[data-go]');
  if (go) {
    setTab(go.dataset.go);
    if (go.dataset.go === 'calendar') scrollCalendarTo(todayNum(), false, true);
    return;
  }

  if (e.target.closest('#cal-today')) { scrollCalendarTo(todayNum(), true, true); return; }
  if (e.target.closest('#row-last')) { openDateSheet(); return; }
  if (e.target.closest('#row-reset')) openResetSheet();
});

document.addEventListener('keydown', e => {
  const el = e.target.closest && e.target.closest('[role="button"]');
  if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); el.click(); }
});

// Active :active sur iOS, bloque le zoom par pincement
document.addEventListener('touchstart', () => {}, { passive: true });
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('dblclick', e => e.preventDefault());

$$('.view').forEach(bindLargeTitle);

// Changement de jour (minuit, retour dans l'app)
let lastToday = todayNum();
const refreshDay = () => {
  if (todayNum() !== lastToday) { lastToday = todayNum(); renderAll(); }
};
setInterval(refreshDay, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshDay(); });

/* ═════════ Démarrage ═════════ */

renderAll();
requestAnimationFrame(() => scrollCalendarTo(todayNum(), false));
if (!S.onboarded) startOnboarding();
else playIntro();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}
})();
