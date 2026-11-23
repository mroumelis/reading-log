// Tests for the app's core logic (timer, logical days, pages, page pickup, import, storage).
// The logic lives inside index.html between /*CORE-START*/ and /*CORE-END*/;
// this pulls it out and runs it in Node. Run:  npm test   (runs with TZ=America/Chicago)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

if (process.env.TZ !== 'America/Chicago') {
  throw new Error('Run with TZ=America/Chicago so the day-boundary/DST tests are deterministic (npm test does this).');
}

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const src = html.split('/*CORE-START*/')[1].split('/*CORE-END*/')[0];
const ctx = {};
vm.createContext(ctx);
vm.runInContext(src, ctx);
const C = ctx.Core;
const BACKFILL = readFileSync(new URL('../backfill.json', import.meta.url), 'utf8');

const MIN = 60000;
const HOUR = 60 * MIN;
const at = (s) => new Date(s).getTime(); // local (Chicago) time strings, e.g. '2026-11-23T00:37'
const memStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
};
const plain = (o) => JSON.parse(JSON.stringify(o)); // normalise objects from the vm realm
const withBackfill = () => C.mergeJSON(C.freshData(), BACKFILL).data;
const timed = (id, bookId, title, startStr, min, pages) => {
  const startedAt = at(startStr);
  return { id, manual: false, date: null, type: 'book', title, bookId, startedAt, endedAt: startedAt + min * MIN, addedAt: startedAt + min * MIN, durationMs: min * MIN, pages: pages || '', pagesRead: C.parsePages(pages).count || null, pagesOverride: null, note: '' };
};
const manual = (id, bookId, title, date, min, pages, addedAt) => ({ id, manual: true, date, type: 'book', title, bookId, startedAt: null, endedAt: null, addedAt: addedAt ?? at(date + 'T12:00'), durationMs: min * MIN, pages, pagesRead: C.parsePages(pages).count || null, pagesOverride: null, note: '' });

// ---------------- logical day (3:00 AM boundary) ----------------
test('12:37 AM still belongs to the previous date', () => {
  assert.equal(C.logicalDay(at('2026-11-23T00:37'), 3), '2026-11-22');
  assert.equal(C.today(C.freshData(), at('2026-11-23T00:37')), '2026-11-22', 'default day start is 3 AM');
});

test('2:59 AM vs 3:00 AM', () => {
  assert.equal(C.logicalDay(at('2026-11-23T02:59'), 3), '2026-11-22');
  assert.equal(C.logicalDay(at('2026-11-23T03:00'), 3), '2026-11-23');
  assert.equal(C.logicalDay(at('2026-11-23T23:59'), 3), '2026-11-23');
});

test('DST fall-back night (Nov 1 2026): uses the local clock, not a fixed 3 hours', () => {
  const midnight = at('2026-11-01T00:30'); // 00:30 CDT
  assert.equal(C.logicalDay(midnight + 3 * HOUR, 3), '2026-10-31', '3 real hours later the clock says 02:30 CST — still Oct 31');
  assert.equal(C.logicalDay(midnight + 3.5 * HOUR, 3), '2026-11-01', 'clock says 03:00 CST — new day');
});

test('DST spring-forward night (Mar 8 2026)', () => {
  const t = at('2026-03-08T01:59'); // CST
  assert.equal(C.logicalDay(t, 3), '2026-03-07');
  assert.equal(C.logicalDay(t + MIN, 3), '2026-03-08', 'one real minute later the clock jumps to 03:00 CDT');
});

test('day start is adjustable (0 = plain calendar days)', () => {
  assert.equal(C.logicalDay(at('2026-11-23T00:37'), 0), '2026-11-23');
  assert.equal(C.logicalDay(at('2026-11-23T04:30'), 5), '2026-11-22');
  assert.equal(C.fmtHour(3), '3:00 AM');
  assert.equal(C.fmtHour(0), '12:00 AM');
});

