// app.js — 画面（ビュー）とユーザー操作。データの保存は store.js、計算は calc.js に任せる。
import { APP_VERSION, CHANGELOG, MUSCLES, MUSCLE_MAP, EXERCISES, CATEGORIES, POSITIONS } from './catalog.js';
import { summarize, buildStats, muscleWindow, lastTrained, weekKeys, periodTotal, rank, liveState,
  e1rm, setLoad, monthKey, dayKey, weekStart, weekKey, toCSV, sessionRows, CSV_HEADER, newId, validSets } from './calc.js';
import { bodySVG } from './body.js';
import { createStore } from './store.js'; import * as pinUI from './pin.js';
import { PROGRAMS, PROGRAM_MAP } from './programs.js';
import { suggest, history, programDay, advance, insights, recommendDay, strengthLevel, streakWeeks,
  earnedBadges, BADGES, STANDARDS, LEVEL_NAMES } from './coach.js';

// ============================================================ 状態
const S = {
  store: null, uid: null,
  members: {}, live: {}, months: [], sessions: [], custom: {}, exMap: {}, profiles: {},
  tab: 'home', bodyWin: '7d', bodySel: null, teamBodySel: null,
  rk: { metric: 'e1rm', ex: 'bench', period: 'week' },
  cur: null,                       // 進行中セッション（live/{uid} と同期）
  rest: { until: 0, dur: 90 },
  liveInit: false, dirty: false,
};
const DAY = 864e5;

// ============================================================ 小道具
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n0 = v => (Number.isFinite(+v) ? +v : 0);
const pad = n => String(n).padStart(2, '0');
const fmtKg = v => `${(Math.round(n0(v) * 10) / 10).toLocaleString('ja-JP')}kg`;
const fmtVol = v => (n0(v) >= 10000 ? `${(n0(v) / 1000).toFixed(1)}t` : `${Math.round(n0(v)).toLocaleString('ja-JP')}kg`);
const fmtMin = m => { m = Math.round(n0(m)); return m >= 60 ? `${Math.floor(m / 60)}時間${m % 60 ? `${m % 60}分` : ''}` : `${m}分`; };
const fmtEl = ms => { const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600); return h ? `${h}:${pad(Math.floor(s % 3600 / 60))}:${pad(s % 60)}` : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; };
const dtf = (o) => new Intl.DateTimeFormat('ja-JP', o);
const fmtDate = t => dtf({ month: 'numeric', day: 'numeric', weekday: 'short' }).format(t);
const fmtTime = t => dtf({ hour: '2-digit', minute: '2-digit' }).format(t);
const ago = t => {
  const d = Date.now() - t;
  if (d < 3600e3) return `${Math.max(1, Math.round(d / 60000))}分前`;
  if (d < DAY) return `${Math.round(d / 3600e3)}時間前`;
  return `${Math.round(d / DAY)}日前`;
};
const toLocalInput = t => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const clone = o => JSON.parse(JSON.stringify(o));
const COLORS = ['#d7301f', '#1f5fd1', '#1e9a55', '#e07b00', '#4a4a4a', '#0f8a8a', '#a8326e'];
const colorOf = id => COLORS[[...String(id)].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];

const me = () => S.members[S.uid] || null;
const myBw = () => n0(me()?.bw);
const exName = id => S.exMap[id]?.name || '（削除された種目）';
function nameOf(id) {
  const m = S.members[id];
  return (m?.nick || '').trim() || S.profiles[id]?.name || (id === S.uid ? 'あなた' : 'メンバー');
}
const avatar = (id, live) => `<span class="avatar${live ? ' live' : ''}" style="background:${colorOf(id)}">${esc([...nameOf(id)][0] || '?')}</span>`;
const subOf = id => { const m = S.members[id] || {}; return [m.num ? `#${esc(m.num)}` : '', esc(m.pos || '')].filter(Boolean).join(' '); };

function toast(msg, err) {
  const el = document.createElement('div');
  el.className = 'toast' + (err ? ' err' : '');
  el.textContent = msg;
  const box = $('#toasts');
  while (box.children.length >= 2) box.firstElementChild.remove();
  box.append(el);
  setTimeout(() => el.remove(), err ? 6000 : 4200);
}
function onError(e) {
  if (e && e.code === 'quota_exceeded') toast('保存容量の上限に達しました。古い記録の整理が必要です。', true);
  else if (e && e.code === 'invalid_argument') toast('保存できませんでした（書き込み権限がない可能性があります）', true);
  else if (e && e.code !== 'unavailable') toast('通信エラー：' + (e.message || e.code || e), true);
}
function onStatus(label, st) { if (st === 'slow') toast('サーバーに接続できるまで待っています…', true); }

function rebuildExMap() {
  S.exMap = Object.fromEntries([...EXERCISES, ...Object.values(S.custom)].map(e => [e.id, e]));
}

// ============================================================ 描画制御
let rq = 0;
function render() { if (!rq) rq = requestAnimationFrame(() => { rq = 0; draw(false); }); }
function renderNow() { draw(true); }
function draw(force) {
  renderLiveStrip();
  const v = $('#view');
  const a = document.activeElement;
  // 入力中は再描画しない（入力値やフォーカスが消えるため）。記録画面はローカル操作でのみ描き直す。
  if (!force && ((S.tab === 'log' && S.cur) || (v.contains(a) && a.matches('input,select,textarea')))) { S.dirty = true; return; }
  S.dirty = false;
  VIEWS[S.tab](v);
}
document.addEventListener('focusout', () => setTimeout(() => {
  const a = document.activeElement;
  if (S.dirty && S.tab !== 'log' && !($('#view').contains(a) && a.matches('input,select,textarea'))) render();
}, 50));

