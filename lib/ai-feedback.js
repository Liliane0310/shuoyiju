/**
 * AI反馈模块 - 支持多后端
 * 支持 DeepSeek / OpenAI / Ollama / 自定义 OpenAI 兼容接口
 */

const { getRealtimePrompt, getReportPrompt, getInterviewAnalysisPrompt, getInterviewReportPrompt } = require('./prompts');

// 各后端的 API 配置
const PROVIDER_ENDPOINTS = {
  openai: 'https://api.openai.com/v1/chat/completions',
  deepseek: 'https://api.deepseek.com/v1/chat/completions'
};

/**
 * 发送请求到 OpenAI 兼容接口
 */
async function callAPI(endpoint, apiKey, model, messages, maxTokens = 200) {
  validateAPIConfig(endpoint, apiKey, model);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature: 0.7
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API 请求失败 (${response.status}): ${error}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

function validateAPIConfig(endpoint, apiKey, model) {
  if (!endpoint) {
    throw new Error('AI 接口地址为空，请到设置里选择后端或填写自定义接口地址');
  }
  if (!model) {
    throw new Error('AI 模型为空，请到设置里选择或填写模型名称');
  }
  if (!apiKey) {
    throw new Error('API Key 为空，请到设置里填写真实的 API Key；不想用云端模型可切换到 Ollama');
  }
  if (apiKey === 'your-api-key-here' || /[^\x00-\x7F]/.test(apiKey)) {
    throw new Error('API Key 看起来不是有效密钥，请删除中文占位文字并填写真实 API Key；不想用云端模型可切换到 Ollama');
  }
}

function toChatCompletionsEndpoint(endpoint) {
  const value = String(endpoint || '').trim().replace(/\/+$/, '');
  if (!value) return value;
  if (/\/chat\/completions$/i.test(value)) return value;
  if (/\/responses$/i.test(value)) {
    throw new Error('当前应用使用 Chat Completions 协议；自定义 Endpoint 请填写 OpenAI 兼容 Base URL（如 https://.../v2）或完整 /chat/completions 地址');
  }
  if (/\/v\d+$/i.test(value)) return `${value}/chat/completions`;
  return value;
}

/**
 * 获取endpoint和配置
 */
function getProviderConfig(settings) {
  const { provider, apiKey, model, ollamaUrl, customEndpoint, customModel } = settings;

  switch (provider) {
    case 'deepseek':
      return {
        endpoint: PROVIDER_ENDPOINTS.deepseek,
        apiKey,
        model: model || 'deepseek-chat'
      };
    case 'openai':
      return {
        endpoint: PROVIDER_ENDPOINTS.openai,
        apiKey,
        model: model || 'gpt-4o-mini'
      };
    case 'ollama':
      return {
        endpoint: `${(ollamaUrl || 'http://localhost:11434').replace(/\/+$/, '')}/v1/chat/completions`,
        apiKey: 'ollama', // Ollama 不需要真实key但接口需要这个字段
        model: model || 'qwen2.5:7b'
      };
    case 'custom':
      return {
        endpoint: toChatCompletionsEndpoint(customEndpoint),
        apiKey,
        model: customModel || model
      };
    default:
      throw new Error(`未知的 provider: ${provider}`);
  }
}

/**
 * 发送实时反馈请求
 * @param {string} text - 当前累积文本
 * @param {Object} settings - 用户设置
 * @returns {string} 反馈HTML
 */
async function sendFeedback(text, settings, customPrompt, context) {
  const config = getProviderConfig(settings);
  const prompt = getRealtimePrompt(text, context, customPrompt);

  const messages = [
    { role: 'system', content: prompt.system },
    { role: 'user', content: prompt.user }
  ];

  const result = await callAPI(config.endpoint, config.apiKey, config.model, messages, 150);
  return result;
}

/**
 * 发送结束报告请求
 * @param {string} fullText - 完整文本
 * @param {Object} stats - 统计数据
 * @param {Object} settings - 用户设置
 * @returns {string} 报告文本
 */
async function sendReport(fullText, stats, settings, customPrompt) {
  const config = getProviderConfig(settings);
  const prompt = getReportPrompt(fullText, stats, customPrompt);

  const messages = [
    { role: 'system', content: prompt.system },
    { role: 'user', content: prompt.user }
  ];

  const result = await callAPI(config.endpoint, config.apiKey, config.model, messages, 8192);
  return result;
}

/**
 * 发送面试复盘报告请求（面试模式录音后专用）
 * @param {string} fullText - 面试回答完整文本
 * @param {Object} stats - 统计数据
 * @param {Object} interviewContext - 原始问题、准备素材和题型分析
 * @param {Object} settings - 用户设置
 * @param {Object} customPrompt - 用户自定义（含面试复盘覆盖）
 * @returns {string} 报告文本
 */
async function sendInterviewReport(fullText, stats, interviewContext, settings, customPrompt) {
  const config = getProviderConfig(settings);
  const prompt = getInterviewReportPrompt(fullText, stats, interviewContext, customPrompt);

  const messages = [
    { role: 'system', content: prompt.system },
    { role: 'user', content: prompt.user }
  ];

  const result = await callAPI(config.endpoint, config.apiKey, config.model, messages, 8192);
  return result;
}

/**
 * 发送面试文本分析请求
 * @param {Object} interviewContext - 分开的原始问题和准备素材
 * @param {Object} settings - 用户设置
 * @returns {Object} 分析结果
 */
async function sendInterviewAnalysis(interviewContext, settings) {
  const context = typeof interviewContext === 'string'
    ? { question: interviewContext, sourceText: '' }
    : (interviewContext || {});
  let result = '';
  try {
    const config = getProviderConfig(settings);
    const prompt = getInterviewAnalysisPrompt(context);

    const messages = [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user }
    ];

    result = await callAPI(config.endpoint, config.apiKey, config.model, messages, 1500);
  } catch (e) {
    console.warn('[面试分析] AI 请求失败，使用本地兜底:', e.message);
    const fallbackData = generateFallbackAnalysis(context);
    fallbackData.notice = e.message;
    return { success: true, data: fallbackData };
  }

  // 尝试解析JSON
  try {
    // 清理可能的markdown代码块
    let cleanResult = result.trim();
    if (cleanResult.startsWith('```json')) {
      cleanResult = cleanResult.replace(/^```json\s*/, '').replace(/\s*```\s*$/, '');
    } else if (cleanResult.startsWith('```')) {
      cleanResult = cleanResult.replace(/^```\s*/, '').replace(/\s*```\s*$/, '');
    }

    const data = JSON.parse(cleanResult);

    // 验证数据结构
    if (!data.type || !data.points || !Array.isArray(data.points)) {
      throw new Error('LLM返回的数据结构不完整');
    }

    return { success: true, data };
  } catch (e) {
    // 如果JSON解析失败，使用本地兜底方案
    console.warn('[面试分析] LLM返回格式错误，使用本地兜底:', e.message);
    const fallbackData = generateFallbackAnalysis(context);
    return { success: true, data: fallbackData };
  }
}

