// calc.js — 集計ロジック（DOMにもDBにも依存しない純粋関数）。
// tests/calc.test.mjs から Node で直接テストできる。

export const JST = 9 * 3600e3;
const DAY = 864e5;

/** JSTの日付キー 'YYYY-MM-DD' */
export const dayKey = t => new Date(t + JST).toISOString().slice(0, 10);
/** JSTの月キー 'YYYY-MM'（記録はこの単位でDBに保存） */
export const monthKey = t => dayKey(t).slice(0, 7);

/** JSTの週の月曜0:00（epoch ms） */
export function weekStart(t) {
  const d = new Date(t + JST);
  const dow = (d.getUTCDay() + 6) % 7; // 月=0
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow) - JST;
}

/** ISO 8601 週番号キー 'YYYY-Www'（JST基準） */
export function weekKey(t) {
  const d = new Date(t + JST);
  const dow = (d.getUTCDay() + 6) % 7;
  const thu = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow + 3));
  const y = thu.getUTCFullYear();
  const w = 1 + Math.floor((thu - Date.UTC(y, 0, 1)) / DAY / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
}

/**
 * 推定1RM（Epley式: w × (1 + r/30)）。
 * 1回なら実重量。13回以上は推定誤差が大きいため 0（＝ランキング対象外）。
 */
export function e1rm(w, r) {
  w = +w; r = +r;
  if (!(w > 0) || !(r > 0)) return 0;
  if (r === 1) return w;
  if (r > 12) return 0;
  return w * (1 + r / 30);
}

/** 1セットの負荷(kg)。自重種目は 追加重量 + bwf×体重 */
export function setLoad(set, ex, bw) {
  const add = +set.w || 0;
  return ex && ex.bwf ? add + ex.bwf * (+bw || 0) : add;
}

/** 回数が入っているセットを「実施済み」とみなす */
export const validSets = sets => (sets || []).filter(s => +s.r > 0);

const round1 = x => Math.round(x * 10) / 10;

/**
 * セッション1件の要約。
 * vol = Σ(負荷×回数)、sets = 実施セット数、mus = 筋群ごとの加重セット数
 * （主働筋1.0＋協働筋0.5）、top = 推定1RMが最も高いセット。
 */
export function summarize(session, exMap, bw) {
  let vol = 0, sets = 0, top = null;
  const mus = {}, perEx = [];
  for (const item of session.ex || []) {
    const ex = exMap[item.id];
    const vs = validSets(item.sets);
    if (!vs.length) continue;
    let exVol = 0, best = null;
    for (const s of vs) {
      const load = setLoad(s, ex, bw);
      exVol += load * +s.r;
      const est = e1rm(load, s.r);
      if (!best || est > best.e1rm) best = { w: +s.w || 0, r: +s.r, load, e1rm: est };
      if (ex) for (const [m, k] of Object.entries(ex.m)) mus[m] = (mus[m] || 0) + k;
    }
    sets += vs.length;
    vol += exVol;
    perEx.push({ id: item.id, sets: vs.length, vol: exVol, best });
    if (best && (!top || best.e1rm > top.e1rm)) top = { id: item.id, ...best };
  }
  const min = session.e && session.s ? Math.max(0, Math.round((session.e - session.s) / 60000)) : 0;
  for (const m in mus) mus[m] = round1(mus[m]);
  return { vol: Math.round(vol), sets, min, mus, top, perEx };
}

/**
 * メンバー集計（members/{uid} に保存する読み取り最適化データ）。
 * 全セッションから毎回作り直すので、カウンタのずれが起きない（冪等）。
 */
export function buildStats(sessions, exMap, bw, now = Date.now()) {
  const done = sessions.filter(s => s.e).sort((a, b) => a.s - b.s); // 古い順に走査（PR判定のため）
  const best = {}, weeks = {};
  const minWeek = weekStart(now) - 25 * 7 * DAY;
  let totN = 0, totMin = 0, totVol = 0;
  const summaries = [];
  for (const s of done) {
    const sum = summarize(s, exMap, bw);
    totN++; totMin += sum.min; totVol += sum.vol;
    if (s.s >= minWeek) {
      const k = weekKey(s.s);
      const w = weeks[k] || (weeks[k] = { vol: 0, min: 0, n: 0, sets: 0 });
      w.vol += sum.vol; w.min += sum.min; w.n++; w.sets += sum.sets;
    }
    let pr = false;
    for (const item of s.ex || []) {
      const ex = exMap[item.id];
      const before = best[item.id]?.e1rm || 0;
      for (const set of validSets(item.sets)) {
        const load = setLoad(set, ex, bw);
        const est = e1rm(load, set.r);
        const cur = best[item.id] || (best[item.id] = { e1rm: 0, w: 0, wr: 0, at: 0, wat: 0 });
        if (est > cur.e1rm) { cur.e1rm = round1(est); cur.r = +set.r; cur.load = round1(load); cur.at = s.s; }
        if (load > cur.w) { cur.w = round1(load); cur.wr = +set.r; cur.wat = s.s; }
      }
      if (before > 0 && (best[item.id]?.e1rm || 0) > before) pr = true;
    }
    summaries.push({
      id: s.id, s: s.s, e: s.e, vol: sum.vol, sets: sum.sets, mus: sum.mus,
      ex: (s.ex || []).filter(i => validSets(i.sets).length).map(i => i.id),
      top: sum.top ? { id: sum.top.id, w: sum.top.w, r: sum.top.r } : null,
      ...(pr ? { pr: true } : {}),
    });
  }
  const recent = summaries.slice(-40).reverse();
  return { best, weeks, recent, totals: { n: totN, min: totMin, vol: totVol } };
}

