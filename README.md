# 🚀 说一句 - 表达训练系统

一个帮你训练口语表达精准度的本地桌面应用。实时语音识别 → 词库匹配 → AI反馈，全程离线+本地处理。

## 功能

- 🎤 **实时语音识别**：基于 Sherpa-ONNX，完全离线，中文优化
- 📝 **全屏字幕显示**：黑底大字，实时显示你说的每一句话
- 🔍 **词库分析**：自动检测填充词、犹豫词、笼统词，给出精准替代
- 🤖 **AI反馈**：支持 OpenAI / DeepSeek / Ollama / 自定义 OpenAI 兼容接口
- 📊 **分析报告**：多维度深度分析（总评/亮点/逐句编辑/用词精准度/行为模式/数据/下次重点）
- 🎤 **面试练习模式**：粘贴面试题目 → AI 识别题型并拆解要点 → 录音回答 → 面试官视角复盘报告
- ☁️ **双语音识别引擎**：本地离线（Sherpa-ONNX）或火山引擎云端流式，可在设置里切换
- 💾 **训练历史**：本地存档历次训练，支持成长趋势图与 Markdown 导出，历史项可一键「查看复盘」
- 🧠 **犹豫词语境判别**：「结果可能波动」「产品也许失败」这类客观陈述自动降级，不再误判为弱化表达
- 🐛 **误判反馈池**：每条 hedge/vague/filler 反馈都附「误判」按钮，一键写入本地反馈池，作为后续优化判别规则的数据基础

## 安装

### 1. 克隆项目 & 安装依赖

```bash
git clone https://github.com/Liliane0310/shuoyiju.git
cd shuoyiju
npm install
```

> **网络说明**：项目默认配置了国内 npm 镜像（`.npmrc`），安装 Electron 和原生模块更快。海外用户若偏好官方源，删除 `.npmrc` 即可。
>
> **环境要求**：Node.js 18+（推荐 20 LTS）。安装过程中会下载 Electron 二进制（约 100MB）和 sherpa-onnx 原生模块，请保持网络通畅。

### 2. 下载语音识别模型

需要下载 Sherpa-ONNX 的 streaming paraformer 中英双语模型（约 227MB）：

```bash
cd models

# 方法一：使用 wget
wget https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-paraformer-bilingual-zh-en.tar.bz2
tar xvf sherpa-onnx-streaming-paraformer-bilingual-zh-en.tar.bz2

# 方法二：使用 huggingface
# https://huggingface.co/csukuangfj/sherpa-onnx-streaming-paraformer-bilingual-zh-en
```

下载后 `models/` 目录应包含：
```
models/
└── sherpa-onnx-streaming-paraformer-bilingual-zh-en/
    ├── encoder.int8.onnx
    ├── decoder.int8.onnx
    └── tokens.txt
```

> 模型文件较大，已通过 `.gitignore` 排除，不会进入 git 仓库，需要手动下载。

### 3. 启动应用

```bash
npm start
```

### 4. 配置 AI 后端

启动后点击右上角 ⚙️ 进入设置页面。

推荐配置：

