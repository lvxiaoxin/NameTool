/**
 * bazi.js - 八字计算核心模块
 * 纯 JS 实现，无外部依赖
 * 支持公历日期 + 时辰 → 四柱八字 + 五行分析 + 十神 + 喜用神
 */

// ============================================================
// 常量
// ============================================================

const TIAN_GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const DI_ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const WUXING_NAMES = ['木', '火', '土', '金', '水'];
const WUXING_KEY = { '金': 'jin', '木': 'mu', '水': 'shui', '火': 'huo', '土': 'tu' };

// 天干 → 五行名
const GAN_WUXING = {
  '甲': '木', '乙': '木', '丙': '火', '丁': '火', '戊': '土',
  '己': '土', '庚': '金', '辛': '金', '壬': '水', '癸': '水',
};
// 天干索引 → 五行索引 (木0,火1,土2,金3,水4)
function ganWuxingIdx(ganIdx) { return Math.floor(ganIdx / 2); }

// 地支 → 五行名
const ZHI_WUXING = {
  '子': '水', '丑': '土', '寅': '木', '卯': '木', '辰': '土', '巳': '火',
  '午': '火', '未': '土', '申': '金', '酉': '金', '戌': '土', '亥': '水',
};
// 地支索引 → 五行索引
const ZHI_WUXING_IDX = [4, 2, 0, 0, 2, 1, 1, 2, 3, 3, 2, 4];

// 地支藏干（主气、中气、余气）
const ZHI_CANG_GAN = [
  [9],       // 子: 癸
  [5, 9, 7], // 丑: 己癸辛
  [0, 2, 4], // 寅: 甲丙戊
  [1],       // 卯: 乙
  [4, 1, 9], // 辰: 戊乙癸
  [2, 6, 4], // 巳: 丙庚戊
  [3, 5],    // 午: 丁己
  [5, 3, 1], // 未: 己丁乙
  [6, 8, 4], // 申: 庚壬戊
  [7],       // 酉: 辛
  [4, 7, 3], // 戌: 戊辛丁
  [8, 0],    // 亥: 壬甲
];

// 纳音表（30 对，每对覆盖 60 甲子中的 2 个）
const NAYIN_TABLE = [
  '海中金', '炉中火', '大林木', '路旁土', '剑锋金',
  '山头火', '涧下水', '城头土', '白蜡金', '杨柳木',
  '泉中水', '屋上土', '霹雳火', '松柏木', '长流水',
  '砂石金', '山下火', '平地木', '壁上土', '金箔金',
  '覆灯火', '天河水', '大驿土', '钗钏金', '桑柘木',
  '大溪水', '沙中土', '天上火', '石榴木', '大海水',
];
const NAYIN_WUXING_IDX = [
  3, 1, 0, 2, 3, 1, 4, 2, 3, 0,
  4, 2, 1, 0, 4, 3, 1, 0, 2, 3,
  1, 4, 2, 3, 0, 4, 2, 1, 0, 4,
];

// 时辰选项
const SHICHEN_OPTIONS = [
  '子时 (23:00-1:00)', '丑时 (1:00-3:00)', '寅时 (3:00-5:00)',
  '卯时 (5:00-7:00)', '辰时 (7:00-9:00)', '巳时 (9:00-11:00)',
  '午时 (11:00-13:00)', '未时 (13:00-15:00)', '申时 (15:00-17:00)',
  '酉时 (17:00-19:00)', '戌时 (19:00-21:00)', '亥时 (21:00-23:00)',
];

// ============================================================
// 五行关系
// ============================================================

// 五行索引: 木0, 火1, 土2, 金3, 水4
// 相生: 木→火→土→金→水→木, 即 (i+1)%5
// 相克: 木→土→水→火→金→木, 即 (i+2)%5

function wxGenerates(a, b) { return (a + 1) % 5 === b; }
function wxControls(a, b) { return (a + 2) % 5 === b; }

