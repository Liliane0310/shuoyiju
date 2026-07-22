/**
 * 语音识别模块 - 基于 sherpa-onnx-node
 * 支持多种流式语音识别模型，可通过设置动态切换
 * 录音通过 Electron 渲染进程的 Web Audio API 采集，音频数据通过 IPC 传入
 */

const path = require('path');
const fs = require('fs');

let recognizer = null;
let stream = null;
let isRunning = false;
let currentModel = null;

const MODELS_DIR = path.join(__dirname, '..', 'models');

/**
 * 支持的ASR模型配置列表
 * 每个模型包含：id、名称、描述、类型、所需文件、配置生成函数
 */
const ASR_MODELS = [
  {
    id: 'sherpa-onnx-streaming-paraformer-bilingual-zh-en',
    name: 'Paraformer 双语（中英文）',
    description: '流式识别，准确率高，中英文混合场景推荐',
    type: 'paraformer',
    streaming: true,
    files: ['encoder.int8.onnx', 'decoder.int8.onnx', 'tokens.txt'],
    recommended: true
  },
  {
    id: 'sherpa-onnx-streaming-zipformer-zh-14M',
    name: 'Zipformer 中文（14M）',
    description: '流式识别，轻量快速，纯中文场景首选',
    type: 'zipformer',
    streaming: true,
    files: ['encoder-epoch-99-avg-1.int8.onnx', 'decoder-epoch-99-avg-1.onnx', 'joiner-epoch-99-avg-1.int8.onnx', 'tokens.txt']
  },
  {
    id: 'sherpa-onnx-streaming-zipformer-en-20M',
    name: 'Zipformer 英文（20M）',
    description: '流式识别，英文场景优化',
    type: 'zipformer',
    streaming: true,
    files: ['encoder-epoch-99-avg-1.int8.onnx', 'decoder-epoch-99-avg-1.onnx', 'joiner-epoch-99-avg-1.int8.onnx', 'tokens.txt']
  },
  {
    id: 'sherpa-onnx-streaming-zipformer-bilingual-zh-en-20M',
    name: 'Zipformer 双语（中英文 20M）',
    description: '流式识别，轻量双语模型',
    type: 'zipformer',
    streaming: true,
    files: ['encoder-epoch-99-avg-1.int8.onnx', 'decoder-epoch-99-avg-1.onnx', 'joiner-epoch-99-avg-1.int8.onnx', 'tokens.txt']
  },
  {
    id: 'sherpa-onnx-whisper-base-zh',
    name: 'Whisper Base 中文',
    description: '非流式识别，准确率极高，但延迟稍高',
    type: 'whisper',
    streaming: false,
    files: ['encoder.onnx', 'decoder.onnx', 'tokens.txt']
  },
  {
    id: 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue',
    name: 'SenseVoice 多语言',
    description: '非流式识别，支持中/英/日/韩/粤语，带情感识别',
    type: 'sense_voice',
    streaming: false,
    files: ['model.int8.onnx', 'tokens.txt']
  }
];

/**
 * 获取所有可用的模型列表（检查模型文件是否存在）
 * @returns {Array} 可用模型列表
 */
function getAvailableModels() {
  return ASR_MODELS.map(model => {
    const modelDir = path.join(MODELS_DIR, model.id);
    const available = model.files.every(file => 
      fs.existsSync(path.join(modelDir, file))
    );
    return {
      ...model,
      available
    };
  });
}

/**
 * 获取默认模型ID
 * @returns {string} 默认模型ID
 */
function getDefaultModelId() {
  const available = getAvailableModels().filter(m => m.available);
  if (available.length === 0) {
    return ASR_MODELS[0].id;
  }
  const recommended = available.find(m => m.recommended);
  return recommended ? recommended.id : available[0].id;
}

/**
 * 检查模型文件是否存在
 * @param {string} modelId - 模型ID
 */
function checkModels(modelId) {
  const modelConfig = ASR_MODELS.find(m => m.id === modelId);
  if (!modelConfig) {
    throw new Error(`未知的模型: ${modelId}`);
  }

  const modelDir = path.join(MODELS_DIR, modelId);
  for (const file of modelConfig.files) {
    const fullPath = path.join(modelDir, file);
    if (!fs.existsSync(fullPath)) {
      throw new Error(
        `模型文件未找到: ${file}\n` +
        `请确认 models/${modelId}/ 目录下有完整的模型文件\n` +
        `可从 https://github.com/k2-fsa/sherpa-onnx/releases/ 下载`
      );
    }
  }
}

/**
 * 根据模型类型和目录生成配置
 * @param {string} modelId - 模型ID
 * @returns {Object} sherpa-onnx 配置对象
 */
