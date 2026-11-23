// Tests for the app's core logic (timer, day math, page prefill, storage).
// The logic lives inside index.html between /*CORE-START*/ and /*CORE-END*/;
// this pulls it out and runs it in Node. Run:  npm test   (or: TZ=America/New_York node --test tests/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

if (process.env.TZ !== 'America/New_York') {
  throw new Error('Run with TZ=America/New_York so the midnight/DST tests are deterministic (npm test does this).');
}

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const src = html.split('/*CORE-START*/')[1].split('/*CORE-END*/')[0];
const ctx = {};
vm.createContext(ctx);
vm.runInContext(src, ctx);
const C = ctx.Core;

const MIN = 60000;
const at = (s) => new Date(s).getTime(); // local time strings, e.g. '2026-11-21T23:50'
const memStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
};
const plain = (o) => JSON.parse(JSON.stringify(o)); // normalise objects from the vm realm

// ---------------- timer ----------------
test('start / pause / resume counts only running time', () => {
  const T = at('2026-11-22T09:00');
  let t = C.idleTimer();
  t = C.start(t, T);
  assert.equal(C.elapsed(t, T + 5 * MIN), 5 * MIN);
  t = C.pause(t, T + 10 * MIN);
  assert.equal(C.elapsed(t, T + 60 * MIN), 10 * MIN, 'paused time does not count');
  t = C.start(t, T + 20 * MIN); // resume
  assert.equal(C.elapsed(t, T + 25 * MIN), 15 * MIN);
  t = C.pause(t, T + 30 * MIN);
  assert.equal(C.elapsed(t, T + 999 * MIN), 20 * MIN);
});

test('double start / double pause are no-ops', () => {
  const T = at('2026-11-22T09:00');
  let t = C.start(C.idleTimer(), T);
  const again = C.start(t, T + 5 * MIN);
  assert.equal(again.runStart, T, 'second start does not reset the run');
  t = C.pause(t, T + 5 * MIN);
  const p2 = C.pause(t, T + 9 * MIN);
  assert.deepEqual(plain(p2), plain(t));
  assert.equal(C.pause(C.idleTimer(), T).status, 'idle');
});

test('clock going backwards never yields negative time', () => {
  const T = at('2026-11-22T09:00');
  const t = C.start(C.idleTimer(), T);
  assert.equal(C.elapsed(t, T - 5 * MIN), 0);
  assert.equal(C.elapsed(C.pause(t, T - 5 * MIN), T), 0);
});

test('reload while running: state persists and keeps counting while "closed"', () => {
  const st = memStorage();
  const T = at('2026-11-22T09:00');
  let t = C.start(C.idleTimer(), T);
  t = C.pause(t, T + 4 * MIN);
  t = C.start(t, T + 6 * MIN);
  C.saveTimer(st, t);
  // ... app closed / phone locked for 30 minutes ...
  const reloaded = C.loadTimer(st);
  assert.equal(reloaded.status, 'running');
  assert.equal(C.elapsed(reloaded, T + 36 * MIN), 34 * MIN);
});

test('reload while paused keeps the paused time', () => {
  const st = memStorage();
  const T = at('2026-11-22T09:00');
  C.saveTimer(st, C.pause(C.start(C.idleTimer(), T), T + 7 * MIN));
  const r = C.loadTimer(st);
  assert.equal(r.status, 'paused');
  assert.equal(C.elapsed(r, T + 100 * MIN), 7 * MIN);
});

test('corrupt or missing timer state falls back to idle', () => {
  const st = memStorage();
  assert.equal(C.loadTimer(st).status, 'idle');
  st.setItem(C.TIMER_KEY, '{not json');
  assert.equal(C.loadTimer(st).status, 'idle');
  st.setItem(C.TIMER_KEY, JSON.stringify({ status: 'running', segments: [{ start: 1, end: 5 }] }));
  assert.equal(C.loadTimer(st).status, 'paused', 'running without runStart is recovered as paused');
});

