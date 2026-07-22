const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { initASR, feedAudio, stopRecognition, getAvailableModels, getDefaultModelId, resetASR } = require('./lib/asr');
const { initVolcanoASR, feedVolcanoAudio, stopVolcanoASR } = require('./lib/asr-volcano');
const { loadLexicon, analyzeText } = require('./lib/lexicon');
const { sendFeedback, sendReport, sendInterviewAnalysis, sendInterviewReport } = require('./lib/ai-feedback');
const feedbackPool = require('./lib/feedback-pool');

let mainWindow;
let settingsWindow;
let promptEditorWindow;
let asrReady = false;
let activeEngine = 'local'; // 'local' | 'volcano' — 本次录音使用的引擎

// Custom prompt 文件路径
function getCustomPromptPath() {
  return path.join(app.getPath('userData'), 'custom-prompt.json');
}

function loadCustomPrompt() {
  const p = getCustomPromptPath();
  if (fs.existsSync(p)) {
    try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch(e) { return null; }
  }
  return null;
}

function saveCustomPrompt(data) {
  fs.writeFileSync(getCustomPromptPath(), JSON.stringify(data, null, 2));
}

// 训练历史文件路径
function getHistoryPath() {
  return path.join(app.getPath('userData'), 'history.json');
}

const HISTORY_LIMIT = 200; // 最多保留的历史记录条数，防止文件无限增长

function loadHistory() {
  const p = getHistoryPath();
  if (fs.existsSync(p)) {
    try {
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.error('读取历史记录失败:', e);
      return [];
    }
  }
  return [];
}

function saveHistory(records) {
  fs.writeFileSync(getHistoryPath(), JSON.stringify(records, null, 2));
}

// 设置文件路径
function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings() {
  const settingsPath = getSettingsPath();
  const defaults = {
    provider: 'deepseek',
    apiKey: '',
    model: 'deepseek-chat',
    ollamaUrl: 'http://localhost:11434',
    customEndpoint: '',
    customModel: '',
    asrModel: getDefaultModelId(),
    asrEngine: 'local',        // 'local'(离线) | 'volcano'(火山云端流式)
    volcAppKey: '',
    volcAccessKey: '',
    volcResourceId: 'volc.bigasr.sauc.duration'
  };

  if (fs.existsSync(settingsPath)) {
    try {
      const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      return { ...defaults, ...saved };
    } catch (e) {
      console.error('读取设置文件失败，使用默认设置:', e);
    }
  }
  return defaults;
}

function saveSettings(settings) {
  const settingsPath = getSettingsPath();
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#000000',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.setFullScreenable(true);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createPromptEditorWindow(mode) {
  const targetMode = mode === 'interview' ? 'interview' : 'expression';

  if (promptEditorWindow) {
    // 复用已有窗口时，切到对应模式重新加载
    promptEditorWindow.loadFile(path.join(__dirname, 'src', 'prompt-editor.html'), { query: { mode: targetMode } });
    promptEditorWindow.focus();
    return;
  }

  promptEditorWindow = new BrowserWindow({
    width: 720,
    height: 700,
    resizable: true,
    backgroundColor: '#1a1a1a',
    titleBarStyle: 'hiddenInset',
    parent: mainWindow,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  promptEditorWindow.loadFile(path.join(__dirname, 'src', 'prompt-editor.html'), { query: { mode: targetMode } });

  promptEditorWindow.on('closed', () => {
    promptEditorWindow = null;
  });
}

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 600,
    height: 720,
    resizable: true,
    backgroundColor: '#1a1a1a',
    titleBarStyle: 'hiddenInset',
    parent: mainWindow,
    modal: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  settingsWindow.loadFile(path.join(__dirname, 'src', 'settings.html'));

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

// App lifecycle
app.whenReady().then(() => {
  // 加载词库
  loadLexicon();

  // 初始化反馈池存储目录（与 history.json 同级，放在 userData 下）
  feedbackPool.setAppDataDir(app.getPath('userData'));

  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers

// 设置相关
ipcMain.handle('get-settings', () => {
  return loadSettings();
});

ipcMain.handle('save-settings', (event, settings) => {
  saveSettings(settings);
  return { success: true };
});

ipcMain.handle('open-settings', () => {
  createSettingsWindow();
});

// Prompt编辑器相关
ipcMain.handle('open-prompt-editor', (event, mode) => {
  createPromptEditorWindow(mode);
});

ipcMain.handle('get-custom-prompt', () => {
  return loadCustomPrompt();
});

ipcMain.handle('save-custom-prompt', (event, data) => {
  saveCustomPrompt(data);
  return { success: true };
});

ipcMain.handle('close-current-window', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
});

// 语音识别相关 - Web Audio方案
ipcMain.handle('init-asr', async () => {
  try {
    const settings = loadSettings();
    activeEngine = settings.asrEngine === 'volcano' ? 'volcano' : 'local';

    if (activeEngine === 'volcano') {
      // 云端流式：结果通过 asr-result 事件异步推回渲染层
      await initVolcanoASR(settings, {
        onResult: (result) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('asr-result', result);
          }
        },
        onError: (err) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('asr-error', err);
          }
          console.error('[ASR-火山]', err.code || '', err.message);
        }
      });
    } else {
      await initASR(settings.asrModel);
    }
    asrReady = true;
    return { success: true, engine: activeEngine };
  } catch (error) {
    asrReady = false;
    return { success: false, error: error.message };
  }
});

