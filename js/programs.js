// programs.js — 定番メニュー（テンプレート）。
// items: [種目ID, セット数, 回数] 。main を持つ日は 5/3/1 方式（トレーニングマックスの%で重量を決める）。
// 重量は保存せず、本人の記録（推定1RM・前回の結果）から毎回計算する（coach.js）。

const D = (name, items, extra = {}) => ({ name, items, ...extra });

export const PROGRAMS = [
  {
    id: 'beginner', name: 'はじめての全身', freq: '週2〜3回', level: '初心者',
    desc: '全身を1回で鍛える基本形。フォームを覚えながら、毎回少しずつ重量を上げる。',
    days: [
      D('全身A', [['squat', 3, 8], ['bench', 3, 8], ['lat_pulldown', 3, 10], ['leg_curl', 3, 12], ['ab_wheel', 3, 10]]),
      D('全身B', [['deadlift', 2, 5], ['ohp', 3, 8], ['seated_row', 3, 10], ['lunge', 3, 10], ['leg_raise', 3, 10]]),
    ],
  },
  {
    id: 'ss5x5', name: 'StrongLifts 5×5', freq: '週3回', level: '初心者〜中級',
    desc: 'AとBを交互に行う。全セット5回できたら次回+2.5kg（デッドリフトは+5kg）。最も有名な線形プログラムの一つ。',
    days: [
      D('ワークアウトA', [['squat', 5, 5], ['bench', 5, 5], ['barbell_row', 5, 5]]),
      D('ワークアウトB', [['squat', 5, 5], ['ohp', 5, 5], ['deadlift', 1, 5]]),
    ],
  },
  {
    id: 'big3', name: 'BIG3集中', freq: '週2〜3回', level: '全レベル',
    desc: 'スクワット・ベンチプレス・デッドリフトの3種目だけを、5×5中心で伸ばす。',
    days: [D('BIG3', [['squat', 5, 5], ['bench', 5, 5], ['deadlift', 3, 5]])],
  },
  {
    id: 'w531', name: '5/3/1（ウェンドラー）', freq: '週4回', level: '中級',
    desc: 'トレーニングマックス（推定1RMの90%）を基準に、4週間で%を変える。最終セットは「+」＝できるだけ多く。4週ごとにTMを上げる。',
    weeks: [
      { name: '1週目（5s）', scheme: [[.65, 5], [.75, 5], [.85, 5]] },
      { name: '2週目（3s）', scheme: [[.70, 3], [.80, 3], [.90, 3]] },
      { name: '3週目（5/3/1）', scheme: [[.75, 5], [.85, 3], [.95, 1]] },
      { name: '4週目（ディロード）', scheme: [[.40, 5], [.50, 5], [.60, 5]] },
    ],
    days: [
      D('スクワットの日', [['leg_press', 5, 10], ['leg_curl', 5, 10]], { main: 'squat' }),
      D('ベンチの日', [['db_row', 5, 10], ['dip', 5, 10]], { main: 'bench' }),
      D('デッドリフトの日', [['bulgarian', 3, 10], ['leg_raise', 5, 10]], { main: 'deadlift' }),
      D('プレスの日', [['chinup', 5, 8], ['pushdown', 5, 12]], { main: 'ohp' }),
    ],
  },
  {
    id: 'ppl', name: 'プッシュ／プル／レッグ', freq: '週3〜6回', level: '中級',
    desc: '押す日・引く日・脚の日で分ける定番分割。筋肥大向けの回数帯（6〜15回）。',
    days: [
      D('プッシュ', [['bench', 4, 6], ['ohp', 3, 8], ['db_bench', 3, 10], ['lateral_raise', 3, 15], ['pushdown', 3, 12]]),
      D('プル', [['deadlift', 3, 5], ['pullup', 3, 8], ['barbell_row', 3, 8], ['face_pull', 3, 15], ['barbell_curl', 3, 10]]),
      D('レッグ', [['squat', 4, 6], ['rdl', 3, 8], ['leg_press', 3, 10], ['leg_curl', 3, 12], ['calf_raise', 4, 15]]),
    ],
  },
  {
    id: 'ul', name: '上半身／下半身', freq: '週4回', level: '中級',
    desc: '上半身と下半身を交互に。各部位を週2回ずつ刺激できる。',
    days: [
      D('上半身A', [['bench', 4, 6], ['barbell_row', 4, 6], ['ohp', 3, 8], ['lat_pulldown', 3, 10], ['db_curl', 2, 12], ['pushdown', 2, 12]]),
      D('下半身A', [['squat', 4, 6], ['rdl', 3, 8], ['bulgarian', 3, 10], ['calf_raise', 4, 12], ['ab_wheel', 3, 10]]),
      D('上半身B', [['incline_bench', 4, 8], ['pullup', 4, 8], ['db_shoulder', 3, 10], ['seated_row', 3, 10], ['face_pull', 3, 15]]),
      D('下半身B', [['deadlift', 3, 5], ['front_squat', 3, 8], ['leg_curl', 3, 12], ['hip_thrust', 3, 10], ['leg_raise', 3, 12]]),
    ],
  },
  {
    id: 'fb_off', name: 'アメフト オフシーズン', freq: '週4回', level: '中級〜',
    desc: '筋力とパワー（爆発力）を同時に伸ばす構成例。クリーン系を最初に、首と体幹で接触への備え。',
    days: [
      D('下半身パワー', [['power_clean', 5, 3], ['squat', 5, 5], ['rdl', 3, 8], ['neck_ext', 3, 15], ['ab_wheel', 3, 10]]),
      D('上半身筋力', [['bench', 5, 5], ['barbell_row', 4, 6], ['push_press', 4, 4], ['pullup', 3, 8], ['neck_flex', 3, 15]]),
      D('下半身筋力', [['trap_bar_dl', 4, 5], ['front_squat', 3, 6], ['bulgarian', 3, 8], ['hip_thrust', 3, 10], ['calf_raise', 3, 15]]),
      D('上半身ボリューム', [['incline_bench', 4, 8], ['db_row', 4, 10], ['db_shoulder', 3, 10], ['face_pull', 3, 15], ['dip', 3, 10]]),
    ],
  },
  {
    id: 'fb_in', name: 'アメフト シーズン中（維持）', freq: '週2回', level: '全レベル',
    desc: '試合期は量を減らし、重さを保って筋力を落とさない。疲労を残さないよう各種目2〜3セット。',
    days: [
      D('維持A', [['hang_clean', 3, 3], ['squat', 3, 3], ['bench', 3, 3], ['pullup', 2, 8], ['neck_ext', 2, 15]]),
      D('維持B', [['trap_bar_dl', 3, 3], ['incline_bench', 3, 5], ['rdl', 2, 6], ['face_pull', 2, 15], ['neck_flex', 2, 15]]),
    ],
  },
];
export const PROGRAM_MAP = Object.fromEntries(PROGRAMS.map(p => [p.id, p]));