// ---------------- 60 minute goal ----------------
test('today total = saved sessions + running chunk, crossing 60 minutes', () => {
  const T = at('2026-11-22T18:00');
  const data = C.freshData();
  data.sessions.push({ id: 'a', type: 'book', title: 'X', durationMs: 50 * MIN, alloc: { '2026-11-22': 50 * MIN }, startedAt: T - 60 * MIN, endedAt: T - 10 * MIN });
  const t = C.start(C.idleTimer(), T);
  const goal = 60 * MIN;
  const before = C.todayTotal(data, t, T + 9 * MIN);
  const after = C.todayTotal(data, t, T + 11 * MIN);
  assert.equal(before, 59 * MIN);
  assert.equal(after, 61 * MIN);
  assert.ok(!C.shouldCheer(before, goal, null, '2026-11-22'));
  assert.ok(C.shouldCheer(after, goal, null, '2026-11-22'), 'cheers once the goal is crossed');
  assert.ok(C.shouldCheer(after, goal, '2026-11-21', '2026-11-22'), 'yesterday’s cheer doesn’t count for today');
  assert.ok(!C.shouldCheer(after + 30 * MIN, goal, '2026-11-22', '2026-11-22'), 'only once per day');
});

test('timer has no cap: keeps counting well past the goal', () => {
  const T = at('2026-11-22T08:00');
  const t = C.start(C.idleTimer(), T);
  assert.equal(C.fmtCRT(C.elapsed(t, T + 59 * MIN + 59000)), '59:59');
  assert.equal(C.fmtCRT(C.elapsed(t, T + 60 * MIN)), '1:00:00');
  assert.equal(C.fmtCRT(C.elapsed(t, T + 135 * MIN + 7000)), '2:15:07');
});

test('formatting', () => {
  assert.equal(C.fmtClock(0), '0:00');
  assert.equal(C.fmtClock(65 * 1000), '1:05');
  assert.equal(C.fmtClock(61 * MIN + 2000), '1:01:02');
  assert.equal(C.fmtCRT(0), '00:00');
  assert.equal(C.fmtCRT(5 * MIN + 12000), '05:12');
  assert.equal(C.fmtHMS(38 * MIN + 12000), '00:38:12');
  assert.equal(C.fmtDur(40 * 1000), '<1m');
  assert.equal(C.fmtDur(59 * MIN + 59 * 1000), '59m');
  assert.equal(C.fmtDur(120 * MIN), '2h');
});

// ---------------- STOP / save flow ----------------
const HOBBIT = { type: 'book', title: 'The Hobbit', fromPage: 42 };

test('start carries the material; stop keeps it and freezes the time', () => {
  const T = at('2026-11-22T09:00');
  let t = C.start(C.idleTimer(), T, HOBBIT);
  assert.deepEqual(plain(t.material), HOBBIT);
  t = C.stop(t, T + 38 * MIN + 12000);
  assert.equal(t.status, 'paused');
  assert.deepEqual(plain(t.material), HOBBIT);
  assert.equal(C.fmtHMS(C.elapsed(t, T + 999 * MIN)), '00:38:12', 'a stopped chunk does not keep counting');
});

test('STOP without saving, then reload: the unsaved chunk comes back intact', () => {
  const st = memStorage();
  const T = at('2026-11-22T09:00');
  C.saveTimer(st, C.stop(C.start(C.idleTimer(), T, HOBBIT), T + 20 * MIN));
  // ... app closed for hours ...
  const r = C.loadTimer(st);
  assert.equal(r.status, 'paused');
  assert.equal(C.elapsed(r, T + 600 * MIN), 20 * MIN);
  assert.deepEqual(plain(r.material), HOBBIT);
  const d = C.draftFromTimer(r, T + 600 * MIN);
  assert.equal(d.endedAt, T + 20 * MIN, 'saved session ends when STOP was pressed, not when it was saved');
});

test('STOP then discard leaves nothing behind', () => {
  const st = memStorage();
  const data = C.freshData();
  const T = at('2026-11-22T09:00');
  C.saveTimer(st, C.stop(C.start(C.idleTimer(), T, HOBBIT), T + 20 * MIN));
  C.saveTimer(st, C.idleTimer()); // discard
  const r = C.loadTimer(st);
  assert.equal(r.status, 'idle');
  assert.equal(C.todayTotal(data, r, T + 30 * MIN), 0, 'discarded time no longer counts toward today');
});

test('a stopped-but-unsaved chunk still counts toward today until discarded', () => {
  const T = at('2026-11-22T09:00');
  const t = C.stop(C.start(C.idleTimer(), T, HOBBIT), T + 25 * MIN);
  assert.equal(C.todayTotal(C.freshData(), t, T + 90 * MIN), 25 * MIN);
});

test('STOP immediately gives a zero-length chunk (nothing to save)', () => {
  const T = at('2026-11-22T09:00');
  const t = C.stop(C.start(C.idleTimer(), T, HOBBIT), T);
  assert.equal(C.draftFromTimer(t, T).durationMs, 0);
});

