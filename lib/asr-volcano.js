/**
 * 火山引擎 双向流式语音识别 (SAUC bigmodel)
 * WebSocket 二进制协议 + Gzip 压缩
 * 接口: wss://openspeech.bytedance.com/api/v3/sauc/bigmodel
 *
 * 帧结构: header(4B) + [sequence(4B)] + payload_size(4B, 大端) + payload
 * 鉴权走 HTTP 请求头 (X-Api-App-Key / X-Api-Access-Key / X-Api-Resource-Id)
 * 需要设置自定义 header, 因此只能在主进程用 ws 包, 浏览器 WebSocket 做不到。
 */

const WebSocket = require('ws');
const zlib = require('zlib');
const crypto = require('crypto');

const WS_URL = 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel';

// message type (高4位)
const CLIENT_FULL_REQUEST = 0b0001; // 端上发送请求参数
const CLIENT_AUDIO_ONLY = 0b0010;   // 端上发送音频数据
const SERVER_FULL_RESPONSE = 0b1001; // 服务端识别结果
const SERVER_ERROR = 0b1111;         // 服务端错误

// message type specific flags (低4位)
const FLAG_POS_SEQUENCE = 0b0001;      // 携带正序号
const FLAG_NEG_WITH_SEQUENCE = 0b0011; // 携带负序号, 且为最后一包

// 序列化 / 压缩
const SER_RAW = 0b0000;
const SER_JSON = 0b0001;
const COMPRESS_NONE = 0b0000;
const COMPRESS_GZIP = 0b0001;

let ws = null;
let seq = 0;
let connected = false;
let onResult = null;   // (result:{text,isFinal}) => void
let onError = null;    // (err:{code?,message}) => void
let definiteEmitted = 0; // 已作为最终句发出的 definite utterance 数量
let lastTail = '';       // 最近一次未确定(non-definite)的尾巴文本, 停止时补发为最终句

// ===== 帧构造 =====

function buildHeader(messageType, flags, serialization, compression) {
  return Buffer.from([
    (0b0001 << 4) | 0b0001,              // version 1, header size 1 (=4字节)
    (messageType << 4) | flags,
    (serialization << 4) | compression,
    0x00                                  // reserved
  ]);
}

function buildFrame(messageType, flags, serialization, compression, payload, seqNum) {
  const header = buildHeader(messageType, flags, serialization, compression);
  const parts = [header];
  if (flags === FLAG_POS_SEQUENCE || flags === FLAG_NEG_WITH_SEQUENCE) {
    const seqBuf = Buffer.alloc(4);
    seqBuf.writeInt32BE(seqNum, 0);
    parts.push(seqBuf);
  }
  const sizeBuf = Buffer.alloc(4);
  sizeBuf.writeUInt32BE(payload.length, 0);
  parts.push(sizeBuf, payload);
  return Buffer.concat(parts);
}

// ===== 响应解析 =====

function parseServerFrame(data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  if (buf.length < 4) return null;

  const messageType = (buf[1] >> 4) & 0x0f;
  const flags = buf[1] & 0x0f;
  const compression = buf[2] & 0x0f;

  let offset = 4;

  if (messageType === SERVER_ERROR) {
    const code = buf.readUInt32BE(offset); offset += 4;
    const size = buf.readUInt32BE(offset); offset += 4;
    let msg = buf.slice(offset, offset + size);
    if (compression === COMPRESS_GZIP) {
      try { msg = zlib.gunzipSync(msg); } catch (e) { /* 保留原样 */ }
    }
    return { type: 'error', code, message: msg.toString('utf-8') };
  }

  if (messageType === SERVER_FULL_RESPONSE) {
    // 携带序号(flags 含正/负序号位)时, header 后 4 字节为 sequence
    if (flags === FLAG_POS_SEQUENCE || flags === FLAG_NEG_WITH_SEQUENCE) {
      offset += 4; // 跳过 sequence
    }
    const size = buf.readUInt32BE(offset); offset += 4;
    let payload = buf.slice(offset, offset + size);
    if (compression === COMPRESS_GZIP) {
      try { payload = zlib.gunzipSync(payload); } catch (e) { return null; }
    }
    let json;
    try { json = JSON.parse(payload.toString('utf-8')); } catch (e) { return null; }
    return { type: 'result', flags, json };
  }

  return null;
}