function route() {
  const t = (location.hash || '#home').slice(1);
  S.tab = VIEWS[t] ? t : 'home';
  $$('.tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === S.tab));
  renderNow();
  window.scrollTo({ top: 0 });
}

// ============================================================ 人体図
const TH = { '7d': [0, 3, 6, 10, 15], '28d': [0, 10, 24, 40, 60], 'sess': [0, 1, 2, 4, 6] };
function legend(th, unit = 'セット') {
  return `<div class="legend">${['--mu0', '--h1', '--h2', '--h3', '--h4', '--h5'].map((c, i) =>
    `<i style="background:var(${c})"></i>${i === 0 ? '0' : i === 1 ? `〜${th[1]}` : i === 5 ? `${th[4]}+` : th[i - 1] + '〜'}`).join(' ')} <span>（加重${unit}）</span></div>`;
}
function bodyBlock(values, { th = TH['7d'], sel = null, compact = false, id = '' } = {}) {
  return `<div class="bodywrap" ${id ? `id="${id}"` : ''}>${bodySVG(values, { thresholds: th, selected: sel, compact })}
    <div class="body-labels"><span>前面</span><span>背面</span></div></div>`;
}
function muscleInfo(m, values, last, unit) {
  if (!m) return '<span class="mute">筋群をタップすると、セット数と前回の実施日を表示します。</span>';
  const v = n0(values[m]);
  const sug = EXERCISES.filter(e => e.m[m] >= 1).slice(0, 5).map(e => esc(e.name)).join('・');
  return `<b>${esc(MUSCLE_MAP[m].name)}</b>　${v} ${unit}　<span class="mute">最終：${last[m] ? ago(last[m]) : '記録なし'}</span>
    <div class="small mute">主な種目：${sug}</div>`;
}

// ============================================================ ヘッダーのライブ表示
function liveList() {
  return Object.values(S.live).filter(l => liveState(l) !== 'off')
    .sort((a, b) => b.startedAt - a.startedAt);
}
function renderLiveStrip() {
  const ls = liveList().filter(l => liveState(l) === 'on');
  const box = $('#liveStrip');
  box.innerHTML = ls.length
    ? ls.map(l => `<button class="pill" data-member="${esc(l.id)}"><span class="dot"></span>${esc(nameOf(l.id))} <span class="num" data-since="${n0(l.startedAt)}">${fmtEl(Date.now() - l.startedAt)}</span></button>`).join('')
    : '<span class="small mute">いまトレーニング中の人はいません</span>';
  document.title = ls.length ? `(${ls.length}) Lift Board` : 'Lift Board';
}

// ============================================================ ホーム
function nextPlan() {
  const m = me();
  const ctx = { sessions: S.sessions, best: m?.best || {}, exMap: S.exMap };
  if (m?.prog?.id && PROGRAM_MAP[m.prog.id]) return { ...programDay(m.prog, ctx), mine: true };
  const pick = recommendDay(m?.recent || [], S.exMap);
  return pick ? { ...programDay({ id: pick.id, day: pick.day, week: 0 }, ctx), mine: false } : null;
}
function planHTML(plan) {
  if (!plan) return '';
  return `<ul class="plan">${plan.items.map(it => {
    const w = it.sets[0]?.w, same = it.sets.every(s => s.w === w && s.r === it.sets[0].r);
    const spec = same ? `${w !== '' && w != null ? (w ? fmtKg(w) : '自重') + ' × ' : ''}${n0(it.sets[0].r)}回 × ${it.sets.length}セット` : it.sets.map(s => `${s.w || '—'}×${s.r}`).join(' / ');
    return `<li><div><b>${esc(exName(it.id))}</b>${it.main ? ' <span class="tag">メイン</span>' : ''}<div class="small mute">${esc(it.reason || '')}</div></div><span class="num spec">${esc(spec)}</span></li>`;
  }).join('')}</ul>`;
}
function coachCard() {
  const m = me();
  const plan = nextPlan();
  const ins = insights({ recent: m?.recent || [], best: m?.best || {}, sessions: S.sessions, exMap: S.exMap });
  return `<section class="card coach">
    <div class="card-h"><div><span class="eyebrow">${plan?.mine ? '次のメニュー' : 'きょうのおすすめ'}</span><h2>${esc(plan?.title || 'メニューを選ぼう')}</h2></div>
      <button class="btn sm ghost" data-act="programs">${m?.prog?.id ? 'メニュー変更' : '定番メニューを選ぶ'}</button></div>
    ${plan && !plan.mine ? '<p class="small mute" style="margin:-4px 0 8px">直近7日の不足部位を埋め、回復中の部位を避ける日を定番メニューから選びました。</p>' : ''}
    ${planHTML(plan)}
    ${S.cur ? '' : `<button class="btn red" data-act="startplan" style="width:100%;margin-top:10px" ${S.store.canWrite ? '' : 'disabled'}>このメニューで開始</button>`}
    ${ins.length ? `<div class="insights">${ins.map(i => `<div class="ins ${i.tone}"><b>${esc(i.title)}</b><span>${esc(i.body)}</span>
      ${i.ex?.length ? `<span class="small">おすすめ：${i.ex.map(id => esc(exName(id))).join('・')}</span>` : ''}</div>`).join('')}</div>` : ''}
  </section>`;
}
function statusStrip(m) {
  if (!m) return '';
  const st = streakWeeks(m.weeks);
  const b = m.best || {};
  const total = ['squat', 'bench', 'deadlift'].every(k => b[k]?.e1rm) ? Math.round(b.squat.e1rm + b.bench.e1rm + b.deadlift.e1rm) : 0;
  return `<div class="strip">
    <div><span class="flame${st ? ' on' : ''}" aria-hidden="true"></span><b class="num">${st}</b><span>週連続</span></div>
    <div><b class="num">${(m.badges || []).length}<small>/${BADGES.length}</small></b><span>バッジ</span></div>
    <div><b class="num">${total ? total + '<small>kg</small>' : '—'}</b><span>BIG3合計</span></div></div>`;
}
function viewHome(v) {
  const now = Date.now();
  const m = me();
  const recent = m?.recent || [];
  const [kw, kl] = weekKeys(now, 2);
  const tw = periodTotal(m?.weeks, [kw]), lw = periodTotal(m?.weeks, [kl]);
  const delta = (a, b, f) => { if (!b) return ''; const d = a - b; return `<span class="small delta ${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '+' : '−'}${f(Math.abs(d))}</span>`; };
  const win = S.bodyWin === '28d' ? 28 : 7;
  const vals = muscleWindow(recent, now - win * DAY);
  const last = lastTrained(recent);
  const th = TH[S.bodyWin];
  const others = liveList().filter(l => l.id !== S.uid && liveState(l) === 'on');
  v.innerHTML = `
  ${!m && S.store.canWrite ? `<div class="card" style="border-color:var(--blue);margin-bottom:16px"><div class="row between"><div><h2>まずプロフィールを登録</h2><p class="small mute" style="margin:4px 0 0">ニックネームと体重を入れるとチームに表示され、体重比ランキングと筋力レベルが出ます。</p></div><button class="btn blue" data-act="profile">登録する</button></div></div>` : ''}
  ${!S.store.canWrite ? `<div class="card" style="margin-bottom:16px"><b>閲覧のみ</b><p class="small mute" style="margin:4px 0 0">記録するには、オーナーにこのアプリの「Contributor（参加者）」以上の権限をもらってください。</p></div>` : ''}
  <div class="grid2">
    <div class="stack">
      <section class="card hero">
        ${S.cur
          ? `<button class="start on" data-go="log" aria-label="記録画面へ"><span>LIVE<small>記録を続ける</small></span></button>
             <div><p class="small mute" style="margin:0">${fmtTime(S.cur.s)} から記録中</p>
             <div class="big-time" data-since="${S.cur.s}">${fmtEl(now - S.cur.s)}</div>
             <p class="small" style="margin:6px 0 10px">${S.cur.ex.length}種目・${S.cur.ex.reduce((a, i) => a + validSets(i.sets).length, 0)}セット完了</p>
             <div class="row"><a class="btn blue" href="#log">記録画面へ</a><button class="btn" data-act="finish">終了する</button></div></div>`
          : `<button class="start" data-act="start" ${S.store.canWrite ? '' : 'disabled'} aria-label="トレーニング開始"><span>START<small>自由に記録</small></span></button>
             <div><h1>${esc(nameOf(S.uid))}</h1>${statusStrip(m)}
             <button class="btn ghost sm" data-act="manual" ${S.store.canWrite ? '' : 'disabled'} style="margin-top:10px">過去の記録を手入力</button></div>`}
      </section>
      ${S.store.mode === 'supabase' && S.push && S.push !== 'on' && S.push !== 'unsupported' && S.push !== 'denied' ? pushCard(true) : ''}
      ${pinUI.card(S, false)}${coachCard()}
      <section class="card">
        <div class="card-h"><h2>今週のあなた</h2><span class="small mute">先週比</span></div>
        <div class="kpis">
          <div class="kpi"><b>${tw.n}<small style="font-size:15px">回</small></b><span>トレーニング</span> ${delta(tw.n, lw.n, x => x + '回')}</div>
          <div class="kpi"><b>${esc(fmtMin(tw.min))}</b><span>時間</span> ${delta(tw.min, lw.min, fmtMin)}</div>
          <div class="kpi"><b>${esc(fmtVol(tw.vol))}</b><span>総挙上量</span> ${delta(tw.vol, lw.vol, fmtVol)}</div>
        </div>
      </section>
      ${others.length ? `<section class="card"><div class="card-h"><h2>いまジムにいる仲間</h2><span class="num">${others.length}人</span></div>
        <div class="live-grid">${others.map(liveCard).join('')}</div></section>` : ''}
    </div>
    <div class="stack">
      <section class="card">
        <div class="card-h"><h2>鍛えた部位</h2>
          <div class="seg" role="group" aria-label="期間">${[['7d', '7日間'], ['28d', '28日間']].map(([k, l]) => `<button data-bodywin="${k}" class="${S.bodyWin === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        ${bodyBlock(vals, { th, sel: S.bodySel, id: 'homeBody' })}
        ${legend(th)}
        <div class="musinfo" id="musinfo">${muscleInfo(S.bodySel, vals, last, 'セット')}</div>
        <p class="small mute" style="margin:0">加重セット＝主働筋1、協働筋0.5で数えたセット数。週10〜20セットが筋肥大の目安とされる範囲です。</p>
      </section>
      <section class="card">
        <div class="card-h"><h2>最近の記録</h2><a href="#me" class="small">すべて</a></div>
        ${recent.length ? `<ul class="list">${recent.slice(0, 4).map(r => sessionItem(S.uid, r, true)).join('')}</ul>` : '<p class="empty">まだ記録がありません</p>'}
      </section>
    </div>
  </div>`;
}
function liveCard(l) {
  const st = liveState(l);
  const cur = l.session?.ex?.at(-1);
  const sets = (l.session?.ex || []).reduce((a, i) => a + validSets(i.sets).length, 0);
  return `<button class="live-card ${st === 'stale' ? 'stale' : ''}" data-member="${esc(l.id)}">
    <div class="row">${avatar(l.id, st === 'on')}<div><div class="t"><b>${esc(nameOf(l.id))}</b></div><div class="small mute">${fmtTime(l.startedAt)} 開始${st === 'stale' ? '・終了忘れ？' : ''}</div></div></div>
    <div class="el num" data-since="${n0(l.startedAt)}">${fmtEl(Date.now() - l.startedAt)}</div>
    <div class="small mute">${cur ? esc(exName(cur.id)) + ' ・ ' : ''}${sets}セット</div></button>`;
}
function sessionItem(uid, r, mine) {
  const mus = Object.entries(r.mus || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => MUSCLE_MAP[k]?.name).filter(Boolean);
  const top = r.top ? `${exName(r.top.id)} ${fmtKg(r.top.w)}×${n0(r.top.r)}` : '';
  return `<li><button class="item" ${mine ? `data-edit="${esc(r.id)}"` : `data-member="${esc(uid)}"`}>
    ${avatar(uid)}
    <div><div class="t">${mine ? fmtDate(r.s) : esc(nameOf(uid)) + '　<span class="small mute">' + fmtDate(r.s) + '</span>'}${r.pr ? ' <span class="tag pr">PR</span>' : ''}</div>
    <div class="s">${fmtTime(r.s)}–${r.e ? fmtTime(r.e) : ''}・${esc(mus.join('・') || '—')}${top ? '・' + esc(top) : ''}</div></div>
    <div class="num" style="text-align:right"><b style="font-size:20px">${esc(fmtVol(r.vol))}</b><div class="small mute">${n0(r.sets)}セット・${esc(fmtMin((r.e - r.s) / 60000))}</div></div>
  </button></li>`;
}

// ============================================================ 記録（ライブ）
function viewLog(v) {
  if (!S.cur) {
    const mine = (me()?.recent || []).slice(0, 8);
    v.innerHTML = `<div class="grid2"><section class="card hero">
      <button class="start" data-act="start" ${S.store.canWrite ? '' : 'disabled'}><span>START<small>トレーニング開始</small></span></button>
      <div><h1>記録を始める</h1><p class="small mute" style="margin:6px 0 12px">開始時刻が自動で記録され、チームに「トレーニング中」と通知されます。種目とセットはトレーニングしながら追加できます。</p>
      <button class="btn" data-act="manual" ${S.store.canWrite ? '' : 'disabled'}>過去の記録を手入力</button></div></section>
      <section class="card"><div class="card-h"><h2>最近の記録</h2><span class="small mute">タップで編集</span></div>
      ${mine.length ? `<ul class="list">${mine.map(r => sessionItem(S.uid, r, true)).join('')}</ul>` : '<p class="empty">まだ記録がありません</p>'}</section></div>`;
    return;
  }
  const sum = summarize(S.cur, S.exMap, myBw());
  v.innerHTML = `<div class="grid2"><div class="stack">
    <section class="card wk-head">
      <div><p class="small mute" style="margin:0"><span class="dot" style="display:inline-block"></span> ${fmtDate(S.cur.s)} ${fmtTime(S.cur.s)} から記録中</p>
      <div class="big-time" data-since="${S.cur.s}">${fmtEl(Date.now() - S.cur.s)}</div></div>
      <div class="row"><button class="btn" data-act="discard">破棄</button><button class="btn red" data-act="finish">終了して保存</button></div>
    </section>
    <div id="editor"></div>
    <section class="card"><div class="row between"><span class="small mute">レスト時間（セット完了で自動スタート）</span>
      <div class="seg">${[60, 90, 120, 180, 0].map(s => `<button data-restdur="${s}" class="${S.rest.dur === s ? 'on' : ''}">${s ? s + '秒' : 'オフ'}</button>`).join('')}</div></div></section>
  </div>
  <section class="card" id="sessBodyCard"><div class="card-h"><h2>このセッションの部位</h2><span class="num small" id="sessSum">${sum.sets}セット・${esc(fmtVol(sum.vol))}</span></div>
    <div id="sessBody">${bodyBlock(sum.mus, { th: TH.sess })}</div>${legend(TH.sess)}</section></div>`;
  mountEditor($('#editor'), S.cur, liveOpts());
}
function liveOpts() {
  return { live: true, onChange: structural => { syncLive(); updateSessBody(); if (structural) mountEditor($('#editor'), S.cur, liveOpts()); } };
}
function updateSessBody() {
  const box = $('#sessBody'); if (!box || !S.cur) return;
  const sum = summarize(S.cur, S.exMap, myBw());
  box.innerHTML = bodyBlock(sum.mus, { th: TH.sess });
  $('#sessSum').textContent = `${sum.sets}セット・${fmtVol(sum.vol)}`;
}

let liveTimer = 0;
function syncLive(now) {
  clearTimeout(liveTimer);
  const push = () => S.cur && S.store.setLive({
    active: true, startedAt: S.cur.s, updatedAt: Date.now(), session: S.cur,
  });
  if (now) return push();
  liveTimer = setTimeout(push, 800); // 入力が落ち着いてから1回だけ書く
}

// ---------------------------------------------------- セッション編集UI（ライブ・過去共通）
function prevFor(exId, excludeId) {
  const s = S.sessions.filter(x => x.id !== excludeId && x.e && (x.ex || []).some(i => i.id === exId && validSets(i.sets).length))
    .sort((a, b) => b.s - a.s)[0];
  if (!s) return null;
  return { s: s.s, sets: validSets(s.ex.find(i => i.id === exId).sets) };
}
function setRow(set, i, si, live) {
  return `<div class="set ${set.done ? 'done' : ''}" data-i="${i}" data-si="${si}">
    <span class="no">${si + 1}</span>
    <input inputmode="decimal" data-f="w" value="${esc(set.w ?? '')}" placeholder="${set.tw != null && set.tw !== '' ? esc(set.tw) : 'kg'}" aria-label="${si + 1}セット目 重量kg">
    <input inputmode="numeric" data-f="r" value="${esc(set.r ?? '')}" placeholder="${set.tr ? esc(set.tr) : '回'}" aria-label="${si + 1}セット目 回数">
    <select data-f="rpe" aria-label="RPE"><option value="">RPE</option>${[6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10].map(x => `<option ${+set.rpe === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
    <button class="ok" data-act="done" aria-label="セット完了" aria-pressed="${!!set.done}">✓</button>
    <button class="x" data-act="delset" aria-label="セット削除">×</button>
    <span class="tag pr" ${isPR(set, i) ? '' : 'hidden'}>PR更新</span></div>`;
}
let editing = null; // { sess, live }
function isPR(set, i) {
  if (!editing) return false;
  const it = editing.sess.ex[i]; const ex = S.exMap[it.id];
  const est = e1rm(setLoad(set, ex, myBw()), set.r);
  const best = n0(me()?.best?.[it.id]?.e1rm);
  return editing.live && est > 0 && best > 0 && est > best;
}
function mountEditor(root, sess, opts) {
  editing = { sess, live: opts.live };
  root.innerHTML = `<div class="stack">${sess.ex.map((it, i) => {
    const ex = S.exMap[it.id];
    const prev = prevFor(it.id, sess.id);
    let guide = '';
    if (opts.live) {
      const sg = it.reason ? null : suggest(ex, history(S.sessions, it.id, 3, sess.id), null, n0(me()?.best?.[it.id]?.e1rm));
      const t = it.sets.find(x => x.tw != null || x.tr);
      const n = it.sets.length;
      const spec = t ? [t.tw ? fmtKg(t.tw) : t.tw === 0 ? '自重' : '', t.tr ? `${t.tr}回` : '', `${n}セット`].filter(Boolean).join(' × ')
        : sg ? [sg.w ? fmtKg(sg.w) : sg.w === 0 ? '自重' : '', `${sg.reps}回`, `${sg.sets}セット`].filter(Boolean).join(' × ') : '';
      const why = it.reason || sg?.reason || '';
      if (spec || why) guide = `<div class="guide"><b>目安 ${esc(spec)}</b><span>${esc(why)}</span>${t ? '<span class="small mute">空欄のまま ✓ を押すと目安の値で記録</span>' : ''}</div>`;
    }
    return `<section class="exb" data-i="${i}">
      <div class="exb-h"><h3>${esc(exName(it.id))}</h3>
        <div class="row" style="gap:2px"><button class="icon-btn" data-act="up" aria-label="上へ" ${i ? '' : 'disabled'}>↑</button><button class="icon-btn" data-act="delex" aria-label="種目を削除">×</button></div></div>
      ${guide}
      ${prev ? `<div class="prev">前回 ${fmtDate(prev.s)}：${esc(prev.sets.map(s => `${n0(s.w)}×${n0(s.r)}`).join('、'))}</div>` : ''}
      ${ex?.bwf ? `<div class="prev">自重種目：重量欄は追加重量（負荷＝追加＋体重×${ex.bwf}）</div>` : ''}
      <div class="set-h"><span></span><span>kg</span><span>回</span><span>RPE</span><span>完了</span><span></span></div>
      <div class="sets">${it.sets.map((s, si) => setRow(s, i, si, opts.live)).join('')}</div>
      <button class="btn sm ghost" data-act="addset">＋ セット追加</button>
    </section>`;
  }).join('')}
  <button class="btn" data-act="addex" style="width:100%">＋ 種目を追加</button>
  <label>メモ<textarea data-f="note" rows="2" placeholder="体調、感覚、コーチからの指示など">${esc(sess.note || '')}</textarea></label></div>`;

  root.oninput = root.onchange = e => {
    const f = e.target.dataset.f; if (!f) return;
    if (f === 'note') { sess.note = e.target.value.slice(0, 1000); opts.onChange(false); return; }
    const row = e.target.closest('.set'); const i = +row.dataset.i, si = +row.dataset.si;
    const set = sess.ex[i].sets[si];
    let val = e.target.value.replace(',', '.');
    set[f] = val === '' ? '' : (f === 'r' ? Math.max(0, Math.round(n0(val))) : n0(val));
    row.querySelector('.pr').hidden = !isPR(set, i);
    opts.onChange(false);
  };
  root.onclick = e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act; const blk = b.closest('.exb'); const i = blk ? +blk.dataset.i : -1;
    if (act === 'addex') return openPicker(id => {
      if (opts.live) {
        const sg = suggest(S.exMap[id], history(S.sessions, id, 3, sess.id), null, n0(me()?.best?.[id]?.e1rm));
        sess.ex.push({ id, sets: Array.from({ length: sg.sets }, () => ({ w: '', r: '', tw: sg.w, tr: sg.reps, done: false })) });
      } else {
        const first = prevFor(id, sess.id)?.sets[0];
        sess.ex.push({ id, sets: [{ w: first ? n0(first.w) : '', r: first ? n0(first.r) : '', done: true }] });
      }
      opts.onChange(true);
    });
    if (act === 'addset') {
      const sets = sess.ex[i].sets; const l = sets.at(-1) || {};
      sets.push({ w: l.w ?? '', r: l.r ?? '', tw: l.tw, tr: l.tr, done: !opts.live });
      return opts.onChange(true);
    }
    if (act === 'delex') { sess.ex.splice(i, 1); return opts.onChange(true); }
    if (act === 'up' && i > 0) { [sess.ex[i - 1], sess.ex[i]] = [sess.ex[i], sess.ex[i - 1]]; return opts.onChange(true); }
    const row = b.closest('.set'); if (!row) return;
    const si = +row.dataset.si; const set = sess.ex[i].sets[si];
    if (act === 'delset') { sess.ex[i].sets.splice(si, 1); return opts.onChange(true); }
    if (act === 'done') {
      set.done = !set.done;
      if (set.done && set.r === '' && set.tr) { set.r = set.tr; row.querySelector('[data-f=r]').value = set.r; }
      if (set.done && set.w === '' && set.tw != null && set.tw !== '') { set.w = set.tw; row.querySelector('[data-f=w]').value = set.w; }
      if (set.done && !(n0(set.r) > 0)) { set.done = false; toast('回数を入力してください'); return; }
      if (set.done && set.w === '' && !S.exMap[sess.ex[i].id]?.bwf) { set.done = false; toast('重量を入力してください'); return; }
      row.querySelector('.pr').hidden = !isPR(set, i);
      row.classList.toggle('done', set.done); b.setAttribute('aria-pressed', set.done);
      if (set.done && opts.live) startRest();
      opts.onChange(false);
    }
  };
}

// ---------------------------------------------------- 開始・終了・保存
async function startWorkout(plan) {
  if (!S.store.canWrite) return toast('書き込み権限がありません', true);
  if (S.cur) { location.hash = '#log'; return; }
  S.cur = { id: newId('s'), s: Date.now(), ex: [], note: '', src: 'live' };
  if (plan) {
    S.cur.ex = plan.items.map(it => ({ id: it.id, reason: it.reason, sets: it.sets.map(x => ({ w: '', r: '', tw: x.w === '' ? null : x.w, tr: x.r, done: false })) }));
    S.cur.title = plan.title;
    if (plan.mine) S.cur.prog = { id: plan.prog.id, day: plan.dayIndex, week: me()?.prog?.week || 0 };
  }
  syncLive(true);
  S.store.notify && S.store.notify('start');
  if (!me()) await saveStats(); // 初回はメンバー登録も兼ねる
  location.hash = '#log'; renderNow();
  toast('記録を開始しました。チームに表示されています。');
}
function cleanSession(s) {
  return { ...s, ex: s.ex.map(it => ({ id: it.id, sets: validSets(it.sets).map(x => ({ w: n0(x.w), r: n0(x.r), ...(x.rpe ? { rpe: n0(x.rpe) } : {}) })) })).filter(it => it.sets.length) };
}
function finishSheet() {
  if (!S.cur) return;
  const draft = cleanSession({ ...S.cur, e: Date.now() });
  const sum = summarize(draft, S.exMap, myBw());
  const prs = sum.perEx.filter(p => p.best && p.best.e1rm > n0(me()?.best?.[p.id]?.e1rm) && n0(me()?.best?.[p.id]?.e1rm) > 0);
  openSheet('トレーニング終了', () => `
    <div class="kpis"><div class="kpi"><b>${esc(fmtMin(sum.min))}</b><span>${fmtTime(draft.s)}–${fmtTime(draft.e)}</span></div>
    <div class="kpi"><b>${sum.sets}</b><span>セット</span></div><div class="kpi"><b>${esc(fmtVol(sum.vol))}</b><span>総挙上量</span></div></div>
    ${prs.length ? `<div class="row">${prs.map(p => `<span class="tag pr">PR ${esc(exName(p.id))} 推定${fmtKg(p.best.e1rm)}</span>`).join('')}</div>` : ''}
    ${bodyBlock(sum.mus, { th: TH.sess, compact: true })}
    ${sum.sets ? '' : '<p class="mute">回数が入ったセットがありません。このまま保存すると記録は残りません。</p>'}
    <div class="row between"><button class="btn" data-close>記録に戻る</button><button class="btn red" data-act="save">保存して終了</button></div>`,
  root => {
    root.querySelector('[data-act=save]').onclick = async () => {
      const s = cleanSession({ ...S.cur, e: Date.now() });
      const cur = S.cur; S.cur = null; clearTimeout(liveTimer); stopRest();
      closeAll();
      const before = new Set(me()?.badges || []);
      const patch = cur.prog && me()?.prog?.id === cur.prog.id ? { prog: advance(me().prog) } : {};
      if (s.ex.length) await saveSession(s, null, patch);
      await S.store.setLive({ active: false, lastId: cur.id, lastEnd: s.e, updatedAt: Date.now() });
      const min = summarize(s, S.exMap, myBw()).min;
      S.store.notify && s.ex.length && S.store.notify('finish', { min, pr: prs.length });
      const fresh = (me()?.badges || []).filter(b => !before.has(b));
      if (prs.length || fresh.length) confetti();
      fresh.forEach(id => toast(`バッジ獲得：${BADGES.find(b => b.id === id)?.name}`));
      toast(s.ex.length ? `保存しました（${fmtMin(min)}）` : '記録なしで終了しました');
      location.hash = '#home'; renderNow();
    };
  });
}
function discardSheet() {
  openSheet('記録を破棄', () => `<p>進行中の記録（${fmtTime(S.cur.s)}開始）を削除します。元に戻せません。</p>
    <div class="row between"><button class="btn" data-close>やめる</button><button class="btn red" data-act="ok">破棄する</button></div>`,
  root => root.querySelector('[data-act=ok]').onclick = async () => {
    const id = S.cur.id; S.cur = null; clearTimeout(liveTimer); stopRest(); closeAll();
    await S.store.setLive({ active: false, lastId: id, lastEnd: Date.now(), updatedAt: Date.now() });
    renderNow();
  });
}

function applyMonth(key, sessions) {
  const i = S.months.findIndex(m => m.id === key);
  if (sessions) { const doc = { id: key, month: key, sessions }; i >= 0 ? (S.months[i] = doc) : S.months.push(doc); }
  else if (i >= 0) S.months.splice(i, 1);
  flattenSessions();
}
function flattenSessions() {
  S.sessions = S.months.flatMap(m => Object.values(m.sessions || {})).filter(s => s && s.s).sort((a, b) => b.s - a.s);
}
/** 月ドキュメントへ保存 → 集計を再計算して members/{uid} へ */
async function saveSession(s, oldStart, patch = {}) {
  const key = monthKey(s.s);
  if (oldStart != null && monthKey(oldStart) !== key) await removeFromMonth(s.id, monthKey(oldStart), false);
  const cur = clone(S.months.find(m => m.id === key)?.sessions || {});
  cur[s.id] = s;
  applyMonth(key, cur);
  await S.store.saveMonth(key, cur);
  await saveStats(patch);
}
async function removeFromMonth(id, key, stats = true) {
  const cur = clone(S.months.find(m => m.id === key)?.sessions || {});
  delete cur[id];
  if (Object.keys(cur).length) { applyMonth(key, cur); await S.store.saveMonth(key, cur); }
  else { applyMonth(key, null); await S.store.deleteMonth(key); }
  if (stats) await saveStats();
}
async function saveStats(profilePatch = {}) {
  const prev = me() || {};
  const profile = {
    nick: prev.nick || '', num: prev.num || '', pos: prev.pos || '', bw: n0(prev.bw) || 0,
    joinedAt: prev.joinedAt || Date.now(), prog: prev.prog || null, ...profilePatch,
  };
  const stats = buildStats(S.sessions, S.exMap, profile.bw);
  const doc = { ...profile, ...stats, badges: earnedBadges(stats, profile.bw), streak: streakWeeks(stats.weeks), lastAt: S.sessions[0]?.e || 0 };
  S.members[S.uid] = { id: S.uid, ...doc }; // 画面を先に更新
  render();
  await S.store.saveMember(doc);
}

// ---------------------------------------------------- 過去セッションの編集
function openEditSheet(orig, isNew) {
  const sess = clone(orig);
  sess.ex.forEach(it => it.sets.forEach(s => { s.done = true; }));
  const oldStart = orig.s;
  openSheet(isNew ? '記録を手入力' : `${fmtDate(orig.s)} の記録`, () => `
    <div class="form"><label>開始<input type="datetime-local" data-t="s" value="${toLocalInput(sess.s)}"></label>
    <label>終了<input type="datetime-local" data-t="e" value="${toLocalInput(sess.e)}"></label></div>
    <div id="sheetEditor"></div>
    <div class="row between">${isNew ? '<span></span>' : '<button class="btn ghost" data-act="del" style="color:var(--red-ink)">この記録を削除</button>'}
    <div class="row"><button class="btn" data-close>キャンセル</button><button class="btn red" data-act="savepast">保存</button></div></div>`,
  root => {
    const mount = () => mountEditor($('#sheetEditor', root), sess, { live: false, onChange: st => { if (st) mount(); } });
    mount();
    $$('[data-t]', root).forEach(inp => inp.onchange = () => { const t = new Date(inp.value).getTime(); if (t) sess[inp.dataset.t] = t; });
    root.querySelector('[data-act=savepast]').onclick = async () => {
      if (!(sess.e > sess.s)) return toast('終了は開始より後にしてください', true);
      if (sess.e - sess.s > 8 * 3600e3) return toast('8時間を超える記録は保存できません', true);
      const s = cleanSession(sess); delete s.done;
      if (!s.ex.length) return toast('回数が入ったセットがありません', true);
      closeAll(); await saveSession(s, isNew ? null : oldStart); toast('保存しました'); renderNow();
    };
    const del = root.querySelector('[data-act=del]');
    if (del) del.onclick = () => openSheet('記録を削除', () => `<p>${fmtDate(orig.s)} ${fmtTime(orig.s)} の記録を削除します。元に戻せません。</p>
      <div class="row between"><button class="btn" data-close>やめる</button><button class="btn red" data-act="ok">削除する</button></div>`,
      r2 => r2.querySelector('[data-act=ok]').onclick = async () => { closeAll(); await removeFromMonth(orig.id, monthKey(orig.s)); toast('削除しました'); renderNow(); });
  });
}

// ---------------------------------------------------- 種目選択
function openPicker(onPick) {
  const st = { q: '', cat: '', mus: null };
  openSheet('種目を選ぶ', () => `
    <input type="search" id="pkq" placeholder="種目名で検索" autocomplete="off">
    <div class="chips" id="pkcat">${['', ...CATEGORIES].map(c => `<button class="chip ${c === st.cat ? 'on' : ''}" data-cat="${c}">${c || 'すべて'}</button>`).join('')}</div>
    <details><summary class="small">人体図で部位から選ぶ</summary><div id="pkbody"></div></details>
    <ul class="list" id="pklist"></ul>
    <button class="btn" data-act="custom">＋ カスタム種目を作る</button>`,
  root => {
    const list = () => {
      const q = st.q.trim().toLowerCase();
      let xs = Object.values(S.exMap).filter(e => (!st.cat || e.cat === st.cat) && (!q || e.name.toLowerCase().includes(q) || e.id.includes(q)));
      if (st.mus) xs = xs.filter(e => e.m[st.mus] > 0).sort((a, b) => b.m[st.mus] - a.m[st.mus]);
      $('#pklist', root).innerHTML = xs.length ? xs.map(e => `<li><button class="item" data-pick="${esc(e.id)}" style="grid-template-columns:minmax(0,1fr) auto">
        <div><div class="t">${esc(e.name)}</div><div class="s">${Object.entries(e.m).filter(([, k]) => k >= 1).map(([m]) => esc(MUSCLE_MAP[m]?.name || m)).join('・')}</div></div>
        <span class="tag">${esc(e.cat)}</span></button></li>`).join('') : '<p class="empty">該当なし</p>';
      $('#pkbody', root).innerHTML = bodyBlock(st.mus ? { [st.mus]: 15 } : {}, { compact: true, sel: st.mus }) +
        `<p class="small mute">${st.mus ? esc(MUSCLE_MAP[st.mus].name) + 'を使う種目（もう一度タップで解除）' : '部位をタップ'}</p>`;
    };
    list();
    $('#pkq', root).oninput = e => { st.q = e.target.value; list(); };
    root.onclick = e => {
      const c = e.target.closest('[data-cat]');
      if (c) { st.cat = c.dataset.cat; $$('[data-cat]', root).forEach(x => x.classList.toggle('on', x === c)); return list(); }
      const mu = e.target.closest('[data-m]');
      if (mu) { st.mus = st.mus === mu.dataset.m ? null : mu.dataset.m; return list(); }
      const p = e.target.closest('[data-pick]');
      if (p) { closeSheet(); onPick(p.dataset.pick); return; }
      if (e.target.closest('[data-act=custom]')) openCustomForm(id => { closeSheet(); onPick(id); });
    };
  });
}
function openCustomForm(done) {
  const st = { prim: new Set(), sec: new Set() };
  const chips = key => MUSCLES.map(m => `<button class="chip" data-k="${key}" data-mm="${m.id}">${esc(m.name)}</button>`).join('');
  openSheet('カスタム種目', () => `
    <label>種目名<input id="cxn" maxlength="40" placeholder="例：スレッドプッシュ"></label>
    <div><div class="small mute">主働筋（係数1）</div><div class="chips" style="flex-wrap:wrap">${chips('prim')}</div></div>
    <div><div class="small mute">協働筋（係数0.5）</div><div class="chips" style="flex-wrap:wrap">${chips('sec')}</div></div>
    <label>自重の扱い<select id="cxb"><option value="0">自重を負荷に含めない</option><option value="1">体重の100%を負荷に含める</option><option value="0.64">体重の64%を負荷に含める</option></select></label>
    <p class="small mute">チーム全員の種目リストに追加されます。</p>
    <div class="row between"><button class="btn" data-close>キャンセル</button><button class="btn red" data-act="mk">作成</button></div>`,
  root => {
    root.onclick = async e => {
      const c = e.target.closest('[data-mm]');
      if (c) { const set = st[c.dataset.k]; set.has(c.dataset.mm) ? set.delete(c.dataset.mm) : set.add(c.dataset.mm); c.classList.toggle('on'); return; }
      if (!e.target.closest('[data-act=mk]')) return;
      const name = $('#cxn', root).value.trim();
      if (!name) return toast('種目名を入れてください', true);
      if (!st.prim.size) return toast('主働筋を1つ以上選んでください', true);
      const m = {}; st.sec.forEach(k => m[k] = .5); st.prim.forEach(k => m[k] = 1);
      const ex = { id: newId('c'), name, cat: 'カスタム', m, ...(n0($('#cxb', root).value) ? { bwf: n0($('#cxb', root).value) } : {}) };
      S.custom[ex.id] = ex; rebuildExMap();
      S.store.saveExercise(ex);
      closeSheet(); done(ex.id);
    };
  });
}

// ---------------------------------------------------- レストタイマー
function startRest() {
  if (!S.rest.dur) return;
  S.rest.until = Date.now() + S.rest.dur * 1000; S.rest.fired = false; tickRest();
}
function stopRest() { S.rest.until = 0; $('#rest').hidden = true; }
function tickRest() {
  const el = $('#rest');
  if (!S.rest.until) { el.hidden = true; return; }
  const left = S.rest.until - Date.now();
  if (left <= 0) {
    if (!S.rest.fired) { S.rest.fired = true; toast('レスト終了。次のセットへ'); try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch {} }
    stopRest(); return;
  }
  el.hidden = false;
  el.innerHTML = `<span class="small">レスト</span><b class="num">${fmtEl(left)}</b><button data-rest="30">+30秒</button><button data-rest="0">スキップ</button>`;
}
$('#rest').onclick = e => {
  const b = e.target.closest('[data-rest]'); if (!b) return;
  if (b.dataset.rest === '0') stopRest(); else { S.rest.until += 30000; tickRest(); }
};

// ============================================================ チーム
function ring(p) {
  const r = 26, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, p));
  return `<svg class="ring" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="${r}" class="bg"/><circle cx="32" cy="32" r="${r}" class="fg" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 32 32)"/><text x="32" y="37" text-anchor="middle">${Math.round(f * 100)}%</text></svg>`;
}
function teamMembers() { return Object.values(S.members).filter(m => m && m.id); }
function viewTeam(v) {
  const now = Date.now();
  const ms = teamMembers();
  const lives = liveList();
  const [kw] = weekKeys(now, 1);
  const wk = ms.map(m => periodTotal(m.weeks, [kw]));
  const active = wk.filter(t => t.n > 0).length;
  const tot = wk.reduce((a, t) => ({ n: a.n + t.n, min: a.min + t.min, vol: a.vol + t.vol }), { n: 0, min: 0, vol: 0 });
  const goal = Math.max(3, ms.length * 3);
  const mvp = ms.map((m, i) => ({ id: m.id, t: wk[i] })).filter(x => x.t.n > 0).sort((a, b) => b.t.n - a.t.n || b.t.min - a.t.min)[0];
  const teamMus = {};
  ms.forEach(m => Object.entries(muscleWindow(m.recent, now - 7 * DAY)).forEach(([k, x]) => teamMus[k] = (teamMus[k] || 0) + x));
  const per = Math.max(1, ms.length);
  const avgMus = Object.fromEntries(Object.entries(teamMus).map(([k, x]) => [k, Math.round(x / per * 10) / 10]));
  const feed = ms.flatMap(m => (m.recent || []).map(r => ({ uid: m.id, r }))).sort((a, b) => b.r.s - a.r.s).slice(0, S.feedN || 12);
  const sorted = ms.slice().sort((a, b) => (liveState(S.live[b.id]) === 'on') - (liveState(S.live[a.id]) === 'on') || n0(b.lastAt) - n0(a.lastAt));
  v.innerHTML = `<div class="stack">
    <section class="card"><div class="card-h"><h2>いまトレーニング中</h2><span class="num">${lives.filter(l => liveState(l) === 'on').length}人</span></div>
      ${lives.length ? `<div class="live-grid">${lives.map(liveCard).join('')}</div>` : '<p class="empty">いまは誰もいません。開始するとここに表示されます。</p>'}</section>
    <div class="grid2">
      <div class="stack">
        <section class="card"><div class="card-h"><h2>今週のチーム</h2><span class="small mute">${kw}</span></div>
          <div class="goal">${ring(tot.n / goal)}<div><b class="num" style="font-size:28px">${tot.n}<small style="font-size:16px"> / ${goal}回</small></b>
            <div class="small mute">チーム目標（1人週3回×${ms.length}人）${tot.n >= goal ? '・達成！' : `・あと${goal - tot.n}回`}</div></div></div>
          <div class="kpis"><div class="kpi"><b>${active}<small style="font-size:15px">/${ms.length}人</small></b><span>実施した人</span></div>
          <div class="kpi"><b>${esc(fmtMin(tot.min))}</b><span>合計時間</span></div><div class="kpi"><b>${esc(fmtVol(tot.vol))}</b><span>総挙上量</span></div></div>
          ${mvp ? `<div class="mvp"><span class="medal" aria-hidden="true"></span><div><span class="small mute">今週のMVP（回数→時間）</span><div><b>${esc(nameOf(mvp.id))}</b>　${mvp.t.n}回・${esc(fmtMin(mvp.t.min))}</div></div></div>` : ''}</section>
        <section class="card"><div class="card-h"><h2>メンバー</h2><span class="small mute">タップで詳細</span></div>
          ${sorted.length ? `<ul class="list">${sorted.map(m => {
            const l = S.live[m.id]; const on = liveState(l) === 'on';
            const t = periodTotal(m.weeks, [kw]);
            return `<li><button class="item" data-member="${esc(m.id)}">${avatar(m.id, on)}
              <div><div class="t">${esc(nameOf(m.id))} <span class="small mute">${subOf(m.id)}</span></div>
              <div class="s">${on ? '<b style="color:var(--red-ink)">トレーニング中</b>' : m.lastAt ? '最終 ' + ago(m.lastAt) : '記録なし'}</div></div>
              <div class="num" style="text-align:right"><b style="font-size:20px">${t.n}回</b><div class="small mute">今週</div></div></button></li>`;
          }).join('')}</ul>` : '<p class="empty">まだメンバーがいません</p>'}</section>
      </div>
      <section class="card"><div class="card-h"><h2>チームの部位バランス</h2><span class="small mute">直近7日・1人あたり</span></div>
        ${bodyBlock(avgMus, { sel: S.teamBodySel, id: 'teamBody' })}${legend(TH['7d'])}
        <div class="musinfo" id="teammus">${S.teamBodySel ? `<b>${esc(MUSCLE_MAP[S.teamBodySel].name)}</b>　1人あたり ${n0(avgMus[S.teamBodySel])} セット / 7日` : '<span class="mute">部位をタップ</span>'}</div></section>
    </div>
    <section class="card"><div class="card-h"><h2>チームの記録</h2><span class="small mute">新しい順</span></div>
      ${feed.length ? `<ul class="list">${feed.map(f => sessionItem(f.uid, f.r, f.uid === S.uid)).join('')}</ul>
      ${feed.length >= (S.feedN || 12) ? '<button class="btn ghost" data-act="morefeed" style="width:100%">さらに表示</button>' : ''}` : '<p class="empty">まだ記録がありません</p>'}</section>
  </div>`;
}