/** 期間内の筋群別加重セット数（人体図の色に使う） */
export function muscleWindow(recent, since, until = Infinity) {
  const out = {};
  for (const r of recent || []) {
    if (r.s < since || r.s >= until) continue;
    for (const [m, v] of Object.entries(r.mus || {})) out[m] = round1((out[m] || 0) + v);
  }
  return out;
}

/** 筋群ごとの最終トレーニング時刻 */
export function lastTrained(recent) {
  const out = {};
  for (const r of recent || []) for (const m in r.mus || {}) out[m] = Math.max(out[m] || 0, r.e || r.s);
  return out;
}

/** 週キーの列（新しい順）: 今週から n 週分 */
export function weekKeys(now, n) {
  const out = [], ws = weekStart(now);
  for (let i = 0; i < n; i++) out.push(weekKey(ws - i * 7 * DAY + DAY));
  return out;
}

/** 期間の合計（weeks マップから） */
export function periodTotal(weeks, keys) {
  const t = { vol: 0, min: 0, n: 0, sets: 0 };
  for (const k of keys) {
    const w = weeks?.[k];
    if (w) { t.vol += w.vol; t.min += w.min; t.n += w.n; t.sets += w.sets; }
  }
  return t;
}

/**
 * ランキング。members = [{id, bw, best, weeks, totals}]
 * metric: 'e1rm' | 'max' | 'ratio' | 'total' | 'vol' | 'min' | 'n'
 */
export function rank(members, { metric, exId, period, now = Date.now() }) {
  const keys = period === 'week' ? weekKeys(now, 1)
    : period === 'last' ? weekKeys(now, 2).slice(1)
    : period === '4w' ? weekKeys(now, 4) : null;
  const rows = [];
  for (const m of members) {
    let value = 0, detail = null;
    if (metric === 'total') {
      const b = m.best || {};
      const xs = ['squat', 'bench', 'deadlift'].map(k => +b[k]?.e1rm || 0);
      if (xs.some(x => !x)) continue;
      value = round1(xs[0] + xs[1] + xs[2]); detail = `S${xs[0]} / B${xs[1]} / D${xs[2]}`;
    } else if (metric === 'e1rm' || metric === 'max' || metric === 'ratio') {
      const b = m.best?.[exId];
      if (!b) continue;
      if (metric === 'e1rm') { value = b.e1rm; detail = b.r ? `${b.load}kg×${b.r}` : null; }
      if (metric === 'max') { value = b.w; detail = `${b.wr}回`; }
      if (metric === 'ratio') { if (!(+m.bw > 0) || !b.e1rm) continue; value = Math.round(b.e1rm / m.bw * 100) / 100; detail = `推定${b.e1rm}kg / 体重${m.bw}kg`; }
    } else {
      const t = keys ? periodTotal(m.weeks, keys) : m.totals || {};
      value = t[metric] || 0;
    }
    if (value > 0) rows.push({ id: m.id, value, detail });
  }
  rows.sort((a, b) => b.value - a.value);
  // 同値は同順位
  rows.forEach((r, i) => { r.rank = i && rows[i - 1].value === r.value ? rows[i - 1].rank : i + 1; });
  return rows;
}

/** 練習中かどうか（4時間以上更新がない開始状態は「放置」と判定） */
export const STALE_MS = 4 * 3600e3;
export function liveState(live, now = Date.now()) {
  if (!live || !live.active || !live.startedAt) return 'off';
  return now - (live.updatedAt || live.startedAt) > STALE_MS ? 'stale' : 'on';
}

/** CSV（研究用：1行＝1セット） */
export function toCSV(rows) {
  const esc = v => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map(r => r.map(esc).join(',')).join('\n');
}

export function sessionRows(memberLabel, session, exMap, bw) {
  const rows = [];
  const fmt = t => (t ? new Date(t + JST).toISOString().slice(0, 16).replace('T', ' ') : '');
  const min = session.e ? Math.round((session.e - session.s) / 60000) : '';
  for (const item of session.ex || []) {
    const ex = exMap[item.id];
    validSets(item.sets).forEach((s, i) => {
      const load = setLoad(s, ex, bw);
      rows.push([memberLabel, session.id, dayKey(session.s), fmt(session.s), fmt(session.e), min,
        item.id, ex ? ex.name : item.id, i + 1, +s.w || 0, +s.r, s.rpe || '', round1(load), round1(e1rm(load, s.r)) || '']);
    });
  }
  return rows;
}
export const CSV_HEADER = ['member', 'session_id', 'date_jst', 'start_jst', 'end_jst', 'duration_min',
  'exercise_id', 'exercise', 'set_no', 'weight_kg', 'reps', 'rpe', 'load_kg', 'e1rm_kg'];

/** ID生成（時刻＋乱数。時刻順に並ぶ） */
export const newId = (p = 's') => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