// 获取可用的ASR模型列表
ipcMain.handle('get-asr-models', () => {
  return getAvailableModels();
});

// 重置ASR引擎（切换模型后调用）
ipcMain.handle('reset-asr', () => {
  resetASR();
  asrReady = false;
  return { success: true };
});

// 接收渲染进程发来的音频数据
ipcMain.handle('feed-audio', (event, samplesArray) => {
  if (!asrReady) return null;
  // Electron IPC 传输 typed array 时主进程侧可能收到普通对象或 Float32Array，
  // 统一转成 Float32Array；如果已经是 Float32Array 则直接用，避免拷贝
  const samples = samplesArray instanceof Float32Array
    ? samplesArray
    : new Float32Array(samplesArray);

  if (activeEngine === 'volcano') {
    // 云端：推送音频，结果走 asr-result 事件异步返回，这里不返回值
    feedVolcanoAudio(samples);
    return null;
  }

  const result = feedAudio(samples);
  return result; // { text, isFinal } or null
});

ipcMain.handle('stop-asr', () => {
  let finalText = '';
  if (activeEngine === 'volcano') {
    stopVolcanoASR();
  } else {
    finalText = stopRecognition();
  }
  asrReady = false;
  return { success: true, finalText };
});

// 词库分析
ipcMain.handle('analyze-text', (event, text) => {
  return analyzeText(text);
});

// Bad case 反馈池：记录误判 / 漏判
ipcMain.handle('feedback-submit', (event, entry) => {
  try {
    const item = feedbackPool.appendFeedback(entry);
    return { success: true, id: item.id };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// 反馈池：列表 / 统计 / 清空（供后续做 review 界面）
ipcMain.handle('feedback-list', (event, limit = 100) => {
  try {
    return { success: true, records: feedbackPool.listRecords(limit) };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('feedback-stats', () => {
  try {
    return { success: true, stats: feedbackPool.getStats() };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('feedback-clear', () => {
  try {
    feedbackPool.clearPool();
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// 面试文本分析
ipcMain.handle('analyze-interview-text', async (event, text) => {
  const settings = loadSettings();
  try {
    const result = await sendInterviewAnalysis(text, settings);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 面试脚本保存/加载
ipcMain.handle('save-interview-script', (event, data) => {
  const scriptPath = path.join(app.getPath('userData'), 'interview-script.json');
  try {
    fs.writeFileSync(scriptPath, JSON.stringify(data, null, 2));
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('load-interview-script', () => {
  const scriptPath = path.join(app.getPath('userData'), 'interview-script.json');
  if (fs.existsSync(scriptPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(scriptPath, 'utf-8'));
      return { success: true, data };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
  return { success: false, error: '未找到保存的面试脚本' };
});

// 训练历史相关
ipcMain.handle('save-history-record', (event, record) => {
  try {
    const records = loadHistory();
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      ...record
    };
    records.unshift(entry); // 最新的排最前
    if (records.length > HISTORY_LIMIT) records.length = HISTORY_LIMIT;
    saveHistory(records);
    return { success: true, id: entry.id };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('get-history', () => {
  return loadHistory();
});

ipcMain.handle('delete-history-record', (event, id) => {
  try {
    const records = loadHistory().filter(r => r.id !== id);
    saveHistory(records);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('clear-history', () => {
  try {
    saveHistory([]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// 文件保存
ipcMain.handle('save-file', async (event, content, filename) => {
  const { dialog } = require('electron');
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '保存报告',
    defaultPath: path.join(app.getPath('desktop'), filename),
    filters: [{ name: 'Markdown', extensions: ['md'] }]
  });

  if (!result.canceled && result.filePath) {
    fs.writeFileSync(result.filePath, content, 'utf-8');
    return { success: true, path: result.filePath };
  }
  return { success: false };
});

// AI反馈（传入customPrompt）
ipcMain.handle('get-realtime-feedback', async (event, payload) => {
  const settings = loadSettings();
  const customPrompt = loadCustomPrompt();
  const data = typeof payload === 'string' ? { text: payload } : (payload || {});
  try {
    const feedback = await sendFeedback(data.text || '', settings, customPrompt, {
      mode: data.mode,
      interviewContext: data.interviewContext
    });
    return { success: true, feedback };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-final-report', async (event, { fullText, stats, mode, interviewContext }) => {
  const settings = loadSettings();
  const customPrompt = loadCustomPrompt();
  try {
    // 面试模式走面试专用复盘报告，其余走通用表达报告
    const report = mode === 'interview'
      ? await sendInterviewReport(fullText, stats, interviewContext, settings, customPrompt)
      : await sendReport(fullText, stats, settings, customPrompt);
    return { success: true, report };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
