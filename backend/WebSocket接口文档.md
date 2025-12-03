# WebSocket 接口文档

## 概述

本系统通过 WebSocket 提供两种语音识别模式：

| 模式 | 适用场景 | 模型 | 特点 |
|------|---------|------|------|
| **非流式** | 语音输入按钮（录完再识别） | SenseVoice | 识别准确，支持多语言 |
| **流式** | 语音通话（边说边识别） | Paraformer-Streaming | 实时返回，延迟低 |

---

## 连接地址

```
ws://{host}:{port}/ws/robot/{client_id}
```

**参数说明：**
- `host`: 服务器地址（默认 `localhost`）
- `port`: 服务端口（默认 `8020`）
- `client_id`: 客户端唯一标识（建议使用 UUID）

**示例：**
```
ws://localhost:8020/ws/robot/550e8400-e29b-41d4-a716-446655440000
```

---

## 通用消息格式

### 请求消息（客户端 → 服务端）

```json
{
  "type": "消息类型",
  "data": { ... }
}
```

### 响应消息（服务端 → 客户端）

```json
{
  "type": "消息类型",
  "data": { ... }
}
```

---

## 一、非流式语音识别

适用于 **语音输入按钮**（录完一段话后识别）。

### 消息流程

```
客户端                        服务端
  |                            |
  |--- audio_start ----------->|  开始录音
  |<-- status ----------------|  确认开始
  |                            |
  |--- audio_chunk ----------->|  发送音频数据
  |    (可多次发送)             |
  |                            |
  |--- audio_end ------------->|  结束录音
  |<-- stt_result ------------|  返回识别结果
  |                            |
```

### 消息定义

#### 1. `audio_start` - 开始录音

```json
// 请求
{ "type": "audio_start", "data": {} }

// 响应
{ 
  "type": "status", 
  "data": { 
    "status": "listening", 
    "message": "开始语音识别" 
  } 
}
```

#### 2. `audio_chunk` - 发送音频数据

```json
// 请求
{ 
  "type": "audio_chunk", 
  "data": { 
    "chunk": "Base64编码的音频数据" 
  } 
}
```

**音频格式要求：**
- 格式：PCM 或 M4A/AAC（服务端会自动转换）
- 采样率：16kHz
- 声道：单声道
- 位深：16bit

#### 3. `audio_end` - 结束录音

```json
// 请求
{ "type": "audio_end", "data": {} }

// 响应
{ 
  "type": "stt_result", 
  "data": { 
    "text": "识别出的文本",
    "is_final": true
  } 
}
```

### 完整示例（JavaScript）

```javascript
const ws = new WebSocket('ws://localhost:8020/ws/robot/client-001');

// 开始录音
ws.send(JSON.stringify({ type: 'audio_start', data: {} }));

// 录音结束后发送完整音频
const audioBase64 = await recordAudio(); // 你的录音函数
ws.send(JSON.stringify({ 
  type: 'audio_chunk', 
  data: { chunk: audioBase64 } 
}));

// 结束并获取结果
ws.send(JSON.stringify({ type: 'audio_end', data: {} }));

// 监听结果
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'stt_result') {
    console.log('识别结果:', msg.data.text);
  }
};
```

---

## 二、流式语音识别（语音通话）

适用于 **语音通话**（边说边识别，实时返回结果）。

### 消息流程

```
客户端                        服务端
  |                            |
  |--- call_start ------------>|  开始通话
  |<-- call_status ------------|  确认连接
  |                            |
  |--- call_audio ------------>|  发送音频块
  |<-- call_transcript --------|  实时返回识别
  |                            |
  |--- call_audio ------------>|  继续发送
  |<-- call_transcript --------|  继续返回
  |    (循环...)               |
  |                            |
  |--- call_end -------------->|  结束通话
  |<-- call_transcript --------|  最终结果
  |<-- call_status ------------|  确认断开
  |                            |
```

### 消息定义

#### 1. `call_start` - 开始通话

```json
// 请求
{ "type": "call_start", "data": {} }

// 响应
{ 
  "type": "call_status", 
  "data": { 
    "status": "connected", 
    "message": "语音通话已连接" 
  } 
}
```

#### 2. `call_audio` - 发送音频块

