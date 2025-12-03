/**
 * 语音通话 Hook - 实现实时录音和流式语音转文字
 */

import { AudioModule, AudioQuality, IOSOutputFormat, RecordingOptions, useAudioRecorder } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { useCallback, useEffect, useRef, useState } from 'react';
import { wsService } from '../services/websocket';
import { WebSocketMessage } from '../types/api';

// 通话状态
export type CallStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

// 转写结果
export interface TranscriptResult {
  text: string;        // 增量文本
  fullText: string;    // 完整文本
  isFinal: boolean;    // 是否是最终结果
  shouldSend: boolean; // 检测到停止说话，应该发送指令
  isSpeaking: boolean; // 当前是否在说话
}

// Hook 配置
interface UseVoiceCallOptions {
  // 检测到停止说话时的回调，返回要发送的文本
  onAutoSend?: (text: string) => Promise<void>;
}

interface UseVoiceCallResult {
  // 状态
  isInCall: boolean;
  callStatus: CallStatus;
  hasPermission: boolean;
  transcript: TranscriptResult;
  error: string | null;
  isSpeaking: boolean;  // 当前是否在说话（静音检测）
  
  // 操作
  startCall: () => Promise<void>;
  endCall: () => Promise<void>;
  clearTranscript: () => void;  // 清空转写文本
  
  // 静音控制（仅本地状态，实际静音需要在录音层处理）
  isMuted: boolean;
  setMuted: (muted: boolean) => void;
}

// 音频块发送间隔（毫秒）- 600ms 对应后端的 chunk_size
const AUDIO_CHUNK_INTERVAL = 600;

// 自定义 WAV/PCM 录音配置（16kHz, 16bit, mono）
// 用于流式语音识别
const PCM_RECORDING_OPTIONS: RecordingOptions = {
  extension: '.wav',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 256000,
  android: {
    extension: '.wav',
    outputFormat: 'default',
    audioEncoder: 'default',
    sampleRate: 16000,
  },
  ios: {
    outputFormat: IOSOutputFormat.LINEARPCM,
    audioQuality: AudioQuality.HIGH,
    sampleRate: 16000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/wav',
    bitsPerSecond: 256000,
  },
};