function buildConfig(modelId) {
  const modelConfig = ASR_MODELS.find(m => m.id === modelId);
  const modelDir = path.join(MODELS_DIR, modelId);

  const baseConfig = {
    featConfig: {
      sampleRate: 16000,
      featureDim: 80
    },
    modelConfig: {
      tokens: path.join(modelDir, 'tokens.txt'),
      numThreads: 2,
      provider: 'cpu',
      debug: false
    },
    decodingMethod: 'greedy_search',
    maxActivePaths: 4,
    enableEndpoint: true,
    rule1MinTrailingSilence: 2.4,
    rule2MinTrailingSilence: 1.2,
    rule3MinUtteranceLength: 20
  };

  switch (modelConfig.type) {
    case 'paraformer':
      baseConfig.modelConfig.paraformer = {
        encoder: path.join(modelDir, 'encoder.int8.onnx'),
        decoder: path.join(modelDir, 'decoder.int8.onnx'),
      };
      break;

    case 'zipformer':
      baseConfig.modelConfig.transducer = {
        encoder: path.join(modelDir, 'encoder-epoch-99-avg-1.int8.onnx'),
        decoder: path.join(modelDir, 'decoder-epoch-99-avg-1.onnx'),
        joiner: path.join(modelDir, 'joiner-epoch-99-avg-1.int8.onnx'),
      };
      break;

    case 'whisper':
      baseConfig.modelConfig.whisper = {
        encoder: path.join(modelDir, 'encoder.onnx'),
        decoder: path.join(modelDir, 'decoder.onnx'),
        language: 'zh',
        task: 'transcribe',
      };
      baseConfig.decodingMethod = 'greedy_search';
      break;

    case 'sense_voice':
      baseConfig.modelConfig.senseVoice = {
        model: path.join(modelDir, 'model.int8.onnx'),
      };
      baseConfig.featConfig.featureDim = 80;
      break;

    default:
      throw new Error(`不支持的模型类型: ${modelConfig.type}`);
  }

  return baseConfig;
}

/**
 * 初始化 ASR 引擎
 * @param {string} [modelId] - 模型ID，不传则使用默认模型
 */
async function initASR(modelId) {
  const targetModel = modelId || getDefaultModelId();

  if (recognizer && currentModel === targetModel) {
    stream = recognizer.createStream();
    isRunning = true;
    console.log(`[ASR] 重用已有引擎 (${targetModel})，创建新stream`);
    return;
  }

  if (recognizer) {
    recognizer = null;
    stream = null;
    console.log('[ASR] 清理旧引擎');
  }

  checkModels(targetModel);

  const sherpa = require('sherpa-onnx-node');
  const config = buildConfig(targetModel);

  if (config.modelConfig.whisper || config.modelConfig.senseVoice) {
    recognizer = new sherpa.OfflineRecognizer(config);
  } else {
    recognizer = new sherpa.OnlineRecognizer(config);
  }

  stream = recognizer.createStream();
  isRunning = true;
  currentModel = targetModel;

  const modelInfo = ASR_MODELS.find(m => m.id === targetModel);
  console.log(`[ASR] 识别引擎初始化完成 - ${modelInfo.name}`);
}

/**
 * 接收渲染进程发来的音频数据进行识别
 * @param {Float32Array} samples - 16kHz 单声道音频采样
 * @returns {{ text: string, isFinal: boolean } | null}
 */
function feedAudio(samples) {
  if (!isRunning || !stream || !recognizer) return null;

  const modelConfig = ASR_MODELS.find(m => m.id === currentModel);
  const isOnline = modelConfig && modelConfig.streaming;

  if (isOnline) {
    stream.acceptWaveform({ samples, sampleRate: 16000 });

    while (recognizer.isReady(stream)) {
      recognizer.decode(stream);
    }

    const result = recognizer.getResult(stream);
    const text = (result.text || '').trim();
    const isEndpoint = recognizer.isEndpoint(stream);

    if (isEndpoint && text) {
      recognizer.reset(stream);
      return { text, isFinal: true };
    } else if (text) {
      return { text, isFinal: false };
    }
  } else {
    stream.acceptWaveform({ samples, sampleRate: 16000 });
    return null;
  }

  return null;
}

/**
 * 停止识别
 * @returns {string} 最后的未确认文本
 */
function stopRecognition() {
  isRunning = false;

  let finalText = '';
  if (stream && recognizer) {
    const modelConfig = ASR_MODELS.find(m => m.id === currentModel);
    const isOnline = modelConfig && modelConfig.streaming;

    if (isOnline) {
      stream.inputFinished();
      while (recognizer.isReady(stream)) {
        recognizer.decode(stream);
      }
      const result = recognizer.getResult(stream);
      finalText = (result.text || '').trim();
    } else {
      recognizer.decode(stream);
      const result = recognizer.getResult(stream);
      finalText = (result.text || '').trim();
    }

    stream = null;
  }

  console.log('[ASR] 停止录制');
  return finalText;
}

/**
 * 重置ASR引擎（切换模型时使用）
 */
function resetASR() {
  if (stream) {
    stream = null;
  }
  if (recognizer) {
    recognizer = null;
  }
  isRunning = false;
  currentModel = null;
  console.log('[ASR] 引擎已重置');
}

module.exports = { 
  initASR, 
  feedAudio, 
  stopRecognition, 
  resetASR,
  getAvailableModels,
  getDefaultModelId,
  ASR_MODELS 
};
