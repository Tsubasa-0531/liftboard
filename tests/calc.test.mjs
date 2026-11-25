// node --test tests/  で実行
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { e1rm, setLoad, summarize, buildStats, weekKey, weekStart, dayKey, monthKey,
  muscleWindow, rank, liveState, toCSV, weekKeys } from '../js/calc.js';
import { EXERCISES } from '../js/catalog.js';

const exMap = Object.fromEntries(EXERCISES.map(e => [e.id, e]));
const T = s => Date.parse(s); // ISO文字列 → ms

test('Epley推定1RM', () => {
  assert.equal(e1rm(100, 1), 100);
  assert.equal(Math.round(e1rm(100, 5) * 10) / 10, 116.7);
  assert.equal(e1rm(100, 13), 0, '13回以上は対象外');
  assert.equal(e1rm(0, 5), 0);
});

test('自重種目の負荷 = 追加重量 + bwf×体重', () => {
  assert.equal(setLoad({ w: 10, r: 5 }, exMap.pullup, 80), 90);
  assert.equal(setLoad({ w: 0, r: 5 }, exMap.pushup, 100), 64);
  assert.equal(setLoad({ w: 60, r: 5 }, exMap.bench, 80), 60);
});

test('JSTの日付・週キー', () => {
  // UTC 2026-11-29 16:00 = JST 11-30(月) 01:00 → 翌週扱い
  assert.equal(dayKey(T('2026-11-29T16:00:00Z')), '2026-11-30');
  assert.equal(weekKey(T('2026-11-29T16:00:00Z')), '2026-W49');
  assert.equal(weekKey(T('2026-11-29T14:00:00Z')), '2026-W48');
  assert.equal(weekKey(T('2021-01-03T03:00:00Z')), '2020-W53', 'ISO週の年またぎ');
  assert.equal(monthKey(T('2026-11-30T15:30:00Z')), '2026-12');
  assert.equal(dayKey(weekStart(T('2026-11-27T03:00:00Z'))), '2026-11-23');
  assert.deepEqual(weekKeys(T('2026-11-27T03:00:00Z'), 2), ['2026-W48', '2026-W47']);
});

const sess = (id, start, ex, minutes = 60) => ({ id, s: T(start), e: T(start) + minutes * 60000, ex });

test('セッション要約：ボリューム・筋群セット', () => {
  const s = sess('a', '2026-11-24T09:00:00Z', [
    { id: 'bench', sets: [{ w: 100, r: 5 }, { w: 100, r: 5 }, { w: 60, r: 0 }] },
    { id: 'pullup', sets: [{ w: 0, r: 10 }] },
  ]);
  const sum = summarize(s, exMap, 80);
  assert.equal(sum.sets, 3, '回数0のセットは除外');
  assert.equal(sum.vol, 100 * 5 * 2 + 80 * 10);
  assert.equal(sum.mus.chest, 2);
  assert.equal(sum.mus.triceps, 1);
  assert.equal(sum.mus.lats, 1);
  assert.equal(sum.min, 60);
  assert.equal(sum.top.id, 'bench');
});

test('メンバー集計とランキング', () => {
  const now = T('2026-11-27T03:00:00Z');
  const a = buildStats([
    sess('1', '2026-11-24T09:00:00Z', [{ id: 'bench', sets: [{ w: 100, r: 5 }] }]),
    sess('2', '2026-11-10T09:00:00Z', [{ id: 'bench', sets: [{ w: 110, r: 1 }] }], 90),
  ], exMap, 80, now);
  assert.equal(a.best.bench.e1rm, 116.7);
  assert.equal(a.best.bench.w, 110);
  assert.equal(a.totals.n, 2);
  assert.equal(a.weeks['2026-W48'].vol, 500);
  const b = buildStats([sess('3', '2026-11-25T09:00:00Z', [{ id: 'bench', sets: [{ w: 120, r: 3 }] }])], exMap, 100, now);
  const members = [{ id: 'A', bw: 80, ...a }, { id: 'B', bw: 100, ...b }];
  const r1 = rank(members, { metric: 'e1rm', exId: 'bench', now });
  assert.deepEqual(r1.map(r => r.id), ['B', 'A']);
  const r2 = rank(members, { metric: 'ratio', exId: 'bench', now });
  assert.deepEqual(r2.map(r => r.id), ['A', 'B'], '体重比ではAが上');
  const r3 = rank(members, { metric: 'min', period: 'week', now });
  assert.equal(r3[0].value, 60);
  const r4 = rank(members, { metric: 'n', period: 'all', now });
  assert.equal(r4[0].id, 'A');
});

test('人体図の期間集計', () => {
  const recent = [{ s: 10, mus: { chest: 2 } }, { s: 20, mus: { chest: 1.5, lats: 1 } }, { s: 5, mus: { chest: 9 } }];
  assert.deepEqual(muscleWindow(recent, 10), { chest: 3.5, lats: 1 });
});

test('ライブ状態', () => {
  const now = 10 * 3600e3;
  assert.equal(liveState({ active: true, startedAt: now - 3600e3 }, now), 'on');
  assert.equal(liveState({ active: true, startedAt: 1, updatedAt: 2 }, now), 'stale');
  assert.equal(liveState({ active: false }, now), 'off');
});

test('CSVエスケープ', () => {
  assert.equal(toCSV([['a', 'b,c', 'd"e']]), 'a,"b,c","d""e"');
});
