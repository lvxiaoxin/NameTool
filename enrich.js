#!/usr/bin/env node
/**
 * 增量爬取每个汉字的 detail 页面，提取"是否常用"和"吉凶寓意"字段
 * 
 * 规则：
 *   common: 页面 <p> 含 "常用字" → true，否则 false
 *   lucky:  页面 <p> 含 "吉利字" 或 metadata 含 "吉凶寓意：吉" → true，否则 false
 *
 * 支持断点续爬：已同时有 common 和 lucky 字段的跳过
 * 并发 5 个请求，每批间隔 200ms
 */

const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data', 'characters.json');
const CONCURRENCY = 5;
const DELAY_MS = 200;
const SAVE_EVERY = 100;

const delay = ms => new Promise(r => setTimeout(r, ms));

async function fetchPage(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'zh-CN,zh;q=0.9',
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (i < retries - 1) await delay(1000 * (i + 1));
    }
  }
  return null;
}

/**
 * 从 detail 页面同时提取 common 和 lucky
 */
function extractDetails(html) {
  const $ = cheerio.load(html);

  // ── common: 是否常用 ──
  let common = false;
  $('p').each((_, el) => {
    const t = $(el).text();
    if (t.includes('是否常用')) {
      if (t.includes('常用字')) common = true;
      return false;
    }
  });
  if (!common) {
    const full = $.text();
    const idx = full.indexOf('是否常用：');
    if (idx >= 0 && full.substring(idx, idx + 80).includes('常用字')) {
      common = true;
    }
  }

  // ── lucky: 吉凶寓意 ──
  let lucky = false;
  $('p').each((_, el) => {
    const t = $(el).text();
    if (t.includes('字吉凶寓意') && t.length < 30) {
      if (t.includes('吉利字')) lucky = true;
      return false;
    }
  });
  if (!lucky) {
    $('p').each((_, el) => {
      const t = $(el).text();
      if (t.includes('五行属性') && t.includes('吉凶寓意：吉')) {
        lucky = true;
        return false;
      }
    });
  }

  return { common, lucky };
}

async function enrich() {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   Phase 4: 爬取详情 (常用/吉凶)       ║');
  console.log('╚══════════════════════════════════════╝');

  const chars = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  console.log(`\n  共 ${chars.length} 个汉字`);

  // 跳过已有两个字段的
  const todo = [];
  chars.forEach((c, i) => {
    if ((c.common === undefined || c.lucky === undefined) && c.url) {
      todo.push({ index: i, char: c });
    }
  });

  console.log(`  待爬取: ${todo.length}，已有: ${chars.length - todo.length}`);
  if (todo.length === 0) {
    console.log('  ✅ 全部已完成');
    return;
  }

  let processed = 0;
  let commonCount = 0;
  let luckyCount = 0;

  for (let b = 0; b < todo.length; b += CONCURRENCY) {
    const batch = todo.slice(b, b + CONCURRENCY);

    const results = await Promise.all(batch.map(async ({ index, char: c }) => {
      const html = await fetchPage(c.url);
      if (!html) return { index, common: false, lucky: false, failed: true };
      const details = extractDetails(html);
      return { index, ...details, failed: false };
    }));

    for (const r of results) {
      chars[r.index].common = r.common;
      chars[r.index].lucky = r.lucky;
      processed++;
      if (r.common) commonCount++;
      if (r.lucky) luckyCount++;
      if (r.failed) {
        console.error(`  ⚠ 失败: ${chars[r.index].char} ${chars[r.index].url}`);
      }
    }

    if (processed % 50 === 0 || b + CONCURRENCY >= todo.length) {
      const pct = ((processed / todo.length) * 100).toFixed(1);
      console.log(`  [${pct}%] ${processed}/${todo.length}  常用: ${commonCount}  吉利: ${luckyCount}`);
    }

    if (processed % SAVE_EVERY === 0) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(chars));
      console.log(`  💾 已保存 (${processed})`);
    }

    await delay(DELAY_MS);
  }

  fs.writeFileSync(DATA_FILE, JSON.stringify(chars));

  const totalCommon = chars.filter(c => c.common === true).length;
  const totalLucky = chars.filter(c => c.lucky === true).length;
  console.log(`\n  ✓ Phase 4 完成: 常用字 ${totalCommon}，吉利字 ${totalLucky}，总计 ${chars.length}`);
}

// 支持直接运行和被 require 调用
if (require.main === module) {
  enrich().catch(console.error);
}

module.exports = { enrich };
