// coach.js — 指南（次の重量・メニュー提案・気づき）とバッジ・筋力レベル。すべて純粋関数。
import { e1rm, validSets, muscleWindow, weekStart, weekKeys } from './calc.js';
import { PROGRAMS, PROGRAM_MAP } from './programs.js';

const DAY = 864e5;
export const roundTo = (x, step = 2.5) => Math.round(x / step) * step;

// 1回で上げる重量の刻み
const BIG_INC = new Set(['squat', 'deadlift', 'trap_bar_dl', 'leg_press', 'rdl', 'hip_thrust', 'front_squat']);
const SMALL = new Set(['lateral_raise', 'rear_fly', 'db_curl', 'hammer_curl', 'barbell_curl', 'pushdown', 'skull_crusher',
  'wrist_curl', 'db_fly', 'face_pull', 'neck_flex', 'neck_ext', 'cable_crunch', 'upright_row', 'cable_cross', 'russian_twist']);
export function increment(ex) {
  if (!ex) return 2.5;
  if (ex.inc) return ex.inc;
  if (BIG_INC.has(ex.id)) return 5;
  if (SMALL.has(ex.id)) return 1;
  return 2.5;
}
const stepOf = ex => (ex && SMALL.has(ex.id) ? 1 : 2.5);
const mode = xs => { const c = {}; let best = xs[0]; for (const x of xs) { c[x] = (c[x] || 0) + 1; if (c[x] > c[best]) best = x; } return best; };

/** その種目の直近 n 回分（sessions は新しい順） */
export function history(sessions, exId, n = 3, excludeId) {
  const out = [];
  for (const s of sessions) {
    if (!s.e || s.id === excludeId) continue;
    const it = (s.ex || []).find(i => i.id === exId);
    const vs = it ? validSets(it.sets) : [];
    if (vs.length) out.push({ s: s.s, sets: vs });
    if (out.length >= n) break;
  }
  return out;
}

/** 目標回数を「余力2回（RIR2）」で行える重量（Epley式の逆算） */
export const weightForReps = (oneRm, reps, rir = 2) => oneRm / (1 + (reps + rir) / 30);

/**
 * 次回の提案（ダブルプログレッション＋2回連続未達でディロード）。
 * - 前回、作業重量で全セット目標回数を達成 → 刻み分増やす
 * - 未達 → 同じ重量で再挑戦
 * - 同じ重量で2回連続未達 → 10%下げる
 * - 目標回数が前回と大きく違う（メニュー変更）→ 推定1RMから逆算
 * 戻り値: { kind: 'new'|'up'|'same'|'deload'|'calc', w, sets, reps, reason }
 */
export function suggest(ex, hist, target = null, best1rm = 0) {
  const inc = increment(ex), step = stepOf(ex);
  const tSets = target?.sets, tReps = target?.reps;
  if (!hist.length) {
    if (best1rm > 0 && tReps) {
      return { kind: 'calc', w: roundTo(weightForReps(best1rm, tReps), step), sets: tSets || 3, reps: tReps, reason: `推定1RM ${round1(best1rm)}kgから、${tReps}回を余力2回で行える重さ` };
    }
    return { kind: 'new', w: null, sets: tSets || 3, reps: tReps || 10, reason: '初めての種目。目標回数＋2回できる重さで、まずフォーム優先' };
  }
  const last = hist[0];
  const topW = Math.max(...last.sets.map(s => +s.w || 0));
  if (topW === 0 && !ex?.bwf) return suggest(ex, [], target, best1rm); // 重量の記録がない
  const work = last.sets.filter(s => (+s.w || 0) === topW);
  const lastReps = mode(work.map(s => +s.r));
  const reps = tReps || lastReps;
  const sets = tSets || work.length;
  // メニューが変わって回数帯が違う → 推定1RMから逆算
  if (tReps && Math.abs(lastReps - tReps) >= 3 && !(ex?.bwf && topW === 0)) {
    const one = Math.max(best1rm, ...last.sets.map(s => e1rm(+s.w || 0, s.r)));
    if (one > 0) return { kind: 'calc', w: roundTo(weightForReps(one, reps), step), sets, reps, reason: `回数帯が前回（${lastReps}回）と違うので、推定1RM ${round1(one)}kgから逆算` };
  }
  const hit = s => +s.r >= reps && !(+s.rpe >= 9.5);
  // 回数が足りないセットがあれば未達。セット数が少ないだけ（メニュー変更など）は未達扱いにしない
  const missed = work.some(s => !hit(s));
  const ok = !missed && work.length >= Math.min(sets, 3);
  if (ex?.bwf && topW === 0) {
    return ok
      ? { kind: 'up', w: 0, sets, reps: reps + 1, reason: `前回 全セット${reps}回達成 → 目標を${reps + 1}回に（12回を超えたら加重へ）` }
      : { kind: 'same', w: 0, sets, reps, reason: `前回は${reps}回に届かないセットあり → 同じ回数で全セット達成を狙う` };
  }
  if (ok) return { kind: 'up', w: topW + inc, sets, reps, reason: `前回 ${topW}kg×${reps}回を${work.length}セット達成 → +${inc}kg` };
  const prev = hist[1];
  if (prev) {
    const pTop = Math.max(...prev.sets.map(s => +s.w || 0));
    const pWork = prev.sets.filter(s => (+s.w || 0) === pTop);
    if (missed && pTop === topW && pWork.some(s => !hit(s))) {
      return { kind: 'deload', w: roundTo(topW * 0.9, step), sets, reps, reason: `${topW}kgで2回連続未達 → 10%下げて組み直す（ディロード）` };
    }
  }
  if (!missed) return { kind: 'same', w: topW, sets, reps, reason: `前回は${work.length}セットのみ → 同じ${topW}kgで${sets}セットそろえてから増量` };
  return { kind: 'same', w: topW, sets, reps, reason: `前回は${reps}回に届かないセットあり → 同じ${topW}kgで全セット達成を狙う` };
}
const round1 = x => Math.round(x * 10) / 10;

