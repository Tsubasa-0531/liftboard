// demo.js — ローカルモード専用の架空データ生成（共有DBには書かない）。
// 画面の確認やプレゼン用。乱数は固定シードなので毎回同じデータになる。
import { buildStats, monthKey, newId } from './calc.js';
import { earnedBadges, streakWeeks } from './coach.js';

function rng(seed) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }

const PEOPLE = [
  { nick: 'ケンタ', num: '72', pos: 'OL', bw: 118, str: 1.25 },
  { nick: 'ハヤト', num: '55', pos: 'DL', bw: 105, str: 1.2 },
  { nick: 'ユウキ', num: '21', pos: 'DB', bw: 78, str: 1.0 },
  { nick: 'ソウタ', num: '34', pos: 'RB', bw: 88, str: 1.1 },
  { nick: 'リク', num: '12', pos: 'QB', bw: 82, str: .9 },
  { nick: 'ダイチ', num: '44', pos: 'LB', bw: 95, str: 1.12 },
  { nick: 'コウ', num: '81', pos: 'WR', bw: 74, str: .88 },
];
const DAYS = [
  [['squat', 1.5, 5], ['rdl', 1.1, 8], ['bulgarian', .45, 10], ['calf_raise', .9, 15]],
  [['bench', 1.15, 5], ['ohp', .7, 6], ['pullup', 0, 8], ['db_row', .4, 10], ['pushdown', .35, 12]],
  [['power_clean', 1.0, 3], ['deadlift', 1.75, 3], ['front_squat', 1.1, 5], ['neck_ext', .15, 15]],
  [['incline_bench', 1.0, 8], ['lat_pulldown', .75, 10], ['lateral_raise', .12, 15], ['barbell_curl', .4, 10]],
];

export function buildDemo(exMap) {
  const r = rng(42);
  const now = Date.now();
  const members = {}, live = {}, months = {};
  PEOPLE.forEach((p, pi) => {
    const id = 'demo' + pi;
    const sessions = [];
    for (let d = 42; d >= 1; d--) {
      if (r() > .45) continue;
      const day = DAYS[(d + pi) % DAYS.length];
      const s = now - d * 864e5 - (2 + r() * 8) * 3600e3;
      const len = (50 + r() * 50) * 60000;
      const prog = 1 + (42 - d) * .004; // 少しずつ伸びる
      sessions.push({
        id: newId('s') + pi + d, s, e: s + len, src: 'demo',
        ex: day.map(([ex, k, reps]) => ({
          id: ex,
          sets: Array.from({ length: 3 + (r() > .5 ? 1 : 0) }, () => ({
            w: k ? Math.round(p.bw * k * p.str * prog / 2.5) * 2.5 : 0,
            r: Math.max(1, reps + Math.round((r() - .5) * 2)),
          })),
        })),
      });
    }
    const byMonth = {};
    sessions.forEach(s => { const k = monthKey(s.s); (byMonth[k] = byMonth[k] || {})[s.id] = s; });
    months[id] = Object.fromEntries(Object.entries(byMonth).map(([k, ss]) => [k, { v: 1, month: k, sessions: ss }]));
    const st = buildStats(sessions, exMap, p.bw, now);
    members[id] = { nick: p.nick, num: p.num, pos: p.pos, bw: p.bw, joinedAt: now - 60 * 864e5, ...st, badges: earnedBadges(st, p.bw, now), streak: streakWeeks(st.weeks, now), lastAt: sessions.at(-1)?.e || 0, v: 1 };
    if (pi < 2) {
      const started = now - (pi ? 12 : 38) * 60000;
      live[id] = { active: true, startedAt: started, updatedAt: now - 60000, v: 1,
        session: { id: newId('s'), s: started, ex: [{ id: pi ? 'bench' : 'squat', sets: [{ w: 100, r: 5, done: true }, { w: 100, r: 5, done: true }] }] } };
    }
  });
  return { members, live, months };
}
