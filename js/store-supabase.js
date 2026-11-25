// store-supabase.js — 独立アプリ版のデータ層（Supabase）。store.js と同じメソッドを持つ。
// ・ログイン：匿名サインイン（アカウント作成不要）＋チームコードで参加。メール登録で機種変更にも対応。
// ・同期：Postgres の変更をリアルタイム購読（Realtime）。接続し直すたびに全件を取り直して取りこぼしを防ぐ。
// ・通知：Web Push を購読し、開始/終了時に Edge Function「notify」を呼ぶ。
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm';
import { CONFIG } from './config.js';
import { SCHEMA_VERSION } from './catalog.js';
import { makeWriter } from './store.js';

const b64ToBytes = b64 => {
  const s = atob((b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, c => c.charCodeAt(0));
};
const fail = (error, msg) => { if (error) { const e = new Error(msg ? `${msg}：${error.message}` : error.message); e.code = error.code; throw e; } };

export async function supabaseStore({ onError, onStatus }) {
  const sb = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  let { data: { session } } = await sb.auth.getSession();
  if (false) { // ログインは参加ボタンを押したときに行う（開いただけでは作らない）
    const { data, error } = await sb.auth.signInAnonymously();
    fail(error, 'サインインできませんでした');
    session = data.session;
  }
  let user = session ? session.user : null; async function ensureUser() { if (user) return; const { data, error } = await sb.auth.signInAnonymously(); fail(error, 'サインインできませんでした'); user = data.session.user; }
  sb.auth.onAuthStateChange((_e, s) => { if (s && user && s.user.id !== user.id) location.reload(); else if (s) user = s.user; });
  let uid = user ? user.id : null;

  let team = null;
  async function loadTeam() { if (!uid) { team = null; return; } const { data: mid } = await sb.rpc('me'); if (mid) uid = mid;
    const { data, error } = await sb.from('members').select('team_id, teams(id, name, code)').eq('user_id', uid).maybeSingle();
    fail(error);
    team = data ? { id: data.team_id, name: data.teams?.name || '', code: data.teams?.code || '' } : null;
  }
  const LINK = 'lb_link', CK = '; max-age=31536000; path=/liftboard/; SameSite=Lax; Secure'; if (!user) { const m = document.cookie.match(/(?:^|; )lb_link=([A-Za-z0-9_-]+)/); if (m) { try { await ensureUser(); uid = user.id; const { data } = await sb.rpc('redeem_link_code', { p_code: m[1] }); if (!data || data.error) document.cookie = LINK + '=; max-age=0; path=/liftboard/'; } catch {} } } await loadTeam(); saveLink(); function saveLink() { if (team) sb.rpc('create_link_code').then(({ data }) => { if (data) document.cookie = LINK + '=' + data + CK; }, () => {}); } // iPhoneはホーム画面に追加した瞬間にこのクッキーをアプリへコピーする→入力なしで同じ人としてログイン

  // テーブルを購読して、{id, ...doc} の配列でコールバック
  const channels = [];
  function watch(table, cb, { col = 'team_id', val = () => team?.id, key = 'user_id' } = {}) {
    const rows = new Map();
    const emit = () => cb([...rows.values()].map(r => ({ id: r[key], ...(r.doc || {}) })));
    const v = val();
    if (!v) { setTimeout(() => cb([])); return () => {}; }
    const timer = setTimeout(() => onStatus(table, 'slow'), 10000);
    const ch = sb.channel(`${table}-${v}-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table, filter: `${col}=eq.${v}` }, p => {
        if (p.eventType === 'DELETE') rows.delete(p.old[key]);
        else rows.set(p.new[key], p.new);
        emit();
      })
      .subscribe(async status => {
        if (status === 'SUBSCRIBED') {
          const { data, error } = await sb.from(table).select('*').eq(col, v);
          clearTimeout(timer);
          if (error) return onError(error);
          rows.clear(); data.forEach(r => rows.set(r[key], r)); emit(); onStatus(table, 'ok');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') onStatus(table, 'slow');
      });
    channels.push(ch);
    return () => { clearTimeout(timer); sb.removeChannel(ch); };
  }
  // 画面に戻ったとき接続を張り直す（スマホのスリープ対策）
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sb.realtime.connect(); });

  const ERR = { team_not_found: 'チームコードが見つかりません', wrong_pin: 'その表示名はもう使われています。本人なら暗証番号が違います', locked: '暗証番号を5回まちがえたので、15分たってからもう一度', pin_format: '暗証番号は数字4桁で入れてください', nick_empty: '表示名を入れてください' }; async function rpcJson(fn, args) { const { data, error } = await sb.rpc(fn, args); fail(error, '通信できませんでした'); if (data && data.error) throw new Error(ERR[data.error] || data.error); return data; } const writers = new Map();
  const writer = (k, fn) => {
    if (!writers.has(k)) writers.set(k, makeWriter(async d => { const { error } = await fn(d); fail(error); }, onError));
    return writers.get(k);
  };
  const stamp = d => ({ ...d, v: SCHEMA_VERSION });

  async function pushReg() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
    return navigator.serviceWorker.ready;
  }
  // 通知の公開鍵：config.js に書いてあればそれ、なければサーバー（notify関数）から取得
  async function vapidKey() {
    if (CONFIG.vapidPublicKey) return CONFIG.vapidPublicKey;
    const { data, error } = await sb.functions.invoke('notify', { body: { type: 'vapid' } });
    if (error || !data?.publicKey) throw new Error('通知の設定を取得できませんでした（notify関数が未設置の可能性）');
    return data.publicKey;
  }

  return {
    mode: 'supabase', get uid() { return uid; },
    get canWrite() { return !!team; },
    get team() { return team; },
    get account() { return { anonymous: !!user.is_anonymous, email: user.email || '' }; },

    onMembers: cb => watch('members', cb),
    onLive: cb => watch('live', cb),
    onExercises: cb => watch('exercises', cb, { key: 'id' }),
    onMyMonths: cb => watch('months', cb, { col: 'user_id', val: () => uid, key: 'month' }),

    saveMember: d => writer('m', x => sb.from('members').upsert({ user_id: uid, team_id: team.id, doc: x, updated_at: new Date().toISOString() }))(stamp({ ...d, updatedAt: Date.now() })),
    setLive: d => writer('l', x => sb.from('live').upsert({ user_id: uid, team_id: team.id, doc: x, updated_at: new Date().toISOString() }))(stamp(d)),
    saveMonth: (k, sessions) => writer('mo:' + k, x => sb.from('months').upsert({ user_id: uid, month: k, team_id: team.id, doc: x, updated_at: new Date().toISOString() }))(stamp({ month: k, sessions })),
    deleteMonth: async k => { const { error } = await sb.from('months').delete().eq('user_id', uid).eq('month', k); fail(error); },
    getMonths: async id => {
      const { data, error } = await sb.from('months').select('month, doc').eq('user_id', id);
      fail(error);
      return data.map(r => ({ id: r.month, ...r.doc }));
    },
    saveExercise: ex => writer('ex:' + ex.id, x => sb.from('exercises').upsert({ id: ex.id, team_id: team.id, doc: x }))(stamp(ex)),
    profiles: async () => ({}),

    // チーム
    async createTeam(name, nick, pin) { await ensureUser(); uid = user.id; await rpcJson('create_team', { p_name: name, p_nick: nick, p_pin: pin }); await loadTeam(); saveLink(); }, async joinTeam(code, nick, pin) { await ensureUser(); uid = user.id; const r = await rpcJson('join_team', { p_code: code, p_nick: nick, p_pin: pin }); await loadTeam(); saveLink(); return r; }, async hasPin() { const { data, error } = await sb.rpc('has_pin'); fail(error); return !!data; }, async setPin(pin) { const { error } = await sb.rpc('set_pin', { p_pin: pin }); fail(error, '暗証番号を保存できませんでした'); },
    async joinTeamOld(code, nick) {
      const { error } = await sb.rpc('join_team', { p_code: code, p_nick: nick });
      if (error && /not found/.test(error.message)) throw new Error('チームコードが見つかりません');
      fail(error, '参加できませんでした'); await loadTeam();
    },

    // 通知
    async pushState() {
      const reg = await pushReg(); if (!reg) return 'unsupported';
      if (Notification.permission === 'denied') return 'denied';
      return (await reg.pushManager.getSubscription()) ? 'on' : 'off';
    },
    async enablePush() {
      const reg = await pushReg(); if (!reg) throw new Error('この端末・ブラウザは通知に対応していません');
      if ((await Notification.requestPermission()) !== 'granted') throw new Error('通知が許可されませんでした');
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(await vapidKey()) });
      const j = sub.toJSON();
      const { error } = await sb.from('push_subs').upsert({ endpoint: j.endpoint, user_id: uid, team_id: team.id, sub: j });
      fail(error);
    },
    async disablePush() {
      const reg = await pushReg(); const sub = reg && await reg.pushManager.getSubscription();
      if (!sub) return;
      await sb.from('push_subs').delete().eq('endpoint', sub.endpoint);
      await sub.unsubscribe();
    },
    notify(type, data = {}) { sb.functions.invoke('notify', { body: { type, ...data } }).catch(() => {}); },

    // 機種変更・引き継ぎ用のメール
    async linkEmail(email) { const { error } = await sb.auth.updateUser({ email }, { emailRedirectTo: location.origin + location.pathname }); fail(error, '登録できませんでした'); },
    async signInEmail(email) {
      const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname } });
      fail(error, '送信できませんでした');
    },
  };
}