function openMemberSheet(id) {
  const m = S.members[id] || { id };
  const now = Date.now();
  const l = S.live[id]; const st = liveState(l);
  const vals = muscleWindow(m.recent, now - 7 * DAY);
  const [kw, kl] = weekKeys(now, 2);
  const tw = periodTotal(m.weeks, [kw]);
  const bests = Object.entries(m.best || {}).filter(([, b]) => b.e1rm > 0 || b.w > 0)
    .sort((a, b) => (S.exMap[b[0]]?.big ? 1 : 0) - (S.exMap[a[0]]?.big ? 1 : 0) || b[1].e1rm - a[1].e1rm).slice(0, 12);
  openSheet(nameOf(id), () => `
    <div class="row">${avatar(id, st === 'on')}<div><b>${esc(nameOf(id))}</b> <span class="mute small">${subOf(id)}${m.bw ? `・体重${n0(m.bw)}kg` : ''}</span>
      <div class="small">${st === 'on' ? `<b style="color:var(--red-ink)">トレーニング中</b> <span class="num" data-since="${n0(l.startedAt)}">${fmtEl(now - l.startedAt)}</span>` : m.lastAt ? '最終 ' + ago(m.lastAt) : ''}</div></div></div>
    ${st !== 'off' && l.session?.ex?.length ? `<div class="card" style="padding:12px"><b class="small">いまのメニュー</b><div class="small">${l.session.ex.map(i => `${esc(exName(i.id))}（${validSets(i.sets).length}セット）`).join('、')}</div></div>` : ''}
    <div class="kpis"><div class="kpi"><b>${tw.n}回</b><span>今週</span></div><div class="kpi"><b>${esc(fmtMin(tw.min))}</b><span>今週の時間</span></div><div class="kpi"><b>${n0(m.totals?.n)}回</b><span>累計</span></div></div>
    <div>${bodyBlock(vals, { compact: true })}${legend(TH['7d'])}</div>
    ${(m.badges || []).length ? `<div class="row" style="gap:6px">${m.badges.map(id => `<span class="tag got">${esc(BADGES.find(b => b.id === id)?.name || '')}</span>`).join('')}${m.streak ? `<span class="tag">${n0(m.streak)}週連続</span>` : ''}</div>` : ''}
    ${n0(m.bw) ? levelsHTML(m) : ''}
    ${bests.length ? `<table><thead><tr><th>種目</th><th class="n">推定1RM</th><th class="n">最大重量</th></tr></thead><tbody>
      ${bests.map(([k, b]) => `<tr><td>${esc(exName(k))}</td><td class="n">${b.e1rm ? fmtKg(b.e1rm) : '—'}</td><td class="n">${fmtKg(b.w)}×${n0(b.wr)}</td></tr>`).join('')}</tbody></table>` : ''}
    ${(m.recent || []).length ? `<ul class="list">${m.recent.slice(0, 6).map(r => `<li class="item" style="cursor:default;grid-template-columns:minmax(0,1fr) auto">
      <div><div class="t">${fmtDate(r.s)} ${fmtTime(r.s)}</div><div class="s">${esc((r.ex || []).map(exName).join('・'))}</div></div>
      <div class="num">${esc(fmtVol(r.vol))}</div></li>`).join('')}</ul>` : '<p class="empty">記録なし</p>'}`);
}

