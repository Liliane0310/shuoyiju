const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // 设置
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  openSettings: () => ipcRenderer.invoke('open-settings'),

  // Prompt编辑器
  openPromptEditor: (mode) => ipcRenderer.invoke('open-prompt-editor', mode),
  getCustomPrompt: () => ipcRenderer.invoke('get-custom-prompt'),
  saveCustomPrompt: (data) => ipcRenderer.invoke('save-custom-prompt', data),
  closeWindow: () => ipcRenderer.invoke('close-current-window'),

  // 语音识别 - 使用 Web Audio 方案
  initASR: () => ipcRenderer.invoke('init-asr'),
  feedAudio: (samples) => ipcRenderer.invoke('feed-audio', samples),
  stopASR: () => ipcRenderer.invoke('stop-asr'),
  getAsrModels: () => ipcRenderer.invoke('get-asr-models'),
  resetASR: () => ipcRenderer.invoke('reset-asr'),
  onASRResult: (callback) => {
    ipcRenderer.on('asr-result', (event, data) => callback(data));
  },
  onASRError: (callback) => {
    ipcRenderer.on('asr-error', (event, data) => callback(data));
  },
  removeASRListener: () => {
    ipcRenderer.removeAllListeners('asr-result');
    ipcRenderer.removeAllListeners('asr-error');
  },

  // 词库分析
  analyzeText: (text) => ipcRenderer.invoke('analyze-text', text),

  // Bad case 反馈池
  submitFeedback: (entry) => ipcRenderer.invoke('feedback-submit', entry),
  listFeedback: (limit) => ipcRenderer.invoke('feedback-list', limit),
  getFeedbackStats: () => ipcRenderer.invoke('feedback-stats'),
  clearFeedback: () => ipcRenderer.invoke('feedback-clear'),

  // 面试分析
  analyzeInterviewText: (text) => ipcRenderer.invoke('analyze-interview-text', text),
  saveInterviewScript: (data) => ipcRenderer.invoke('save-interview-script', data),
  loadInterviewScript: () => ipcRenderer.invoke('load-interview-script'),
  getRealtimeFeedback: (data) => ipcRenderer.invoke('get-realtime-feedback', data),
  getFinalReport: (data) => ipcRenderer.invoke('get-final-report', data),

  // 文件保存
  saveFile: (content, filename) => ipcRenderer.invoke('save-file', content, filename),

  // 训练历史
  saveHistoryRecord: (record) => ipcRenderer.invoke('save-history-record', record),
  getHistory: () => ipcRenderer.invoke('get-history'),
  deleteHistoryRecord: (id) => ipcRenderer.invoke('delete-history-record', id),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
});