test('a timed session running across 3 AM is not split: it counts for the day it started', () => {
  const data = C.freshData();
  data.sessions.push(timed('t', null, 'X', '2026-11-23T02:30', 60));
  const totals = C.dayTotals(data);
  assert.equal(totals['2026-11-22'], 60 * MIN);
  assert.equal(totals['2026-11-23'], undefined);
});

test('changing the day start regroups timed sessions but never moves manual ones', () => {
  const data = C.freshData();
  data.sessions.push(timed('t', null, 'X', '2026-11-23T01:00', 20));
  data.sessions.push(manual('m', null, 'Y', '2026-11-22', 30, ''));
  assert.deepEqual(plain(C.dayTotals(data)), { '2026-11-22': 50 * MIN });
  data.settings.dayStart = 0;
  assert.deepEqual(plain(C.dayTotals(data)), { '2026-11-23': 20 * MIN, '2026-11-22': 30 * MIN });
});

test('addDays steps over DST and month/year boundaries', () => {
  assert.equal(C.addDays('2026-11-01', -1), '2026-10-31');
  assert.equal(C.addDays('2026-03-09', -1), '2026-03-08');
  assert.equal(C.addDays('2027-01-01', -1), '2026-12-31');
});

// ---------------- the backfill, totals and streak ----------------
test('backfill: Nov 22 shows 46 min until more is logged; streak counts Nov 15–21 as 7 days', () => {
  const data = withBackfill();
  const now = at('2026-11-23T00:44'); // logical Nov 22
  assert.equal(C.todayTotal(data, C.idleTimer(), now), 46 * MIN);
  const totals = C.dayTotals(data);
  for (let d = 15; d <= 21; d++) assert.ok(totals[`2026-11-${d}`] >= 60 * MIN, `Nov ${d} hits the goal`);
  assert.equal(C.streak(totals, '2026-11-22', 60 * MIN), 7, 'unfinished Nov 22 doesn’t break it');
  const wk = C.week(totals, '2026-11-22', 60 * MIN);
  assert.deepEqual(plain(wk.map((d) => d.hit)), [true, true, true, true, true, true, false]);
});

test('tonight’s 14 minutes with the timer (after midnight, before 3 AM) count toward Nov 22', () => {
  const data = withBackfill();
  const start = at('2026-11-23T00:50');
  const t = C.start(C.idleTimer(), start, { type: 'book', title: 'Bird by Bird', fromPage: 80 });
  const now = start + 14 * MIN;
  assert.equal(C.todayTotal(data, t, now), 60 * MIN);
  assert.ok(C.shouldCheer(C.todayTotal(data, t, now), 60 * MIN, null, C.today(data, now)));
  const totals = C.dayTotals(data, t, now);
  assert.equal(C.streak(totals, '2026-11-22', 60 * MIN), 8);
  // and the next morning it is still Nov 22's time
  assert.equal(C.dayTotals(data, C.stop(t, now), at('2026-11-23T09:00'))['2026-11-22'], 60 * MIN);
  assert.equal(C.today(data, at('2026-11-23T09:00')), '2026-11-23');
});

test('streak: a missed day breaks it', () => {
  const g = 60 * MIN;
  assert.equal(C.streak({ '2026-11-20': 99 * MIN }, '2026-11-22', g), 0);
  assert.equal(C.streak({ '2026-11-21': 60 * MIN, '2026-11-22': 61 * MIN }, '2026-11-22', g), 2);
});

// ---------------- pages ----------------
test('roman numerals', () => {
  assert.equal(C.romanToInt('xi'), 11);
  assert.equal(C.romanToInt('xxxi'), 31);
  assert.equal(C.romanToInt('XIV'), 14);
  assert.equal(C.romanToInt('McMxcIv'), 1994);
  for (const bad of ['iiii', 'vx', 'ic', 'abc', '', 'x1']) assert.equal(C.romanToInt(bad), null, bad);
});