// ============================================================ ランキング
const METRICS = [['e1rm', '推定1RM'], ['max', '最大重量'], ['ratio', '体重比'], ['total', 'BIG3合計'], ['vol', '総挙上量'], ['min', '時間'], ['n', '回数']];
const PERIODS = [['week', '今週'], ['last', '先週'], ['4w', '4週間'], ['all', '全期間']];
function fmtMetric(metric, v) {
  if (metric === 'ratio') return `×${v.toFixed(2)}`;
  if (metric === 'vol') return fmtVol(v);
  if (metric === 'min') return fmtMin(v);
  if (metric === 'n') return `${v}回`;
  return fmtKg(v);
}
function viewRank(v) {
  const rk = S.rk; const ms = teamMembers();
  const weightMode = ['e1rm', 'max', 'ratio'].includes(rk.metric);
  const totalMode = rk.metric === 'total';
  const used = new Set(ms.flatMap(m => Object.keys(m.best || {})));
  const exOpts = Object.values(S.exMap).filter(e => used.has(e.id) || e.big).sort((a, b) => (b.big ? 1 : 0) - (a.big ? 1 : 0));
  const rows = rank(ms, { metric: rk.metric, exId: rk.ex, period: rk.period });
  const max = rows[0]?.value || 1;
  const pod = rows.slice(0, 3);
  v.innerHTML = `<div class="stack"><section class="card">
    <div class="card-h"><h1>ランキング</h1></div>
    <div class="stack" style="gap:10px">
      <div class="seg" role="group" aria-label="指標">${METRICS.map(([k, l]) => `<button data-metric="${k}" class="${rk.metric === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${totalMode ? '<p class="small mute" style="margin:0">スクワット＋ベンチプレス＋デッドリフトの推定1RM合計。3種目すべて記録がある人が対象。</p>' : weightMode
        ? `<label>種目<select id="rkex">${exOpts.map(e => `<option value="${esc(e.id)}" ${e.id === rk.ex ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></label>`
        : `<div class="seg" role="group" aria-label="期間">${PERIODS.map(([k, l]) => `<button data-period="${k}" class="${rk.period === k ? 'on' : ''}">${l}</button>`).join('')}</div>`}
    </div></section>
    <section class="card">
      ${rows.length >= 3 ? `<div class="podium">${[1, 0, 2].map(i => `<button class="pod p${i + 1}" data-member="${esc(pod[i].id)}" style="border:0;cursor:pointer">
        <span class="num" style="font-size:14px">${pod[i].rank}位</span><span class="n">${esc(nameOf(pod[i].id))}</span><b>${esc(fmtMetric(rk.metric, pod[i].value))}</b></button>`).join('')}</div>` : ''}
      ${rows.length ? rows.map(r => `<div class="rank-row ${r.id === S.uid ? 'me' : ''}" data-member="${esc(r.id)}">
        <span class="rank-no r${r.rank}">${r.rank}</span>
        <div><div><b>${esc(nameOf(r.id))}</b> <span class="small mute">${subOf(r.id)}</span></div>
          <div class="bar"><i style="width:${Math.max(2, r.value / max * 100)}%"></i></div></div>
        <div class="rank-val"><b>${esc(fmtMetric(rk.metric, r.value))}</b>${r.detail ? `<div class="small mute">${esc(r.detail)}</div>` : ''}</div></div>`).join('')
        : '<p class="empty">この条件の記録はまだありません</p>'}
      <p class="small mute">${rk.metric === 'e1rm' ? '推定1RM＝Epley式 w×(1+r/30)。12回以下のセットから算出。' : rk.metric === 'ratio' ? '体重比＝推定1RM÷登録体重。体重未登録の人は対象外。' : rk.metric === 'max' ? '最大重量＝記録された最も重いセット（回数問わず）。' : '週はISO週（月曜始まり・日本時間）。総挙上量＝Σ重量×回数（自重種目は体重分を含む）。'}</p>
    </section></div>`;
  const sel = $('#rkex', v); if (sel) sel.onchange = () => { S.rk.ex = sel.value; renderNow(); };
}

// ============================================================ マイデータ
function viewMe(v) {
  const m = me() || {};
  const now = Date.now();
  // カレンダー（16週）
  const byDay = {};
  S.sessions.forEach(s => { const k = dayKey(s.s); byDay[k] = (byDay[k] || 0) + summarize(s, S.exMap, n0(m.bw)).sets; });
  const start = weekStart(now) - 15 * 7 * DAY;
  const days = [];
  for (let t = start; t < weekStart(now) + 7 * DAY; t += DAY) {
    const k = dayKey(t + 3600e3); const x = byDay[k] || 0;
    days.push(`<i class="${x ? 'c' + (x >= 25 ? 4 : x >= 16 ? 3 : x >= 8 ? 2 : 1) : ''}${k === dayKey(now) ? ' today' : ''}" title="${k}：${x}セット"></i>`);
  }
  const wks = weekKeys(now, 12).reverse();
  const wmax = Math.max(1, ...wks.map(k => n0(m.weeks?.[k]?.vol)));
  const bests = Object.entries(m.best || {}).filter(([, b]) => b.e1rm > 0)
    .sort((a, b) => (S.exMap[b[0]]?.big ? 1 : 0) - (S.exMap[a[0]]?.big ? 1 : 0) || b[1].e1rm - a[1].e1rm);
  const hist = S.sessions.slice(0, S.histN || 20);
  v.innerHTML = `<div class="grid2"><div class="stack">
    <section class="card"><div class="card-h"><h2>プロフィール</h2><span class="small mute">チーム全員に表示されます</span></div>
      <form class="form" id="pf">
        <label>表示名（ニックネーム）<input name="nick" maxlength="20" value="${esc(m.nick || '')}" placeholder="${esc(S.profiles[S.uid]?.name || '例：翼')}"></label>
        <label>背番号<input name="num" maxlength="3" inputmode="numeric" value="${esc(m.num || '')}"></label>
        <label>ポジション<select name="pos">${POSITIONS.map(p => `<option ${p === (m.pos || '') ? 'selected' : ''} value="${esc(p)}">${p || '—'}</option>`).join('')}</select></label>
        <label>体重(kg)<input name="bw" inputmode="decimal" value="${esc(m.bw || '')}" placeholder="例：85"></label>
        <button class="btn blue" ${S.store.canWrite ? '' : 'disabled'}>保存</button>
      </form></section>
    <section class="card"><div class="card-h"><h2>筋力レベル</h2><span class="small mute">推定1RM÷体重（一般的な基準の目安）</span></div>${levelsHTML(m)}</section>
    <section class="card"><div class="card-h"><h2>バッジ</h2><span class="num">${(m.badges || []).length}/${BADGES.length}</span></div>${badgesHTML(m)}</section>
    <section class="card"><div class="card-h"><h2>トレーニングした日</h2><span class="small mute">16週間・色＝セット数</span></div>
      <div class="cal" style="grid-template-columns:repeat(16,minmax(0,1fr))">${days.join('')}</div>
      <div class="row small mute" style="margin-top:6px;gap:14px"><span>累計 ${n0(m.totals?.n)}回</span><span>${esc(fmtMin(m.totals?.min))}</span><span>${esc(fmtVol(m.totals?.vol))}</span></div></section>
    <section class="card"><div class="card-h"><h2>週ごとの総挙上量</h2><span class="small mute">12週間</span></div>
      <div class="wbars">${wks.map((k, i) => `<div class="${i === 11 ? 'cur' : ''}" title="${k} ${fmtVol(n0(m.weeks?.[k]?.vol))}"><i style="height:${n0(m.weeks?.[k]?.vol) / wmax * 100}%"></i>${k.slice(-2)}</div>`).join('')}</div></section>
    <section class="card"><div class="card-h"><h2>自己ベスト</h2></div>
      ${bests.length ? `<table><thead><tr><th>種目</th><th class="n">推定1RM</th><th class="n">最大重量</th><th class="n">日付</th></tr></thead><tbody>
      ${bests.map(([k, b]) => `<tr><td>${esc(exName(k))}</td><td class="n">${fmtKg(b.e1rm)}</td><td class="n">${fmtKg(b.w)}</td><td class="n small">${b.at ? dayKey(b.at).slice(5) : ''}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">記録するとここに表示されます</p>'}</section>
  </div><div class="stack">
    <section class="card"><div class="card-h"><h2>メニュー</h2><button class="btn sm" data-act="programs">${m.prog?.id ? '変更' : '選ぶ'}</button></div>
      ${m.prog?.id && PROGRAM_MAP[m.prog.id] ? `<p style="margin:0"><b>${esc(PROGRAM_MAP[m.prog.id].name)}</b>　<span class="small mute">次は ${esc(PROGRAM_MAP[m.prog.id].days[(m.prog.day || 0) % PROGRAM_MAP[m.prog.id].days.length].name)}${PROGRAM_MAP[m.prog.id].weeks ? '・' + esc(PROGRAM_MAP[m.prog.id].weeks[(m.prog.week || 0) % 4].name) : ''}</span></p>` : '<p class="small mute" style="margin:0">未設定。ホームには不足部位から選んだおすすめが出ます。</p>'}</section>
    <section class="card"><div class="card-h"><h2>履歴</h2><button class="btn sm" data-act="manual" ${S.store.canWrite ? '' : 'disabled'}>＋ 手入力</button></div>
      ${hist.length ? `<ul class="list">${hist.map(s => { const r = summarize(s, S.exMap, n0(m.bw)); return sessionItem(S.uid, { ...s, ...r, ex: undefined }, true); }).join('')}</ul>
      ${S.sessions.length > hist.length ? '<button class="btn ghost" data-act="more" style="width:100%">さらに表示</button>' : ''}` : '<p class="empty">まだ記録がありません</p>'}</section>
    ${S.store.mode === 'supabase' ? appCards() : ''}
    <section class="card"><div class="card-h"><h2>研究用データ出力</h2></div>
      <p class="small mute" style="margin-top:0">1行＝1セットのCSV（日本時間）。列：member, session_id, date, start, end, duration_min, exercise, set_no, weight_kg, reps, rpe, load_kg, e1rm_kg</p>
      <div class="row"><button class="btn" data-act="csvme">自分のCSV</button><button class="btn" data-act="csvteam">チーム全員のCSV</button></div></section>
    <section class="card"><div class="card-h"><h2>アプリ情報</h2><span class="num">v${APP_VERSION}</span></div>
      <p class="small" style="margin-top:0">保存先：${{ remote: 'Claude の共有データベース（リアルタイム同期）', supabase: 'チームのデータベース（Supabase・リアルタイム同期）', local: 'このブラウザのみ（ローカルモード・共有されません）' }[S.store.mode]}</p>
      <ul class="small" style="padding-left:18px">${CHANGELOG.map(c => `<li><b>v${esc(c.v)}</b>（${esc(c.date)}）${esc(c.notes)}</li>`).join('')}</ul>
      ${S.store.mode === 'local' ? '<div class="row"><button class="btn sm" data-act="demo">デモデータを入れる</button><button class="btn sm ghost" data-act="reset">ローカルデータを消去</button></div>' : ''}</section>
  </div></div>`;
  $('#pf', v).onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const bw = n0(String(f.get('bw')).replace(',', '.'));
    if (bw && (bw < 30 || bw > 250)) return toast('体重は30〜250kgで入力してください', true);
    document.activeElement?.blur();
    await saveStats({ nick: String(f.get('nick')).trim().slice(0, 20), num: String(f.get('num')).trim().slice(0, 3), pos: String(f.get('pos')), bw });
    toast('プロフィールを保存しました'); renderNow();
  };
  const lf = $('#linkF', v);
  if (lf) lf.onsubmit = async e => {
    e.preventDefault();
    try { await S.store.linkEmail(String(new FormData(lf).get('email'))); toast('確認メールを送りました。リンクを開くと登録完了です'); }
    catch (er) { toast(er.message, true); }
  };
}

async function exportCSV(team) {
  toast('CSVを作成中…');
  const rows = [CSV_HEADER];
  const ids = team ? teamMembers().map(m => m.id) : [S.uid];
  for (const id of ids) {
    const months = id === S.uid ? S.months : await S.store.getMonths(id);
    const label = `${nameOf(id)}${S.members[id]?.num ? '#' + S.members[id].num : ''}`;
    months.flatMap(mo => Object.values(mo.sessions || {})).sort((a, b) => a.s - b.s)
      .forEach(s => rows.push(...sessionRows(label, s, S.exMap, n0(S.members[id]?.bw))));
  }
  const csv = '﻿' + toCSV(rows);
  const filename = `liftboard_${team ? 'team' : 'me'}_${dayKey(Date.now())}.csv`;
  let dl = null;
  try { dl = window.claude?.use ? await window.claude.use('downloads') : null; } catch {}
  if (dl) { try { await dl.save({ filename, data: csv }); return; } catch {} }
  openSheet('CSV', () => `<p class="small mute">${rows.length - 1}行。下のボタンでコピーし、表計算ソフトに貼り付けてください。</p>
    <pre>${esc(csv.slice(0, 4000))}${csv.length > 4000 ? '\n…' : ''}</pre><button class="btn blue" data-act="copy">コピー</button>`,
  root => root.querySelector('[data-act=copy]').onclick = async () => {
    try { await navigator.clipboard.writeText(csv); toast('コピーしました'); } catch { toast('コピーできませんでした', true); }
  });
}

// ============================================================ シート（モーダル）
const sheetStack = [];
function openSheet(title, html, bind) { sheetStack.push({ title, html, bind }); showSheet(); }
function showSheet() {
  const top = sheetStack.at(-1);
  if (!top) { $('#sheet').hidden = true; return; }
  $('#sheetTitle').textContent = top.title;
  const body = $('#sheetBody');
  body.onclick = body.oninput = body.onchange = null;
  body.innerHTML = top.html();
  $('#sheet').hidden = false;
  top.bind && top.bind(body);
  body.scrollTop = 0;
}
function closeSheet() { sheetStack.pop(); showSheet(); }
function closeAll() { sheetStack.length = 0; showSheet(); }
$('#sheet').addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSheet(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheetStack.length) closeSheet(); });