test('a timer saved by the old version (no material) still loads', () => {
  const st = memStorage();
  st.setItem(C.TIMER_KEY, JSON.stringify({ status: 'running', segments: [], runStart: at('2026-11-22T09:00') }));
  const r = C.loadTimer(st);
  assert.equal(r.status, 'running');
  assert.equal(r.material, undefined);
  st.setItem(C.TIMER_KEY, JSON.stringify({ status: 'running', segments: [], runStart: 1, material: { type: 'novel', title: 5 } }));
  assert.equal(C.loadTimer(st).material, undefined, 'junk material is dropped');
});

test('session number counts today’s saved sessions', () => {
  const s = (day) => ({ alloc: { [day]: MIN }, endedAt: 0 });
  assert.equal(C.sessionNumber([s('2026-11-22'), s('2026-11-21'), s('2026-11-22')], '2026-11-22'), 3);
  assert.equal(C.sessionNumber([], '2026-11-22'), 1);
});

// ---------------- the mouse ----------------
test('mouse grid is 24×24 and only uses the legend colours', () => {
  assert.equal(C.MOUSE.length, 24);
  for (const row of C.MOUSE) { assert.equal(row.length, 24); assert.match(row, /^[KGPW.]+$/); }
});

test('mood overrides', () => {
  const at2 = (g, x, y) => g[y][x];
  const sleep = C.mouseGrid('sleeping');
  assert.equal(sleep[9].slice(6, 8), 'KK'); assert.equal(sleep[9].slice(14, 16), 'KK');
  const read = C.mouseGrid('reading');
  assert.equal(read[15].slice(7, 15), 'KKKKKKKK');
  assert.equal(read[16].slice(7, 15), 'KWWKKWWK');
  assert.equal(at2(read, 6, 16), 'P'); assert.equal(at2(read, 15, 16), 'P');
  const cheer = C.mouseGrid('cheering');
  assert.equal(at2(cheer, 7, 8), 'K'); assert.equal(at2(cheer, 7, 9), 'G'); assert.equal(at2(cheer, 6, 9), 'K');
  assert.equal(cheer[13].slice(10, 12), 'KK');
  assert.deepEqual(plain(C.mouseGrid('base')), plain(C.MOUSE));
});

test('pixel rects: one per horizontal run, and they redraw the grid exactly', () => {
  for (const mood of ['base', 'sleeping', 'reading', 'cheering']) {
    const grid = C.mouseGrid(mood);
    const rects = C.gridRects(grid, C.MOUSE_COLORS);
    const back = Array.from({ length: 24 }, () => Array(24).fill('.'));
    const rev = Object.fromEntries(Object.entries(C.MOUSE_COLORS).map(([k, v]) => [v, k]));
    for (const r of rects) for (let i = 0; i < r.w; i++) back[r.y][r.x + i] = rev[r.fill];
    assert.deepEqual(back.map((r) => r.join('')), plain(grid), mood);
    for (let i = 1; i < rects.length; i++) {
      const a = rects[i - 1], b = rects[i];
      assert.ok(!(a.y === b.y && a.x + a.w === b.x && a.fill === b.fill), 'adjacent same-colour runs are merged');
    }
  }
  const svg = C.svgPixels(['XX.X'], { X: '#111111' }, 4);
  assert.match(svg, /shape-rendering="crispEdges"/);
  assert.match(svg, /width="16" height="4"/);
  assert.equal((svg.match(/<rect/g) || []).length, 2);
});

// ---------------- midnight ----------------
test('a chunk running across midnight is split between the two days', () => {
  let t = C.start(C.idleTimer(), at('2026-11-21T23:50'));
  const now = at('2026-11-22T00:20');
  assert.deepEqual(plain(C.timerAlloc(t, now)), { '2026-11-21': 10 * MIN, '2026-11-22': 20 * MIN });
  // the ring after midnight only shows today's part
  assert.equal(C.todayTotal(C.freshData(), t, now), 20 * MIN);
  t = C.pause(t, now);
  const d = C.draftFromTimer(t, now);
  assert.equal(d.durationMs, 30 * MIN);
  const s = { id: 's', type: 'poem', title: 'p', durationMs: d.durationMs, alloc: d.alloc, startedAt: d.startedAt, endedAt: d.endedAt };
  assert.equal(C.sessionDay(s), '2026-11-22', 'listed under the day it ended');
  const totals = C.dayTotals([s]);
  assert.equal(totals['2026-11-21'], 10 * MIN);
  assert.equal(totals['2026-11-22'], 20 * MIN);
});

