/**
 * 词库匹配模块
 * 加载情感词库JSON，分析文本中的情绪词、填充词、犹豫词
 */

const fs = require('fs');
const path = require('path');

let lexiconData = null;
let interviewLexicon = null;

// 分词词表缓存：lexiconData/interviewLexicon 加载后构建一次，避免每次 analyzeText 重建
let dictCache = null;

function buildDict() {
  if (!lexiconData && !interviewLexicon) return null;
  const dict = new Set([
    ...FILLER_WORDS,
    ...HEDGE_WORDS,
    ...Object.keys(VAGUE_TO_PRECISE),
    ...Object.keys(lexiconData?.emotions || {}),
    ...(interviewLexicon?.positiveWords || []),
    ...Object.keys(interviewLexicon?.professionalVerbs || {}),
    ...Object.keys(interviewLexicon?.confidenceMap || {})
  ]);
  return dict;
}

function getDict() {
  if (!dictCache) dictCache = buildDict();
  return dictCache;
}

// 填充词列表（语气词/口头禅）
const FILLER_WORDS = [
  '嗯', '啊', '呃', '额', '那个', '就是', '然后',
  '这个', '对吧', '是吧', '你知道', '怎么说呢',
  '反正', '基本上', '总之', '所以说'
];

// 犹豫词列表（弱化表达）
const HEDGE_WORDS = [
  '可能', '也许', '大概', '应该', '我觉得', '好像',
  '似乎', '或许', '不一定', '差不多', '算是',
  '某种程度上', '一般来说', '感觉'
];

// 客观陈述语境：犹豫词后接这类词时，往往是描述事物本身的概率/属性，
// 而非说话人在退缩。例如「结果可能波动」「产品可能失败」是客观规律陈述。
// 注：仅对「可能/也许/大概/应该/好像/似乎/或许」这类认识情态词生效；
// 「我觉得」是主观信号，不参与降级。
const OBJECTIVE_CONTEXT_WORDS = [
  '结果', '产品', '系统', '模型', '用户', '客户', '市场', '行业',
  '方案', '功能', '需求', '数据', '表现', '行为', '输出', '回答',
  '识别', '翻译', '生成', '响应', '请求', '调用', '运行', '部署',
  '上线', '迭代', '波动', '失败', '出错', '延迟', '偏差', '幻觉',
  '理解', '判断', '决策', '变化', '趋势', '问题', '风险', '成本',
  '效果', '质量', '准确', '精度', '性能', '兼容', '覆盖', '遗漏',
  '出现', '发生', '存在', '导致', '影响', '触发', '命中', '漏掉',
  '听不懂', '编造', '不准', '缺失', '冲突', '崩溃', '丢失', '重复'
];

// 参与语境降级的犹豫词（「我觉得」等纯主观词不在此列）
const CONTEXT_SENSITIVE_HEDGES = new Set([
  '可能', '也许', '大概', '应该', '好像', '似乎', '或许'
]);

/**
 * 判断某次犹豫词命中是否应被降级为「客观陈述」而非「主观弱化」。
 * 规则：命中词属于语境敏感词，且其后（跳过标点/空白，最多看 8 个汉字内）
 * 出现客观语境词，则判定为客观陈述。
 */
function isObjectiveHedge(word, fullText, matchIndex) {
  if (!CONTEXT_SENSITIVE_HEDGES.has(word)) return false;
  // matchIndex 是 word 在 segmented words 数组里的下标；
  // 这里需要还原到原文位置。简单起见：在原文里从 matchIndex 对应的词结束位置之后找。
  // 由于 segmentText 已把标点/空白剔除，重建映射成本较高，
  // 这里采用更轻量的策略：直接在原文中定位该词最近一次出现位置，然后看后续窗口。
  // 多次出现时，按命中顺序取第 n 次。
  let searchFrom = 0;
  let occ = -1;
  const w = word;
  // 重复查找以区分多次出现：用一个计数对齐
  // 这里简化：找第一个未被占用的出现位置
  while ((occ = fullText.indexOf(w, searchFrom)) !== -1) {
    // 看后续窗口
    const tail = fullText.slice(occ + w.length, occ + w.length + 8);
    const hit = OBJECTIVE_CONTEXT_WORDS.some(kw => tail.includes(kw));
    if (hit) return true;
    searchFrom = occ + w.length;
  }
  return false;
}

