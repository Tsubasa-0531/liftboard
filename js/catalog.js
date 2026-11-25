// catalog.js — 静的マスタデータ（筋群・種目・バージョン情報）
// ここを編集すれば種目や筋群の割り当てを変更できる。DBには種目IDだけが保存されるので、
// 名前や筋群の重み付けを後から直しても過去記録の集計に自動で反映される。

export const APP_VERSION = '2.2.0';
export const SCHEMA_VERSION = 1;

export const CHANGELOG = [ { v: '2.2.0', date: '2026-11-25', notes: 'ホーム画面のアプリは入力なしでログイン済み・開くと記録画面' }, { v: '2.1.0', date: '2026-11-25', notes: '暗証番号（4桁）で入り直し・端末の引き継ぎ。メール確認を廃止。一度入ればログインしたまま' },
  { v: '2.0.1', date: '2026-11-25', notes: '独立アプリ版を公開（GitHub Pages＋Supabase）。通知用の鍵をサーバーで自動生成' },
  { v: '2.0.0', date: '2026-11-25', notes: '定番メニュー8種、コーチ機能（次回重量・不足部位・停滞・押し引きバランス）、バッジ・連続週・筋力レベル・チーム目標・MVP・BIG3合計、独立アプリ版（チームコード参加・プッシュ通知・ホーム画面に追加）' },
  { v: '1.0.0', date: '2026-11-25', notes: '初版：記録、人体図、チーム共有、ライブ表示、ランキング、CSV出力' },
];

// 筋群。view は人体図のどちら側に描くか。
export const MUSCLES = [
  { id: 'neck',     name: '首',             view: 'front' },
  { id: 'traps',    name: '僧帽筋',         view: 'both' },
  { id: 'delt_f',   name: '三角筋（前部）', view: 'front' },
  { id: 'delt_s',   name: '三角筋（中部）', view: 'both' },
  { id: 'delt_r',   name: '三角筋（後部）', view: 'back' },
  { id: 'chest',    name: '大胸筋',         view: 'front' },
  { id: 'biceps',   name: '上腕二頭筋',     view: 'front' },
  { id: 'triceps',  name: '上腕三頭筋',     view: 'back' },
  { id: 'forearm',  name: '前腕',           view: 'both' },
  { id: 'abs',      name: '腹直筋',         view: 'front' },
  { id: 'oblique',  name: '腹斜筋',         view: 'front' },
  { id: 'upback',   name: '菱形筋・大円筋', view: 'back' },
  { id: 'lats',     name: '広背筋',         view: 'back' },
  { id: 'lowback',  name: '脊柱起立筋',     view: 'back' },
  { id: 'glutes',   name: '臀筋',           view: 'back' },
  { id: 'quads',    name: '大腿四頭筋',     view: 'front' },
  { id: 'adductor', name: '内転筋',         view: 'front' },
  { id: 'hams',     name: 'ハムストリングス', view: 'back' },
  { id: 'calves',   name: '下腿（ふくらはぎ）', view: 'both' },
];
export const MUSCLE_MAP = Object.fromEntries(MUSCLES.map(m => [m.id, m]));

