// utils/tone.js - 拼音声调工具函数

const TONE_MAP = {
  'ā': 'a', 'á': 'a', 'ǎ': 'a', 'à': 'a',
  'ē': 'e', 'é': 'e', 'ě': 'e', 'è': 'e',
  'ī': 'i', 'í': 'i', 'ǐ': 'i', 'ì': 'i',
  'ō': 'o', 'ó': 'o', 'ǒ': 'o', 'ò': 'o',
  'ū': 'u', 'ú': 'u', 'ǔ': 'u', 'ù': 'u',
  'ǖ': 'v', 'ǘ': 'v', 'ǚ': 'v', 'ǜ': 'v',
  'ü': 'v',
};

const TONE_NUM = {
  'ā': 1, 'á': 2, 'ǎ': 3, 'à': 4,
  'ē': 1, 'é': 2, 'ě': 3, 'è': 4,
  'ī': 1, 'í': 2, 'ǐ': 3, 'ì': 4,
  'ō': 1, 'ó': 2, 'ǒ': 3, 'ò': 4,
  'ū': 1, 'ú': 2, 'ǔ': 3, 'ù': 4,
  'ǖ': 1, 'ǘ': 2, 'ǚ': 3, 'ǜ': 4,
};

function stripTones(s) {
  return s.split('').map(c => TONE_MAP[c] || c).join('').toLowerCase();
}

function detectTone(pinyin) {
  for (const ch of pinyin) {
    if (TONE_NUM[ch]) return TONE_NUM[ch];
  }
  return 0;
}

/**
 * 预处理字符数组，添加 _py 和 _tone 字段
 */
function preprocessChars(chars) {
  chars.forEach(c => {
    c._py = stripTones(c.pinyin);
    c._tone = detectTone(c.pinyin);
  });
  return chars;
}

module.exports = {
  stripTones,
  detectTone,
  preprocessChars,
};
