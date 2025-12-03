/**
 * 应用配置常量
 */

// 判断是否为开发环境
const __DEV__ = process.env.NODE_ENV === 'development';

export const APP_CONFIG = {
  // API 地址
  API_BASE_URL: __DEV__ ? 'http://localhost:8020' : 'https://api.example.com',

  WS_BASE_URL: __DEV__ ? 'ws://localhost:8020' : 'wss://api.example.com',

  // 超时配置
  HTTP_TIMEOUT: 30000, // 30秒
  WS_RECONNECT_DELAY: [1000, 2000, 5000], // 重连延迟

  // 音频配置
  AUDIO_MAX_DURATION: 60, // 最长60秒
  AUDIO_SAMPLE_RATE: 16000,

  // 缓存配置
  MAX_HISTORY_SIZE: 100,
};

// 错误代码
export enum ErrorCode {
  // 网络错误 (1xxx)
  NETWORK_ERROR = 'E1001',
  TIMEOUT_ERROR = 'E1002',
  CONNECTION_REFUSED = 'E1003',

  // API错误 (2xxx)
  API_ERROR = 'E2001',
  INVALID_REQUEST = 'E2002',
  UNAUTHORIZED = 'E2003',

  // STT错误 (3xxx)
  STT_ERROR = 'E3001',
  AUDIO_FORMAT_ERROR = 'E3002',
  AUDIO_TOO_LONG = 'E3003',

  // NLU错误 (4xxx)
  NLU_ERROR = 'E4001',
  COMMAND_PARSE_ERROR = 'E4002',
  INVALID_COMMAND = 'E4003',

  // WebSocket错误 (5xxx)
  WS_CONNECTION_ERROR = 'E5001',
  WS_SEND_ERROR = 'E5002',
  WS_RECONNECT_FAILED = 'E5003',

  // 3D渲染错误 (6xxx)
  MODEL_LOAD_ERROR = 'E6001',
  RENDER_ERROR = 'E6002',
}

// 错误提示映射
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.NETWORK_ERROR]: '网络连接失败，请检查网络',
  [ErrorCode.TIMEOUT_ERROR]: '请求超时，请重试',
  [ErrorCode.CONNECTION_REFUSED]: '无法连接到服务器',
  [ErrorCode.API_ERROR]: 'API 调用失败',
  [ErrorCode.INVALID_REQUEST]: '请求参数错误',
  [ErrorCode.UNAUTHORIZED]: '未授权访问',
  [ErrorCode.STT_ERROR]: '语音识别失败，请重新录音',
  [ErrorCode.AUDIO_FORMAT_ERROR]: '不支持的音频格式',
  [ErrorCode.AUDIO_TOO_LONG]: '音频时长超过限制',
  [ErrorCode.NLU_ERROR]: '无法理解指令，请换个说法',
  [ErrorCode.COMMAND_PARSE_ERROR]: '指令解析失败',
  [ErrorCode.INVALID_COMMAND]: '无效的指令',
  [ErrorCode.WS_CONNECTION_ERROR]: '连接断开，正在重连...',
  [ErrorCode.WS_SEND_ERROR]: '发送消息失败',
  [ErrorCode.WS_RECONNECT_FAILED]: '重连失败，请刷新页面',
  [ErrorCode.MODEL_LOAD_ERROR]: '3D 模型加载失败',
  [ErrorCode.RENDER_ERROR]: '渲染错误',
};

