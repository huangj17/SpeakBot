/**
 * API 响应类型定义
 */

import { NLUResult } from './commands';

/**
 * STT API 响应
 */
export interface STTResponse {
  success: boolean;
  text?: string;
  confidence?: number;
  duration?: number;
  error?: string;
  error_code?: string;
}

/**
 * NLU API 响应
 */
export interface NLUResponse {
  success: boolean;
  result?: NLUResult;
  processing_time?: number;
}

/**
 * WebSocket 消息
 */
export interface WebSocketMessage {
  type:
    | 'command'
    | 'command_sequence'
    | 'error'
    | 'heartbeat'
    | 'heartbeat_ack'
    | 'status'
    | 'audio_start'
    | 'audio_chunk'
    | 'audio_end'
    | 'stt_result'
    // 流式语音通话消息类型
    | 'call_start'
    | 'call_audio'
    | 'call_end'
    | 'call_transcript'
    | 'call_status'
    | 'call_error';
  data: any;
  timestamp: string;
}

