// body.js — 人体図（前面・背面）のSVG生成。
// 各筋群は「体の左半分」の多角形座標で定義し、x=100 を軸に鏡像を自動生成する。
// center:true の筋群（腹直筋・首・僧帽筋背面）は全幅で1回だけ描く。
// 座標系: 1体あたり viewBox 200×420。前面を左、背面を右(+220)に並べる。

const L = pts => 'M' + pts.map(p => p.join(',')).join('L') + 'Z';
const mirror = pts => pts.map(([x, y]) => [200 - x, y]);

// シルエット（左半分、首の付け根→手→脚→股）。右半分は鏡像を逆順に連結。
const OUTLINE = [[100, 52], [91, 54], [90, 66], [74, 73], [60, 77], [50, 86], [45, 102], [41, 126], [38, 150],
  [33, 172], [29, 198], [27, 212], [23, 226], [27, 237], [34, 233], [37, 215], [42, 193], [48, 168], [53, 150],
  [57, 128], [61, 112], [64, 140], [68, 170], [70, 190], [66, 206], [64, 232], [64, 262], [67, 292], [66, 312],
  [64, 336], [68, 366], [71, 388], [66, 400], [70, 406], [90, 406], [92, 396], [90, 386], [92, 360], [94, 332],
  [94, 306], [96, 282], [98, 252], [99, 234], [100, 232]];
const outlinePath = L([...OUTLINE, ...mirror(OUTLINE).reverse()]);

const FRONT = [
  { m: 'neck', center: true, d: 'M93,56L107,56L108,67L100,72L92,67Z' },
  { m: 'traps', pts: [[91, 63], [86, 70], [75, 75], [93, 78]] },
  { m: 'delt_s', pts: [[60, 79], [51, 86], [46, 100], [49, 106], [55, 93]] },
  { m: 'delt_f', pts: [[73, 77], [62, 79], [56, 93], [50, 107], [57, 111], [64, 101], [71, 90]] },
  { m: 'chest', pts: [[98, 84], [75, 80], [65, 92], [61, 108], [67, 122], [81, 128], [98, 126]] },
  { m: 'biceps', pts: [[50, 111], [46, 125], [44, 140], [48, 150], [54, 146], [57, 130], [58, 116]] },
  { m: 'forearm', pts: [[46, 155], [38, 171], [33, 196], [36, 206], [42, 192], [48, 172], [52, 157]] },
  { m: 'abs', center: true, d: 'M87,132L113,132L115,168L112,200L100,207L88,200L85,168Z' },
  { m: 'oblique', pts: [[84, 133], [69, 129], [66, 148], [68, 172], [72, 190], [86, 199], [84, 168]] },
  { m: 'quads', pts: [[71, 208], [67, 232], [67, 262], [70, 289], [80, 296], [90, 290], [93, 264], [91, 238], [86, 220]] },
  { m: 'adductor', pts: [[98, 236], [94, 232], [92, 248], [95, 270], [98, 260]] },
  { m: 'calves', pts: [[68, 316], [66, 336], [70, 360], [76, 372], [80, 350], [79, 326]] },
];
const BACK = [
  { m: 'traps', center: true, d: 'M100,58L89,66L73,76L85,86L92,110L100,128L108,110L115,86L127,76L111,66Z' },
  { m: 'delt_s', pts: [[56, 79], [49, 86], [45, 100], [48, 104], [52, 92]] },
  { m: 'delt_r', pts: [[71, 78], [58, 80], [52, 94], [49, 106], [56, 108], [64, 97]] },
  { m: 'upback', pts: [[83, 88], [71, 84], [64, 96], [67, 108], [89, 113], [90, 105]] },
  { m: 'triceps', pts: [[50, 110], [45, 124], [43, 142], [48, 151], [55, 145], [58, 126], [57, 111]] },
  { m: 'forearm', pts: [[46, 155], [38, 171], [33, 196], [36, 206], [42, 192], [48, 172], [52, 157]] },
  { m: 'lats', pts: [[90, 116], [66, 111], [63, 128], [66, 152], [74, 174], [88, 162]] },
  { m: 'lowback', pts: [[98, 132], [93, 134], [89, 160], [87, 190], [98, 196]] },
  { m: 'glutes', pts: [[98, 200], [84, 197], [71, 205], [66, 222], [72, 240], [88, 245], [99, 239]] },
  { m: 'hams', pts: [[69, 249], [67, 270], [71, 292], [82, 298], [93, 290], [97, 266], [96, 250], [84, 247]] },
  { m: 'calves', pts: [[68, 312], [64, 332], [68, 356], [78, 367], [86, 354], [90, 330], [86, 312], [76, 306]] },
];

function shapes(list, dx) {
  let out = '';
  for (const s of list) {
    const attrs = `class="mu" data-m="${s.m}"`;
    if (s.center) out += `<path ${attrs} d="${s.d}" transform="translate(${dx},0)"/>`;
    else {
      out += `<path ${attrs} d="${L(s.pts)}" transform="translate(${dx},0)"/>`;
      out += `<path ${attrs} d="${L(mirror(s.pts))}" transform="translate(${dx},0)"/>`;
    }
  }
  return out;
}

function figure(dx) {
  return `<g transform="translate(${dx},0)"><ellipse class="sil" cx="100" cy="33" rx="17" ry="21"/>` +
    `<path class="sil" d="${outlinePath}"/></g>`;
}

const ABS_LINES = '<g class="det" transform="translate(0,0)"><path d="M100,134V204M88,150H112M87,167H113M88,184H112"/></g>';
const BACK_LINES = '<g class="det" transform="translate(220,0)"><path d="M100,128V196"/></g>';

/** 値→段階(0〜5)。thresholds は段階1〜5の下限 */
export function level(v, th) {
  if (!(v > 0)) return 0;
  let l = 1;
  for (let i = 1; i < th.length; i++) if (v >= th[i]) l = i + 1;
  return l;
}

/** 人体図SVG文字列。values = {筋群ID: 数値}、selected = 強調する筋群ID */
export function bodySVG(values = {}, { thresholds = [0, 3, 6, 10, 15], selected = null, compact = false } = {}) {
  const svg = `<svg class="body${compact ? ' compact' : ''}" viewBox="0 0 420 420" role="img" aria-label="筋群マップ（左：前面、右：背面）">` +
    figure(0) + figure(220) + shapes(FRONT, 0) + shapes(BACK, 220) + ABS_LINES + BACK_LINES + '</svg>';
  // 値は data 属性ではなく class で反映（文字列結合にユーザー値を混ぜない）
  return svg.replace(/class="mu" data-m="([a-z_]+)"/g, (_, m) =>
    `class="mu l${level(values[m], thresholds)}${m === selected ? ' sel' : ''}" data-m="${m}"`);
}