/**
 * 本地兜底分析方案
 * 当LLM返回格式错误时使用
 */
function generateFallbackAnalysis(interviewContext) {
  const context = typeof interviewContext === 'string'
    ? { question: interviewContext, sourceText: '' }
    : (interviewContext || {});
  const question = context.question || '';
  const text = [question, context.sourceText].filter(Boolean).join('\n');
  const typeRules = [
    ['反问环节', /你有什么(问题|想问)|反问|想了解我们/],
    ['压力质疑', /经验不够|没什么难度|凭什么|频繁跳槽|质疑|不适合/],
    ['职业规划', /职业规划|未来[三3五5]|长期目标|发展方向/],
    ['动机意向', /为什么.*(公司|岗位|行业)|选择.*(公司|岗位)|求职动机|加入我们/],
    ['自我介绍', /自我介绍|介绍一下(你自己|自己)|简单介绍/],
    ['情感态度', /优点|缺点|离职原因|失败|冲突|价值观|怎么看待/],
    ['情景题', /如果|假设|遇到.*(怎么办|如何)|你会怎么/],
    ['技术问题', /原理|架构|技术|如何实现|怎么优化|有什么区别|性能|算法/],
    ['行为问题', /举个例子|讲一次|有没有.*经历|如何处理过/],
    ['项目经历', /项目|经历|负责|成果/]
  ];
  const detected = typeRules.find(([, pattern]) => pattern.test(question));
  const type = detected ? detected[0] : '未识别';
  // 按句子分割
  const sentences = text.split(/(?<=[。！？\n])/g).filter(s => s.trim());

  // 提取前5句作为要点
  const points = sentences.slice(0, 5).map((sentence, idx) => {
    const headings = ['背景', '任务', '行动', '成果', '总结'];
    return {
      heading: headings[idx] || `要点${idx + 1}`,
      content: sentence.trim().slice(0, 50) + (sentence.length > 50 ? '...' : ''),
      keywords: [],
      emotion: '从容自信'
    };
  });

  return {
    type,
    title: '面试文本',
    structure: 'none',
    emotionScore: 5,
    points
  };
}

module.exports = { sendFeedback, sendReport, sendInterviewAnalysis, sendInterviewReport };