// 从服务端 JSON 里提取当前文本, 并判断是否有新的确定分句
function handleServerJson(json) {
  const result = json && json.result;
  if (!result) return;

  const text = (result.text || '').trim();
  const utterances = result.utterances || [];

  // 统计已确定(definite)的分句数; 火山是全量返回, 用 definite 边界来切"最终句"
  const definiteCount = utterances.filter(u => u.definite).length;

  if (definiteCount > definiteEmitted) {
    // 有新确定的整句
    const newDefinite = utterances.filter(u => u.definite).slice(definiteEmitted);
    definiteEmitted = definiteCount;
    for (const u of newDefinite) {
      const t = (u.text || '').trim();
      if (t && onResult) onResult({ text: t, isFinal: true });
    }
    // 确定句之后可能还有未定的尾巴, 作为中间结果刷新
    const tail = utterances.filter(u => !u.definite).map(u => u.text).join('').trim();
    lastTail = tail; // 记录当前尾巴, 停止时若始终未转正则补发为最终句
    if (tail && onResult) onResult({ text: tail, isFinal: false });
  } else if (text && onResult) {
    // 无新确定句, 整体作为中间结果(取未定部分, 没有则用整段)
    const tail = utterances.length
      ? utterances.filter(u => !u.definite).map(u => u.text).join('').trim()
      : text;
    lastTail = tail;
    if (tail) onResult({ text: tail, isFinal: false });
  }
}

// ===== 连接与初始化 =====

/**
 * 建立火山流式连接
 * @param {object} settings - 含 volcAppKey / volcAccessKey / volcResourceId
 * @param {object} handlers - { onResult, onError }
 */
function initVolcanoASR(settings, handlers = {}) {
  return new Promise((resolve, reject) => {
    const appKey = settings.volcAppKey;
    const accessKey = settings.volcAccessKey;
    const resourceId = settings.volcResourceId || 'volc.bigasr.sauc.duration';

    if (!appKey || !accessKey) {
      reject(new Error('火山引擎需要填写 App Key 和 Access Key'));
      return;
    }

    onResult = handlers.onResult || null;
    onError = handlers.onError || null;
    seq = 0;
    definiteEmitted = 0;
    lastTail = '';

    ws = new WebSocket(WS_URL, {
      headers: {
        'X-Api-App-Key': appKey,
        'X-Api-Access-Key': accessKey,
        'X-Api-Resource-Id': resourceId,
        'X-Api-Connect-Id': crypto.randomUUID()
      }
    });

    ws.on('open', () => {
      // 发送 full client request
      const requestJson = {
        user: { uid: 'expression-trainer' },
        audio: { format: 'pcm', rate: 16000, bits: 16, channel: 1, codec: 'raw' },
        request: {
          model_name: 'bigmodel',
          enable_itn: true,
          enable_punc: true,
          show_utterances: true,
          result_type: 'full'
        }
      };
      const payload = zlib.gzipSync(Buffer.from(JSON.stringify(requestJson), 'utf-8'));
      seq += 1;
      const frame = buildFrame(CLIENT_FULL_REQUEST, FLAG_POS_SEQUENCE, SER_JSON, COMPRESS_GZIP, payload, seq);
      ws.send(frame);
      connected = true;
      resolve();
    });

    ws.on('message', (data) => {
      const parsed = parseServerFrame(data);
      if (!parsed) return;
      if (parsed.type === 'error') {
        if (onError) onError({ code: parsed.code, message: parsed.message });
        return;
      }
      if (parsed.type === 'result') {
        handleServerJson(parsed.json);
      }
    });

    ws.on('error', (err) => {
      connected = false;
      if (onError) onError({ message: err.message });
      reject(err);
    });

    ws.on('close', () => {
      connected = false;
    });
  });
}

// ===== 音频推送 =====

/**
 * 推送一包音频。samples 为 Float32Array (16kHz 单声道), 内部转 16bit PCM。
 */
function feedVolcanoAudio(samples) {
  if (!connected || !ws || ws.readyState !== WebSocket.OPEN) return;

  const pcm = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    pcm.writeInt16LE(s < 0 ? s * 0x8000 : s * 0x7fff, i * 2);
  }
  const payload = zlib.gzipSync(pcm);
  seq += 1;
  const frame = buildFrame(CLIENT_AUDIO_ONLY, FLAG_POS_SEQUENCE, SER_RAW, COMPRESS_GZIP, payload, seq);
  ws.send(frame);
}

/**
 * 停止: 发送最后一包(负序号)并关闭连接
 */
function stopVolcanoASR() {
  // 补发残留尾巴: 若最后一段话始终没被服务端标记为 definite,
  // 这里作为最终句发出, 否则它只以中间态出现过, 不会进入 fullText
  if (lastTail && onResult) {
    try { onResult({ text: lastTail, isFinal: true }); } catch (e) { /* 忽略 */ }
  }
  lastTail = '';

  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      const payload = zlib.gzipSync(Buffer.alloc(0));
      seq += 1;
      const frame = buildFrame(CLIENT_AUDIO_ONLY, FLAG_NEG_WITH_SEQUENCE, SER_RAW, COMPRESS_GZIP, payload, -seq);
      ws.send(frame);
    } catch (e) { /* 忽略关闭时的发送错误 */ }
  }
  connected = false;
  // 稍等服务端回最终帧再关
  const closing = ws;
  ws = null;
  if (closing) {
    setTimeout(() => { try { closing.close(); } catch (e) {} }, 800);
  }
}

module.exports = { initVolcanoASR, feedVolcanoAudio, stopVolcanoASR };