test('pause before midnight, resume after: segments land on the right days', () => {
  let t = C.start(C.idleTimer(), at('2026-11-21T23:30'));
  t = C.pause(t, at('2026-11-21T23:45'));
  t = C.start(t, at('2026-11-22T00:10'));
  assert.deepEqual(plain(C.timerAlloc(t, at('2026-11-22T00:15'))), { '2026-11-21': 15 * MIN, '2026-11-22': 5 * MIN });
});

test('editing the time of a cross-midnight session rescales each day proportionally', () => {
  const alloc = { '2026-11-21': 10 * MIN, '2026-11-22': 20 * MIN };
  assert.deepEqual(plain(C.scaleAlloc(alloc, 60 * MIN, '2026-11-22')), { '2026-11-21': 20 * MIN, '2026-11-22': 40 * MIN });
  const odd = C.scaleAlloc(alloc, 7 * MIN + 1, '2026-11-22');
  assert.equal(odd['2026-11-21'] + odd['2026-11-22'], 7 * MIN + 1, 'rounding never loses time');
  assert.deepEqual(plain(C.scaleAlloc({}, 5 * MIN, '2026-11-22')), { '2026-11-22': 5 * MIN });
});

test('DST fall-back night (Nov 1 2026, 25-hour day) splits correctly', () => {
  // 23:00 EDT Oct 31 → 03:00 EST Nov 1 is 5 real hours.
  const a = at('2026-10-31T23:00'), b = at('2026-11-01T03:00');
  assert.equal(b - a, 5 * 60 * MIN);
  assert.deepEqual(plain(C.splitByDay(a, b)), { '2026-10-31': 60 * MIN, '2026-11-01': 4 * 60 * MIN });
});

test('addDays steps over DST and month/year boundaries', () => {
  assert.equal(C.addDays('2026-11-01', -1), '2026-10-31');
  assert.equal(C.addDays('2026-03-09', -1), '2026-03-08');
  assert.equal(C.addDays('2027-01-01', -1), '2026-12-31');
});

// ---------------- streak & week ----------------
test('streak counts consecutive goal days; an unfinished today does not break it', () => {
  const g = 60 * MIN;
  const totals = { '2026-11-19': 61 * MIN, '2026-11-20': 60 * MIN, '2026-11-21': 90 * MIN, '2026-11-22': 10 * MIN, '2026-11-17': 70 * MIN };
  assert.equal(C.streak(totals, '2026-11-22', g), 3);
  totals['2026-11-22'] = 60 * MIN;
  assert.equal(C.streak(totals, '2026-11-22', g), 4);
  assert.equal(C.streak({ '2026-11-20': 99 * MIN }, '2026-11-22', g), 0, 'missed yesterday breaks it');
  const wk = C.week(totals, '2026-11-22', g);
  assert.equal(wk.length, 7);
  assert.equal(wk[6].key, '2026-11-22'); assert.ok(wk[6].today);
  assert.deepEqual(plain(wk.map((d) => d.hit)), [false, true, false, true, true, true, true]);
});

// ---------------- page prefill ----------------
function libraryData() {
  const data = C.freshData();
  const now = at('2026-11-22T12:00');
  const b1 = C.upsertBook(data, 'The Hobbit', now);
  const b2 = C.upsertBook(data, 'Dune', now);
  const S = (id, bookId, startPage, endPage, endedAt) => ({ id, type: 'book', title: '', bookId, startPage, endPage, note: '', durationMs: MIN, alloc: { [C.dayKey(endedAt)]: MIN }, startedAt: endedAt - MIN, endedAt });
  data.sessions.push(
    S('h1', b1.id, 1, 40, at('2026-11-20T10:00')),
    S('h2', b1.id, 40, 88, at('2026-11-21T10:00')),
    S('d1', b2.id, 1, 300, at('2026-11-22T09:00')), // other book, more recent
    S('h0', b1.id, null, null, at('2026-11-22T08:00')), // newest Hobbit session, but no pages logged
  );
  data.sessions.push({ id: 'art', type: 'article', title: 'The Hobbit', bookId: null, startPage: null, endPage: 999, note: '', durationMs: MIN, alloc: { '2026-11-22': MIN }, startedAt: 0, endedAt: at('2026-11-22T11:00') });
  return { data, b1, b2 };
}