// 種目。m = { 筋群ID: 係数 }。1 = 主働筋、0.5 = 協働筋。
// bwf = 自重のうち負荷として動かす割合（自重種目のみ）。負荷 = 追加重量 + bwf × 体重。
// big = ランキングの初期候補。cat = 絞り込み用カテゴリ。
const E = (id, name, cat, m, extra = {}) => ({ id, name, cat, m, ...extra });
export const EXERCISES = [
  // 胸
  E('bench', 'ベンチプレス', '胸', { chest: 1, triceps: .5, delt_f: .5 }, { big: true }),
  E('incline_bench', 'インクラインベンチプレス', '胸', { chest: 1, delt_f: .5, triceps: .5 }),
  E('db_bench', 'ダンベルプレス', '胸', { chest: 1, triceps: .5, delt_f: .5 }),
  E('db_fly', 'ダンベルフライ', '胸', { chest: 1, delt_f: .5 }),
  E('cable_cross', 'ケーブルクロスオーバー', '胸', { chest: 1, delt_f: .5 }),
  E('dip', 'ディップス', '胸', { chest: 1, triceps: 1, delt_f: .5 }, { bwf: 1 }),
  E('pushup', '腕立て伏せ', '胸', { chest: 1, triceps: .5, delt_f: .5, abs: .5 }, { bwf: .64 }),
  // 背中
  E('deadlift', 'デッドリフト', '背中', { lowback: 1, glutes: 1, hams: 1, quads: .5, traps: .5, upback: .5, forearm: .5 }, { big: true }),
  E('trap_bar_dl', 'トラップバーデッドリフト', '背中', { quads: 1, glutes: 1, hams: .5, lowback: .5, traps: .5, forearm: .5 }),
  E('pullup', '懸垂（順手）', '背中', { lats: 1, upback: .5, biceps: .5, forearm: .5 }, { bwf: 1 }),
  E('chinup', 'チンアップ（逆手）', '背中', { lats: 1, biceps: 1, upback: .5 }, { bwf: 1 }),
  E('lat_pulldown', 'ラットプルダウン', '背中', { lats: 1, upback: .5, biceps: .5 }),
  E('barbell_row', 'ベントオーバーロウ', '背中', { lats: 1, upback: 1, delt_r: .5, biceps: .5, lowback: .5 }),
  E('db_row', 'ワンハンドロウ', '背中', { lats: 1, upback: 1, biceps: .5, delt_r: .5 }),
  E('seated_row', 'シーテッドロウ', '背中', { upback: 1, lats: 1, biceps: .5, delt_r: .5 }),
  E('shrug', 'シュラッグ', '背中', { traps: 1, forearm: .5 }),
  E('back_ext', 'バックエクステンション', '背中', { lowback: 1, glutes: .5, hams: .5 }),
  // 肩
  E('ohp', 'オーバーヘッドプレス', '肩', { delt_f: 1, delt_s: .5, triceps: .5, traps: .5 }, { big: true }),
  E('db_shoulder', 'ダンベルショルダープレス', '肩', { delt_f: 1, delt_s: .5, triceps: .5 }),
  E('push_press', 'プッシュプレス', '肩', { delt_f: 1, triceps: .5, quads: .5, traps: .5 }),
  E('lateral_raise', 'サイドレイズ', '肩', { delt_s: 1 }),
  E('rear_fly', 'リアレイズ', '肩', { delt_r: 1, upback: .5 }),
  E('face_pull', 'フェイスプル', '肩', { delt_r: 1, upback: 1, traps: .5 }),
  E('upright_row', 'アップライトロウ', '肩', { delt_s: 1, traps: 1 }),
  // 腕
  E('barbell_curl', 'バーベルカール', '腕', { biceps: 1, forearm: .5 }),
  E('db_curl', 'ダンベルカール', '腕', { biceps: 1, forearm: .5 }),
  E('hammer_curl', 'ハンマーカール', '腕', { biceps: 1, forearm: 1 }),
  E('pushdown', 'トライセプスプッシュダウン', '腕', { triceps: 1 }),
  E('skull_crusher', 'ライイングエクステンション', '腕', { triceps: 1 }),
  E('cgbp', 'ナローベンチプレス', '腕', { triceps: 1, chest: .5, delt_f: .5 }),
  E('wrist_curl', 'リストカール', '腕', { forearm: 1 }),
  // 脚
  E('squat', 'バックスクワット', '脚', { quads: 1, glutes: 1, adductor: .5, lowback: .5 }, { big: true }),
  E('front_squat', 'フロントスクワット', '脚', { quads: 1, glutes: .5, abs: .5, upback: .5 }),
  E('leg_press', 'レッグプレス', '脚', { quads: 1, glutes: .5 }),
  E('bulgarian', 'ブルガリアンスクワット', '脚', { quads: 1, glutes: 1, adductor: .5 }),
  E('lunge', 'ランジ', '脚', { quads: 1, glutes: 1, adductor: .5 }),
  E('rdl', 'ルーマニアンデッドリフト', '脚', { hams: 1, glutes: 1, lowback: .5 }),
  E('leg_curl', 'レッグカール', '脚', { hams: 1 }),
  E('leg_ext', 'レッグエクステンション', '脚', { quads: 1 }),
  E('hip_thrust', 'ヒップスラスト', '脚', { glutes: 1, hams: .5 }),
  E('adductor_mc', 'アダクション', '脚', { adductor: 1 }),
  E('calf_raise', 'カーフレイズ', '脚', { calves: 1 }),
  // パワー（アメフト向け）
  E('power_clean', 'パワークリーン', 'パワー', { glutes: 1, quads: 1, traps: 1, hams: .5, lowback: .5, calves: .5 }, { big: true }),
  E('hang_clean', 'ハングクリーン', 'パワー', { glutes: 1, traps: 1, hams: .5, quads: .5, lowback: .5 }),
  E('snatch_pull', 'スナッチプル', 'パワー', { traps: 1, glutes: 1, hams: 1, lowback: .5 }),
  // 体幹・首
  E('ab_wheel', '腹筋ローラー', '体幹', { abs: 1, lats: .5 }),
  E('leg_raise', 'ハンギングレッグレイズ', '体幹', { abs: 1, oblique: .5, forearm: .5 }),
  E('cable_crunch', 'ケーブルクランチ', '体幹', { abs: 1 }),
  E('russian_twist', 'ロシアンツイスト', '体幹', { oblique: 1, abs: .5 }),
  E('neck_flex', 'ネックフレクション', '首', { neck: 1 }),
  E('neck_ext', 'ネックエクステンション', '首', { neck: 1, traps: .5 }),
];
export const CATEGORIES = ['胸', '背中', '肩', '腕', '脚', 'パワー', '体幹', '首', 'カスタム'];

export const POSITIONS = ['', 'QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'K/P', 'スタッフ', 'その他'];