test('page ranges: counts, mixed ranges, dashes, case, single pages', () => {
  const p = (s) => C.parsePages(s);
  assert.equal(p('xi–xxxi').count, 21);
  assert.equal(p('xi-xxxi, 3-32').count, 51);
  assert.equal(p('XI – XXXI ,3 —32').count, 51, 'uppercase, spaces, em dash');
  assert.equal(p('33-79').count, 47);
  assert.equal(p('266-318').count, 53);
  assert.equal(p('40').count, 1);
  assert.equal(p('').count, 0); assert.ok(p('').empty);
  assert.equal(p('xi-xxxi, 3-32').lastArabic, 32);
  assert.equal(p('xi-xxxi').lastArabic, null, 'roman ranges never give a page to pick up from');
});

test('page ranges: invalid text is flagged but valid parts still count', () => {
  const r = C.parsePages('33-79, chapter 2');
  assert.equal(r.count, 47);
  assert.deepEqual(plain(r.errors), ['chapter 2']);
  assert.deepEqual(plain(C.parsePages('79-33').errors), ['79-33'], 'end before start');
  assert.deepEqual(plain(C.parsePages('x-5').errors), ['x-5'], 'roman and arabic mixed in one range');
  assert.deepEqual(plain(C.parsePages('1-2-3').errors), ['1-2-3']);
  assert.equal(C.parsePages('33-').errors.length, 1, 'an unfinished "33-" is flagged');
  assert.equal(C.prettyPages('xi-xxxi,3-32'), 'xi–xxxi, 3–32');
});

test('pages read uses the override when set', () => {
  assert.equal(C.pagesCount({ pagesRead: 47, pagesOverride: null }), 47);
  assert.equal(C.pagesCount({ pagesRead: 47, pagesOverride: 40 }), 40);
  assert.equal(C.pagesCount({ pagesRead: null, pagesOverride: null }), null);
});

// ---------------- pickup page ----------------
test('backfill pickup: As If We Were Staying → p.319, Bird by Bird → p.80', () => {
  const data = withBackfill();
  assert.equal(C.pickupPage(data, 'As If We Were Staying'), 319);
  assert.equal(C.pickupPage(data, 'bird by bird'), 80);
  const st = C.bookStats(data);
  assert.equal(st['book-as-if-we-were-staying'].lastPage, 318);
  assert.equal(st['book-bird-by-bird'].lastPage, 79);
  assert.equal(st['book-bird-by-bird'].pages, 98);
  assert.equal(data.books.find((b) => b.id === 'book-bird-by-bird').author, 'Anne Lamott');
});

test('after the intro "xi–xxxi" alone there is no pickup; after "3–32" it is p.33', () => {
  const data = C.freshData();
  const b = C.upsertBook(data, 'Bird by Bird', 0);
  data.sessions.push(manual('a', b.id, 'Bird by Bird', '2026-11-21', 30, 'xi-xxxi'));
  assert.equal(C.pickupPage(data, 'Bird by Bird'), null);
  data.sessions.push(manual('b', b.id, 'Bird by Bird', '2026-11-21', 34, '3-32'));
  assert.equal(C.pickupPage(data, 'Bird by Bird'), 33);
});

test('adding a past-dated entry after newer ones never changes the pickup page', () => {
  const data = withBackfill();
  const bid = 'book-bird-by-bird';
  // typed in today, dated Nov 20 (before both Bird by Bird entries)
  data.sessions.push(manual('old', bid, 'Bird by Bird', '2026-11-20', 10, '200-210', at('2026-11-23T00:40')));
  assert.equal(C.pickupPage(data, 'Bird by Bird'), 80, 'latest by date still wins, not latest saved');
  assert.equal(C.readingOrder(data).filter((s) => s.bookId === bid).map((s) => s.id).join(','), 'old,seed-2026-11-21,seed-2026-11-22');
});

