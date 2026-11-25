// node --test tests/  で実行
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggest, history, programDay, advance, insights, recommendDay, strengthLevel, streakWeeks,
  earnedBadges, weightForReps, increment } from '../js/coach.js';
import { buildStats, weekKey } from '../js/calc.js';
import { EXERCISES } from '../js/catalog.js';
import { PROGRAMS } from '../js/programs.js';

const exMap = Object.fromEntries(EXERCISES.map(e => [e.id, e]));
const DAY = 864e5;
const NOW = Date.parse('2026-11-27T03:00:00Z');
const sess = (id, daysAgo, ex) => ({ id, s: NOW - daysAgo * DAY, e: NOW - daysAgo * DAY + 3600e3, ex });

test('全プログラムの種目IDがカタログに存在する', () => {
  for (const p of PROGRAMS) for (const d of p.days) {
    for (const [id] of d.items) assert.ok(exMap[id], `${p.id}/${d.name}: ${id}`);
    if (d.main) assert.ok(exMap[d.main]);
  }
});

test('刻み幅', () => {
  assert.equal(increment(exMap.squat), 5);
  assert.equal(increment(exMap.bench), 2.5);
  assert.equal(increment(exMap.lateral_raise), 1);
});

test('提案：全セット達成で増量', () => {
  const h = history([sess('a', 2, [{ id: 'bench', sets: [{ w: 80, r: 5 }, { w: 80, r: 5 }, { w: 80, r: 5 }] }])], 'bench');
  const s = suggest(exMap.bench, h);
  assert.equal(s.kind, 'up'); assert.equal(s.w, 82.5); assert.equal(s.reps, 5); assert.equal(s.sets, 3);
});

test('提案：未達なら据え置き、2回連続未達で10%減', () => {
  const miss = [{ w: 100, r: 5 }, { w: 100, r: 4 }, { w: 100, r: 3 }];
  const one = history([sess('a', 2, [{ id: 'squat', sets: miss }])], 'squat');
  assert.equal(suggest(exMap.squat, one, { sets: 3, reps: 5 }).kind, 'same');
  const two = history([sess('a', 2, [{ id: 'squat', sets: miss }]), sess('b', 5, [{ id: 'squat', sets: miss }])], 'squat');
  const s = suggest(exMap.squat, two, { sets: 3, reps: 5 });
  assert.equal(s.kind, 'deload'); assert.equal(s.w, 90);
});

test('提案：回数帯が違えば推定1RMから逆算、初回は案内', () => {
  const h = history([sess('a', 2, [{ id: 'bench', sets: [{ w: 70, r: 10 }, { w: 70, r: 10 }] }])], 'bench');
  const s = suggest(exMap.bench, h, { sets: 5, reps: 5 });
  assert.equal(s.kind, 'calc');
  assert.equal(s.w, Math.round(weightForReps(70 * (1 + 10 / 30), 5) / 2.5) * 2.5);
  assert.equal(suggest(exMap.bench, [], { sets: 3, reps: 8 }).kind, 'new');
});

test('提案：自重種目は回数を増やす', () => {
  const h = history([sess('a', 1, [{ id: 'pullup', sets: [{ w: 0, r: 8 }, { w: 0, r: 8 }] }])], 'pullup');
  const s = suggest(exMap.pullup, h);
  assert.equal(s.w, 0); assert.equal(s.reps, 9);
});

test('5/3/1 の重量と日の進行', () => {
  const best = { squat: { e1rm: 150 } };
  const d = programDay({ id: 'w531', day: 0, week: 2 }, { sessions: [], best, exMap });
  assert.equal(d.items[0].id, 'squat');
  assert.deepEqual(d.items[0].sets.map(s => s.w), [102.5, 115, 127.5]); // TM135 × 75/85/95%
  let st = { id: 'w531', day: 3, week: 0 };
  st = advance(st); assert.deepEqual([st.day, st.week], [0, 1]);
  st = advance({ id: 'ss5x5', day: 1 }); assert.equal(st.day, 0);
});

test('気づき：不足部位・押し引き・間隔', () => {
  const sessions = [0, 2, 4, 6].map((d, i) => sess('p' + i, d + 0.5, [{ id: 'bench', sets: Array(5).fill({ w: 80, r: 8 }) }]));
  const stats = buildStats(sessions, exMap, 80, NOW);
  const ins = insights({ ...stats, sessions, exMap, now: NOW });
  const titles = ins.map(i => i.title).join(' | ');
  assert.match(titles, /不足/);
  assert.match(titles, /押す種目/);
  const old = buildStats([sess('o', 6, [{ id: 'squat', sets: [{ w: 100, r: 5 }] }])], exMap, 80, NOW);
  assert.match(insights({ ...old, sessions: [], exMap, now: NOW })[0].title, /日空いています/);
});

test('おすすめの日：脚が回復中なら脚の日を避ける', () => {
  const s = [sess('l', 0.5, [{ id: 'squat', sets: Array(6).fill({ w: 100, r: 5 }) }, { id: 'rdl', sets: Array(4).fill({ w: 80, r: 8 }) }])];
  const st = buildStats(s, exMap, 80, NOW);
  const pick = recommendDay(st.recent, exMap, NOW);
  const day = PROGRAMS.find(p => p.id === pick.id).days[pick.day];
  assert.ok(!day.items.some(([id]) => id === 'squat'), day.name);
});

test('筋力レベル・連続週・バッジ', () => {
  const lv = strengthLevel('bench', 110, 80);
  assert.equal(lv.name, '上級'); assert.equal(lv.next.kg, 120);
  const weeks = { [weekKey(NOW - 7 * DAY)]: { n: 2 }, [weekKey(NOW - 14 * DAY)]: { n: 3 }, [weekKey(NOW - 21 * DAY)]: { n: 1 } };
  assert.equal(streakWeeks(weeks, NOW), 2, '今週未達は数えず、先週から遡る');
  const b = earnedBadges({ best: { bench: { e1rm: 125, w: 100 }, squat: { e1rm: 180 }, deadlift: { e1rm: 160 } }, totals: { n: 12 }, recent: [], weeks: {} }, 80, NOW);
  assert.deepEqual(b, ['first', 'n10', 'b100', 'b15', 'sq2', 'k1000']);
});

test('提案：セット数が目標より少ないだけなら増量（メニュー変更時）', () => {
  const h = history([sess('a', 2, [{ id: 'bench', sets: [{ w: 80, r: 5 }, { w: 80, r: 5 }, { w: 80, r: 5 }] }]),
    sess('b', 4, [{ id: 'bench', sets: [{ w: 80, r: 5 }, { w: 80, r: 5 }, { w: 80, r: 5 }] }])], 'bench');
  const s = suggest(exMap.bench, h, { sets: 5, reps: 5 });
  assert.equal(s.kind, 'up'); assert.equal(s.w, 82.5); assert.equal(s.sets, 5);
});
