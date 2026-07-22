// 设置页逻辑

const PROVIDER_CONFIG = {
  openai: {
    needsKey: true,
    keyHint: '在 platform.openai.com 获取',
    models: [
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini（推荐）' },
      { value: 'gpt-4o', label: 'GPT-4o' },
      { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' }
    ]
  },
  deepseek: {
    needsKey: true,
    keyHint: '在 platform.deepseek.com 获取',
    models: [
      { value: 'deepseek-chat', label: 'DeepSeek Chat（推荐）' },
      { value: 'deepseek-coder', label: 'DeepSeek Coder' }
    ]
  },
  ollama: {
    needsKey: false,
    models: [
      { value: 'qwen2.5:7b', label: 'Qwen 2.5 7B（推荐）' },
      { value: 'llama3.1:8b', label: 'Llama 3.1 8B' },
      { value: 'mistral:7b', label: 'Mistral 7B' }
    ]
  },
  custom: {
    needsKey: true,
    keyHint: '自定义 API Key',
    models: []
  }
};

class SettingsPage {
  constructor() {
    this.providerSelect = document.getElementById('provider');
    this.apikeyInput = document.getElementById('apikey');
    this.apikeyHint = document.getElementById('apikey-hint');
    this.modelSelect = document.getElementById('model');
    this.modelHint = document.getElementById('model-hint');
    this.ollamaUrlInput = document.getElementById('ollama-url');
    this.customEndpointInput = document.getElementById('custom-endpoint');
    this.customModelInput = document.getElementById('custom-model');
    this.asrModelsList = document.getElementById('asr-models-list');
    this.btnSave = document.getElementById('btn-save');
    this.saveSuccess = document.getElementById('save-success');

    this.groupApikey = document.getElementById('group-apikey');
    this.groupOllama = document.getElementById('group-ollama');
    this.groupCustom = document.getElementById('group-custom');
    this.groupCustomModel = document.getElementById('group-custom-model');

    // ASR 引擎选择（本地 / 火山云端）
    this.asrEngineSelect = document.getElementById('asr-engine');
    this.groupLocalAsr = document.getElementById('group-local-asr');
    this.groupVolcano = document.getElementById('group-volcano');
    this.volcAppKeyInput = document.getElementById('volc-app-key');
    this.volcAccessKeyInput = document.getElementById('volc-access-key');
    this.volcResourceIdInput = document.getElementById('volc-resource-id');

    this.asrModels = [];
    this.selectedAsrModel = null;

    // 麦克风自检
    this.btnMicTest = document.getElementById('btn-mic-test');
    this.micTestPanel = document.getElementById('mic-test-panel');
    this.micVolFill = document.getElementById('mic-vol-fill');
    this.micTestResult = document.getElementById('mic-test-result');
    this.micTesting = false;
    this.micTestCtx = null;
    this.micTestStream = null;
    this.micTestProcessor = null;
    this.micTestText = '';

    this.bindEvents();
    this.loadSettings();
    this.loadAsrModels();
  }

  bindEvents() {
    this.providerSelect.addEventListener('change', () => this.onProviderChange());
    this.asrEngineSelect.addEventListener('change', () => this.onAsrEngineChange());
    this.btnSave.addEventListener('click', () => this.save());

    // 密码显示/隐藏切换
    document.querySelectorAll('.reveal-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const input = document.getElementById(btn.dataset.target);
        if (!input) return;
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.setAttribute('aria-pressed', String(show));
      });
    });

    // 麦克风 & 识别自检
    if (this.btnMicTest) {
      this.btnMicTest.addEventListener('click', () => this.toggleMicTest());
    }
  }

  onAsrEngineChange() {
    const engine = this.asrEngineSelect.value;
    this.groupLocalAsr.style.display = engine === 'local' ? '' : 'none';
    this.groupVolcano.classList.toggle('visible', engine === 'volcano');
  }

  async loadSettings() {
    const settings = await window.api.getSettings();

    this.providerSelect.value = settings.provider || 'deepseek';
    this.apikeyInput.value = settings.apiKey || '';
    this.ollamaUrlInput.value = settings.ollamaUrl || 'http://localhost:11434';
    this.customEndpointInput.value = settings.customEndpoint || '';
    this.customModelInput.value = settings.customModel || '';
    this.selectedAsrModel = settings.asrModel || null;

    // ASR 引擎
    this.asrEngineSelect.value = settings.asrEngine || 'local';
    this.volcAppKeyInput.value = settings.volcAppKey || '';
    this.volcAccessKeyInput.value = settings.volcAccessKey || '';
    this.volcResourceIdInput.value = settings.volcResourceId || 'volc.bigasr.sauc.duration';
    this.onAsrEngineChange();

    this.onProviderChange();

    if (settings.model) {
      this.modelSelect.value = settings.model;
    }
  }

  async loadAsrModels() {
    try {
      this.asrModels = await window.api.getAsrModels();
      this.renderAsrModels();
    } catch (e) {
      console.error('加载ASR模型列表失败:', e);
    }
  }

  renderAsrModels() {
    this.asrModelsList.innerHTML = '';

    const available = this.asrModels.filter(m => m.available);
    const unavailable = this.asrModels.filter(m => !m.available);
    const sorted = [...available, ...unavailable];

    sorted.forEach(model => {
      const option = document.createElement('div');
      option.className = 'asr-model-option';
      if (model.id === this.selectedAsrModel) {
        option.classList.add('selected');
      }
      if (!model.available) {
        option.classList.add('unavailable');
      }

      const nameDiv = document.createElement('div');
      nameDiv.className = 'model-name';

      let nameText = model.name;
      if (model.streaming) {
        nameText += ' <span class="badge">流式</span>';
      } else {
        nameText += ' <span class="badge">非流式</span>';
      }
      if (model.recommended && model.available) {
        nameText += ' <span class="badge recommended">推荐</span>';
      }
      nameDiv.innerHTML = nameText;

      const descDiv = document.createElement('div');
      descDiv.className = 'model-desc';
      descDiv.textContent = model.description;

      option.appendChild(nameDiv);
      option.appendChild(descDiv);

      if (model.available) {
        option.addEventListener('click', () => this.selectAsrModel(model.id));
      }

      this.asrModelsList.appendChild(option);
    });

    if (!this.selectedAsrModel && available.length > 0) {
      const recommended = available.find(m => m.recommended);
      this.selectedAsrModel = recommended ? recommended.id : available[0].id;
      this.renderAsrModels();
    }
  }

  selectAsrModel(modelId) {
    const model = this.asrModels.find(m => m.id === modelId);
    if (!model || !model.available) return;

    this.selectedAsrModel = modelId;
    this.renderAsrModels();
  }

  onProviderChange() {
    const provider = this.providerSelect.value;
    const config = PROVIDER_CONFIG[provider];

    this.groupApikey.classList.toggle('visible', config.needsKey);
    this.groupOllama.classList.toggle('visible', provider === 'ollama');
    this.groupCustom.classList.toggle('visible', provider === 'custom');
    this.groupCustomModel.classList.toggle('visible', provider === 'custom');

    if (config.keyHint) {
      this.apikeyHint.textContent = config.keyHint;
    }

    this.modelSelect.innerHTML = '';
    if (config.models.length > 0) {
      config.models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.value;
        opt.textContent = m.label;
        this.modelSelect.appendChild(opt);
      });
      this.modelSelect.parentElement.style.display = '';
    } else {
      this.modelSelect.parentElement.style.display = 'none';
    }
  }

  async save() {
    const settings = {
      provider: this.providerSelect.value,
      apiKey: this.apikeyInput.value.trim(),
      model: this.modelSelect.value,
      ollamaUrl: this.ollamaUrlInput.value.trim(),
      customEndpoint: this.customEndpointInput.value.trim(),
      customModel: this.customModelInput.value.trim(),
      asrModel: this.selectedAsrModel,
      asrEngine: this.asrEngineSelect.value,
      volcAppKey: this.volcAppKeyInput.value.trim(),
      volcAccessKey: this.volcAccessKeyInput.value.trim(),
      volcResourceId: this.volcResourceIdInput.value.trim() || 'volc.bigasr.sauc.duration'
    };

    // 只有 ASR 引擎相关字段变化时才需要重置引擎，避免改 AI 后端也重载模型
    const old = await window.api.getSettings();
    const ASR_KEYS = ['asrModel', 'asrEngine', 'volcAppKey', 'volcAccessKey', 'volcResourceId'];
    const asrChanged = ASR_KEYS.some(k => (old[k] || '') !== (settings[k] || ''));

    await window.api.saveSettings(settings);

    if (asrChanged) {
      try {
        await window.api.resetASR();
      } catch (e) {
        console.error('重置ASR引擎失败:', e);
      }
    }

    this.saveSuccess.classList.add('show');
    setTimeout(() => {
      window.close();
    }, 800);
  }

  // 收集当前表单里的设置（不关窗，供自检使用）
  collectSettings() {
    return {
      provider: this.providerSelect.value,
      apiKey: this.apikeyInput.value.trim(),
      model: this.modelSelect.value,
      ollamaUrl: this.ollamaUrlInput.value.trim(),
      customEndpoint: this.customEndpointInput.value.trim(),
      customModel: this.customModelInput.value.trim(),
      asrModel: this.selectedAsrModel,
      asrEngine: this.asrEngineSelect.value,
      volcAppKey: this.volcAppKeyInput.value.trim(),
      volcAccessKey: this.volcAccessKeyInput.value.trim(),
      volcResourceId: this.volcResourceIdInput.value.trim() || 'volc.bigasr.sauc.duration'
    };
  }

  // ===== 麦克风 & 识别自检 =====

  toggleMicTest() {
    if (this.micTesting) {
      this.stopMicTest();
    } else {
      this.startMicTest();
    }
  }

  async startMicTest() {
    this.micTesting = true;
    this.micTestText = '';
    this.btnMicTest.classList.add('testing');
    this.btnMicTest.textContent = '停止测试';
    this.micTestPanel.style.display = 'block';
    this.micTestResult.className = 'mic-test-result';
    this.micTestResult.textContent = '正在启动识别引擎…';

    try {
      // 用当前表单设置初始化引擎，测的就是当前选择
      await window.api.saveSettings(this.collectSettings());
      await window.api.resetASR();
      const initResult = await window.api.initASR();
      if (!initResult.success) {
        this.showMicError(`引擎启动失败：${initResult.error || '未知错误'}`);
        return;
      }

      // 监听识别结果
      if (window.api.onASRResult) {
        window.api.onASRResult((result) => {
          if (result && result.text) {
            if (result.isFinal) this.micTestText += result.text;
            const shown = (this.micTestText + (result.isFinal ? '' : result.text)).trim();
            if (shown) {
              this.micTestResult.className = 'mic-test-result ok';
              this.micTestResult.textContent = '识别到：' + shown;
            }
          }
        });
      }
      if (window.api.onASRError) {
        window.api.onASRError((err) => this.showMicError(`识别错误：${err.message || ''}`));
      }

      // 采集麦克风
      this.micTestStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.micTestCtx = new AudioContext({ sampleRate: 16000 });
      const source = this.micTestCtx.createMediaStreamSource(this.micTestStream);
      this.micTestProcessor = this.micTestCtx.createScriptProcessor(4096, 1, 1);

      this.micTestProcessor.onaudioprocess = async (e) => {
        if (!this.micTesting) return;
        const samples = e.inputBuffer.getChannelData(0);
        // 音量条：RMS
        let sum = 0;
        for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
        const rms = Math.sqrt(sum / samples.length);
        const vol = Math.min(100, Math.round(rms * 300));
        this.micVolFill.style.width = vol + '%';

        const asrResult = await window.api.feedAudio(samples);
        if (asrResult && asrResult.text) {
          if (asrResult.isFinal) this.micTestText += asrResult.text;
          const shown = (this.micTestText + (asrResult.isFinal ? '' : asrResult.text)).trim();
          if (shown) {
            this.micTestResult.className = 'mic-test-result ok';
            this.micTestResult.textContent = '识别到：' + shown;
          }
        }
      };
      source.connect(this.micTestProcessor);
      this.micTestProcessor.connect(this.micTestCtx.destination);

      if (!this.micTestText) {
        this.micTestResult.textContent = '请对着麦克风说话…';
      }
    } catch (err) {
      this.showMicError(`麦克风访问失败：${err.message}`);
    }
  }

  async stopMicTest() {
    this.micTesting = false;
    this.btnMicTest.classList.remove('testing');
    this.btnMicTest.textContent = '开始测试（说一句话）';
    this.micVolFill.style.width = '0%';

    if (this.micTestProcessor) { this.micTestProcessor.disconnect(); this.micTestProcessor = null; }
    if (this.micTestCtx) { this.micTestCtx.close(); this.micTestCtx = null; }
    if (this.micTestStream) { this.micTestStream.getTracks().forEach(t => t.stop()); this.micTestStream = null; }
    if (window.api.removeASRListener) window.api.removeASRListener();
    try { await window.api.stopASR(); } catch (e) { /* 忽略 */ }

    // 给出结论
    if (this.micTestText.trim()) {
      this.micTestResult.className = 'mic-test-result ok';
      this.micTestResult.textContent = '✓ 引擎正常，识别到：' + this.micTestText.trim();
    } else if (this.micTestResult.className.indexOf('err') === -1) {
      this.micTestResult.className = 'mic-test-result err';
      this.micTestResult.textContent = '没有识别到文字。检查麦克风是否有声音（音量条有没有跳动）、引擎凭证是否正确。';
    }
  }

  showMicError(msg) {
    this.micTestResult.className = 'mic-test-result err';
    this.micTestResult.textContent = msg;
    this.stopMicTest();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new SettingsPage();
});