// 笼统词 → 精准替代映射
const VAGUE_TO_PRECISE = {
  '开心': ['欣喜', '雀跃', '兴奋', '欣慰', '畅快', '满足'],
  '难过': ['心酸', '失落', '委屈', '心疼', '沮丧', '低落'],
  '害怕': ['恐惧', '焦虑', '不安', '慌张', '胆怯', '忐忑'],
  '生气': ['愤怒', '恼火', '窝火', '气愤', '不满', '暴躁'],
  '不舒服': ['压抑', '烦躁', '憋屈', '窒息', '煎熬', '疲惫'],
  '很好': ['出色', '精彩', '优秀', '惊艳', '完美', '理想'],
  '很多': ['大量', '海量', '充裕', '丰富', '密集', '可观'],
  '很快': ['迅速', '飞速', '立刻', '瞬间', '即刻', '火速'],
  '很大': ['巨大', '庞大', '显著', '惊人', '可观', '壮观'],
  '很小': ['微小', '细微', '轻微', '渺小', '微不足道', '些许'],
  '好看': ['精致', '优雅', '绚丽', '惊艳', '别致', '夺目'],
  '不好': ['糟糕', '恶劣', '拙劣', '不堪', '惨淡', '低劣'],
  '喜欢': ['热爱', '痴迷', '着迷', '钟爱', '倾心', '沉醉'],
  '讨厌': ['厌恶', '反感', '排斥', '憎恨', '鄙视', '嫌弃'],
  '觉得': ['认为', '判断', '确信', '推断', '意识到', '发现'],
  '想': ['渴望', '期待', '向往', '盼望', '企图', '打算'],
  '做': ['执行', '落实', '推进', '完成', '实施', '操作'],
  '看': ['审视', '观察', '注视', '打量', '端详', '凝视'],
  '说': ['表达', '阐述', '强调', '指出', '坦言', '声明'],
  '想想': ['反思', '回顾', '审视', '复盘', '琢磨', '斟酌']
};

/**
 * 加载词库
 */
function loadLexicon() {
  const lexiconPath = path.join(__dirname, '..', 'data', 'emotion-lexicon.json');

  if (fs.existsSync(lexiconPath)) {
    const raw = fs.readFileSync(lexiconPath, 'utf-8');
    lexiconData = JSON.parse(raw);
    console.log(`[词库] 加载完成，共 ${Object.keys(lexiconData.emotions || {}).length} 个情绪词`);
  } else {
    console.warn('[词库] emotion-lexicon.json 未找到，使用内置词表');
    lexiconData = { emotions: {} };
  }

  // 加载面试词库
  const interviewPath = path.join(__dirname, '..', 'data', 'interview-lexicon.json');
  if (fs.existsSync(interviewPath)) {
    const raw = fs.readFileSync(interviewPath, 'utf-8');
    interviewLexicon = JSON.parse(raw);
    console.log('[词库] 面试词库加载完成');
  } else {
    console.warn('[词库] interview-lexicon.json 未找到');
    interviewLexicon = null;
  }

  // 词库重新加载后，分词词表缓存需要重建
  dictCache = null;
}

/**
 * 简单中文分词（基于最大正向匹配 + 词表）
 */
function segmentText(text) {
  const words = [];
  let i = 0;
  const maxLen = 6;
  const dict = getDict();

  while (i < text.length) {
    // 标点和空白不参与分词，也不应进入任何统计分母。
    if (/[^\p{L}\p{N}]/u.test(text[i])) {
      i++;
      continue;
    }
    let matched = false;
    // 从最长到最短（含单字）尝试匹配词表
    for (let len = Math.min(maxLen, text.length - i); len >= 1; len--) {
      const word = text.substring(i, i + len);
      if (len >= 2 && dict && dict.has(word)) {
        words.push(word);
        i += len;
        matched = true;
        break;
      }
    }
    if (!matched) {
      // 单字兜底（词表里的单字词上面已匹配，这里是非词表单字）
      words.push(text[i]);
      i++;
    }
  }

  return words;
}