export const useVoiceCall = (options?: UseVoiceCallOptions): UseVoiceCallResult => {
  const { onAutoSend } = options || {};
  
  // 权限状态
  const [hasPermission, setHasPermission] = useState(false);
  
  // 通话状态
  const [isInCall, setIsInCall] = useState(false);
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);  // VAD 检测的说话状态
  
  // 转写结果
  const [transcript, setTranscript] = useState<TranscriptResult>({
    text: '',
    fullText: '',
    isFinal: false,
    shouldSend: false,
    isSpeaking: false,
  });
  
  // 回调 ref，避免闭包问题
  const onAutoSendRef = useRef(onAutoSend);
  onAutoSendRef.current = onAutoSend;
  
  // 录音相关 ref
  const isInCallRef = useRef(false);
  const audioChunkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastAudioPositionRef = useRef(0);
  const isFirstChunkRef = useRef(true);  // 是否是第一个音频块（包含 WAV 头）
  
  // 使用 expo-audio 的 hook，配置为 PCM 格式
  const audioRecorder = useAudioRecorder(PCM_RECORDING_OPTIONS);
  
  // 请求麦克风权限
  useEffect(() => {
    (async () => {
      try {
        const status = await AudioModule.requestRecordingPermissionsAsync();
        setHasPermission(status.granted);
        
        if (status.granted) {
          await AudioModule.setAudioModeAsync({
            allowsRecording: true,
            playsInSilentMode: true,
          });
        }
      } catch (err) {
        console.error('[VoiceCall] 请求麦克风权限失败:', err);
      }
    })();
  }, []);
  
  // 监听 WebSocket 消息
  useEffect(() => {
    // 通话状态消息
    const handleCallStatus = (message: WebSocketMessage) => {
      const status = message.data?.status;
      console.log('[VoiceCall] 收到通话状态:', status);
      
      if (status === 'connected') {
        setCallStatus('connected');
      } else if (status === 'disconnected') {
        setCallStatus('disconnected');
      }
    };
    
    // 转写结果消息
    const handleTranscript = (message: WebSocketMessage) => {
      const { text, full_text, is_final, should_send, is_speaking } = message.data || {};
      console.log('[VoiceCall] 收到转写结果:', text, '完整:', full_text, 'should_send:', should_send);
      
      // 更新说话状态
      setIsSpeaking(is_speaking ?? false);
      
      setTranscript({
        text: text || '',
        fullText: full_text || '',
        isFinal: is_final || false,
        shouldSend: should_send || false,
        isSpeaking: is_speaking ?? false,
      });
      
      // 检测到停止说话，触发自动发送
      if (should_send && full_text && onAutoSendRef.current) {
        console.log('[VoiceCall] 触发自动发送:', full_text);
        onAutoSendRef.current(full_text);
      }
    };
    
    // 错误消息
    const handleError = (message: WebSocketMessage) => {
      const errorMsg = message.data?.error;
      console.error('[VoiceCall] 收到错误:', errorMsg);
      setError(errorMsg);
      setCallStatus('error');
    };
    
    wsService.on('call_status', handleCallStatus);
    wsService.on('call_transcript', handleTranscript);
    wsService.on('call_error', handleError);
    
    return () => {
      wsService.off('call_status', handleCallStatus);
      wsService.off('call_transcript', handleTranscript);
      wsService.off('call_error', handleError);
    };
  }, []);
  
  // 发送音频块
  const sendAudioChunk = useCallback(async () => {
    if (!isInCallRef.current || !audioRecorder.uri) {
      return;
    }
    
    try {
      // 读取当前录音文件
      const uri = audioRecorder.uri;
      const fileInfo = await FileSystem.getInfoAsync(uri);
      
      if (!fileInfo.exists || !fileInfo.size) {
        return;
      }
      
      // 只发送新增的部分（增量发送）
      const currentSize = fileInfo.size;
      if (currentSize <= lastAudioPositionRef.current) {
        return;
      }
      
      // 读取整个文件为 Base64
      const base64Data = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      // 正确计算 Base64 截取位置
      // Base64 编码：每 3 字节原始数据 -> 4 个 Base64 字符
      // 确保截取位置对齐到 4 的倍数，避免解码错误
      const base64Start = Math.ceil(lastAudioPositionRef.current / 3) * 4;
      const newChunk = base64Data.slice(base64Start);
      
      if (newChunk.length > 0) {
        // 发送音频块，标记是否是第一个块（包含 WAV 头）
        wsService.sendCallAudio(newChunk, isFirstChunkRef.current);
        lastAudioPositionRef.current = currentSize;
        isFirstChunkRef.current = false;
      }
      
    } catch (err) {
      console.error('[VoiceCall] 发送音频块失败:', err);
    }
  }, [audioRecorder.uri]);
  
  // 开始通话
  const startCall = useCallback(async () => {
    if (!hasPermission) {
      console.warn('[VoiceCall] 没有麦克风权限');
      setError('没有麦克风权限');
      return;
    }
    
    if (isInCallRef.current) {
      console.log('[VoiceCall] 已在通话中');
      return;
    }
    
    try {
      console.log('[VoiceCall] 开始通话...');
      setError(null);
      setCallStatus('connecting');
      setTranscript({ text: '', fullText: '', isFinal: false, shouldSend: false, isSpeaking: false });
      setIsSpeaking(false);
      
      // 确保 WebSocket 已连接
      if (!wsService.isReady()) {
        await wsService.connect();
      }
      
      // 发送通话开始信号
      wsService.sendCallStart();
      
      // 准备并开始录音
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      
      // 更新状态
      isInCallRef.current = true;
      setIsInCall(true);
      lastAudioPositionRef.current = 0;
      isFirstChunkRef.current = true;  // 重置第一个块标记
      
      // 启动定时发送音频块
      audioChunkTimerRef.current = setInterval(() => {
        sendAudioChunk();
      }, AUDIO_CHUNK_INTERVAL);
      
      console.log('[VoiceCall] 通话已开始');
      
    } catch (err: any) {
      console.error('[VoiceCall] 开始通话失败:', err);
      setError(err?.message || '开始通话失败');
      setCallStatus('error');
      isInCallRef.current = false;
      setIsInCall(false);
    }
  }, [hasPermission, audioRecorder, sendAudioChunk]);
  
  // 结束通话
  const endCall = useCallback(async () => {
    if (!isInCallRef.current) {
      console.log('[VoiceCall] 未在通话中');
      return;
    }
    
    try {
      console.log('[VoiceCall] 结束通话...');
      
      // 停止定时器
      if (audioChunkTimerRef.current) {
        clearInterval(audioChunkTimerRef.current);
        audioChunkTimerRef.current = null;
      }
      
      // 发送最后一块音频
      await sendAudioChunk();
      
      // 停止录音
      await audioRecorder.stop();
      
      // 发送通话结束信号
      wsService.sendCallEnd();
      
      // 更新状态
      isInCallRef.current = false;
      setIsInCall(false);
      setCallStatus('disconnected');
      
      console.log('[VoiceCall] 通话已结束');
      
    } catch (err: any) {
      console.error('[VoiceCall] 结束通话失败:', err);
      setError(err?.message || '结束通话失败');
      
      // 确保状态被重置
      isInCallRef.current = false;
      setIsInCall(false);
      setCallStatus('error');
      
      // 确保发送结束信号
      wsService.sendCallEnd();
    }
  }, [audioRecorder, sendAudioChunk]);
  
  // 清空转写文本（发送后调用）
  const clearTranscript = useCallback(() => {
    setTranscript({ text: '', fullText: '', isFinal: false, shouldSend: false, isSpeaking: false });
  }, []);
  
  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (audioChunkTimerRef.current) {
        clearInterval(audioChunkTimerRef.current);
      }
      if (isInCallRef.current) {
        wsService.sendCallEnd();
      }
    };
  }, []);
  
  return {
    isInCall,
    callStatus,
    hasPermission,
    transcript,
    error,
    isSpeaking,
    startCall,
    endCall,
    clearTranscript,
    isMuted,
    setMuted: setIsMuted,
  };
};