// ============================================================ 全体のクリック処理
document.addEventListener('click', e => {
  if (e.target.closest('#sheet') && !e.target.closest('[data-member]')) return;
  const t = e.target;
  const mem = t.closest('[data-member]'); if (mem) { openMemberSheet(mem.dataset.member); return; }
  const ed = t.closest('[data-edit]');
  if (ed) { const s = S.sessions.find(x => x.id === ed.dataset.edit); if (s) openEditSheet(s, false); return; }
  const go = t.closest('[data-go]'); if (go) { location.hash = '#' + go.dataset.go; return; }
  const bw = t.closest('[data-bodywin]'); if (bw) { S.bodyWin = bw.dataset.bodywin; renderNow(); return; }
  const mt = t.closest('[data-metric]'); if (mt) { S.rk.metric = mt.dataset.metric; renderNow(); return; }
  const pd = t.closest('[data-period]'); if (pd) { S.rk.period = pd.dataset.period; renderNow(); return; }
  const rd = t.closest('[data-restdur]'); if (rd) { S.rest.dur = +rd.dataset.restdur; $$('[data-restdur]').forEach(b => b.classList.toggle('on', b === rd)); return; }
  const mu = t.closest('#homeBody [data-m]');
  if (mu) { S.bodySel = S.bodySel === mu.dataset.m ? null : mu.dataset.m; renderNow(); return; }
  const tm = t.closest('#teamBody [data-m]');
  if (tm) { S.teamBodySel = S.teamBodySel === tm.dataset.m ? null : tm.dataset.m; renderNow(); return; }
  const a = t.closest('[data-act]'); if (!a || a.closest('#editor')) return;
  const act = a.dataset.act;
  if (act === 'start') startWorkout();
  else if (act === 'startplan') { const p = nextPlan(); startWorkout(p); }
  else if (act === 'programs') openPrograms();
  else if (act === 'pushon') S.store.enablePush().then(() => { toast('通知をオンにしました'); refreshPush(); }, e => toast(e.message, true));
  else if (act === 'pushoff') S.store.disablePush().then(() => { toast('通知をオフにしました'); refreshPush(); }, e => toast(e.message, true));
  else if (act === 'copyinvite') navigator.clipboard.writeText(inviteUrl()).then(() => toast('コピーしました'), () => toast(inviteUrl()));
  else if (act === 'share') {
    const data = { title: 'Lift Board', text: `「${S.store.team?.name}」に参加しよう（コード ${S.store.team?.code}）`, url: inviteUrl() };
    if (navigator.share) navigator.share(data).catch(() => {}); else navigator.clipboard.writeText(inviteUrl()).then(() => toast('リンクをコピーしました'));
  }
  else if (act === 'finish') finishSheet();
  else if (act === 'discard') discardSheet();
  else if (act === 'manual') { const now = Date.now(); openEditSheet({ id: newId('s'), s: now - 90 * 60000, e: now, ex: [], note: '', src: 'manual' }, true); }
  else if (act === 'profile') location.hash = '#me';
  else if (act === 'morefeed') { S.feedN = (S.feedN || 12) + 20; renderNow(); }
  else if (act === 'more') { S.histN = (S.histN || 20) + 30; renderNow(); }
  else if (act === 'csvme') exportCSV(false);
  else if (act === 'csvteam') exportCSV(true);
  else if (act === 'demo') import('./demo.js').then(d => S.store.seedDemo(() => d.buildDemo(S.exMap)));
  else if (act === 'reset') { S.store.resetLocal(); S.cur = null; renderNow(); }
});