test('prefill for a past date uses the latest entry before that date', () => {
  const data = withBackfill();
  assert.equal(C.pickupPage(data, 'Bird by Bird', { date: '2026-11-20' }), null, 'nothing before Nov 21 → blank');
  assert.equal(C.pickupPage(data, 'Bird by Bird', { date: '2026-11-21' }), 33, 'another entry on Nov 21 picks up after 3–32');
  assert.equal(C.pickupPage(data, 'Bird by Bird', { date: '2026-11-22' }), 80);
  assert.equal(C.pickupPage(data, 'As If We Were Staying', { date: '2026-11-17' }), 160);
  assert.equal(C.pickupPage(data, 'Bird by Bird', { beforeId: 'seed-2026-11-22' }), 33, 'editing an entry looks only before it');
  assert.equal(C.pickupPage(data, 'Nonexistent'), null);
});

test('tonight’s timed session (logical Nov 22) comes after the Nov 22 manual entry for pages', () => {
  const data = withBackfill();
  data.sessions.push(timed('tonight', 'book-bird-by-bird', 'Bird by Bird', '2026-11-23T00:50', 14, '80-95'));
  assert.equal(C.pickupPage(data, 'Bird by Bird'), 96);
});

test('a past-dated manual entry sorts after that day’s timed sessions', () => {
  const data = C.freshData();
  data.sessions.push(manual('m', null, 'X', '2026-11-20', 10, '', at('2026-11-23T00:40')));
  data.sessions.push(timed('t1', null, 'X', '2026-11-20T21:00', 10));
  data.sessions.push(timed('t0', null, 'X', '2026-11-20T08:00', 10));
  assert.equal(C.readingOrder(data).map((s) => s.id).join(','), 't0,t1,m');
  assert.equal(C.displayOrder(data, data.sessions).map((s) => s.id).join(','), 't0,t1,m');
});

test('manual entries on the same day keep the order they were added', () => {
  const data = C.freshData();
  data.sessions.push(manual('a', null, 'X', '2026-11-20', 10, '', 5));
  data.sessions.push(manual('b', null, 'X', '2026-11-20', 10, '', 5));
  data.sessions.push(manual('c', null, 'X', '2026-11-20', 10, '', 6));
  assert.equal(C.readingOrder(data).map((s) => s.id).join(','), 'a,b,c');
});

// ---------------- import / export ----------------
test('importing the backfill is idempotent', () => {
  const once = C.mergeJSON(C.freshData(), BACKFILL);
  assert.equal(once.added, 8); assert.equal(once.books, 2);
  const twice = C.mergeJSON(once.data, BACKFILL);
  assert.equal(twice.added, 0); assert.equal(twice.skipped, 8); assert.equal(twice.books, 0);
  assert.equal(twice.data.sessions.length, 8);
  assert.equal(twice.data.books.length, 2);
});

test('merge never replaces existing data, and matches books by title', () => {
  const data = C.freshData();
  data.settings.goalMin = 45;
  const mine = C.upsertBook(data, 'bird by bird', 0);
  data.sessions.push(timed('mine', mine.id, 'bird by bird', '2026-11-10T20:00', 30, '1-2'));
  const r = C.mergeJSON(data, BACKFILL);
  assert.equal(r.data.settings.goalMin, 45, 'settings untouched');
  assert.equal(r.data.books.length, 2, 'no duplicate Bird by Bird');
  const bb = r.data.books.find((b) => b.id === mine.id);
  assert.equal(bb.author, 'Anne Lamott', 'author filled in');
  assert.ok(r.data.sessions.filter((s) => s.title === 'Bird by Bird').every((s) => s.bookId === mine.id));
  assert.ok(r.data.sessions.some((s) => s.id === 'mine'));
  assert.equal(data.sessions.length, 1, 'input object not mutated');
});