| 后端 | 费用 | 速度 | 获取方式 |
|------|------|------|----------|
| DeepSeek | 极低 | 快 | [platform.deepseek.com](https://platform.deepseek.com) |
| OpenAI | 中等 | 快 | [platform.openai.com](https://platform.openai.com) |
| Ollama | 免费 | 取决于硬件 | [ollama.com](https://ollama.com) 本地运行 |

**推荐 deepseek**：生成报告质量高，且成本极低。

## 使用说明

1. **点击「开始录制」** → 对着麦克风说话
2. **实时字幕**会在屏幕中央显示你说的内容
3. **左侧面板**实时统计填充词/犹豫词/笼统词
4. **右侧面板**每50字会给出AI实时反馈
5. **说完后点击「结束」** → 可以点「生成报告」获取完整分析

## 字幕颜色含义

| 颜色 | 含义 |
|------|------|
| 🔴 红色波浪下划线 | 填充词（嗯、啊、那个、然后…） |
| 🟠 橙色 | 犹豫词（可能、也许、我觉得…） |
| 🟡 黄色虚线 | 笼统词（有精准替代建议） |
| 🟢 绿色 | 有力表达（好句子！） |

> **关于犹豫词**：「结果可能波动」「产品也许失败」这类描述事物客观概率的句子，系统会自动识别为「客观陈述」并降级，不计入弱化表达。只有说话人在退缩、弱化自己主张时才会被标记。

## 误判反馈

左侧反馈列表里，每条 hedge / vague / filler 提示尾部都有「误判」按钮。点击后会把这条例子写入本地反馈池（`userData/feedback-pool.json`，上限 500 条），作为后续优化判别规则、训练 LLM 二次判别的数据基础。被降级为客观陈述的犹豫词也会单独出一条提示，同样可标记。

## 技术架构

```
┌─────────────────────────────────────────┐
│ Electron 主进程                          │
│  ├── Sherpa-ONNX (离线语音识别)          │
│  ├── 词库匹配 (emotion-lexicon.json)     │
│  └── AI反馈 (多后端 HTTP API)            │
├─────────────────────────────────────────┤
│ 渲染进程 (Chromium)                      │
│  ├── 全屏字幕显示                        │
│  ├── 实时统计面板                        │
│  └── 分析报告弹窗                        │
└─────────────────────────────────────────┘
```

## 词库说明

### 表达训练词库（`data/emotion-lexicon.json` + `data/tiered-lexicon.json`）

`emotion-lexicon.json` 基于大连理工情感词库7大类结构，包含：

- **130+ 情绪词**：分类（喜怒哀惧恶惊）+ 强度（1-9）
- **笼统词→精准词映射**：25组高频替代建议
- **填充词表**：24个常见口头禅
- **犹豫词表**：19个弱化表达
- **程度词梯度**：弱→中→强→极 四级
- **画面化描述**：10组「抽象→具象」转换
- **犹豫→直接转换**：8组对照示例

### 面试词库（`data/interview-lexicon.json`）

面试练习模式专用词库，由 `lib/lexicon.js` 加载使用，融合六类来源：

| 来源 | 说明 |
|------|------|
| Hedging 语言学 | Lakoff 1972 / Hyland 1998——模糊限制语降低能力感知 |
| Russell 情绪环形模型 | 效价(valence) × 唤醒度(arousal) 四象限 |
| Fiske 刻板印象内容模型 | warmth × competence 两维度印象形成 |
| STAR 法则 / 行为面试法 BBI | 过去行为预测未来行为 |
| 《终极面试问答》琳恩·威廉斯 | 面试官三大基本问题、六大核心特质 |
| 《500强企业面试题与面试流程全记录》鲁克德 | 16家500强选人标准、经典面试题 |

包含 15 个分类：`confidenceMap`（弱化词→自信替代）、`emotionCircumplex`、`impressionDimensions`、`professionalVerbs`、`structureHints`、`weakWords` / `positiveWords` / `lowValueWords` / `powerWords`、`quantifierHints`、`interviewFramework`、`jobCategoryFocus`、`interviewQuestionTypes`、`fortune500Standards`、`interviewMethods`。

### 面试知识库（`data/interview-knowledge-base.json`）

上述两本面试书的结构化提炼，作为面试模块生成分析框架和报告模板时的知识背景素材，包含面试官三大基本问题、六大核心特质、岗位分类面试法、500强选人标准与黄金忠告等。

## 开发

```bash
# 开发模式（带DevTools）
npm run dev

# 运行核心逻辑测试（词库分析 / Prompt 构造 / 历史趋势渲染）
npm test
```

# 目录结构
├── main.js              # Electron主进程
├── preload.js           # preload脚本
├── start.js             # 启动器（清除 ELECTRON_RUN_AS_NODE 后拉起 Electron）
├── src/
│   ├── index.html       # 主界面
│   ├── settings.html    # 设置页
│   ├── prompt-editor.html # 训练规则定制页
│   ├── lexicon-playground.html # 词库调试页
│   ├── styles.css       # 样式
│   ├── app.js           # 前端逻辑
│   └── settings.js      # 设置逻辑
├── lib/
│   ├── asr.js           # 本地语音识别（Sherpa-ONNX）
│   ├── asr-volcano.js   # 火山引擎云端流式识别
│   ├── lexicon.js       # 词库匹配 + 犹豫词语境判别
│   ├── ai-feedback.js   # AI反馈（多后端）
│   ├── feedback-pool.js # 误判反馈池（本地存档，供后续优化）
│   └── prompts.js       # Prompt模板
├── data/
│   ├── emotion-lexicon.json
│   ├── interview-lexicon.json
│   ├── interview-knowledge-base.json
│   └── tiered-lexicon.json
├── test/
│   └── core.test.js     # 核心逻辑测试
├── models/              # Sherpa-ONNX模型（需下载，已 gitignore）
└── settings.example.json # 设置示例（真实 settings.json 含 API Key，已 gitignore）
```

## 系统要求

- macOS 12+ / Windows 10+ / Linux
- Node.js 18+
- 麦克风权限
- （可选）网络连接（用于AI反馈，词库分析可离线）

## License

MIT

## 更新日志

详见 [CHANGELOG.md](./CHANGELOG.md)。