// ---------------------------------------------------- 独立アプリ版：チーム・通知・アカウント
const inviteUrl = () => `${location.origin}${location.pathname}?team=${encodeURIComponent(S.store.team?.code || '')}&openExternalBrowser=1`;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function pushCard(compact) {
  const st = S.push;
  if (!st || st === 'on') return compact ? '' : `<p class="small" style="margin:0">通知：<b>オン</b>（アプリを閉じていても届きます）</p><button class="btn sm ghost" data-act="pushoff">通知をオフにする</button>`;
  if (st === 'unsupported') return compact ? '' : `<p class="small mute" style="margin:0">${isIOS() && !standalone() ? 'iPhoneは、Safariの共有ボタン →「ホーム画面に追加」→ ホーム画面のアイコンから開くと通知をオンにできます（iOS 16.4以降）。' : 'このブラウザは通知に対応していません。'}</p>`;
  if (st === 'denied') return compact ? '' : '<p class="small mute" style="margin:0">通知がブロックされています。端末の設定でこのアプリの通知を許可してください。</p>';
  return `<div class="${compact ? 'card push-cta' : ''}"><div class="row between"><div><b>通知をオンにする</b><div class="small mute">仲間がトレーニングを始めたら、アプリを閉じていても知らせます。</div></div>
    <button class="btn red sm" data-act="pushon">オンにする</button></div></div>`;
}
function appCards() {
  const t = S.store.team || {}; const acc = S.store.account || {};
  return `<section class="card"><div class="card-h"><h2>チーム</h2><span class="small mute">${esc(t.name)}</span></div>
      <div class="code-box"><span class="small mute">チームコード</span><b class="num">${esc(t.code)}</b></div>
      <p class="small mute" style="margin:6px 0">このリンクを送ると、開くだけでコードが入った状態で参加できます。</p>
      <div class="row"><button class="btn blue sm" data-act="share">招待リンクを送る</button><button class="btn sm" data-act="copyinvite">リンクをコピー</button></div></section>
    <section class="card"><div class="card-h"><h2>通知</h2></div>${pushCard(false)}</section>
    ${pinUI.card(S, true)}<section class="card" hidden><div class="card-h"><h2>アカウント</h2></div>
      ${acc.anonymous ? `<p class="small mute" style="margin-top:0">いまはこの端末だけのアカウントです。メールを登録しておくと、機種変更しても記録を引き継げます。</p>
        <form class="row" id="linkF"><input name="email" type="email" placeholder="メールアドレス" required style="flex:1"><button class="btn sm">登録</button></form>`
        : `<p class="small" style="margin:0">登録メール：${esc(acc.email)}</p>`}</section>`;
}