/** 5/3/1 のトレーニングマックス（推定1RM×0.9） */
export const trainingMax = one => round1(one * 0.9);

/**
 * メニューの「次の日」を、本人の記録から重量つきで組み立てる。
 * state = { id, day, week }（members/{uid}.prog に保存）
 */
export function programDay(state, { sessions, best, exMap }) {
  const prog = PROGRAM_MAP[state?.id];
  if (!prog) return null;
  const di = (state.day || 0) % prog.days.length;
  const day = prog.days[di];
  const wk = prog.weeks ? prog.weeks[(state.week || 0) % prog.weeks.length] : null;
  const items = [];
  if (day.main && wk) {
    const one = +best?.[day.main]?.e1rm || 0;
    const tm = trainingMax(one);
    items.push({
      id: day.main, main: true,
      sets: wk.scheme.map(([p, r]) => ({ w: tm ? roundTo(tm * p) : '', r })),
      reason: tm ? `TM ${tm}kg（推定1RM×0.9）× ${wk.scheme.map(([p]) => Math.round(p * 100) + '%').join('/')}。最終セットはできるだけ多く` : 'まず通常の記録で推定1RMを作ると、%から重量を出せる',
    });
  }
  for (const [id, sets, reps] of day.items) {
    const sg = suggest(exMap[id], history(sessions, id), { sets, reps }, +best?.[id]?.e1rm || 0);
    items.push({ id, sets: Array.from({ length: sg.sets }, () => ({ w: sg.w ?? '', r: sg.reps })), reason: sg.reason, kind: sg.kind });
  }
  return { prog, dayIndex: di, day, week: wk, items, title: `${prog.name}・${day.name}${wk ? `（${wk.name}）` : ''}` };
}
export function advance(state) {
  const prog = PROGRAM_MAP[state?.id];
  if (!prog) return state;
  const day = ((state.day || 0) + 1) % prog.days.length;
  const week = prog.weeks && day === 0 ? ((state.week || 0) + 1) % prog.weeks.length : (state.week || 0);
  return { ...state, day, week };
}

// ------------------------------------------------------------ 気づき
export const GROUPS = [
  { id: 'chest', name: '胸', m: ['chest'] },
  { id: 'back', name: '背中', m: ['lats', 'upback'] },
  { id: 'shoulder', name: '肩', m: ['delt_f', 'delt_s', 'delt_r'] },
  { id: 'arms', name: '腕', m: ['biceps', 'triceps'] },
  { id: 'quads', name: '太もも前', m: ['quads'] },
  { id: 'hams', name: 'ハムストリングス', m: ['hams'] },
  { id: 'glutes', name: 'お尻', m: ['glutes'] },
  { id: 'core', name: '体幹', m: ['abs', 'oblique', 'lowback'] },
];
const sumOf = (vals, ms) => ms.reduce((a, m) => a + (vals[m] || 0), 0);

