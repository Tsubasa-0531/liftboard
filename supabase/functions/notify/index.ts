// notify — チームへのプッシュ通知（Supabase Edge Function / Deno）
// アプリが「開始」「終了」のときに呼ぶ。送信者の本人確認 → 同じチームの購読者へ Web Push を送る。
// 通知用の鍵（VAPID）は初回にこの関数が自動で作り、DBの app_secrets（利用者からは読めない表）に保管する。
// 自分の鍵を使いたい場合だけ、Secrets に VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY を入れる（そちらが優先）。
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY（または SUPABASE_SECRET_KEYS）は Supabase が自動で渡す。
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const URL_ = Deno.env.get('SUPABASE_URL')!;
const SECRET = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default;
const admin = createClient(URL_, SECRET, { auth: { persistSession: false } });

/** VAPID鍵：環境変数 → DB の順に探し、なければ作って保存（同時に作られても先勝ちで1組に揃う） */
async function vapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const ep = Deno.env.get('VAPID_PUBLIC_KEY'), es = Deno.env.get('VAPID_PRIVATE_KEY');
  if (ep && es) return { publicKey: ep, privateKey: es };
  const read = async () => {
    const { data } = await admin.from('app_secrets').select('name, value').in('name', ['vapid_public', 'vapid_private']);
    const get = (n: string) => data?.find((r) => r.name === n)?.value as string | undefined;
    return { publicKey: get('vapid_public'), privateKey: get('vapid_private') };
  };
  let k = await read();
  if (!k.publicKey || !k.privateKey) {
    const g = webpush.generateVAPIDKeys();
    await admin.from('app_secrets').upsert(
      [{ name: 'vapid_public', value: g.publicKey }, { name: 'vapid_private', value: g.privateKey }],
      { onConflict: 'name', ignoreDuplicates: true },
    );
    k = await read();
  }
  return k as { publicKey: string; privateKey: string };
}
const COOLDOWN_MS = 10 * 60 * 1000; // 同じ人・同じ種類の通知は10分に1回まで

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  // 1. 送信者の確認（アプリのログイントークン）
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return json({ error: 'unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const keys = await vapidKeys();
  if (body.type === 'vapid') return json({ publicKey: keys.publicKey }); // アプリが購読するときに公開鍵を取りに来る
  const type = body.type === 'finish' ? 'finish' : 'start';
  const origin = req.headers.get('Origin') ?? '';
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? (origin.startsWith('https://') ? origin : 'mailto:liftboard@example.org'), keys.publicKey, keys.privateKey);

  const { data: me } = await admin.from('members').select('team_id, doc').eq('user_id', user.id).single();
  if (!me) return json({ error: 'no team' }, 400);
  const name = String(me.doc?.nick || 'メンバー').slice(0, 20);

  // 2. 状態の確認（アプリ側の申告だけで通知しない）
  const { data: live } = await admin.from('live').select('doc').eq('user_id', user.id).maybeSingle();
  if (type === 'start' && !live?.doc?.active) return json({ skipped: 'not active' });

  // 3. 連投防止
  const { data: log } = await admin.from('notify_log').select('at').eq('user_id', user.id).eq('kind', type).maybeSingle();
  if (log && Date.now() - Date.parse(log.at) < COOLDOWN_MS) return json({ skipped: 'cooldown' });
  await admin.from('notify_log').upsert({ user_id: user.id, kind: type, at: new Date().toISOString() });

  // 4. 文面
  let text: string;
  if (type === 'start') {
    const { count } = await admin.from('live').select('user_id', { count: 'exact', head: true })
      .eq('team_id', me.team_id).eq('doc->>active', 'true');
    text = `${name} がトレーニングを開始しました${count && count > 1 ? `（いま${count}人）` : ''}`;
  } else {
    const min = Math.max(0, Math.min(600, Math.round(Number(body.min) || 0)));
    const pr = Math.max(0, Math.min(20, Math.round(Number(body.pr) || 0)));
    text = `${name} がトレーニング終了・${min}分${pr ? `・自己ベスト更新${pr > 1 ? pr + '種目' : ''}！` : ''}`;
  }
  const payload = JSON.stringify({ title: 'Lift Board', body: text, tag: `${type}-${user.id}`, url: './#team' });

  // 5. 同じチームの自分以外へ送信。期限切れの購読は削除
  const { data: subs } = await admin.from('push_subs').select('endpoint, sub').eq('team_id', me.team_id).neq('user_id', user.id);
  let sent = 0;
  await Promise.all((subs ?? []).map(async (s) => {
    try { await webpush.sendNotification(s.sub, payload, { TTL: 3600, urgency: 'normal' }); sent++; }
    catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin.from('push_subs').delete().eq('endpoint', s.endpoint);
    }
  }));
  return json({ sent });
});