test('export → import round-trips manual entries, pages and overrides', () => {
  const data = withBackfill();
  data.sessions[0].pagesOverride = 50;
  data.settings.dayStart = 4;
  const back = C.importJSON(C.exportJSON(data, Date.now()));
  assert.deepEqual(plain(back), plain(data));
});

test('import rejects junk', () => {
  assert.throws(() => C.importJSON('nope'), /valid JSON/);
  assert.throws(() => C.importJSON('{"hello":1}'), /reading log/);
  assert.throws(() => C.importJSON('{"schema":99,"sessions":[]}'), /newer version/);
  const d = C.sanitize({ schema: 2, sessions: [{ id: 'x', manual: true, date: '2026-02-30', durationMs: MIN, type: 'poem', title: 'p' }] });
  assert.equal(d.sessions.length, 0, 'impossible date dropped');
});

test('v1 data migrates: start/end pages become a pages range, alloc is dropped', () => {
  const v1 = {
    schema: 1, settings: { goalMin: 60 }, books: [{ id: 'h', title: 'The Hobbit' }],
    sessions: [{ id: 's', type: 'book', title: 'The Hobbit', bookId: 'h', startPage: 42, endPage: 79, durationMs: 10 * MIN, alloc: { '2026-11-22': 10 * MIN }, startedAt: at('2026-11-22T20:00'), endedAt: at('2026-11-22T20:10') }],
  };
  const d = C.sanitize(v1);
  assert.equal(d.schema, 2);
  assert.equal(d.settings.dayStart, 3);
  const s = d.sessions[0];
  assert.equal(s.pages, '42-79'); assert.equal(s.pagesRead, 38); assert.equal(s.manual, false);
  assert.equal(s.alloc, undefined);
  assert.equal(C.pickupPage(d, 'The Hobbit'), 80);
});

// ---------------- timer ----------------
const HOBBIT = { type: 'book', title: 'The Hobbit', fromPage: 42 };

test('start / pause / resume counts only running time', () => {
  const T = at('2026-11-22T09:00');
  let t = C.start(C.idleTimer(), T);
  t = C.pause(t, T + 10 * MIN);
  assert.equal(C.elapsed(t, T + 60 * MIN), 10 * MIN);
  t = C.start(t, T + 20 * MIN);
  assert.equal(C.elapsed(t, T + 25 * MIN), 15 * MIN);
});

test('double start / double stop are no-ops; clock going backwards is never negative', () => {
  const T = at('2026-11-22T09:00');
  let t = C.start(C.idleTimer(), T);
  assert.equal(C.start(t, T + 5 * MIN).runStart, T);
  t = C.stop(t, T + 5 * MIN);
  assert.deepEqual(plain(C.stop(t, T + 9 * MIN)), plain(t));
  assert.equal(C.elapsed(C.start(C.idleTimer(), T), T - 5 * MIN), 0);
});

test('reload while running keeps counting while the app is closed', () => {
  const st = memStorage();
  const T = at('2026-11-22T21:00');
  C.saveTimer(st, C.start(C.idleTimer(), T, HOBBIT));
  const r = C.loadTimer(st);
  assert.equal(r.status, 'running');
  assert.equal(C.elapsed(r, T + 34 * MIN), 34 * MIN);
  assert.deepEqual(plain(r.material), HOBBIT);
});

test('STOP without saving, then reload: the unsaved chunk comes back frozen', () => {
  const st = memStorage();
  const T = at('2026-11-22T09:00');
  C.saveTimer(st, C.stop(C.start(C.idleTimer(), T, HOBBIT), T + 20 * MIN));
  const r = C.loadTimer(st);
  assert.equal(r.status, 'paused');
  assert.equal(C.elapsed(r, T + 600 * MIN), 20 * MIN);
  assert.equal(C.draftFromTimer(r, T + 600 * MIN).endedAt, T + 20 * MIN);
});

