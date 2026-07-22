// 说一句 - 表达训练系统

class ExpressionTrainer {
  constructor() {
    this.isRecording = false;
    this.isPaused = false;
    this.startTime = null;
    this.pausedTime = 0;
    this.pauseStart = null;
    this.timerInterval = null;
    this.fullText = '';
    this.sentences = [];
    this.stats = {
      fillers: 0,
      hedges: 0,
      vagueWords: 0,
      totalWords: 0,
      duration: 0,
      timingAvailable: false,
      weakRate: null,
      positiveWords: 0,
      weakWords: 0
    };
    this.lastFeedbackText = '';
    this.lastReport = '';
    this.feedbackInFlight = false;       // 实时反馈是否在请求中，防止并发
    this.feedbackErrorCount = 0;         // 连续失败次数，用于退避
    this.feedbackEpoch = 0;              // 实时反馈代际：录音开始/清空时 +1，使在飞请求回调失效
    this.mode = 'expression'; // 'expression' | 'interview'
    this.interviewScript = null;
    this.interviewQuestion = '';
    this.interviewSourceText = '';
    this.cardsCollapsed = false;

    this.initElements();
    this.bindEvents();
  }

  initElements() {
    this.btnStart = document.getElementById('btn-start');
    this.btnPaste = document.getElementById('btn-paste');
    this.btnPause = document.getElementById('btn-pause');
    this.btnResume = document.getElementById('btn-resume');
    this.btnStop = document.getElementById('btn-stop');
    this.btnReport = document.getElementById('btn-report');
    this.btnSettings = document.getElementById('btn-settings');
    this.btnCloseReport = document.getElementById('btn-close-report');
    this.btnClosePaste = document.getElementById('btn-close-paste');
    this.btnAnalyzePaste = document.getElementById('btn-analyze-paste');
    this.btnCopyText = document.getElementById('btn-copy-text');
    this.btnSaveText = document.getElementById('btn-save-text');
    this.btnClear = document.getElementById('btn-clear');
    this.btnCopyReport = document.getElementById('btn-copy-report');
    this.pasteModal = document.getElementById('paste-modal');
    this.pasteTextarea = document.getElementById('paste-textarea');
    this.timer = document.getElementById('timer');
    this.subtitleScroll = document.getElementById('subtitle-scroll');
    this.subtitleContainer = document.getElementById('subtitle-container');
    this.feedbackContent = document.getElementById('feedback-content');
    this.reportModal = document.getElementById('report-modal');
    this.reportBody = document.getElementById('report-body');
    this.statFillers = document.getElementById('stat-fillers');
    this.statHedges = document.getElementById('stat-hedges');
    this.statVague = document.getElementById('stat-vague');
    this.statDensity = document.getElementById('stat-density');

    // 面试模式元素
    this.btnModeExpression = document.getElementById('btn-mode-expression');
    this.btnModeInterview = document.getElementById('btn-mode-interview');
    this.expressionPanel = document.getElementById('expression-panel');
    this.interviewPanel = document.getElementById('interview-panel');
    this.interviewTextarea = document.getElementById('interview-textarea');
    this.btnAnalyzeInterview = document.getElementById('btn-analyze-interview');
    this.btnEditScript = document.getElementById('btn-edit-script');
    this.btnRepeatInterview = document.getElementById('btn-repeat-interview');
    this.btnNewInterview = document.getElementById('btn-new-interview');
    this.interviewCards = document.getElementById('interview-cards');
    this.interviewInputSection = document.getElementById('interview-input-section');
    this.cardsContainer = document.getElementById('cards-container');
    this.interviewQuestionDisplay = document.getElementById('interview-question-display');
    this.interviewQuestionText = document.getElementById('interview-question-text');
    this.btnToggleCards = document.getElementById('btn-toggle-cards');
    this.interviewContent = document.getElementById('interview-content');
    this.statWeakRate = document.getElementById('stat-weak-rate');
    this.statPositive = document.getElementById('stat-positive');
    this.statWeak = document.getElementById('stat-weak');

    // 训练历史元素
    this.btnHistory = document.getElementById('btn-history');
    this.historyModal = document.getElementById('history-modal');
    this.btnCloseHistory = document.getElementById('btn-close-history');
    this.btnClearHistory = document.getElementById('btn-clear-history');
    this.historyTrend = document.getElementById('history-trend');
    this.historyList = document.getElementById('history-list');
    this.historyFilter = 'all'; // 'all' | 'expression' | 'interview'
  }