/** 部位の不足・回復中・押し引きバランス・停滞・間隔 */
export function insights({ recent = [], best = {}, sessions = [], exMap, now = Date.now() }) {
  const out = [];
  const last = recent[0];
  if (!last) return [{ tone: 'info', title: 'まずは1回記録しよう', body: '記録がたまると、次の重量や足りない部位をここで提案します。' }];
  const since = now - (last.e || last.s);
  if (since > 4 * DAY) out.push({ tone: 'warn', title: `${Math.floor(since / DAY)}日空いています`, body: '重量は前回より5〜10%軽めで再開すると、ケガをしにくく戻りも早い。' });

  const w7 = muscleWindow(recent, now - 7 * DAY);
  const h36 = muscleWindow(recent, now - 36 * 3600e3);
  const recovering = GROUPS.filter(g => sumOf(h36, g.m) >= 6);
  if (recovering.length) out.push({ tone: 'info', title: `${recovering.map(g => g.name).join('・')}は回復中`, body: '36時間以内にしっかり鍛えた部位。今日は別の部位を中心にすると効率がいい。' });

  const gaps = GROUPS.filter(g => g.id !== 'arms' && g.id !== 'core')
    .map(g => ({ g, v: sumOf(w7, g.m) / g.m.length })).filter(x => x.v < 4).sort((a, b) => a.v - b.v);
  if (gaps.length) {
    const g = gaps[0].g;
    const ex = Object.values(exMap).filter(e => g.m.some(m => e.m[m] >= 1) && !e.id.startsWith('c_')).slice(0, 3).map(e => e.id);
    out.push({ tone: 'warn', title: `${gaps.map(x => x.g.name).slice(0, 3).join('・')}が不足`, body: `直近7日で${g.name}は${round1(gaps[0].v)}セット。週10セット前後が目安。`, ex });
  }

  const w28 = muscleWindow(recent, now - 28 * DAY);
  const push = (w28.chest || 0) + (w28.delt_f || 0), pull = (w28.lats || 0) + (w28.upback || 0) + (w28.delt_r || 0);
  if (push >= 8 && push > pull * 1.5) {
    out.push({ tone: 'warn', title: `押す種目が引く種目の${pull ? round1(push / pull) + '倍' : '大幅超過'}`, body: '前後のバランスが崩れると肩を痛めやすい。ロウ・懸垂・フェイスプルを足そう。', ex: ['barbell_row', 'pullup', 'face_pull'] });
  }

  for (const id of ['squat', 'bench', 'deadlift', 'ohp', 'power_clean']) {
    const b = best[id];
    if (!b || !b.at || now - b.at < 28 * DAY) continue;
    const n = sessions.filter(s => s.s > now - 28 * DAY && (s.ex || []).some(i => i.id === id)).length;
    if (n >= 3) {
      out.push({ tone: 'warn', title: `${exMap[id]?.name}が4週間更新なし`, body: '停滞のサイン。1週間だけ重量を10%落とす（ディロード）か、回数帯を変える（5回→3回、または8回）。' });
      break;
    }
  }
  const newPR = Object.entries(best).find(([, b]) => b.at && now - b.at < 7 * DAY);
  if (newPR) out.push({ tone: 'good', title: `今週 ${exMap[newPR[0]]?.name} で自己ベスト`, body: `推定1RM ${newPR[1].e1rm}kg。この調子。` });
  return out.slice(0, 4);
}

/** メニュー未設定の人へ：不足部位を埋め、回復中の部位を避ける日を全テンプレートから選ぶ */
export function recommendDay(recent, exMap, now = Date.now()) {
  const w7 = muscleWindow(recent, now - 7 * DAY);
  const h36 = muscleWindow(recent, now - 36 * 3600e3);
  let bestPick = null;
  for (const p of PROGRAMS) {
    if (p.weeks) continue;
    p.days.forEach((d, i) => {
      let score = 0;
      for (const [id, sets] of d.items) {
        const ex = exMap[id]; if (!ex) continue;
        for (const [m, k] of Object.entries(ex.m)) {
          score += k * sets * Math.max(0, 10 - (w7[m] || 0)) / 10;
          if ((h36[m] || 0) >= 4) score -= k * sets * 1.5;
        }
      }
      if (!bestPick || score > bestPick.score) bestPick = { id: p.id, day: i, score };
    });
  }
  return bestPick;
}