```json
// 请求
{ 
  "type": "call_audio", 
  "data": { 
    "chunk": "Base64编码的PCM音频数据" 
  } 
}

// 响应（有识别结果时返回）
{ 
  "type": "call_transcript", 
  "data": { 
    "text": "增量识别文本",
    "full_text": "累积的完整文本",
    "is_final": false
  } 
}
```

**音频格式要求（严格）：**
- 格式：**PCM（Raw）**
- 采样率：**16kHz**
- 声道：**单声道**
- 位深：**16bit (int16)**
- 建议块大小：**600ms**（9600 samples = 19200 bytes）

#### 3. `call_end` - 结束通话

```json
// 请求
{ "type": "call_end", "data": {} }

// 响应1 - 最终识别结果
{ 
  "type": "call_transcript", 
  "data": { 
    "text": "最后一段文本",
    "full_text": "完整的对话文本",
    "is_final": true
  } 
}

// 响应2 - 通话状态
{ 
  "type": "call_status", 
  "data": { 
    "status": "disconnected", 
    "message": "语音通话已结束" 
  } 
}
```

### 完整示例（React Native）

```typescript
import { Audio } from 'expo-av';

class VoiceCallService {
  private ws: WebSocket;
  private recording: Audio.Recording | null = null;
  
  // 开始通话
  async startCall() {
    // 发送开始消息
    this.ws.send(JSON.stringify({ type: 'call_start', data: {} }));
    
    // 开始录音并实时发送
    this.recording = new Audio.Recording();
    await this.recording.prepareToRecordAsync({
      android: {
        extension: '.pcm',
        outputFormat: Audio.RECORDING_OPTION_ANDROID_OUTPUT_FORMAT_PCM_16BIT,
        audioEncoder: Audio.RECORDING_OPTION_ANDROID_AUDIO_ENCODER_PCM_16BIT,
        sampleRate: 16000,
        numberOfChannels: 1,
      },
      ios: {
        extension: '.pcm',
        audioQuality: Audio.RECORDING_OPTION_IOS_AUDIO_QUALITY_HIGH,
        sampleRate: 16000,
        numberOfChannels: 1,
        bitRate: 256000,
        linearPCMBitDepth: 16,
        linearPCMIsBigEndian: false,
        linearPCMIsFloat: false,
      },
    });
    
    // 设置定时发送音频块（每 600ms）
    this.startStreamingAudio();
  }
  
  // 结束通话
  async endCall() {
    await this.recording?.stopAndUnloadAsync();
    this.ws.send(JSON.stringify({ type: 'call_end', data: {} }));
  }
  
  // 监听消息
  setupMessageHandler() {
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      
      switch (msg.type) {
        case 'call_transcript':
          console.log('实时识别:', msg.data.text);
          console.log('完整文本:', msg.data.full_text);
          break;
        case 'call_status':
          console.log('通话状态:', msg.data.status);
          break;
        case 'call_error':
          console.error('错误:', msg.data.error);
          break;
      }
    };
  }
}
```

---

## 三、心跳保活

为保持连接，客户端应定期发送心跳消息。

```json
// 请求
{ "type": "heartbeat", "data": {} }

// 响应
{ "type": "heartbeat_ack", "data": {} }
```

**建议：** 每 30 秒发送一次心跳。

---

## 四、错误处理

### 错误响应格式

```json
{
  "type": "call_error",
  "data": {
    "error": "错误描述信息"
  }
}
```

### 常见错误

| 错误信息 | 原因 | 解决方案 |
|---------|------|---------|
| `流式 STT 模型未初始化` | 模型未加载 | 检查模型路径配置 |
| `音频解码失败` | 音频格式错误 | 确保发送 PCM 16kHz 格式 |
| `收到 call_audio 但没有活动的语音通话会话` | 未先调用 call_start | 先发送 call_start |

---

## 五、配置说明

相关配置位于 `backend/app/config.py`：

```python
# STT 模型路径配置
STT_MODEL_DIR = "/path/to/SenseVoiceSmall"  # 非流式模型
STREAMING_STT_MODEL_DIR = "/path/to/paraformer-zh-streaming"  # 流式模型
```

---

## 六、注意事项

1. **流式识别音频格式**：必须是 PCM 16kHz 单声道，不支持压缩格式
2. **音频块大小**：建议 600ms（9600 samples），太小会影响识别准确率
3. **会话管理**：一个 client_id 同时只能有一个活动的流式会话
4. **资源释放**：通话结束后务必发送 `call_end` 释放服务端资源

