// config.js — 独立アプリ版の接続設定（SETUP.md の手順で値を入れる）。
// 空のままなら、Claude 上では共有DB版、それ以外ではローカルモードで動く。
// anon key と VAPID 公開鍵は公開してよい値（権限はDB側のRLSで守っている）。秘密鍵はここに書かない。
export const CONFIG = {
  supabaseUrl: 'https://ralttlsbolkjxtdqclih.supabase.co',
  supabaseAnonKey: 'sb_publishable_5_MmsxFaScs6n3aMlvBt1g_5fS4nWQV', // 公開用の鍵（publishable）
  vapidPublicKey: '',   // 空でよい（通知の鍵はサーバーが自動で作る）。自分の鍵を使う場合だけ公開鍵を入れる
};