/**
 * 计算十神
 * @param {number} dayIdx - 日主天干索引
 * @param {number} otherIdx - 其他天干索引
 * @returns {string} 十神名称
 */
function getTenGod(dayIdx, otherIdx) {
  const dw = ganWuxingIdx(dayIdx);
  const ow = ganWuxingIdx(otherIdx);
  const sameYY = (dayIdx % 2) === (otherIdx % 2);

  if (dw === ow) return sameYY ? '比肩' : '劫财';
  if (wxGenerates(dw, ow)) return sameYY ? '食神' : '伤官';
  if (wxGenerates(ow, dw)) return sameYY ? '偏印' : '正印';
  if (wxControls(dw, ow)) return sameYY ? '偏财' : '正财';
  if (wxControls(ow, dw)) return sameYY ? '七杀' : '正官';
  return '';
}

// ============================================================
// 纳音
// ============================================================

function getNayin(ganIdx, zhiIdx) {
  const cycleIdx = ((6 * ganIdx - 5 * zhiIdx) % 60 + 60) % 60;
  const pairIdx = Math.floor(cycleIdx / 2);
  return {
    name: NAYIN_TABLE[pairIdx],
    wuxing: WUXING_NAMES[NAYIN_WUXING_IDX[pairIdx]],
    wuxingKey: WUXING_KEY[WUXING_NAMES[NAYIN_WUXING_IDX[pairIdx]]],
  };
}

// ============================================================
// 节气计算（寿星公式）
// ============================================================

// 节气 C 值 (20世纪 / 21世纪)
// 顺序: 小寒,大寒,立春,雨水,惊蛰,春分,清明,谷雨,立夏,小满,芒种,夏至,
//       小暑,大暑,立秋,处暑,白露,秋分,寒露,霜降,立冬,小雪,大雪,冬至
const TERM_C_20 = [
  6.11, 20.84, 4.15, 19.04, 6.11, 20.84,
  5.59, 20.53, 6.06, 21.37, 5.93, 21.47,
  7.44, 23.13, 7.95, 23.35, 8.23, 23.35,
  8.44, 23.59, 7.82, 22.36, 7.18, 21.94,
];
const TERM_C_21 = [
  5.4055, 20.12, 3.87, 18.73, 5.63, 20.646,
  4.81, 20.1, 5.52, 21.04, 5.678, 21.37,
  7.108, 22.83, 7.5, 23.13, 7.646, 23.042,
  8.318, 23.438, 7.438, 22.36, 7.18, 21.94,
];

/**
 * 计算某年某个节气的公历日期
 * termIndex: 0=小寒, 2=立春, 4=惊蛰, ...
 * 返回 { month, day }
 */
function solarTermDate(year, termIndex) {
  const is21 = year >= 2000;
  const C = is21 ? TERM_C_21[termIndex] : TERM_C_20[termIndex];
  const Y = year % 100;
  const L = Math.floor(Y / 4);
  let day = Math.floor(Y * 0.2422 + C) - L;

  // 已知特殊修正
  if (termIndex === 0 && year === 2019) day -= 1;
  if (termIndex === 1 && year === 2082) day += 1;

  const month = Math.floor(termIndex / 2) + 1;
  return { month, day };
}

// ============================================================
// 儒略日
// ============================================================

function dateToJDN(year, month, day) {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day + Math.floor((153 * m + 2) / 5) + 365 * y
    + Math.floor(y / 4) - Math.floor(y / 100)
    + Math.floor(y / 400) - 32045;
}

// ============================================================
// 四柱计算
// ============================================================

function hourToZhiIndex(hour) {
  if (hour === 23 || hour === 0) return 0;
  return Math.ceil(hour / 2);
}

function yearPillar(year, month, day) {
  const lichun = solarTermDate(year, 2);
  let gy = year;
  if (month < lichun.month || (month === lichun.month && day < lichun.day)) {
    gy = year - 1;
  }
  let ganIdx = (gy - 4) % 10; if (ganIdx < 0) ganIdx += 10;
  let zhiIdx = (gy - 4) % 12; if (zhiIdx < 0) zhiIdx += 12;
  return { ganIdx, zhiIdx };
}

