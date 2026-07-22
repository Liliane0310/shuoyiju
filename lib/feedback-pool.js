/**
 * Bad case 反馈池
 *
 * 目的：收集「规则误判 / 漏判」样本，作为后续优化判别逻辑、
 * 喂给 LLM 二次判别、或人工 review 的数据基础。
 *
 * 存储位置：app.getPath('userData')/feedback-pool.json
 * 结构：数组，最新在前，带去重与上限。
 */

const fs = require('fs');
const path = require('path');

let appDataDir = null;
const POOL_LIMIT = 500;

function setAppDataDir(dir) {
  appDataDir = dir;
}

function getPoolPath() {
  if (!appDataDir) {
    throw new Error('feedback-pool: appDataDir 未初始化，请先在 app.whenReady 后调用 setAppDataDir');
  }
  return path.join(appDataDir, 'feedback-pool.json');
}

function loadPool() {
  try {
    const p = getPoolPath();
    if (!fs.existsSync(p)) return [];
    const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error('[反馈池] 读取失败:', e.message);
    return [];
  }
}

function savePool(records) {
  fs.writeFileSync(getPoolPath(), JSON.stringify(records, null, 2));
}

/**
 * 追加一条反馈
 * @param {Object} entry
 * @param {string} entry.text          - 原始文本（或包含命中的上下文片段）
 * @param {string} entry.word          - 被命中的词
 * @param {string} entry.category      - 命中类别：'hedge' | 'filler' | 'vague' | 'positive'
 * @param {string} entry.verdict       - 用户标注：'false-positive'(误判) | 'false-negative'(漏判)
 * @param {string} [entry.note]        - 用户备注
 * @param {Object} [entry.context]     - 系统侧上下文：{ systemVerdict, downgraded, sentenceSnapshot }
 * @param {string} [entry.mode]        - 训练模式：'expression' | 'interview'
 */
function appendFeedback(entry) {
  const records = loadPool();
  const item = {
    id: `fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    text: String(entry.text || '').slice(0, 2000),
    word: String(entry.word || ''),
    category: entry.category || 'unknown',
    verdict: entry.verdict || 'false-positive',
    note: entry.note ? String(entry.note).slice(0, 500) : '',
    context: entry.context || null,
    mode: entry.mode || 'expression'
  };
  records.unshift(item);
  if (records.length > POOL_LIMIT) records.length = POOL_LIMIT;
  savePool(records);
  return item;
}

/**
 * 简单聚合统计，供后续查看 bad case 分布
 */
function getStats() {
  const records = loadPool();
  const byCategory = {};
  const byVerdict = {};
  const byWord = {};
  for (const r of records) {
    byCategory[r.category] = (byCategory[r.category] || 0) + 1;
    byVerdict[r.verdict] = (byVerdict[r.verdict] || 0) + 1;
    if (r.word) byWord[r.word] = (byWord[r.word] || 0) + 1;
  }
  return {
    total: records.length,
    byCategory,
    byVerdict,
    byWord
  };
}

function listRecords(limit = 100) {
  const records = loadPool();
  return records.slice(0, limit);
}

function clearPool() {
  savePool([]);
}

module.exports = {
  setAppDataDir,
  appendFeedback,
  listRecords,
  getStats,
  clearPool,
  POOL_LIMIT
};
