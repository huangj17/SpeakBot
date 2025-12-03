import { AudioModule, RecordingPresets, useAudioRecorder } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { useCallback, useEffect, useRef, useState } from 'react';
import { wsService } from '../services/websocket';

interface UseVoiceInputResult {
  isRecording: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  hasPermission: boolean;
}

export const useVoiceInput = (): UseVoiceInputResult => {
  const [hasPermission, setHasPermission] = useState(false);
  // 使用自己的状态跟踪录音，避免依赖 audioRecorder.isRecording 的延迟
  const [isRecording, setIsRecording] = useState(false);
  const isRecordingRef = useRef(false); // 用 ref 确保在异步函数中获取最新状态
  
  // 使用 expo-audio 的 hook
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  useEffect(() => {
    (async () => {
      try {
        const status = await AudioModule.requestRecordingPermissionsAsync();
        setHasPermission(status.granted);
        
        // iOS 需要设置音频模式才能录音
        if (status.granted) {
          await AudioModule.setAudioModeAsync({
            allowsRecording: true,
            playsInSilentMode: true,
          });
        }
      } catch (error) {
        console.error('Error requesting audio permissions:', error);
      }
    })();
  }, []);

  const startRecording = useCallback(async () => {
    if (!hasPermission) {
      console.warn('No audio permission');
      return;
    }

    // 防止重复启动
    if (isRecordingRef.current) {
      console.log('Already recording, ignoring start request');
      return;
    }

    try {
      console.log('Starting recording...');
      
      // 先更新状态
      isRecordingRef.current = true;
      setIsRecording(true);
      
      // 检查 audioRecorder 是否有效
      if (!audioRecorder || typeof audioRecorder.prepareToRecordAsync !== 'function') {
        throw new Error('Audio recorder not available');
      }
      
      // 1. 先准备录音器 (必须！否则文件不会创建)
      await audioRecorder.prepareToRecordAsync();
      
      // 2. 开始录音
      audioRecorder.record();
      
      // 发送开始信号
      wsService.sendAudioStart();
      
      console.log('Recording started successfully');
      
    } catch (error: any) {
      console.error('Failed to start recording:', error);
      
      // 检测是否是 native 对象失效的错误
      const errorMsg = error?.message || String(error);
      if (errorMsg.includes('NativeSharedObjectNotFoundException') || 
          errorMsg.includes('FunctionCallException')) {
        console.warn('Native recorder object invalid, please try again');
      }
      
      // 出错时重置状态
      isRecordingRef.current = false;
      setIsRecording(false);
    }
  }, [hasPermission, audioRecorder]);

  const stopRecording = useCallback(async () => {
    // 使用 ref 检查状态，避免闭包问题
    if (!isRecordingRef.current) {
      console.log('Not recording, ignoring stop request');
      return;
    }

    try {
      console.log('Stopping recording...');
      
      // 先更新状态，防止重复调用
      isRecordingRef.current = false;
      setIsRecording(false);
      
      // 停止录音
      await audioRecorder.stop();
      
      // 给文件系统一点时间完成写入
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const uri = audioRecorder.uri;
      console.log('Audio file URI:', uri);
      
      if (uri) {
        // 检查文件是否存在
        const fileInfo = await FileSystem.getInfoAsync(uri);
        console.log('File info:', JSON.stringify(fileInfo));
        
        if (fileInfo.exists && fileInfo.size && fileInfo.size > 0) {
          console.log(`Reading audio file, size: ${fileInfo.size} bytes`);
          
          // 读取文件并发送
          const base64Data = await FileSystem.readAsStringAsync(uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          
          console.log(`Base64 data size: ${base64Data.length} chars`);
          
          // 发送数据
          wsService.sendAudioChunk(base64Data);
          
          // 发送结束信号
          wsService.sendAudioEnd();
          
          console.log('Audio sent successfully');
        } else {
          console.warn('Audio file does not exist or is empty:', fileInfo);
          wsService.sendAudioEnd();
        }
      } else {
        console.warn('No audio URI available');
        wsService.sendAudioEnd();
      }
      
    } catch (error) {
      console.error('Failed to stop recording:', error);
      // 确保状态被重置
      isRecordingRef.current = false;
      setIsRecording(false);
      // 仍然发送结束信号
      wsService.sendAudioEnd();
    }
  }, [audioRecorder]);

  return {
    isRecording,
    startRecording,
    stopRecording,
    hasPermission,
  };
};