/**
 * 月柱：以 12 个"节"为月界
 * 按公历月份顺序排列各节
 */
function monthPillar(year, month, day, yearGanIdx) {
  // 节 termIndex 按公历月份排列 (1月小寒, 2月立春, ...)
  // 每个节开始一个新的八字月
  const JIE_TERMS = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22];
  // 对应地支索引: 丑1, 寅2, 卯3, 辰4, 巳5, 午6, 未7, 申8, 酉9, 戌10, 亥11, 子0
  const MONTH_ZHI_IDX = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0];
  // 月序 (从寅月=1 到 丑月=12)
  const MONTH_ORD = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

  // 计算各节日期
  const jieDates = JIE_TERMS.map(t => solarTermDate(year, t));

  // 从最后一个节倒查
  let idx = 0; // 默认: 小寒前 → 上年子月
  for (let i = jieDates.length - 1; i >= 0; i--) {
    const jd = jieDates[i];
    if (month > jd.month || (month === jd.month && day >= jd.day)) {
      idx = i;
      break;
    }
  }

  // 若日期在小寒之前 (1月初)，属于上一年大雪后的子月
  if (month < jieDates[0].month || (month === jieDates[0].month && day < jieDates[0].day)) {
    // 子月，月序11
    const startGan = [2, 4, 6, 8, 0][yearGanIdx % 5];
    // 注意: 此处的yearGanIdx来自已调整过的八字年
    // 子月是上一个八字年的第11个月
    // 但yearPillar已经把立春前的年份-1了，这里年干对应的是前一年
    // 前一年的子月(ord=11): ganIdx = (startGan + 11 - 1) % 10
    const ganIdx = (startGan + 10) % 10;
    return { ganIdx, zhiIdx: 0 };
  }

  const zhiIdx = MONTH_ZHI_IDX[idx];
  const ord = MONTH_ORD[idx];

  // 五虎遁月
  const startGan = [2, 4, 6, 8, 0][yearGanIdx % 5];
  const ganIdx = (startGan + ord - 1) % 10;

  return { ganIdx, zhiIdx };
}

function dayPillar(year, month, day) {
  const jdn = dateToJDN(year, month, day);
  const ref = 2451551; // 2000-01-07 = 甲子日
  const diff = jdn - ref;
  let ganIdx = diff % 10; if (ganIdx < 0) ganIdx += 10;
  let zhiIdx = diff % 12; if (zhiIdx < 0) zhiIdx += 12;
  return { ganIdx, zhiIdx };
}

function hourPillarCalc(hour, dayGanIdx) {
  const zhiIdx = hourToZhiIndex(hour);
  const startGan = [0, 2, 4, 6, 8][dayGanIdx % 5];
  const ganIdx = (startGan + zhiIdx) % 10;
  return { ganIdx, zhiIdx };
}

// ============================================================
// 主计算 + 分析
// ============================================================

function buildPillarInfo(ganIdx, zhiIdx) {
  const gan = TIAN_GAN[ganIdx];
  const zhi = DI_ZHI[zhiIdx];
  return {
    gan, zhi, ganIdx, zhiIdx,
    ganWuxing: GAN_WUXING[gan],
    zhiWuxing: ZHI_WUXING[zhi],
    ganWuxingKey: WUXING_KEY[GAN_WUXING[gan]],
    zhiWuxingKey: WUXING_KEY[ZHI_WUXING[zhi]],
    cangGan: ZHI_CANG_GAN[zhiIdx].map(gi => ({
      gan: TIAN_GAN[gi],
      wuxing: WUXING_NAMES[ganWuxingIdx(gi)],
      wuxingKey: WUXING_KEY[WUXING_NAMES[ganWuxingIdx(gi)]],
    })),
    nayin: getNayin(ganIdx, zhiIdx),
  };
}

/**
 * 计算四柱八字 + 完整分析
 */
