// store.js — データ層。UIはこのインターフェースだけを使い、保存先を意識しない。
//   RemoteStore: Claude アーティファクトの共有DB（チーム全員でリアルタイム共有）
//   SupabaseStore: 独立アプリ版（ログイン不要のチームコード参加・プッシュ通知）→ store-supabase.js
//   LocalStore : ブラウザ内保存（DBが使えない環境・オフライン確認用）
// 別のバックエンド（Firebase/Supabase等）へ移す場合は、同じメソッドを持つ実装を足すだけでよい。
//
// DBのパス設計（"/"区切り、偶数セグメント＝ドキュメント）
//   members/{uid}                 プロフィール＋集計（ランキング・チーム画面はここだけ読む）
//   members/{uid}/months/{YYYY-MM} その月のセッション全件（本人の詳細履歴・CSV出力用）
//   live/{uid}                    いま練習中か＋進行中セッション（端末をまたいで復元）
//   exercises/{id}                チーム共通のカスタム種目

import { SCHEMA_VERSION } from './catalog.js';
import { CONFIG } from './config.js';

/** 1ドキュメントへの書き込みを直列化し、待機中の書き込みは最新のものだけ残す */
export function makeWriter(write, onError) {
  let inflight = null, pending;
  const pump = async () => {
    while (pending !== undefined) {
      const data = pending; pending = undefined;
      try { await write(data); } catch (e) { onError(e); }
    }
    inflight = null;
  };
  return data => { pending = data; if (!inflight) inflight = pump(); return inflight; };
}

const docs = snap => snap.docs.filter(d => d.exists).map(d => ({ id: d.id, ...d.data() }));

export async function createStore(handlers) {
  // 独立アプリ版（Supabase）が設定されていればそちらを使う
  // Claude 上で開いたときは Claude の共有DBを優先（同じファイルのまま両方で動かすため）
  const inClaude = !!(window.claude && typeof window.claude.use === 'function');
  if (CONFIG.supabaseUrl && CONFIG.supabaseAnonKey && !inClaude) {
    const m = await import('./store-supabase.js');
    return m.supabaseStore(handlers);
  }
  const c = window.claude;
  let db = null, user = null;
  if (c && typeof c.use === 'function') {
    try { [db, user] = await Promise.all([c.use('db'), c.use('user')]); } catch { db = null; }
  }
  return db ? remoteStore(db, user, handlers) : localStore(handlers);
}

// ---------------------------------------------------------------- Remote
async function remoteStore(db, user, { onError, onStatus }) {
  const uid = user ? await user.id() : null;
  let canWrite = !!uid;
  if (uid && user.can) { try { if ((await user.can('data.write')) === false) canWrite = false; } catch {} }
  const writers = new Map();
  const writerFor = path => {
    if (!writers.has(path)) writers.set(path, makeWriter(d => db.doc(path).set(d), e => {
      if (e && e.code === 'invalid_argument') canWrite = false;
      onError(e);
    }));
    return writers.get(path);
  };
  // 10秒以内に確定データが来なければ「接続待ち」を通知
  const watch = (query, cb, label) => {
    const timer = setTimeout(() => onStatus(label, 'slow'), 10000);
    return query.onSnapshot(snap => {
      if (!snap.metadata.fromCache) { clearTimeout(timer); onStatus(label, 'ok'); }
      cb(docs(snap));
    }, e => { clearTimeout(timer); onStatus(label, 'error'); onError(e); });
  };
  return {
    mode: 'remote', uid,
    get canWrite() { return canWrite; },
    onMembers: cb => watch(db.collection('members'), cb, 'members'),
    onLive: cb => watch(db.collection('live'), cb, 'live'),
    onExercises: cb => watch(db.collection('exercises'), cb, 'exercises'),
    onMyMonths: cb => uid ? watch(db.collection(`members/${uid}/months`), cb, 'months') : () => {},
    saveMember: data => writerFor(`members/${uid}`)({ ...data, v: SCHEMA_VERSION, updatedAt: Date.now() }),
    setLive: data => writerFor(`live/${uid}`)({ ...data, v: SCHEMA_VERSION }),
    saveMonth: (key, sessions) => writerFor(`members/${uid}/months/${key}`)({ v: SCHEMA_VERSION, month: key, sessions }),
    deleteMonth: key => db.doc(`members/${uid}/months/${key}`).delete(),
    getMonths: async id => docs(await db.collection(`members/${id}/months`).get()),
    saveExercise: ex => writerFor(`exercises/${ex.id}`)({ ...ex, by: uid, v: SCHEMA_VERSION }),
    profiles: async ids => {
      if (!user || !user.profiles || !ids.length) return {};
      try { return await user.profiles(ids); } catch { return {}; }
    },
  };
}

// ---------------------------------------------------------------- Local
function localStore({ onError }) {
  const KEY = 'liftboard.local.v1';
  let mem;
  try { mem = JSON.parse(localStorage.getItem(KEY)); } catch {}
  mem = mem || { members: {}, live: {}, months: {}, exercises: {} };
  const subs = { members: [], live: [], exercises: [], months: [] };
  const uid = 'me';
  const list = obj => Object.entries(obj).map(([id, d]) => ({ id, ...d }));
  const emit = k => {
    const data = k === 'months' ? list(mem.months[uid] || {}) : list(mem[k]);
    subs[k].forEach(cb => cb(data));
  };
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch {} };
  const sub = k => cb => { subs[k].push(cb); setTimeout(() => emit(k)); return () => { subs[k] = subs[k].filter(x => x !== cb); }; };
  const put = (k, id, d) => { mem[k][id] = d; persist(); emit(k); return Promise.resolve(); };
  return {
    mode: 'local', uid, canWrite: true,
    onMembers: sub('members'), onLive: sub('live'), onExercises: sub('exercises'), onMyMonths: sub('months'),
    saveMember: d => put('members', uid, { ...d, v: SCHEMA_VERSION, updatedAt: Date.now() }),
    setLive: d => put('live', uid, { ...d, v: SCHEMA_VERSION }),
    saveMonth: (key, sessions) => {
      (mem.months[uid] = mem.months[uid] || {})[key] = { v: SCHEMA_VERSION, month: key, sessions };
      persist(); emit('months'); return Promise.resolve();
    },
    deleteMonth: key => { delete (mem.months[uid] || {})[key]; persist(); emit('months'); return Promise.resolve(); },
    getMonths: async id => list(mem.months[id] || {}),
    saveExercise: ex => put('exercises', ex.id, ex),
    profiles: async ids => Object.fromEntries(ids.map(id => [id, { name: id === uid ? 'あなた' : '' }])),
    // デモ用：架空のチームメイトを入れる（ローカルモードのみ）
    seedDemo(build) {
      const { members, live, months } = build();
      Object.assign(mem.members, members); Object.assign(mem.live, live);
      Object.assign(mem.months, months);
      persist(); ['members', 'live', 'months'].forEach(emit);
    },
    resetLocal() { mem = { members: {}, live: {}, months: {}, exercises: {} }; persist(); Object.keys(subs).forEach(emit); },
    onError,
  };
}