test('STOP then discard leaves nothing behind; a stopped chunk counts until then', () => {
  const data = C.freshData();
  const T = at('2026-11-22T09:00');
  const stopped = C.stop(C.start(C.idleTimer(), T, HOBBIT), T + 25 * MIN);
  assert.equal(C.todayTotal(data, stopped, T + 90 * MIN), 25 * MIN);
  assert.equal(C.todayTotal(data, C.idleTimer(), T + 90 * MIN), 0);
  assert.equal(C.draftFromTimer(C.stop(C.start(C.idleTimer(), T), T), T).durationMs, 0, 'instant STOP = nothing to save');
});

test('corrupt or old timer state loads safely', () => {
  const st = memStorage();
  assert.equal(C.loadTimer(st).status, 'idle');
  st.setItem(C.TIMER_KEY, '{not json');
  assert.equal(C.loadTimer(st).status, 'idle');
  st.setItem(C.TIMER_KEY, JSON.stringify({ status: 'running', segments: [{ start: 1, end: 5 }] }));
  assert.equal(C.loadTimer(st).status, 'paused');
  st.setItem(C.TIMER_KEY, JSON.stringify({ status: 'running', segments: [], runStart: 1, material: { type: 'novel', title: 5 } }));
  assert.equal(C.loadTimer(st).material, undefined);
});

test('formatting', () => {
  assert.equal(C.fmtCRT(0), '00:00');
  assert.equal(C.fmtCRT(5 * MIN + 12000), '05:12');
  assert.equal(C.fmtCRT(135 * MIN + 7000), '2:15:07');
  assert.equal(C.fmtHMS(38 * MIN + 12000), '00:38:12');
  assert.equal(C.fmtDur(40 * 1000), '<1m');
  assert.equal(C.fmtDur(64 * MIN), '1h 4m');
});

// ---------------- storage ----------------
test('empty storage → fresh data; corrupt storage is set aside', () => {
  assert.equal(C.loadData(memStorage()).data.schema, 2);
  const st = memStorage();
  st.setItem(C.KEY, '{"sessions": [oops');
  const r = C.loadData(st);
  assert.equal(r.data.sessions.length, 0);
  assert.ok(r.warning);
  assert.ok([...st.m.keys()].some((k) => k.startsWith(C.KEY + '.corrupt.')));
});

// ---------------- the mouse ----------------
test('mouse grid is 24×24 and only uses the legend colours', () => {
  assert.equal(C.MOUSE.length, 24);
  for (const row of C.MOUSE) { assert.equal(row.length, 24); assert.match(row, /^[KGPW.]+$/); }
});

test('mood overrides', () => {
  const px = (g, x, y) => g[y][x];
  assert.equal(C.mouseGrid('sleeping')[9].slice(6, 8), 'KK');
  const read = C.mouseGrid('reading');
  assert.equal(read[16].slice(7, 15), 'KWWKKWWK');
  assert.equal(px(read, 6, 16), 'P');
  const cheer = C.mouseGrid('cheering');
  assert.equal(px(cheer, 7, 8), 'K'); assert.equal(cheer[13].slice(10, 12), 'KK');
});

test('pixel rects redraw the grid exactly, one per horizontal run', () => {
  for (const mood of ['base', 'sleeping', 'reading', 'cheering']) {
    const grid = C.mouseGrid(mood);
    const rects = C.gridRects(grid, C.MOUSE_COLORS);
    const back = Array.from({ length: 24 }, () => Array(24).fill('.'));
    const rev = Object.fromEntries(Object.entries(C.MOUSE_COLORS).map(([k, v]) => [v, k]));
    for (const r of rects) for (let i = 0; i < r.w; i++) back[r.y][r.x + i] = rev[r.fill];
    assert.deepEqual(back.map((r) => r.join('')), plain(grid), mood);
  }
  assert.match(C.svgPixels(['XX.X'], { X: '#111111' }, 4), /width="16" height="4"/);
});