function calculateBazi(year, month, day, hour) {
  const yp = yearPillar(year, month, day);
  const mp = monthPillar(year, month, day, yp.ganIdx);
  const dp = dayPillar(year, month, day);

  const pillars = {
    year: buildPillarInfo(yp.ganIdx, yp.zhiIdx),
    month: buildPillarInfo(mp.ganIdx, mp.zhiIdx),
    day: buildPillarInfo(dp.ganIdx, dp.zhiIdx),
    hour: null,
  };

  if (hour >= 0) {
    const hp = hourPillarCalc(hour, dp.ganIdx);
    pillars.hour = buildPillarInfo(hp.ganIdx, hp.zhiIdx);
  }

  // 十神（相对日主）
  const dayGanIdx = dp.ganIdx;
  pillars.year.tenGod = getTenGod(dayGanIdx, yp.ganIdx);
  pillars.month.tenGod = getTenGod(dayGanIdx, mp.ganIdx);
  pillars.day.tenGod = '日主';
  if (pillars.hour) {
    pillars.hour.tenGod = getTenGod(dayGanIdx, pillars.hour.ganIdx);
  }

  // 五行分析
  const analysis = analyzeComplete(pillars, dayGanIdx);

  return { pillars, analysis };
}

/**
 * 综合分析
 */
