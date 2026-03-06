/**
 * gen-tab-icons.js
 * 生成微信小程序 tabBar 图标（81x81 PNG）
 * 依赖: canvas (npm install canvas --save-dev)
 *
 * 用法: node scripts/gen-tab-icons.js
 */

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const SIZE = 81;
const OUTPUT_DIR = path.join(__dirname, '..', 'miniprogram', 'images');

function generateIcon(text, color, filename) {
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');

  // 透明背景
  ctx.clearRect(0, 0, SIZE, SIZE);

  // 绘制文字
  ctx.fillStyle = color;
  ctx.font = 'bold 48px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, SIZE / 2, SIZE / 2 + 2);

  // 写入文件
  const buffer = canvas.toBuffer('image/png');
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, buffer);
  console.log('Generated:', filepath);
}

// 确保输出目录存在
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// 寻字起名 tab
generateIcon('字', '#999999', 'tab-name.png');
generateIcon('字', '#0071e3', 'tab-name-active.png');

// 八字分析 tab
generateIcon('八', '#999999', 'tab-bazi.png');
generateIcon('八', '#0071e3', 'tab-bazi-active.png');

console.log('Done! All icons generated.');
