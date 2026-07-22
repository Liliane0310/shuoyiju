const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const { loadLexicon, analyzeText, countEffectiveWords } = require('../lib/lexicon');
const { getRealtimePrompt, getInterviewReportPrompt } = require('../lib/prompts');

const indexHtml = fs.readFileSync(require.resolve('../src/index.html'), 'utf8');
['interview-textarea', 'btn-repeat-interview', 'btn-new-interview', 'stat-weak-rate']
  .forEach(id => assert(indexHtml.includes(`id="${id}"`), `界面缺少元素：${id}`));

loadLexicon();

assert.strictEqual(countEffectiveWords('你好， world 123！'), 4, '有效字数应忽略标点和空白');
const textAnalysis = analyzeText('我觉得，可能行。');
assert.strictEqual(textAnalysis.totalWords, 6, '总字数不应依赖词库分词结果');
assert.strictEqual(textAnalysis.hedges.length, 2, '犹豫词仍应正常识别');

const interviewContext = {
  question: '请解释一下事件循环的原理',
  sourceText: '准备素材',
  analysis: {
    type: '技术问题',
    points: [{ heading: '结论' }, { heading: '原理' }]
  }
};
const realtime = getRealtimePrompt('事件循环主要负责协调任务执行', {
  mode: 'interview',
  interviewContext
}, {});
assert(realtime.user.includes('本次练习内容'), '实时反馈应携带本次练习内容');
assert(realtime.user.includes('准备要点: 结论、原理'), '实时反馈应只携带精简准备要点');
assert(!realtime.user.includes('准备素材'), '实时反馈不应发送完整准备稿');

const pastedStats = {
  duration: 0,
  timingAvailable: false,
  totalWords: 100,
  fillers: 2,
  hedges: 3,
  vagueWords: 1,
  weakRate: 3,
  positiveWords: 2,
  weakWords: 3
};
const report = getInterviewReportPrompt('回答文本', pastedStats, interviewContext, {});
assert(report.system.includes('结论—原理—方案—权衡—边界'), '技术题应使用技术问题结构');
assert(report.system.includes('| 语速 | 未采集 |'), '粘贴文本不应推测语速');
assert(report.user.includes('每分钟频率未采集'), '用户数据应标记时长不可用');

const timedReport = getInterviewReportPrompt('回答文本', {
  ...pastedStats,
  duration: 60,
  timingAvailable: true,
  totalWords: 120
}, interviewContext, {});
assert(timedReport.user.includes('语速120字/分钟'), '语速应由程序预先计算');
assert(timedReport.user.includes('填充词2次/分钟'), '每分钟频率应由程序预先计算');

const customReport = getInterviewReportPrompt('回答文本', pastedStats, interviewContext, {
  interviewReportPrompt: '我的自定义报告规则'
});
assert(customReport.system.includes('本题诊断基准'), '完整自定义 Prompt 仍应保留题型诊断基准');

let appCode = fs.readFileSync(require.resolve('../src/app.js'), 'utf8');
appCode = appCode.replace(
  "document.addEventListener('DOMContentLoaded', () => { new ExpressionTrainer(); });",
  'globalThis.ExpressionTrainer = ExpressionTrainer;'
);
const sandbox = { document: { addEventListener() {} } };
vm.runInNewContext(appCode, sandbox);
const trainer = Object.create(sandbox.ExpressionTrainer.prototype);

assert.strictEqual(
  trainer.countLongestMatches('从容自信，也很从容。', ['从容', '从容自信']),
  2,
  '长词与短词不应重复计数'
);

trainer.historyTrend = { innerHTML: '' };
const mixedRecords = [
  { mode: 'expression', stats: { totalWords: 100, fillers: 1, hedges: 1, duration: 60, timingAvailable: true } },
  { mode: 'interview', stats: { totalWords: 100, fillers: 1, hedges: 1, weakWords: 2, weakRate: 2, duration: 60, timingAvailable: true } }
];
trainer.historyFilter = 'all';
trainer.renderTrend(mixedRecords);
assert(!trainer.historyTrend.innerHTML.includes('弱化表达率%'), '混合趋势不应把表达训练记为零弱化率');
trainer.historyFilter = 'interview';
trainer.renderTrend(mixedRecords.filter(record => record.mode === 'interview').concat({
  mode: 'interview',
  stats: { totalWords: 100, fillers: 1, hedges: 1, weakWords: 1, weakRate: 1, duration: 60, timingAvailable: true }
}));
assert(trainer.historyTrend.innerHTML.includes('弱化表达率%'), '面试趋势应显示弱化表达率');

console.log('core tests: ok');