// ------------------------------------------------------------ 筋力レベル・バッジ・連続週
// 体重比の目安（成人男性の一般的な筋力基準を丸めたもの。あくまで目安）
export const STANDARDS = {
  bench: [.75, 1, 1.25, 1.5, 2], squat: [1, 1.25, 1.5, 2, 2.5], deadlift: [1.25, 1.5, 2, 2.5, 3],
  ohp: [.5, .65, .8, 1, 1.25], power_clean: [.7, .9, 1.1, 1.3, 1.5],
};
export const LEVEL_NAMES = ['入門', '初級', '中級', '上級', '超上級', 'エリート'];
export function strengthLevel(exId, one, bw) {
  const st = STANDARDS[exId];
  if (!st || !(one > 0) || !(bw > 0)) return null;
  const ratio = one / bw;
  let level = 0;
  st.forEach((t, i) => { if (ratio >= t) level = i + 1; });
  const next = level < st.length ? { name: LEVEL_NAMES[level + 1], kg: round1(st[level] * bw) } : null;
  const lo = level ? st[level - 1] : 0, hi = st[level] ?? st.at(-1);
  const pct = level >= st.length ? 100 : Math.round((ratio - lo) / (hi - lo) * 100);
  return { level, name: LEVEL_NAMES[level], ratio: Math.round(ratio * 100) / 100, next, pct };
}

/** 週2回以上を何週続けているか（今週が未達なら先週から数える） */
export function streakWeeks(weeks = {}, now = Date.now(), min = 2) {
  const keys = weekKeys(now, 26);
  let n = 0;
  for (let i = 0; i < keys.length; i++) {
    const c = weeks[keys[i]]?.n || 0;
    if (c >= min) n++;
    else if (i === 0) continue;
    else break;
  }
  return n;
}

export const BADGES = [
  { id: 'first', name: '初トレ', desc: '最初の記録' },
  { id: 'n10', name: '10回', desc: '累計10回' },
  { id: 'n50', name: '50回', desc: '累計50回' },
  { id: 'n100', name: '100回', desc: '累計100回' },
  { id: 's4', name: '4週連続', desc: '週2回以上を4週続けた' },
  { id: 's12', name: '12週連続', desc: '週2回以上を12週続けた' },
  { id: 'b100', name: 'ベンチ100kg', desc: 'ベンチプレスで100kgを挙げた' },
  { id: 'b15', name: 'ベンチ体重×1.5', desc: '推定1RMが体重の1.5倍' },
  { id: 'sq2', name: 'スクワット体重×2', desc: '推定1RMが体重の2倍' },
  { id: 'dl25', name: 'デッド体重×2.5', desc: '推定1RMが体重の2.5倍' },
  { id: 'k1000', name: '1000ポンドクラブ', desc: 'BIG3の推定1RM合計が454kg以上' },
  { id: 'ton10', name: '10トン', desc: '1回の総挙上量が10t以上' },
  { id: 'early', name: '朝トレ', desc: '7時前に開始' },
  { id: 'neck', name: '首を守る', desc: '首のトレーニングを5回' },
  { id: 'all', name: '全身バランス', desc: '7日間で主要部位すべて3セット以上' },
];
export function earnedBadges({ best = {}, totals = {}, recent = [], weeks = {} }, bw, now = Date.now()) {
  const got = new Set();
  const n = totals.n || 0;
  if (n >= 1) got.add('first'); if (n >= 10) got.add('n10'); if (n >= 50) got.add('n50'); if (n >= 100) got.add('n100');
  const st = streakWeeks(weeks, now);
  if (st >= 4) got.add('s4'); if (st >= 12) got.add('s12');
  const e = id => +best[id]?.e1rm || 0;
  if ((+best.bench?.w || 0) >= 100) got.add('b100');
  if (bw > 0) {
    if (e('bench') >= 1.5 * bw) got.add('b15');
    if (e('squat') >= 2 * bw) got.add('sq2');
    if (e('deadlift') >= 2.5 * bw) got.add('dl25');
  }
  if (e('squat') && e('bench') && e('deadlift') && e('squat') + e('bench') + e('deadlift') >= 453.6) got.add('k1000');
  if (recent.some(r => r.vol >= 10000)) got.add('ton10');
  if (recent.some(r => new Date(r.s + 9 * 3600e3).getUTCHours() < 7)) got.add('early');
  if (recent.filter(r => (r.ex || []).some(x => x === 'neck_flex' || x === 'neck_ext')).length >= 5) got.add('neck');
  const w7 = muscleWindow(recent, now - 7 * DAY);
  if (GROUPS.filter(g => g.id !== 'arms').every(g => g.m.some(m => (w7[m] || 0) >= 3))) got.add('all');
  return BADGES.filter(b => got.has(b.id)).map(b => b.id);
}