function analyzeComplete(pillars, dayGanIdx) {
  const dayWxIdx = ganWuxingIdx(dayGanIdx);
  const dayWuxing = WUXING_NAMES[dayWxIdx];

  // ---- 1. 五行统计（天干 + 地支主五行）----
  const counts = { '木': 0, '火': 0, '土': 0, '金': 0, '水': 0 };
  const pillarKeys = ['year', 'month', 'day'];
  if (pillars.hour) pillarKeys.push('hour');

  for (const k of pillarKeys) {
    counts[pillars[k].ganWuxing]++;
    counts[pillars[k].zhiWuxing]++;
  }

  // 缺失 / 偏弱
  const missing = [];
  const weak = [];
  for (const wx of WUXING_NAMES) {
    if (counts[wx] === 0) missing.push(wx);
    else if (counts[wx] === 1) weak.push(wx);
  }

  const total = pillarKeys.length * 2;
  const wuxingList = WUXING_NAMES.map(wx => ({
    name: wx,
    key: WUXING_KEY[wx],
    count: counts[wx],
    percent: Math.round(counts[wx] / total * 100),
    status: counts[wx] === 0 ? 'missing' : (counts[wx] === 1 ? 'weak' : 'normal'),
  }));

  // ---- 2. 日主强弱 ----
  // 月令（月支五行）
  const monthZhiWxIdx = ZHI_WUXING_IDX[pillars.month.zhiIdx];
  // 得令: 月支五行与日主同类或生日主
  const deLing = (monthZhiWxIdx === dayWxIdx) || wxGenerates(monthZhiWxIdx, dayWxIdx);

  // 计算支持/耗泄分数
  let support = 0;
  let drain = 0;

  for (const k of pillarKeys) {
    const p = pillars[k];
    // 天干（日主自身跳过）
    if (k !== 'day') {
      const gw = ganWuxingIdx(p.ganIdx);
      if (gw === dayWxIdx || wxGenerates(gw, dayWxIdx)) support += 1;
      else drain += 1;
    }
    // 地支主气
    const zw = ZHI_WUXING_IDX[p.zhiIdx];
    if (zw === dayWxIdx || wxGenerates(zw, dayWxIdx)) support += 1;
    else drain += 1;
    // 地支中气/余气 (权重较低)
    const cg = ZHI_CANG_GAN[p.zhiIdx];
    for (let ci = 1; ci < cg.length; ci++) {
      const cgw = ganWuxingIdx(cg[ci]);
      if (cgw === dayWxIdx || wxGenerates(cgw, dayWxIdx)) support += 0.3;
      else drain += 0.3;
    }
  }

  // 得令加成
  if (deLing) support += 2;
  else drain += 1;

  let strength; // 'strong' | 'weak' | 'neutral'
  if (support > drain + 1) strength = 'strong';
  else if (drain > support + 1) strength = 'weak';
  else strength = 'neutral';

  const strengthLabel = strength === 'strong' ? '身旺' :
                        strength === 'weak' ? '身弱' : '中和';

  // ---- 3. 喜用神 ----
  // 身旺 → 喜 食伤(我生)、财(我克)、官杀(克我)
  // 身弱 → 喜 印(生我)、比劫(同我)
  // 中和 → 根据缺失元素建议

  const generates_me = (dayWxIdx + 4) % 5; // 生我
  const same_as_me = dayWxIdx;              // 同我
  const i_generate = (dayWxIdx + 1) % 5;   // 我生 (食伤)
  const i_control = (dayWxIdx + 2) % 5;    // 我克 (财)
  const controls_me = (dayWxIdx + 3) % 5;  // 克我 (官杀)

  let xiyong = []; // 喜用神五行索引
  let ji = [];     // 忌神五行索引

  if (strength === 'weak') {
    xiyong = [generates_me, same_as_me];
    ji = [i_generate, i_control, controls_me];
  } else if (strength === 'strong') {
    xiyong = [i_generate, i_control, controls_me];
    ji = [generates_me, same_as_me];
  } else {
    // 中和：以缺失元素为喜用
    if (missing.length > 0) {
      xiyong = missing.map(wx => WUXING_NAMES.indexOf(wx));
    } else if (weak.length > 0) {
      xiyong = weak.map(wx => WUXING_NAMES.indexOf(wx));
    }
    // 忌神为最多的元素
    let maxWx = 0;
    for (let i = 1; i < 5; i++) {
      if (counts[WUXING_NAMES[i]] > counts[WUXING_NAMES[maxWx]]) maxWx = i;
    }
    ji = [maxWx];
  }

  const xiyongNames = xiyong.map(i => WUXING_NAMES[i]);
  const jiNames = ji.map(i => WUXING_NAMES[i]);

  // 首选喜用神（用于起名推荐）
  const primaryXiyong = xiyongNames.length > 0 ? xiyongNames[0] : '';

  // ---- 4. 起名建议 ----
  let suggestion = '';
  if (strength === 'weak') {
    suggestion = '日主偏弱，喜用「' + xiyongNames.join('、') + '」来扶助。起名建议优先使用五行属「' + primaryXiyong + '」的字';
  } else if (strength === 'strong') {
    suggestion = '日主偏旺，喜用「' + xiyongNames.join('、') + '」来平衡。起名建议优先使用五行属「' + primaryXiyong + '」的字';
  } else {
    if (missing.length > 0) {
      suggestion = '八字中和，五行缺「' + missing.join('、') + '」。起名建议补充五行属「' + primaryXiyong + '」的字';
    } else {
      suggestion = '八字五行较为均衡，起名可根据喜好选择';
    }
  }

  // ---- 5. 月令描述 ----
  const seasonDesc = deLing ? '得令（月令扶助日主）' : '失令（月令不助日主）';

  // ---- 6. 日主信息 ----
  const dayMaster = {
    gan: TIAN_GAN[dayGanIdx],
    wuxing: dayWuxing,
    wuxingKey: WUXING_KEY[dayWuxing],
  };

  return {
    counts,
    missing,
    weak,
    wuxingList,
    dayMaster,
    strength,
    strengthLabel,
    deLing,
    seasonDesc,
    support: Math.round(support * 10) / 10,
    drain: Math.round(drain * 10) / 10,
    xiyongNames,
    jiNames,
    primaryXiyong,
    suggestion,
    suggestedWuxing: primaryXiyong,
  };
}

module.exports = {
  calculateBazi,
  SHICHEN_OPTIONS,
  TIAN_GAN,
  DI_ZHI,
  GAN_WUXING,
  ZHI_WUXING,
  WUXING_KEY,
  WUXING_NAMES,
};