// ---------------------------------------------------- 定番メニューの選択
function openPrograms() {
  const cur = me()?.prog?.id;
  openSheet('定番メニュー', () => `<p class="small mute" style="margin:0">選ぶとホームに「次のメニュー」と各種目の目安重量が出ます。重量は自分の記録から自動で計算します。</p>
    <div class="progs">${PROGRAMS.map(p => `<article class="prog ${p.id === cur ? 'on' : ''}">
      <div class="row between"><h3>${esc(p.name)}</h3><span class="tag">${esc(p.freq)}・${esc(p.level)}</span></div>
      <p class="small" style="margin:4px 0">${esc(p.desc)}</p>
      <details><summary class="small">内容を見る（${p.days.length}日${p.weeks ? '×' + p.weeks.length + '週' : ''}）</summary>
        ${p.days.map(d => `<div class="small"><b>${esc(d.name)}</b>：${[d.main ? exName(d.main) + '（%）' : '', ...d.items.map(([id, se, r]) => `${exName(id)} ${se}×${r}`)].filter(Boolean).map(esc).join('、')}</div>`).join('')}
      </details>
      <button class="btn sm ${p.id === cur ? '' : 'blue'}" data-prog="${p.id}" style="margin-top:8px">${p.id === cur ? '選択中（最初の日からやり直す）' : 'このメニューにする'}</button>
    </article>`).join('')}</div>
    ${cur ? '<button class="btn ghost" data-prog="">メニューを外す（おすすめ表示に戻す）</button>' : ''}`,
  root => root.onclick = async e => {
    const b = e.target.closest('[data-prog]'); if (!b) return;
    if (!S.store.canWrite) return toast('書き込み権限がありません', true);
    const id = b.dataset.prog;
    closeAll();
    await saveStats({ prog: id ? { id, day: 0, week: 0, since: Date.now() } : null });
    toast(id ? `「${PROGRAM_MAP[id].name}」を設定しました` : 'メニューを外しました');
    renderNow();
  });
}