  bindEvents() {
    this.btnStart.addEventListener('click', () => this.startRecording());
    this.btnPaste.addEventListener('click', () => this.openPasteModal());
    this.btnPause.addEventListener('click', () => this.pauseRecording());
    this.btnResume.addEventListener('click', () => this.resumeRecording());
    this.btnStop.addEventListener('click', () => this.stopRecording());
    this.btnReport.addEventListener('click', () => this.generateReport());
    this.btnSettings.addEventListener('click', () => window.api.openSettings());
    document.getElementById('btn-prompt-editor').addEventListener('click', () => window.api.openPromptEditor(this.mode));
    this.btnCloseReport.addEventListener('click', () => this.closeReport());
    this.btnCopyReport.addEventListener('click', () => {
      const reportText = this.reportBody.innerText;
      const copyIcon = '<svg class="ic" width="13" height="13" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
      const checkIcon = '<svg class="ic" width="13" height="13" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>';
      navigator.clipboard.writeText(reportText).then(() => {
        this.btnCopyReport.innerHTML = checkIcon + ' 已复制';
        setTimeout(() => { this.btnCopyReport.innerHTML = copyIcon + ' 复制全文'; }, 2000);
      });
    });
    this.btnClosePaste.addEventListener('click', () => this.pasteModal.classList.add('hidden'));
    this.btnAnalyzePaste.addEventListener('click', () => this.analyzePastedText());
    this.btnCopyText.addEventListener('click', () => this.copyOriginalText());
    this.btnSaveText.addEventListener('click', () => this.saveOriginalText());
    this.btnClear.addEventListener('click', () => this.clearAll());

    // 面试模式事件
    if (this.btnModeExpression) {
      this.btnModeExpression.addEventListener('click', () => this.switchMode('expression'));
    }
    if (this.btnModeInterview) {
      this.btnModeInterview.addEventListener('click', () => this.switchMode('interview'));
    }
    if (this.btnAnalyzeInterview) {
      this.btnAnalyzeInterview.addEventListener('click', () => this.analyzeInterviewText());
    }
    if (this.btnEditScript) {
      this.btnEditScript.addEventListener('click', () => this.editInterviewText());
    }
    if (this.btnToggleCards) {
      this.btnToggleCards.addEventListener('click', () => this.toggleCards());
    }
    if (this.btnRepeatInterview) {
      this.btnRepeatInterview.addEventListener('click', () => this.repeatInterviewQuestion());
    }
    if (this.btnNewInterview) {
      this.btnNewInterview.addEventListener('click', () => this.startNewInterviewQuestion());
    }

    // 空格键：录音中切换 暂停/继续
    document.addEventListener('keydown', (e) => this.handleShortcut(e));

    // 训练历史
    if (this.btnHistory) {
      this.btnHistory.addEventListener('click', () => this.openHistory());
    }
    if (this.btnCloseHistory) {
      this.btnCloseHistory.addEventListener('click', () => this.historyModal.classList.add('hidden'));
    }
    if (this.btnClearHistory) {
      this.btnClearHistory.addEventListener('click', () => this.clearHistory());
    }
    document.querySelectorAll('.history-filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.history-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.historyFilter = btn.dataset.filter;
        this.renderHistory();
      });
    });
  }

  handleShortcut(e) {
    if (e.code !== 'Space' && e.key !== ' ') return;
    // 长按连发时只响应第一次
    if (e.repeat) return;

    // 正在文本框/可编辑区域里打字时，空格应正常输入，不触发快捷键
    const el = e.target;
    const tag = el && el.tagName ? el.tagName.toUpperCase() : '';
    if (tag === 'TEXTAREA' || tag === 'INPUT' || (el && el.isContentEditable)) return;

    // 只在录音进行中生效；没在录音时空格不做任何事
    if (!this.isRecording) return;

    e.preventDefault(); // 阻止空格滚动页面 / 触发聚焦按钮
    if (this.isPaused) {
      this.resumeRecording();
    } else {
      this.pauseRecording();
    }
  }

  // ===== 录制控制 =====

  async startRecording() {
    const initResult = await window.api.initASR();
    if (!initResult.success) {
      this.showError(`语音识别启动失败: ${initResult.error}`);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioContext = new AudioContext({ sampleRate: 16000 });
      const source = this.audioContext.createMediaStreamSource(stream);
      this.audioProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
      // 云端引擎结果异步走 asr-result 事件；本地引擎走 feedAudio 返回值
      window.api.onASRResult((result) => {
        if (result) this.handleASRResult(result);
      });
      if (window.api.onASRError) {
        window.api.onASRError((err) => {
          this.showError(`云端识别错误: ${err.message || ''}`);
        });
      }

      this.audioProcessor.onaudioprocess = async (e) => {
        if (!this.isRecording || this.isPaused) return;
        const samples = e.inputBuffer.getChannelData(0);
        const result = await window.api.feedAudio(samples);
        if (result) this.handleASRResult(result); // 本地引擎的同步结果
      };
      source.connect(this.audioProcessor);
      this.audioProcessor.connect(this.audioContext.destination);
      this.mediaStream = stream;
    } catch (err) {
      await window.api.stopASR();
      this.showError(`麦克风访问失败: ${err.message}`);
      return;
    }

    this.isRecording = true;
    this.isPaused = false;
    this._stopping = false;
    this.startTime = Date.now();
    this.pausedTime = 0;
    this.fullText = '';
    this.sentences = [];
    this.feedbackInFlight = false;
    this.feedbackErrorCount = 0;
    this.feedbackEpoch += 1; // 让上一轮残留的在飞请求回调失效
    this._lastInterim = '';
    this.resetStats();
    this.stats.timingAvailable = true;
    this.subtitleContainer.innerHTML = '';

    // UI
    this.btnStart.classList.add('hidden');
    this.btnPause.classList.remove('hidden');
    this.btnStop.classList.remove('hidden');
    this.btnReport.classList.add('hidden');
    this.btnResume.classList.add('hidden');
    this.timer.classList.add('active');

    // 首次录制提示空格暂停快捷键（只弹一次）
    if (!this._hintedSpace) {
      this._hintedSpace = true;
      this.addFeedbackItem('按空格可暂停/继续', 'ai');
    }

    this.timerInterval = setInterval(() => this.updateTimer(), 1000);
  }

  pauseRecording() {
    this.isPaused = true;
    this.pauseStart = Date.now();
    this.btnPause.classList.add('hidden');
    this.btnResume.classList.remove('hidden');
    this.timer.classList.remove('active');
  }

  resumeRecording() {
    this.isPaused = false;
    this.pausedTime += Date.now() - this.pauseStart;
    this.pauseStart = null;
    this.btnResume.classList.add('hidden');
    this.btnPause.classList.remove('hidden');
    this.timer.classList.add('active');
  }

  async stopRecording() {
    // 防重入：按钮 disabled 只能挡鼠标点击，空格键快捷键会绕过。
    // 用 _stopping 标志锁住整个异步流程，避免 audioContext.close() 被调两次。
    if (this._stopping || !this.isRecording) return;
    this._stopping = true;

    if (this.audioProcessor) { this.audioProcessor.disconnect(); this.audioProcessor = null; }
    if (this.audioContext) { this.audioContext.close(); this.audioContext = null; }
    if (this.mediaStream) { this.mediaStream.getTracks().forEach(t => t.stop()); this.mediaStream = null; }
    // 停止期间禁用按钮，避免重复点击
    this.btnStop.disabled = true;
    const stopLabel = this.btnStop.querySelector('.btn-label');
    const origStopText = stopLabel ? stopLabel.textContent : '结束';
    if (stopLabel) stopLabel.textContent = '收尾中…';
    // 先停止 ASR：火山云端引擎会在此补发最后一段未确定的文本(isFinal)，
    // 必须保留监听器让它进入 fullText，否则连贯说话时结尾整段会丢失，
    // 导致停止后 fullText 为空、清空/报告等按钮不显示。
    await window.api.stopASR();
    // 给补发的 asr-result 事件一点时间被 handleASRResult 处理完
    await new Promise(resolve => setTimeout(resolve, 60));
    if (window.api.removeASRListener) window.api.removeASRListener();
    this.isRecording = false;
    this.isPaused = false;
    // 结束录音：让在飞的实时反馈请求回调失效，避免结束后旧请求又往反馈栏加内容
    this.feedbackEpoch += 1;
    this.feedbackInFlight = false;

    clearInterval(this.timerInterval);
    let totalPaused = this.pausedTime;
    if (this.pauseStart) totalPaused += Date.now() - this.pauseStart;
    this.stats.duration = Math.floor((Date.now() - this.startTime - totalPaused) / 1000);

    // UI：显示生成报告按钮，可翻阅字幕
    this.btnStop.classList.add('hidden');
    this.btnStop.disabled = false;
    if (stopLabel) stopLabel.textContent = origStopText;
    this.btnPause.classList.add('hidden');
    this.btnResume.classList.add('hidden');
    this.btnStart.classList.remove('hidden');
    this.timer.classList.remove('active');

    if (this.fullText.trim()) {
      this.btnReport.classList.remove('hidden');
      this.btnCopyText.classList.remove('hidden');
      this.btnSaveText.classList.remove('hidden');
      this.btnClear.classList.remove('hidden');
    }
  }

  // ===== 面试模式逻辑 =====

  switchMode(mode) {
    if (this.isRecording) {
      this.showError('请先停止录制再切换模式');
      return;
    }
    this.mode = mode;

    // 切换面板显示
    if (this.expressionPanel && this.interviewPanel) {
      this.expressionPanel.classList.toggle('hidden', mode !== 'expression');
      this.interviewPanel.classList.toggle('hidden', mode !== 'interview');
    }

    // 更新按钮状态
    if (this.btnModeExpression && this.btnModeInterview) {
      this.btnModeExpression.classList.toggle('active', mode === 'expression');
      this.btnModeInterview.classList.toggle('active', mode === 'interview');
    }

    // 更新标题
    const titleEl = document.querySelector('.app-title');
    if (titleEl) {
      titleEl.textContent = mode === 'interview' ? '面试表达练习' : '说一句';
    }
  }

  toggleCards() {
    this.cardsCollapsed = !this.cardsCollapsed;
    if (this.interviewContent) {
      this.interviewContent.classList.toggle('collapsed', this.cardsCollapsed);
    }
    if (this.btnToggleCards) {
      this.btnToggleCards.classList.toggle('rotated', this.cardsCollapsed);
    }
  }

  async analyzeInterviewText() {
    if (!this.interviewTextarea) return;

    const question = this.interviewTextarea.value.trim();
    const sourceText = '';
    if (!question) {
      this.showError('请先粘贴面试题目、自我介绍或项目经历');
      return;
    }

    this.btnAnalyzeInterview.textContent = '分析中...';
    this.btnAnalyzeInterview.disabled = true;
    this.interviewQuestion = question;
    this.interviewSourceText = sourceText;

    try {
      const result = await window.api.analyzeInterviewText({ question, sourceText });
      if (result.success) {
        this.interviewScript = result.data;
        window.api.saveInterviewScript(this.getInterviewContext()).catch(() => {});
        this.renderInterviewCards(result.data);
        this.interviewInputSection.classList.add('hidden');
        this.interviewCards.classList.remove('hidden');
        this.cardsCollapsed = false;
        if (this.interviewContent) {
          this.interviewContent.classList.remove('collapsed');
        }
        if (this.btnToggleCards) this.btnToggleCards.classList.remove('rotated');
      } else {
        this.showError('分析失败: ' + (result.error || '未知错误'));
      }
    } catch (e) {
      this.showError('分析出错: ' + e.message);
    } finally {
      this.btnAnalyzeInterview.textContent = '分析文本';
      this.btnAnalyzeInterview.disabled = false;
    }
  }

  renderInterviewCards(data) {
    if (!data || !data.points) return;

    const typeEl = document.getElementById('interview-type');
    if (typeEl) {
      typeEl.textContent = `题型：${data.type || '面试文本'}`;
    }

    // 在卡片之前常驻展示本次面试问题，避免被卡片"吞掉"导致用户录音时忘记题干
    if (this.interviewQuestionText) {
      this.interviewQuestionText.textContent = this.interviewQuestion || '';
    }
    if (this.interviewQuestionDisplay) {
      this.interviewQuestionDisplay.classList.toggle('hidden', !this.interviewQuestion);
    }

    if (this.cardsContainer) {
      const notice = data.notice
        ? `<div class="feedback-item type-hedge" style="margin-bottom:12px;">${this.escapeHtml(data.notice)}。已先使用本地分析生成练习卡片。</div>`
        : '';

      this.cardsContainer.innerHTML = notice + data.points.map((point, idx) => `
        <div class="interview-card" data-idx="${idx}">
          <div class="card-heading">${this.escapeHtml(point.heading || '要点')}</div>
          <div class="card-content">${this.escapeHtml(point.content || '')}</div>
          <div class="card-keywords">
            ${(point.keywords || []).map(k => `<span class="keyword-chip">${this.escapeHtml(k)}</span>`).join('')}
          </div>
          ${point.emotion ? `<div class="card-emotion">情绪提示：${this.escapeHtml(point.emotion)}</div>` : ''}
        </div>
      `).join('');
    }
  }

  editInterviewText() {
    if (this.interviewTextarea) this.interviewTextarea.value = this.interviewQuestion || '';
    if (this.interviewInputSection) {
      this.interviewInputSection.classList.remove('hidden');
    }
    if (this.interviewCards) {
      this.interviewCards.classList.add('hidden');
    }
    if (this.interviewContent) {
      this.interviewContent.classList.remove('collapsed');
    }
    if (this.btnToggleCards) this.btnToggleCards.classList.remove('rotated');
    this.cardsCollapsed = false;
  }

  getInterviewContext() {
    return {
      question: this.interviewQuestion || '',
      sourceText: this.interviewSourceText || '',
      analysis: this.interviewScript ? { ...this.interviewScript } : null
    };
  }

  repeatInterviewQuestion() {
    if (this.isRecording) {
      this.showError('请先结束当前录制');
      return;
    }
    this.clearAll();
    this.addFeedbackItem('已保留当前问题，可以再练一次', 'good');
  }

  startNewInterviewQuestion() {
    if (this.isRecording) {
      this.showError('请先结束当前录制');
      return;
    }
    this.clearAll();
    this.interviewQuestion = '';
    this.interviewSourceText = '';
    this.interviewScript = null;
    if (this.interviewTextarea) this.interviewTextarea.value = '';
    if (this.interviewInputSection) this.interviewInputSection.classList.remove('hidden');
    if (this.interviewCards) this.interviewCards.classList.add('hidden');
    if (this.interviewContent) this.interviewContent.classList.remove('collapsed');
    if (this.btnToggleCards) this.btnToggleCards.classList.remove('rotated');
    this.cardsCollapsed = false;
    window.api.saveInterviewScript(this.getInterviewContext()).catch(() => {});
    if (this.interviewTextarea) this.interviewTextarea.focus();
  }

  // 面试模式下的高亮
  highlightInterviewText(text) {
    const weakWords = ['可能','也许','大概','应该','我觉得','好像','似乎','或许','不一定','差不多','感觉','尽量','试试','看看','想想'];
    const positiveWords = ['热情','兴奋','激动','专注','充满信心','从容',
      '胜任','高效','精通','擅长','专业','协作','感恩','真诚','积极','开放',
      '坚定','充满动力','乐观','平静','从容自信','沉稳','泰然','笃定','娴熟','游刃有余'];
    const termClass = new Map([
      ...weakWords.map(word => [word, 'weak-confidence']),
      ...positiveWords.map(word => [word, 'positive-emotion'])
    ]);
    const terms = [...termClass.keys()].sort((a, b) => b.length - a.length);
    const pattern = new RegExp(terms.map(word => this.escapeRegExp(word)).join('|'), 'g');
    let result = '';
    let lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      result += this.escapeHtml(text.slice(lastIndex, match.index));
      result += `<span class="${termClass.get(match[0])}">${this.escapeHtml(match[0])}</span>`;
      lastIndex = match.index + match[0].length;
    }
    return result + this.escapeHtml(text.slice(lastIndex));
  }

  countLongestMatches(text, words) {
    const terms = [...new Set(words)].sort((a, b) => b.length - a.length);
    if (!terms.length) return 0;
    const matches = text.match(new RegExp(terms.map(word => this.escapeRegExp(word)).join('|'), 'g'));
    return matches ? matches.length : 0;
  }

  // 更新面试统计
  updateInterviewStats(text, shouldNotify = true) {
    if (!text) return;

    // 统计弱化词
    const weakWords = ['可能','也许','大概','应该','我觉得','好像','似乎','或许','不一定','差不多','感觉','尽量','试试','看看','想想'];
    const weakCount = this.countLongestMatches(text, weakWords);

    // 统计积极词
    const positiveWords = ['热情','兴奋','激动','专注','充满信心','从容',
      '胜任','高效','精通','擅长','专业','协作','感恩','真诚','积极','开放',
      '坚定','充满动力','乐观','平静','从容自信','沉稳','泰然','笃定','娴熟','游刃有余'];
    const positiveCount = this.countLongestMatches(text, positiveWords);

    // 弱化表达率只描述措辞，不冒充声音状态判断。
    const totalWords = this.stats.totalWords || 0;
    const weakRate = totalWords > 0 ? Math.round((weakCount / totalWords) * 1000) / 10 : 0;

    if (this.statWeakRate) this.statWeakRate.textContent = weakRate + '%';
    if (this.statPositive) this.statPositive.textContent = positiveCount;
    if (this.statWeak) this.statWeak.textContent = weakCount;
    this.stats.weakRate = weakRate;
    this.stats.positiveWords = positiveCount;
    this.stats.weakWords = weakCount;

    // 实时反馈
    if (shouldNotify) {
      if (weakCount > 0) {
        this.addFeedbackItem(`检测到弱化表达（${weakCount}次），尝试改成更明确的说法`, 'hedge', {
          word: 'mixed',
          sentence: text,
          category: 'hedge',
          systemVerdict: 'flagged'
        });
      }
      if (positiveCount > 0) {
        this.addFeedbackItem(`检测到积极措辞（${positiveCount}次），仅供表达观察`, 'good');
      }
    }
  }

  // ===== ASR结果处理 =====

  handleASRResult({ text, isFinal }) {
    if (isFinal) {
      this.sentences.push(text);
      this.fullText += text;
      this.analyzeCurrentSentence(text);

      // 每30字触发一次AI反馈（语境化精准词建议）
      if (this.fullText.length - this.lastFeedbackText.length >= 30) {
        this.requestRealtimeFeedback();
      }
    } else {
      // 中间态：长句模式下火山可能很久不返回 definite，
      // 这里对新增部分做轻量词库提示（只弹反馈，不累加 stats，避免停止时重复计数）
      this.analyzeInterimIncrement(text);
    }
    this.renderSubtitle(text, isFinal);
  }

  // 中间态增量提示：对比上次中间态，只对新增片段检测笼统词/填充词
  analyzeInterimIncrement(text) {
    if (!text) return;
    const prev = this._lastInterim || '';
    this._lastInterim = text;
    // 只处理"追加"场景；中间态回退/重写时跳过，避免误报
    if (!text.startsWith(prev)) return;
    const delta = text.slice(prev.length);
    if (!delta) return;
    window.api.analyzeText(delta).then(analysis => {
      if (!analysis || !this.isRecording) return;
      if (analysis.vagueWords && analysis.vagueWords.length > 0) {
        analysis.vagueWords.forEach(item => {
          const alts = item.alternatives.slice(0, 3).join(' / ');
          this.addFeedbackItem(`「${item.word}」→ ${alts}`, 'vague', {
            word: item.word,
            sentence: text,
            category: 'vague',
            systemVerdict: 'flagged'
          });
        });
      }
    });
  }

  renderSubtitle(currentText, isFinal) {
    if (isFinal) {
      // 移除interim
      const interim = this.subtitleContainer.querySelector('.interim-line');
      if (interim) interim.remove();

      // 旧行变灰
      this.subtitleContainer.querySelectorAll('.subtitle-line:not(.old)').forEach(el => {
        el.classList.add('old');
      });

      // 新行
      const line = document.createElement('div');
      line.className = 'subtitle-line';
      // 面试模式下使用面试高亮
      if (this.mode === 'interview') {
        line.innerHTML = this.highlightInterviewText(currentText);
      } else {
        line.innerHTML = this.highlightText(currentText);
      }
      this.subtitleContainer.appendChild(line);
    } else {
      let interim = this.subtitleContainer.querySelector('.interim-line');
      if (!interim) {
        interim = document.createElement('div');
        interim.className = 'subtitle-line interim-line';
        this.subtitleContainer.appendChild(interim);
      }
      interim.textContent = currentText;
    }

    // 自动滚到底
    this.subtitleScroll.scrollTop = this.subtitleScroll.scrollHeight;
  }

  highlightText(text) {
    let result = this.escapeHtml(text);
    const vagueWords = ['开心','难过','害怕','生气','不舒服','很好','很多','很快','很大','很小','好看','不好','喜欢','讨厌','觉得','想想'];
    vagueWords.sort((a, b) => b.length - a.length).forEach(w => {
      result = result.replace(new RegExp(this.escapeRegExp(w), 'g'), `<span class="vague">${w}</span>`);
    });
    const fillerPatterns = /(嗯|啊|呃|额|那个|就是|然后|这个|对吧|是吧|反正|基本上)/g;
    result = result.replace(fillerPatterns, '<span class="filler">$1</span>');
    const hedgePatterns = /(可能|也许|大概|应该|我觉得|好像|似乎|或许|不一定|差不多|感觉)/g;
    result = result.replace(hedgePatterns, '<span class="hedge">$1</span>');
    return result;
  }

  // ===== 分析 =====

  async analyzeCurrentSentence(text) {
    const analysis = await window.api.analyzeText(text);
    if (analysis) {
      this.stats.fillers += analysis.fillers.length;
      this.stats.hedges += analysis.hedges.length;
      this.stats.vagueWords += analysis.vagueWords.length;
      this.stats.totalWords += analysis.totalWords;
      this.updateStatsDisplay();
      if (this.mode === 'interview') {
        this.updateInterviewStats(this.fullText);
      }
      // 碰到笼统词 → 立刻在反馈栏弹出替换建议
      if (analysis.vagueWords && analysis.vagueWords.length > 0) {
        analysis.vagueWords.forEach(item => {
          const alts = item.alternatives.slice(0, 3).join(' / ');
          this.addFeedbackItem(`「${item.word}」→ ${alts}`, 'vague', {
            word: item.word,
            sentence: text,
            category: 'vague',
            systemVerdict: 'flagged'
          });
        });
      }
      // 碰到填充词 → 弹提醒
      if (analysis.fillers && analysis.fillers.length >= 2) {
        const uniqueFillers = [...new Set(analysis.fillers.map(f => f.word))].slice(0, 3);
        this.addFeedbackItem(`填充词：${uniqueFillers.join('、')}——试试停顿`, 'filler');
      }
      // 碰到犹豫词 → 弹提醒（带上下文，供「误判」按钮写反馈池）
      if (analysis.hedges && analysis.hedges.length >= 1) {
        const uniqueHedges = [...new Set(analysis.hedges.map(h => h.word))].slice(0, 2);
        this.addFeedbackItem(`「${uniqueHedges.join('」「')}」→ 直接说`, 'hedge', {
          word: uniqueHedges.join('/'),
          sentence: text,
          category: 'hedge',
          systemVerdict: 'flagged'
        });
      }
      // 被降级为客观陈述的犹豫词：单独提示，同样可标记误判
      if (analysis.hedgesDowngraded && analysis.hedgesDowngraded.length > 0) {
        const words = [...new Set(analysis.hedgesDowngraded.map(h => h.word))].slice(0, 2);
        this.addFeedbackItem(
          `「${words.join('」「')}」识别为客观陈述，未计入弱化`,
          'ai',
          {
            word: words.join('/'),
            sentence: text,
            category: 'hedge',
            systemVerdict: 'downgraded',
            downgraded: true
          }
        );
      }
    }
  }

  updateStatsDisplay() {
    this.statFillers.textContent = this.stats.fillers;
    this.statHedges.textContent = this.stats.hedges;
    this.statVague.textContent = this.stats.vagueWords;
    if (this.stats.totalWords > 0) {
      const density = ((this.stats.totalWords - this.stats.fillers - this.stats.hedges) / this.stats.totalWords * 100).toFixed(0);
      this.statDensity.textContent = density + '%';
    } else {
      // 清空/重置时密度归位，避免残留上次的值
      this.statDensity.textContent = '--';
    }
  }

  // ===== 实时反馈 =====

  async requestRealtimeFeedback() {
    // 防并发：上一次还没返回就跳过，避免乱序与重复请求
    if (this.feedbackInFlight) return;
    // 退避：连续失败时拉长间隔，避免没配 Key 时每 30 字就报错一次
    if (this.feedbackErrorCount >= 3) return;

    this.feedbackInFlight = true;
    // 代际 token：录音结束/清空后会递增，回调据此判断自己是否已过期，
    // 避免清空后旧请求返回又把反馈（如「说过一遍」）加回已清空的反馈栏
    const epoch = this.feedbackEpoch;
    const snapshot = this.fullText;
    let result;
    try {
      result = await window.api.getRealtimeFeedback({
        text: snapshot,
        mode: this.mode,
        interviewContext: this.mode === 'interview' ? this.getInterviewContext() : null
      });
    } catch (e) {
      if (epoch === this.feedbackEpoch) {
        this.feedbackErrorCount += 1;
        this.notifyFeedbackFailure(e.message || '网络错误');
      }
      return;
    } finally {
      if (epoch === this.feedbackEpoch) this.feedbackInFlight = false;
    }

    // 请求返回时若录音已结束或已清空，丢弃这条反馈
    if (epoch !== this.feedbackEpoch) return;

    if (result.success && result.feedback) {
      this.feedbackErrorCount = 0;
      // 用快照对齐，避免请求期间 fullText 又增长导致下次触发延迟
      this.lastFeedbackText = snapshot;
      const lines = result.feedback.split('\n').filter(l => l.trim());
      lines.forEach(line => {
        const type = this.classifyFeedback(line.trim());
        this.addFeedbackItem(line.trim(), type);
      });
    } else {
      this.feedbackErrorCount += 1;
      this.notifyFeedbackFailure(result.error || '请检查 AI 设置');
    }
  }

  // 反馈失败的分级提示：第 1 次告诉具体错误，达到熔断阈值时告诉"已停止"
  notifyFeedbackFailure(errorMsg) {
    if (this.feedbackErrorCount === 1) {
      this.addFeedbackItem(`实时反馈不可用：${errorMsg}`, 'hedge');
    } else if (this.feedbackErrorCount === 3) {
      this.addFeedbackItem('连续 3 次失败，实时反馈已暂停。清空或重新开始录音会重试', 'hedge');
    }
  }

  classifyFeedback(text) {
    if (text === '✓' || text.includes('✓')) return 'good';
    // 填充词相关
    const fillerKeywords = ['嗯','啊','呃','那个','就是','然后','这个','对吧','是吧','反正','基本上','所以说'];
    if (fillerKeywords.some(w => text.includes(`「${w}」`))) return 'filler';
    // 犹豫词相关
    const hedgeKeywords = ['可能','也许','大概','应该','我觉得','好像','似乎','感觉','或许'];
    if (hedgeKeywords.some(w => text.includes(`「${w}」`))) return 'hedge';
    // 其他精准词替换
    if (text.includes('→')) return 'vague';
    return 'ai';
  }

  addFeedbackItem(text, type = 'ai', meta = null) {
    // 去重：如果前3条已经有相同内容，跳过
    const existing = Array.from(this.feedbackContent.children).slice(0, 3);
    if (existing.some(el => el.dataset.text === text)) return;

    const item = document.createElement('div');
    item.className = `feedback-item type-${type}`;
    item.dataset.text = text;
    item.textContent = text;

    // 犹豫词 / 笼统词类反馈：附「误判」按钮，写入 bad case 反馈池
    if (meta && (type === 'hedge' || type === 'vague' || type === 'filler')) {
      const btn = document.createElement('button');
      btn.className = 'feedback-mark-falsepositive';
      btn.textContent = '误判';
      btn.title = '标记为误判，写入反馈池供后续优化';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.reportFalsePositive(text, type, meta);
        btn.disabled = true;
        btn.textContent = '已记录';
      });
      item.appendChild(btn);
    }

    this.feedbackContent.insertBefore(item, this.feedbackContent.firstChild);
    while (this.feedbackContent.children.length > 12) {
      this.feedbackContent.removeChild(this.feedbackContent.lastChild);
    }
  }

  // 把误判样本写进反馈池
  async reportFalsePositive(feedbackText, type, meta) {
    try {
      await window.api.submitFeedback({
        text: meta.sentence || feedbackText,
        word: meta.word || '',
        category: type,
        verdict: 'false-positive',
        systemVerdict: meta.systemVerdict || 'flagged',
        sentenceSnapshot: meta.sentence || '',
        downgraded: meta.downgraded || false,
        mode: this.mode || 'expression'
      });
      this.addFeedbackItem('已记录到反馈池，感谢标记', 'good');
    } catch (e) {
      console.error('写入反馈池失败:', e);
    }
  }

  // ===== 报告 =====

  async generateReport() {
    if (this.mode === 'interview' && !this.interviewQuestion.trim()) {
      this.showError('请先填写并分析本次练习内容，再生成报告');
      return;
    }
    this.reportBody.innerHTML = '<p style="text-align:center;color:var(--mute);padding:40px;font-family:\'Space Mono\',monospace;letter-spacing:0.08em;">正在生成报告...</p>';
    this.reportModal.classList.remove('hidden');
    this._viewingHistory = false;
    this._snapshot = null;
    this._currentHistoryRecord = null;

    let result;
    try {
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('生成报告超时（30秒），请检查网络或 API 设置')), 30000)
      );
      result = await Promise.race([
        window.api.getFinalReport({
          fullText: this.fullText,
          stats: this.stats,
          mode: this.mode,
          interviewContext: this.mode === 'interview' ? this.getInterviewContext() : null
        }),
        timeout
      ]);
    } catch (e) {
      this.reportBody.innerHTML = `<p style="color:var(--mute);padding:40px;text-align:center;">${this.escapeHtml(e.message)}</p>`;
      return;
    }

    if (result.success) {
      this.lastReport = result.report;
      this.renderReport(result.report, this.mode === 'interview' ? this.getInterviewContext() : null);
      this.saveToHistory(result.report); // 生成成功后自动存档
    } else {
      this.reportBody.innerHTML = `<p style="color:var(--accent-red);">生成失败: ${this.escapeHtml(result.error || '未知错误')}</p>`;
    }
  }

  // 把本次训练存入历史记录（生成报告成功时自动调用）
  async saveToHistory(report) {
    try {
      await window.api.saveHistoryRecord({
        mode: this.mode,
        fullText: this.fullText,
        report,
        stats: { ...this.stats },
        interviewContext: this.mode === 'interview' ? this.getInterviewContext() : null
      });
    } catch (e) {
      // 存档失败不影响主流程，仅记录
      console.warn('训练历史存档失败:', e.message);
    }
  }

  // ===== 训练历史 =====

  async openHistory() {
    if (this.isRecording) {
      this.showError('请先结束当前录制再查看历史');
      return;
    }
    this.historyRecords = await window.api.getHistory();
    this.historyModal.classList.remove('hidden');
    this.renderHistory();
  }

  getFilteredRecords() {
    const records = this.historyRecords || [];
    if (this.historyFilter === 'all') return records;
    return records.filter(r => r.mode === this.historyFilter);
  }

  renderHistory() {
    const records = this.getFilteredRecords();
    this.renderTrend(records);
    this.renderHistoryList(records);
  }

  renderTrend(records) {
    // 按时间正序（旧→新）用于画趋势
    const chrono = [...records].reverse();

    if (chrono.length < 2) {
      this.historyTrend.innerHTML = `<div class="history-trend-title">成长趋势</div>
        <div class="history-empty" style="padding:24px;">至少完成 2 次训练后，这里会显示你的成长曲线</div>`;
      return;
    }

    const rate = (n, durationSec) => {
      const min = (durationSec || 0) / 60;
      return min > 0 ? (n || 0) / min : 0;
    };
    const density = (s) => (s.totalWords > 0
      ? (s.totalWords - (s.fillers || 0) - (s.hedges || 0)) / s.totalWords * 100
      : 0);

    // 指标定义：higherBetter 仅用于图例说明
    const metrics = [
      { key: 'density', label: '表达密度%', color: '#53131E', get: (s) => density(s), fmt: (v) => Math.round(v) + '%' }
    ];
    const allHaveTiming = chrono.every(r => {
      const s = r.stats || {};
      return s.timingAvailable !== false && s.duration > 0;
    });
    if (allHaveTiming) {
      metrics.push(
        { key: 'filler', label: '填充词/分', color: '#C8641E', get: (s) => rate(s.fillers, s.duration), fmt: (v) => v.toFixed(1) },
        { key: 'hedge', label: '犹豫词/分', color: '#A08A2C', get: (s) => rate(s.hedges, s.duration), fmt: (v) => v.toFixed(1) }
      );
    }
    const getWeakRate = (s) => typeof s.weakRate === 'number'
      ? s.weakRate
      : (s.totalWords > 0 && typeof s.weakWords === 'number' ? (s.weakWords / s.totalWords) * 100 : 0);
    // 面试记录显示弱化表达率；旧记录可由弱化词次数和总字数换算。
    if (this.historyFilter === 'interview' && chrono.some(r => typeof (r.stats || {}).weakWords === 'number')) {
      metrics.push({ key: 'weakRate', label: '弱化表达率%', color: '#2E6E4E', get: getWeakRate, fmt: (v) => (Math.round(v * 10) / 10) + '%' });
    }

    const W = 600, H = 180, padX = 12, padY = 16;
    const plotW = W - padX * 2, plotH = H - padY * 2;
    const n = chrono.length;
    const xAt = (i) => padX + (n === 1 ? plotW / 2 : (plotW * i) / (n - 1));

    // 每条线按自身 min/max 归一化，突出走势方向
    const lines = metrics.map((m) => {
      const vals = chrono.map(r => m.get(r.stats || {}));
      const min = Math.min(...vals), max = Math.max(...vals);
      const span = max - min || 1;
      const pts = vals.map((v, i) => {
        const y = padY + plotH - ((v - min) / span) * plotH;
        return `${xAt(i).toFixed(1)},${y.toFixed(1)}`;
      });
      return { color: m.color, points: pts.join(' '), latest: m.fmt(vals[vals.length - 1]) };
    });

    const legendHtml = metrics.map((m, idx) =>
      `<span><i style="background:${m.color}"></i>${m.label} <strong style="color:${m.color}">${lines[idx].latest}</strong></span>`
    ).join('');

    const polylines = lines.map(l =>
      `<polyline points="${l.points}" fill="none" stroke="${l.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` +
      l.points.split(' ').map(p => `<circle cx="${p.split(',')[0]}" cy="${p.split(',')[1]}" r="2.5" fill="${l.color}"/>`).join('')
    ).join('');

    this.historyTrend.innerHTML = `
      <div class="history-trend-title">成长趋势 · 最近 ${n} 次</div>
      <div class="history-trend-legend">${legendHtml}</div>
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
        <line x1="${padX}" y1="${H - padY}" x2="${W - padX}" y2="${H - padY}" stroke="var(--mute)" stroke-width="1" opacity="0.4"/>
        ${polylines}
      </svg>
      <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--mute);text-align:right;margin-top:4px;letter-spacing:0.06em;">← 旧　　新 →　每条线按自身范围显示升降趋势</div>`;
  }

  renderHistoryList(records) {
    if (!records.length) {
      this.historyList.innerHTML = '<div class="history-empty">还没有训练记录，练一次并生成报告后就会出现在这里</div>';
      return;
    }

    const copyIcon = '<svg class="ic" width="13" height="13" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>';
    const delIcon = '<svg class="ic" width="13" height="13" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>';
    const viewIcon = '<svg class="ic" width="13" height="13" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';

    this.historyList.innerHTML = records.map((r) => {
      const d = new Date(r.createdAt);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      const s = r.stats || {};
      const modeLabel = r.mode === 'interview' ? '面试练习' : '表达训练';
      const density = s.totalWords > 0
        ? Math.round((s.totalWords - (s.fillers || 0) - (s.hedges || 0)) / s.totalWords * 100) + '%'
        : '--';
      const durationLabel = s.timingAvailable === false || !(s.duration > 0) ? '无时长' : `${s.duration}秒`;
      const metrics = `${durationLabel} · ${s.totalWords || 0}字 · 密度${density} · 填充${s.fillers || 0} · 犹豫${s.hedges || 0}`;
      const question = r.mode === 'interview' && r.interviewContext?.question
        ? `<div class="history-item-question">${this.escapeHtml(r.interviewContext.question)}</div>`
        : '';
      return `
        <div class="history-item" data-id="${r.id}">
          <div class="history-item-main" data-action="view" data-id="${r.id}">
            <div class="history-item-top">
              <span class="history-item-date">${dateStr}</span>
              <span class="history-item-tag ${r.mode === 'interview' ? 'interview' : ''}">${modeLabel}</span>
            </div>
            <div class="history-item-metrics">${metrics}</div>
            ${question}
          </div>
          <div class="history-item-actions">
            <button data-action="view" data-id="${r.id}" title="查看复盘">${viewIcon}</button>
            <button data-action="export" data-id="${r.id}" title="导出 Markdown">${copyIcon}</button>
            <button data-action="delete" data-id="${r.id}" title="删除">${delIcon}</button>
          </div>
        </div>`;
    }).join('');

    // 事件委托
    this.historyList.querySelectorAll('[data-action]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = el.dataset.id;
        const action = el.dataset.action;
        if (action === 'view') this.viewHistoryRecord(id);
        else if (action === 'export') this.exportHistoryRecord(id);
        else if (action === 'delete') this.deleteHistoryRecord(id);
      });
    });
  }

  viewHistoryRecord(id) {
    const record = (this.historyRecords || []).find(r => r.id === id);
    if (!record) return;
    // 查看历史时不污染当前录制状态：存快照，关闭弹窗时恢复
    if (!this._viewingHistory) {
      this._snapshot = {
        fullText: this.fullText,
        stats: { ...this.stats },
        lastReport: this.lastReport
      };
      this._viewingHistory = true;
    }
    this.fullText = record.fullText || '';
    this.stats = { ...this.stats, ...(record.stats || {}) };
    this.lastReport = record.report;
    this._currentHistoryRecord = record;
    this.renderReport(record.report, record.interviewContext);
    // 查看复盘时关闭历史弹窗，让报告独占前台；关闭报告时会恢复原录制状态
    this.historyModal.classList.add('hidden');
    this.reportModal.classList.remove('hidden');
  }

  async exportHistoryRecord(id) {
    const record = (this.historyRecords || []).find(r => r.id === id);
    if (!record) return;
    const d = new Date(record.createdAt);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const timeStr = `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
    const s = record.stats || {};
    const title = record.mode === 'interview' ? '面试练习报告' : '表达训练报告';
    const timingLabel = s.timingAvailable === false || !(s.duration > 0) ? '未采集' : `${s.duration}秒`;
    const contextMarkdown = this.buildInterviewContextMarkdown(record.interviewContext);
    const markdown = `# ${title}\n\n**日期**: ${dateStr} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}  \n**时长**: ${timingLabel}  \n**总字数**: ${s.totalWords || 0}  \n\n${contextMarkdown}## 完整原文\n\n${record.fullText || ''}\n\n---\n\n${record.report || ''}`;
    const filename = `${title}-${dateStr}-${timeStr}.md`;
    try {
      await window.api.saveFile(markdown, filename);
    } catch (e) {
      alert('导出失败: ' + e.message);
    }
  }

  async deleteHistoryRecord(id) {
    if (!confirm('确定删除这条训练记录吗？')) return;
    await window.api.deleteHistoryRecord(id);
    this.historyRecords = await window.api.getHistory();
    this.renderHistory();
  }

  async clearHistory() {
    if (!(this.historyRecords || []).length) return;
    if (!confirm('确定清空全部训练历史吗？此操作不可恢复。')) return;
    await window.api.clearHistory();
    this.historyRecords = [];
    this.renderHistory();
  }

  buildInterviewContextMarkdown(interviewContext) {
    if (!interviewContext || !interviewContext.question) return '';
    const analysis = interviewContext.analysis || {};
    return `## 本次练习内容\n\n${interviewContext.question}\n\n**识别题型**: ${analysis.type || '未识别'}  \n\n---\n\n`;
  }

  renderReport(report, interviewContext = null) {
    let html = this.escapeHtml(report)
      .replace(/\r\n/g, '\n')  // 统一换行符，避免表格 cell 尾部残留 \r
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

    // Markdown 表格解析：连续 | 行块 → <table>
    html = html.replace(/((?:^\|.+\|$\n?){2,})/gm, (block) => {
      const rows = block.trim().split('\n').filter(r => r.trim());
      if (rows.length < 2) return block;
      const parseRow = (row) => row.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const isSeparator = (row) => /^\|[\s\-:|]+\|$/.test(row.trim());
      let headerRow = parseRow(rows[0]);
      let bodyStart = 1;
      if (rows.length > 1 && isSeparator(rows[1])) bodyStart = 2;
      let tableHtml = '<table><thead><tr>' + headerRow.map(c => `<th>${c}</th>`).join('') + '</tr></thead><tbody>';
      for (let i = bodyStart; i < rows.length; i++) {
        if (isSeparator(rows[i])) continue;
        const cells = parseRow(rows[i]);
        tableHtml += '<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>';
      }
      tableHtml += '</tbody></table>';
      return tableHtml;
    });

    html = html.replace(/\n/g, '<br>');

    const contextHtml = this.buildInterviewContextMarkdown(interviewContext)
      ? `<div class="report-interview-context">${this.escapeHtml(this.buildInterviewContextMarkdown(interviewContext))
        .replace(/^## (.+)$/gm, '<strong class="report-context-heading">$1</strong>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/---/g, '')
        .replace(/\n/g, '<br>')}</div>`
      : '';
    this.reportBody.innerHTML = `
      <div style="text-align:right;margin-bottom:12px;">
        <button id="btn-save-report" style="display:inline-flex;align-items:center;gap:6px;background:var(--ink);color:var(--paper);border:1px solid var(--ink);border-radius:0;padding:8px 16px;font-size:12px;font-family:'JetBrains Mono',monospace;letter-spacing:0.08em;cursor:pointer;"><svg class="ic" width="13" height="13" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> 保存为 Markdown</button>
      </div>
      ${contextHtml}${html}
    `;

    document.getElementById('btn-save-report').addEventListener('click', () => this.saveReport());
  }

  closeReport() {
    this.reportModal.classList.add('hidden');
    // 如果是在查看历史记录，恢复当前录制状态
    if (this._viewingHistory && this._snapshot) {
      this.fullText = this._snapshot.fullText;
      this.stats = this._snapshot.stats;
      this.lastReport = this._snapshot.lastReport;
      this._snapshot = null;
      this._viewingHistory = false;
      this._currentHistoryRecord = null;
    }
  }

  async saveReport() {
    if (!this.lastReport) return;
    // 查看历史时用记录自己的时间，否则用当前时间（本地时区）
    const viewing = this._viewingHistory && this._currentHistoryRecord;
    const now = viewing ? new Date(this._currentHistoryRecord.createdAt) : new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const timeStr = `${pad(now.getHours())}${pad(now.getMinutes())}`;
    const reportMode = viewing ? this._currentHistoryRecord.mode : this.mode;
    const title = reportMode === 'interview' ? '面试练习报告' : '表达训练报告';
    const timingLabel = this.stats.timingAvailable === false || !(this.stats.duration > 0) ? '未采集' : `${this.stats.duration}秒`;
    const interviewContext = viewing
      ? this._currentHistoryRecord.interviewContext
      : (reportMode === 'interview' ? this.getInterviewContext() : null);
    const contextMarkdown = this.buildInterviewContextMarkdown(interviewContext);
    const markdown = `# ${title}\n\n**日期**: ${dateStr} ${pad(now.getHours())}:${pad(now.getMinutes())}  \n**时长**: ${timingLabel}  \n**总字数**: ${this.stats.totalWords}  \n\n${contextMarkdown}## 完整原文\n\n${this.fullText}\n\n---\n\n${this.lastReport}`;
    const filename = `${title}-${dateStr}-${timeStr}.md`;

    try {
      const result = await window.api.saveFile(markdown, filename);
      if (result.success) {
        const btn = document.getElementById('btn-save-report');
        const saveIcon = '<svg class="ic" width="13" height="13" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>';
        const checkIcon = '<svg class="ic" width="13" height="13" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>';
        btn.innerHTML = checkIcon + ' 已保存';
        setTimeout(() => { btn.innerHTML = saveIcon + ' 保存为 Markdown'; }, 2000);
      }
    } catch (e) {
      alert('保存失败: ' + e.message);
    }
  }

  // ===== 工具 =====

  escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  updateTimer() {
    let totalPaused = this.pausedTime;
    if (this.pauseStart) totalPaused += Date.now() - this.pauseStart;
    const elapsed = Math.floor((Date.now() - this.startTime - totalPaused) / 1000);
    const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const seconds = (elapsed % 60).toString().padStart(2, '0');
    this.timer.textContent = `${minutes}:${seconds}`;
  }

  resetStats() {
    this.stats = {
      fillers: 0,
      hedges: 0,
      vagueWords: 0,
      totalWords: 0,
      duration: 0,
      timingAvailable: false,
      weakRate: null,
      positiveWords: 0,
      weakWords: 0
    };
    this.updateStatsDisplay();
    this.feedbackContent.innerHTML = '';

    // 重置面试统计
    if (this.statWeakRate) this.statWeakRate.textContent = '--';
    if (this.statPositive) this.statPositive.textContent = '0';
    if (this.statWeak) this.statWeak.textContent = '0';
  }

  showError(msg) {
    const line = document.createElement('div');
    line.className = 'subtitle-line';
    line.style.color = 'var(--accent-red)';
    line.textContent = msg;
    this.subtitleContainer.appendChild(line);
  }

  // ===== 复制 & 保存原文 & 清空 =====

  copyOriginalText() {
    if (!this.fullText.trim()) return;
    navigator.clipboard.writeText(this.fullText).then(() => {
      this.btnCopyText.querySelector('.btn-label').textContent = '✓ 已复制';
      setTimeout(() => { this.btnCopyText.querySelector('.btn-label').textContent = '复制原文'; }, 1500);
    });
  }

  async saveOriginalText() {
    if (!this.fullText.trim()) return;
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const timeStr = `${pad(now.getHours())}${pad(now.getMinutes())}`;
    const markdown = `# 表达训练原文\n\n**日期**: ${dateStr}\n\n---\n\n${this.fullText}`;
    const filename = `原文-${dateStr}-${timeStr}.md`;

    try {
      const result = await window.api.saveFile(markdown, filename);
      if (result.success) {
        this.btnSaveText.querySelector('.btn-label').textContent = '✓ 已保存';
        setTimeout(() => { this.btnSaveText.querySelector('.btn-label').textContent = '保存原文'; }, 2000);
      }
    } catch (e) {
      alert('保存失败: ' + e.message);
    }
  }

  clearAll() {
    // 通知进行中的粘贴分析循环中止，避免清空后又被加回去
    this._clearToken = (this._clearToken || 0) + 1;
    // 让在飞的实时反馈请求回调失效，避免清空后旧请求又把反馈加回来
    this.feedbackEpoch += 1;
    this.feedbackInFlight = false;
    this.fullText = '';
    this.sentences = [];
    this.lastFeedbackText = '';
    this.lastReport = '';
    this.subtitleContainer.innerHTML = '<div class="subtitle-line hint">点击下方按钮开始说话</div>';
    this.feedbackContent.innerHTML = '';
    this.resetStats();
    this.timer.textContent = '00:00';
    this.timer.classList.remove('active');
    this.btnReport.classList.add('hidden');
    this.btnCopyText.classList.add('hidden');
    this.btnSaveText.classList.add('hidden');
    this.btnClear.classList.add('hidden');

    // 重置面试统计
    if (this.statWeakRate) this.statWeakRate.textContent = '--';
    if (this.statPositive) this.statPositive.textContent = '0';
    if (this.statWeak) this.statWeak.textContent = '0';

    // 重置面试模式下的题目/脚本状态，避免旧数据在「再练一次」时被复用
    this.interviewQuestion = '';
    this.interviewSourceText = '';
    this.interviewScript = null;
  }

  // ===== 粘贴逐字稿分析 =====

  openPasteModal() {
    this.pasteTextarea.value = '';
    this.pasteModal.classList.remove('hidden');
    this.pasteTextarea.focus();
  }

  async analyzePastedText() {
    if (this._analyzingPaste) return;
    const text = this.pasteTextarea.value.trim();
    if (!text) return;

    this._analyzingPaste = true;
    this.btnAnalyzePaste.disabled = true;
    this.btnAnalyzePaste.textContent = '分析中...';
    const token = (this._clearToken || 0) + 1;
    this._clearToken = token;

    // 关闭粘贴弹窗
    this.pasteModal.classList.add('hidden');

    // 把文本显示到字幕区（高亮标记）
    this.subtitleContainer.innerHTML = '';
    this.fullText = text;
    this.resetStats();

    // 按句号/问号/感叹号/换行分句
    const sentences = text.split(/(?<=[。！？\n])/g).filter(s => s.trim());
    this.sentences = sentences;

    try {
      for (const sentence of sentences) {
        // 清空被触发则中止剩余分析
        if (this._clearToken !== token) return;
        const line = document.createElement('div');
        line.className = 'subtitle-line';
        line.innerHTML = this.mode === 'interview'
          ? this.highlightInterviewText(sentence.trim())
          : this.highlightText(sentence.trim());
        this.subtitleContainer.appendChild(line);

        // 词库分析
        const analysis = await window.api.analyzeText(sentence);
        if (this._clearToken !== token) return;
        if (analysis) {
          this.stats.fillers += analysis.fillers.length;
          this.stats.hedges += analysis.hedges.length;
          this.stats.vagueWords += analysis.vagueWords.length;
          this.stats.totalWords += analysis.totalWords;
          this.updateStatsDisplay();
        }
      }

      if (this._clearToken !== token) return;
      this.stats.duration = 0; // 粘贴模式没有时长
      this.updateStatsDisplay();
      if (this.mode === 'interview') {
        this.updateInterviewStats(this.fullText);
      }

      // 显示操作按钮
      this.btnReport.classList.remove('hidden');
      this.btnCopyText.classList.remove('hidden');
      this.btnSaveText.classList.remove('hidden');
      this.btnClear.classList.remove('hidden');

      // 请求AI语境化反馈
      this.requestRealtimeFeedback();
    } finally {
      if (this._clearToken === token) {
        this._analyzingPaste = false;
        this.btnAnalyzePaste.disabled = false;
        this.btnAnalyzePaste.textContent = '分析';
      }
    }
  }
}

document.addEventListener('DOMContentLoaded', () => { new ExpressionTrainer(); });
