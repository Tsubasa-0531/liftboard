// pin.js — 独立アプリ版の参加画面と暗証番号（v2.1）。
// 一度参加すればその端末ではログインしたまま。別の端末・ホーム画面のアプリ・機種変更のときは
// 「チームコード＋表示名＋暗証番号（4桁）」で入り直せば、元の記録の続きになる（サーバー側 join_team が引き継ぐ）。
let C = null; // app.js から渡される道具一式 { S, $, esc, toast, startApp, refreshPush, renderNow, isIOS, standalone }

const PIN_INPUT = '<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off" required placeholder="数字4桁"';

let bound = false;
function setup(ctx) {
  C = ctx;
  if (bound) return;
  bound = true;
  // 暗証番号フォーム（ホームのカード・マイデータ）はどこにあっても1か所で処理
  document.addEventListener('submit', async e => {
    if (!e.target.matches || !e.target.matches('#pinF')) return;
    e.preventDefault();
    const pin = String(new FormData(e.target).get('pin') || '');
    if (!/^[0-9]{4}$/.test(pin)) return C.toast('数字4桁で入れてください', true);
    try {
      await C.S.store.setPin(pin);
      C.S.hasPin = true;
      if (document.activeElement) document.activeElement.blur();
      C.toast('暗証番号を保存しました');
      C.renderNow();
    } catch (er) { C.toast(er.message || String(er), true); }
  });
}

/** 参加済みで起動したとき：暗証番号が未設定ならホームに設定カードを出す */
export function init(ctx) {
  setup(ctx);
  if (C.S.store.hasPin) C.S.store.hasPin().then(h => { C.S.hasPin = h; if (!document.body.classList.contains('onboard')) C.renderNow(); }, () => {});
}

/** 暗証番号カード。full=false はホーム用（未設定のときだけ表示） */
export function card(S, full) {
  if (!S.store || S.store.mode !== 'supabase') return '';
  if (!full && S.hasPin !== false) return '';
  return `<section class="card${full ? '' : ' push-cta'}"><div class="card-h"><h2>暗証番号</h2><span class="small mute">${S.hasPin ? '設定済み' : '未設定'}</span></div>
    <p class="small mute" style="margin-top:0">この端末ではずっとログインしたまま。別の端末・ホーム画面のアプリ・機種変更のときは、チームコード＋表示名＋この暗証番号で入れば記録の続きになる。</p>
    <form class="row" id="pinF">${PIN_INPUT} style="flex:1"><button class="btn ${full ? '' : 'red '}sm">${S.hasPin ? '変更' : '設定'}</button></form></section>`;
}

export function onboarding(ctx) {
  setup(ctx);
  const { S, $, esc, toast } = C;
  document.body.classList.add('onboard');
  const code = (new URLSearchParams(location.search).get('team') || '').toUpperCase();
  const iosTab = C.isIOS() && !C.standalone();
  const pinField = `<label>暗証番号（数字4桁）${PIN_INPUT}></label>`;
  $('#view').innerHTML = `<div class="onb">
    <div class="onb-hero"><span class="plate big" aria-hidden="true"></span><h1>LIFT BOARD</h1><p>チームの筋トレを、記録して、競って、伸ばす。</p></div>
    ${iosTab ? `<div class="card push-cta"><b>先にホーム画面に追加しよう</b><p class="small" style="margin:4px 0 0">iPhoneは、Safariのタブとホーム画面のアプリが別の端末あつかいになる。共有ボタン →「ホーム画面に追加」→ ホーム画面のアイコンから開いて参加するのがおすすめ。</p></div>` : ''}
    <form class="card stack" id="joinF"><h2>チームに参加</h2>
      <label>チームコード<input name="code" value="${esc(code)}" placeholder="例：K7M2Q9XA" autocapitalize="characters" autocomplete="off" required maxlength="12"></label>
      <label>表示名（フルネーム推奨）<input name="nick" placeholder="例：藤堂翼" maxlength="20" required></label>
      ${pinField}
      <p class="small mute" style="margin:0">一度入ればこの端末ではずっとログインしたまま。前に参加したことがある人も、同じ表示名と暗証番号で入れば記録の続きから使える。</p>
      <button class="btn red">参加する</button></form>
    <details class="card"><summary><b>新しくチームを作る</b>（最初の1人だけ）</summary>
      <form class="stack" id="makeF" style="margin-top:10px">
        <label>チーム名<input name="name" placeholder="例：慶應ダックス" maxlength="40" required></label>
        <label>あなたの表示名<input name="nick" placeholder="例：藤堂翼" maxlength="20" required></label>
        ${pinField}
        <button class="btn blue">作成する</button></form></details>
  </div>`;
  const go = async (f, fn) => {
    const btn = f.querySelector('button'); btn.disabled = true;
    let r;
    try { r = await fn(new FormData(f)); }
    catch (e) { toast(e.message || String(e), true); btn.disabled = false; return; }
    document.body.classList.remove('onboard');
    try { window.history.replaceState(null, '', location.pathname + '#log'); } catch {}
    S.hasPin = true;
    S.uid = S.store.uid; C.refreshPush(); C.startApp();
    toast(r && r.claimed ? 'おかえり。前の記録をこの端末に引き継いだ' : 'チームに参加しました');
  };
  $('#joinF').onsubmit = e => { e.preventDefault(); go(e.target, f => S.store.joinTeam(String(f.get('code')), String(f.get('nick')), String(f.get('pin')))); };
  $('#makeF').onsubmit = e => { e.preventDefault(); go(e.target, f => S.store.createTeam(String(f.get('name')), String(f.get('nick')), String(f.get('pin')))); };
}