/**
 * 统一的有效字数口径：每个汉字计 1，连续英文/数字计 1，忽略标点与空白。
 * 该值不依赖词库内容，避免修改词库后历史指标发生漂移。
 */
function countEffectiveWords(text) {
  const value = String(text || '');
  const hanCount = (value.match(/\p{Script=Han}/gu) || []).length;
  const latinNumberCount = (value.match(/[A-Za-z0-9]+/g) || []).length;
  return hanCount + latinNumberCount;
}

/**
 * 分析文本
 * @param {string} text - 输入文本
 * @returns {Object} 分析结果
 */
function analyzeText(text) {
  if (!text || !text.trim()) {
    return null;
  }

  const words = segmentText(text);
  const totalWords = countEffectiveWords(text);

  // 检测填充词
  const fillers = [];
  words.forEach((word, idx) => {
    if (FILLER_WORDS.includes(word)) {
      fillers.push({ word, position: idx });
    }
  });

  // 检测犹豫词（带语境判别：客观陈述语境下降级，不计入弱化）
  const hedges = [];
  const hedgesDowngraded = [];
  words.forEach((word, idx) => {
    if (HEDGE_WORDS.includes(word)) {
      if (isObjectiveHedge(word, text, idx)) {
        hedgesDowngraded.push({ word, position: idx, reason: 'objective' });
      } else {
        hedges.push({ word, position: idx });
      }
    }
  });

  // 检测笼统词
  const vagueWords = [];
  words.forEach((word, idx) => {
    if (VAGUE_TO_PRECISE[word]) {
      vagueWords.push({
        word,
        position: idx,
        alternatives: VAGUE_TO_PRECISE[word]
      });
    }
  });

  // 检测情绪词（来自词库）
  const emotionWords = [];
  if (lexiconData && lexiconData.emotions) {
    words.forEach((word, idx) => {
      if (lexiconData.emotions[word]) {
        emotionWords.push({
          word,
          position: idx,
          ...lexiconData.emotions[word]
        });
      }
    });
  }

  // 计算表达密度
  // 降级为客观陈述的犹豫词不计入"弱化"，按有效词处理
  const meaningfulWords = totalWords - fillers.length - hedges.length;
  const density = totalWords > 0 ? (meaningfulWords / totalWords) : 1;

  return {
    totalWords,
    fillers,
    hedges,
    hedgesDowngraded,
    vagueWords,
    emotionWords,
    density: Math.round(density * 100),
    suggestions: generateSuggestions(vagueWords, fillers, hedges)
  };
}

/**
 * 生成替代建议
 */
function generateSuggestions(vagueWords, fillers, hedges) {
  const suggestions = [];

  // 笼统词替代
  vagueWords.forEach(item => {
    suggestions.push({
      type: 'vague',
      original: item.word,
      alternatives: item.alternatives.slice(0, 3),
      message: `「${item.word}」→ 试试更精准的：${item.alternatives.slice(0, 3).join('、')}`
    });
  });

  // 填充词提醒
  if (fillers.length >= 3) {
    const topFillers = [...new Set(fillers.map(f => f.word))].slice(0, 3);
    suggestions.push({
      type: 'filler',
      message: `填充词偏多（${fillers.length}次）：${topFillers.join('、')}。试试用停顿替代`
    });
  }

  // 犹豫词提醒
  if (hedges.length >= 2) {
    suggestions.push({
      type: 'hedge',
      message: `犹豫表达较多（${hedges.length}次）。试试把「我觉得」改成直接陈述`
    });
  }

  return suggestions;
}

module.exports = { loadLexicon, analyzeText, countEffectiveWords, VAGUE_TO_PRECISE, FILLER_WORDS, HEDGE_WORDS };