function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = document.createElement('div'); box.className = 'confetti';
  const cols = ['#d7301f', '#1f5fd1', '#f2c21b', '#1e9a55', '#ffffff'];
  for (let i = 0; i < 70; i++) {
    const p = document.createElement('i');
    p.style.left = Math.random() * 100 + '%';
    p.style.background = cols[i % cols.length];
    p.style.animationDelay = Math.random() * .6 + 's';
    p.style.setProperty('--x', (Math.random() * 160 - 80) + 'px');
    p.style.setProperty('--r', (Math.random() * 720 - 360) + 'deg');
    box.append(p);
  }
  document.body.append(box);
  setTimeout(() => box.remove(), 3200);
}

function levelsHTML(m) {
  const rows = Object.keys(STANDARDS).map(id => ({ id, lv: strengthLevel(id, +m?.best?.[id]?.e1rm || 0, n0(m?.bw)) })).filter(x => x.lv);
  if (!rows.length) return `<p class="empty">${n0(m?.bw) ? 'BIG3などを記録すると表示されます' : '体重を登録すると表示されます'}</p>`;
  return `<div class="lvls">${rows.map(({ id, lv }) => `<div class="lvl">
    <div class="row between"><b>${esc(exName(id))}</b><span class="num">体重×${lv.ratio}</span></div>
    <div class="lvl-bar">${LEVEL_NAMES.map((n, i) => `<i class="${i < lv.level ? 'full' : i === lv.level ? 'cur' : ''}" ${i === lv.level ? `style="--p:${Math.max(4, Math.min(100, lv.pct))}%"` : ''}></i>`).join('')}</div>
    <div class="row between small"><span class="lv-name">${esc(lv.name)}</span><span class="mute">${lv.next ? `${esc(lv.next.name)}まで 推定1RM ${fmtKg(lv.next.kg)}` : '最上位'}</span></div></div>`).join('')}</div>`;
}
function badgesHTML(m) {
  const got = new Set(m?.badges || []);
  return `<div class="badges">${BADGES.map(b => `<div class="badge ${got.has(b.id) ? 'got' : ''}" title="${esc(b.desc)}"><span class="medal" aria-hidden="true"></span><b>${esc(b.name)}</b><span>${esc(b.desc)}</span></div>`).join('')}</div>`;
}

const VIEWS = { home: viewHome, log: viewLog, team: viewTeam, rank: viewRank, me: viewMe };

// ============================================================ 起動
let profTimer = 0;
function requestProfiles() {
  clearTimeout(profTimer);
  profTimer = setTimeout(async () => {
    const ids = [...new Set([...Object.keys(S.members), ...Object.keys(S.live), S.uid].filter(Boolean))].filter(id => !S.profiles[id]);
    if (!ids.length) return;
    Object.assign(S.profiles, await S.store.profiles(ids));
    render();
  }, 100);
}
function onLiveDocs(list) {
  const next = Object.fromEntries(list.map(d => [d.id, d]));
  if (S.liveInit) {
    for (const d of list) {
      if (d.id === S.uid) continue;
      const p = S.live[d.id];
      if (liveState(d) === 'on' && !(p && p.active && p.startedAt === d.startedAt)) toast(`● ${nameOf(d.id)} がトレーニングを開始しました`);
      if (p && p.active && !d.active && d.lastEnd) toast(`${nameOf(d.id)} がトレーニングを終了（${fmtMin((d.lastEnd - p.startedAt) / 60000)}）`);
    }
  }
  S.live = next; S.liveInit = true;
  const mine = next[S.uid];
  // 別の端末で開始した記録を復元 / 別の端末で終了した記録を閉じる
  if (!S.cur && mine && mine.active && mine.session && liveState(mine) !== 'off') { S.cur = clone(mine.session); if (S.tab === 'log') renderNow(); }
  else if (S.cur && mine && !mine.active && mine.lastId === S.cur.id) { S.cur = null; stopRest(); renderNow(); }
  requestProfiles(); render();
}

async function boot() {
  rebuildExMap();
  S.store = await createStore({ onError, onStatus });
  S.uid = S.store.uid;
  $('#modeTag').textContent = S.store.mode === 'local' ? 'ローカルモード' : '';
  if (S.store.mode === 'supabase') {
    try { await navigator.serviceWorker.register('sw.js'); } catch {}
    const pinCtx = { S, $, esc, toast, startApp, refreshPush, renderNow, isIOS, standalone }; if (!S.store.team) return pinUI.onboarding(pinCtx); pinUI.init(pinCtx);
    refreshPush();
  }
  startApp();
}
async function refreshPush() {
  if (!S.store.pushState) return;
  try { S.push = await S.store.pushState(); } catch { S.push = 'unsupported'; }
  render();
}
function onboarding() {
  document.body.classList.add('onboard');
  const code = (new URLSearchParams(location.search).get('team') || '').toUpperCase();
  const v = $('#view');
  v.innerHTML = `<div class="onb">
    <div class="onb-hero"><span class="plate big" aria-hidden="true"></span><h1>LIFT BOARD</h1><p>チームの筋トレを、記録して、競って、伸ばす。</p></div>
    <form class="card stack" id="joinF"><h2>チームに参加</h2>
      <label>チームコード<input name="code" value="${esc(code)}" placeholder="例：K7M2Q9XA" autocapitalize="characters" autocomplete="off" required maxlength="12"></label>
      <label>表示名<input name="nick" placeholder="例：翼" maxlength="20" required></label>
      <button class="btn red">参加する</button></form>
    <details class="card"><summary><b>新しくチームを作る</b>（最初の1人だけ）</summary>
      <form class="stack" id="makeF" style="margin-top:10px">
        <label>チーム名<input name="name" placeholder="例：慶應 ウエイト班" maxlength="40" required></label>
        <label>あなたの表示名<input name="nick" placeholder="例：翼" maxlength="20" required></label>
        <button class="btn blue">作成する</button></form></details>
    <details class="card"><summary>別の端末で使っていた記録を引き継ぐ</summary>
      <form class="stack" id="mailF" style="margin-top:10px"><p class="small mute" style="margin:0">前の端末の「マイデータ」でメールを登録済みの場合のみ。届いたリンクを開くとログインできます。</p>
        <label>メールアドレス<input name="email" type="email" required></label><button class="btn">ログインリンクを送る</button></form></details>
  </div>`;
  const go = async (f, fn) => {
    const btn = f.querySelector('button'); btn.disabled = true;
    try { await fn(new FormData(f)); document.body.classList.remove('onboard'); window.history.replaceState(null, '', location.pathname + '#home'); refreshPush(); startApp(); toast('チームに参加しました'); }
    catch (e) { toast(e.message || String(e), true); btn.disabled = false; }
  };
  $('#joinF').onsubmit = e => { e.preventDefault(); go(e.target, f => S.store.joinTeam(String(f.get('code')), String(f.get('nick')))); };
  $('#makeF').onsubmit = e => { e.preventDefault(); go(e.target, f => S.store.createTeam(String(f.get('name')), String(f.get('nick')))); };
  $('#mailF').onsubmit = async e => {
    e.preventDefault();
    try { await S.store.signInEmail(String(new FormData(e.target).get('email'))); toast('メールを送りました。届いたリンクをこの端末で開いてください'); }
    catch (er) { toast(er.message, true); }
  };
}
function startApp() {
  S.store.onExercises(list => { S.custom = Object.fromEntries(list.filter(e => e.name && e.m).map(e => [e.id, { ...e, cat: 'カスタム' }])); rebuildExMap(); render(); });
  S.store.onMembers(list => { S.members = Object.fromEntries(list.map(d => [d.id, d])); requestProfiles(); render(); });
  S.store.onLive(onLiveDocs);
  S.store.onMyMonths(list => { S.months = list; flattenSessions(); render(); });
  window.addEventListener('hashchange', route);
  route();
  setInterval(() => {
    const now = Date.now();
    $$('[data-since]').forEach(el => { el.textContent = fmtEl(now - +el.dataset.since); });
    tickRest();
  }, 1000);
}
boot().catch(e => { $('#view').innerHTML = `<p class="empty">起動できませんでした：${esc(e.message || e)}</p>`; });