test('prefill: start page = last end page logged for that book', () => {
  const { data, b1, b2 } = libraryData();
  assert.equal(C.lastEndPage(data.sessions, b1.id), 88, 'skips sessions without pages, ignores other books and articles');
  assert.equal(C.lastEndPage(data.sessions, b2.id), 300);
  assert.equal(C.prefillStartPage(data, 'The Hobbit'), 88);
  assert.equal(C.prefillStartPage(data, '  the   HOBBIT '), 88, 'title match is case/space-insensitive');
  assert.equal(C.prefillStartPage(data, 'A Brand New Book'), null);
  assert.equal(C.prefillStartPage(data, ''), null);
});

test('prefill when editing ignores the session being edited', () => {
  const { data, b1 } = libraryData();
  assert.equal(C.lastEndPage(data.sessions, b1.id, 'h2'), 40);
});

test('prefill picks up the session you just saved', () => {
  const { data, b1 } = libraryData();
  data.sessions.push({ id: 'h3', type: 'book', bookId: b1.id, title: '', startPage: 88, endPage: 120, durationMs: MIN, alloc: {}, endedAt: at('2026-11-22T13:00') });
  assert.equal(C.prefillStartPage(data, 'The Hobbit'), 120);
});

test('pages read', () => {
  assert.equal(C.pagesRead(40, 88), 48);
  assert.equal(C.pagesRead(88, 40), null);
  assert.equal(C.pagesRead(null, 40), null);
  assert.equal(C.pagesRead(10, 10), 0);
});

test('upsertBook dedupes by title and un-archives', () => {
  const data = C.freshData();
  const a = C.upsertBook(data, 'Dune', 1);
  a.archived = true;
  const b = C.upsertBook(data, ' dune ', 2);
  assert.equal(a, b);
  assert.equal(data.books.length, 1);
  assert.equal(b.archived, false);
});

test('book stats: total time, last page, session count', () => {
  const { data, b1 } = libraryData();
  const s = C.bookStats(data)[b1.id];
  assert.equal(s.totalMs, 3 * MIN);
  assert.equal(s.count, 3);
  assert.equal(s.lastPage, 88);
});

// ---------------- storage ----------------
test('empty storage gives fresh data with a schema version', () => {
  const r = C.loadData(memStorage());
  assert.equal(r.data.schema, C.SCHEMA);
  assert.equal(r.data.settings.goalMin, 60);
  assert.equal(r.warning, undefined);
});

test('corrupt storage is set aside and the app starts fresh', () => {
  const st = memStorage();
  st.setItem(C.KEY, '{"sessions": [oops');
  const r = C.loadData(st);
  assert.equal(r.data.sessions.length, 0);
  assert.ok(r.warning);
  assert.ok([...st.m.keys()].some((k) => k.startsWith(C.KEY + '.corrupt.')), 'raw copy kept');
});

test('save → load round trip', () => {
  const st = memStorage();
  const { data } = libraryData();
  C.saveData(st, data);
  const back = C.loadData(st).data;
  assert.equal(back.sessions.length, data.sessions.length);
  assert.equal(C.prefillStartPage(back, 'the hobbit'), 88);
});

test('sanitize repairs partial data (no schema, bad entries, lost book links)', () => {
  const d = C.sanitize({
    settings: { goalMin: 'abc' },
    books: [{ title: '' }, { id: 'x', title: 'Kept' }],
    sessions: [
      null,
      { durationMs: -4, endedAt: 1 },
      { type: 'book', title: 'Orphan Book', bookId: 'gone', durationMs: MIN, endedAt: at('2026-11-22T10:00'), endPage: '12' },
      { type: 'weird', title: 'Y', durationMs: MIN, endedAt: at('2026-11-22T10:00') },
    ],
  });
  assert.equal(d.schema, C.SCHEMA);
  assert.equal(d.settings.goalMin, 60);
  assert.equal(d.sessions.length, 2);
  const orphan = d.sessions.find((s) => s.title === 'Orphan Book');
  assert.ok(d.books.find((b) => b.id === orphan.bookId), 're-linked to a book by title');
  assert.equal(orphan.endPage, 12);
  assert.deepEqual(plain(orphan.alloc), { '2026-11-22': MIN });
});

test('export → import round trip, and import rejects junk', () => {
  const { data } = libraryData();
  const back = C.importJSON(C.exportJSON(data, Date.now()));
  assert.equal(back.sessions.length, data.sessions.length);
  assert.equal(back.books.length, data.books.length);
  assert.throws(() => C.importJSON('nope'), /valid JSON/);
  assert.throws(() => C.importJSON('{"hello":1}'), /reading log backup/);
  assert.throws(() => C.importJSON('{"schema":99,"sessions":[]}'), /newer version/);
});
