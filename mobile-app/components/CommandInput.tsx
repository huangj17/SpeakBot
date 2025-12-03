import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useVoiceCall } from "../src/hooks/useVoiceCall";
import { useVoiceInput } from "../src/hooks/useVoiceInput";
import { apiService } from "../src/services/api";
import { wsService } from "../src/services/websocket";
import { useCommandStore } from "../src/store/commandStore";
import { WebSocketMessage } from "../src/types/api";
import { SingleCommandResult } from "../src/types/commands";
import { IconSymbol } from "./ui/icon-symbol";
import { VoiceRecordButton } from "./VoiceRecordButton";

// 录音状态提示组件
const RecordingIndicator = () => {
  const opacity = useSharedValue(1);
  
  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.5, { duration: 800 }),
      -1,
      true
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  const dotStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));
  
  return (
    <Animated.View 
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      style={styles.recordingContainer}
    >
      <View style={styles.recordingBadge}>
        <Animated.View style={[styles.recordingDot, dotStyle]} />
        <Text style={styles.recordingText}>松开结束录音</Text>
      </View>
    </Animated.View>
  );
};

// 单个波形条动画组件
const WaveBar = ({ delay, baseHeight }: { delay: number; baseHeight: number }) => {
  const height = useSharedValue(baseHeight);
  
  useEffect(() => {
    // 为每个波形条创建随机且错开的动画
    const minHeight = 8;
    const maxHeight = baseHeight + 20;
    
    height.value = withRepeat(
      withSequence(
        withTiming(maxHeight, { duration: 300 + delay * 50 }),
        withTiming(minHeight, { duration: 400 + delay * 30 }),
        withTiming(baseHeight, { duration: 250 + delay * 40 })
      ),
      -1,
      true
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  const barStyle = useAnimatedStyle(() => ({
    height: height.value,
  }));
  
  return <Animated.View style={[styles.waveBar, barStyle]} />;
};

// 波形动画组件
const WaveformAnimation = () => {
  // 7个波形条，每个有不同的基础高度和延迟
  const bars = [
    { delay: 0, baseHeight: 12 },
    { delay: 1, baseHeight: 20 },
    { delay: 2, baseHeight: 28 },
    { delay: 3, baseHeight: 36 },
    { delay: 4, baseHeight: 28 },
    { delay: 5, baseHeight: 20 },
    { delay: 6, baseHeight: 12 },
  ];
  
  return (
    <View style={styles.waveformContainer}>
      {bars.map((bar, index) => (
        <WaveBar key={index} delay={bar.delay} baseHeight={bar.baseHeight} />
      ))}
    </View>
  );
};

// 格式化通话时长（秒 -> mm:ss）
const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// 通话控制按钮组件
interface CallControlButtonProps {
  icon: string;
  label: string;
  onPress: () => void;
  isActive?: boolean;
  isDanger?: boolean;
}

const CallControlButton = ({ icon, label, onPress, isActive, isDanger }: CallControlButtonProps) => {
  const bgColor = isDanger 
    ? '#FEE2E2' 
    : isActive 
      ? '#D1FAE5' 
      : '#F3F4F6';
  const iconColor = isDanger 
    ? '#EF4444' 
    : isActive 
      ? '#10B981' 
      : '#6B7280';
  const textColor = isDanger 
    ? '#DC2626' 
    : isActive 
      ? '#059669' 
      : '#6B7280';
  
  return (
    <Pressable style={styles.callControlButton} onPress={onPress}>
      <View style={[styles.callControlIcon, { backgroundColor: bgColor }]}>
        <IconSymbol name={icon as any} size={24} color={iconColor} />
      </View>
      <Text style={[styles.callControlLabel, { color: textColor }]}>{label}</Text>
    </Pressable>
  );
};

// 通话中状态面板组件
interface CallInProgressPanelProps {
  duration: number;
  isMuted: boolean;
  isSpeakerOn: boolean;
  transcript: string;  // 实时转写文本
  isSpeaking: boolean; // 是否正在说话（静音检测）
  isSending: boolean;  // 是否正在发送指令
  onToggleMute: () => void;
  onToggleSpeaker: () => void;
  onHangUp: () => void;
  onManualSend: () => void;  // 手动发送指令
  onClearTranscript: () => void; // 清除转写
}

const CallInProgressPanel = ({
  duration,
  isMuted,
  isSpeakerOn,
  transcript,
  isSpeaking,
  isSending,
  onToggleMute,
  onToggleSpeaker,
  onHangUp,
  onManualSend,
  onClearTranscript,
}: CallInProgressPanelProps) => {
  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      exiting={FadeOut.duration(200)}
      style={styles.callPanel}
    >
      {/* 通话状态标题 */}
      <View style={styles.callHeader}>
        <View style={styles.callStatusBadge}>
          <View style={[styles.callStatusDot, isSpeaking && styles.callStatusDotSpeaking]} />
          <Text style={styles.callStatusText}>{isSpeaking ? '正在听...' : '通话中'}</Text>
        </View>
        <Text style={styles.callDuration}>{formatDuration(duration)}</Text>
      </View>
      
      {/* 实时转写文本区域 */}
      {transcript ? (
        <View style={styles.transcriptContainer}>
          <View style={styles.transcriptContent}>
          <Text style={styles.transcriptText}>{transcript}</Text>
            {!isSending && (
              <TouchableOpacity 
                onPress={onClearTranscript}
                style={styles.clearButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <IconSymbol name="xmark.circle.fill" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            )}
          </View>
          
          {/* 手动发送按钮 */}
          {!isSending && (
            <TouchableOpacity 
              style={styles.manualSendButton}
              onPress={onManualSend}
            >
              <Text style={styles.manualSendButtonText}>发送指令</Text>
            </TouchableOpacity>
          )}
          {isSending && (
            <View style={styles.sendingIndicator}>
              <ActivityIndicator size="small" color="#10B981" />
              <Text style={styles.sendingText}>发送中...</Text>
            </View>
          )}
        </View>
      ) : (
        /* 波形动画（无转写时显示） */
        <WaveformAnimation />
      )}
      
      {/* 提示文字 */}
      <Text style={styles.vadTipText}>
        💡 说完后稍作停顿，系统会自动发送指令
      </Text>
      
      {/* 控制按钮 */}
      <View style={styles.callControls}>
        <CallControlButton
          icon={isMuted ? "mic.slash.fill" : "mic.fill"}
          label={isMuted ? "已静音" : "静音"}
          onPress={onToggleMute}
          isActive={!isMuted}
        />
        <CallControlButton
          icon={isSpeakerOn ? "speaker.wave.3.fill" : "speaker.fill"}
          label={isSpeakerOn ? "扬声器开" : "扬声器"}
          onPress={onToggleSpeaker}
          isActive={isSpeakerOn}
        />
        <CallControlButton
          icon="phone.down.fill"
          label="挂断"
          onPress={onHangUp}
          isDanger
        />
      </View>
    </Animated.View>
  );
};

export const CommandInput = () => {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [callSending, setCallSending] = useState(false);  // 通话中发送指令的状态
  const { addCommand, addCommands, setError } = useCommandStore();
  const insets = useSafeAreaInsets();
  
  // 语音输入 Hook（非流式，录完再识别）
  const { isRecording, startRecording, stopRecording, hasPermission } = useVoiceInput();
  
  // 清空转写的 ref（解决循环依赖）
  const clearTranscriptRef = useRef<(() => void) | null>(null);
  
  // 上一次发送的文本（用于防抖）
  const lastSentTextRef = useRef<string>("");
  
  // 处理通话中自动发送指令（静音检测触发）
  const handleAutoSendCommand = useCallback(async (textToSend: string) => {
    const trimmedText = textToSend.trim();
    if (!trimmedText) return;
    
    // 防止重复发送相同内容（防抖）
    if (trimmedText === lastSentTextRef.current) {
      console.log('[CommandInput] 忽略重复发送:', trimmedText);
      return;
    }
    
    console.log('[CommandInput] 自动发送指令:', trimmedText);
    lastSentTextRef.current = trimmedText;
    setCallSending(true);
    setError(null);
    
    try {
      const result = await apiService.parseCommand(trimmedText);
      
      if (result.type === "error") {
        setError(result.error || "解析失败");
        // 发送失败，允许重试
        lastSentTextRef.current = "";
        return;
      }
      
      if (result.type === "single") {
        const commandData = result as SingleCommandResult;
        addCommand({
          ...commandData,
          command_id: commandData.command_id || Date.now().toString(),
        });
      } else if (result.type === "sequence") {
        const commandsWithIds = result.commands.map((cmd, index) => ({
          ...cmd,
          command_id: cmd.command_id || `${Date.now()}-${index}`,
        }));
        addCommands(commandsWithIds);
      }
      
      // 发送成功后，清空转写文本，准备下一轮
      if (clearTranscriptRef.current) {
        clearTranscriptRef.current();
        // 清空后重置 lastSentText，允许发送新内容
        lastSentTextRef.current = "";
      }
      
    } catch (err) {
      setError("网络请求失败或服务器错误");
      console.error('[CommandInput] 自动发送失败:', err);
      // 发送失败，允许重试
      lastSentTextRef.current = "";
    } finally {
      setCallSending(false);
    }
  }, [addCommand, addCommands, setError]);
  
  // 语音通话 Hook（流式，边说边识别）- 传入自动发送回调
  const {
    isInCall,
    transcript,
    isMuted,
    isSpeaking,
    setMuted,
    startCall,
    endCall,
    clearTranscript,
  } = useVoiceCall({
    onAutoSend: handleAutoSendCommand,
  });
  
  // 更新 ref
  clearTranscriptRef.current = clearTranscript;
  
  // 通话时长计时器
  const [callDuration, setCallDuration] = useState(0);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // 通话计时器逻辑
  useEffect(() => {
    if (isInCall) {
      // 开始通话时重置时长并启动计时器
      setCallDuration(0);
      callTimerRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      // 结束通话时清除计时器
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
        callTimerRef.current = null;
      }
    }
    
    return () => {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
      }
    };
  }, [isInCall]);
  
  // 开始通话
  const handleStartCall = useCallback(async () => {
    setIsSpeakerOn(false);
    await startCall();
  }, [startCall]);
  
  // 结束通话
  const handleEndCall = useCallback(async () => {
    await endCall();
  }, [endCall]);
  
  // 切换静音
  const handleToggleMute = useCallback(() => {
    setMuted(!isMuted);
  }, [isMuted, setMuted]);
  
  // 切换扬声器
  const handleToggleSpeaker = useCallback(() => {
    setIsSpeakerOn(prev => !prev);
    // 扬声器切换暂时只是本地状态
    console.log('切换扬声器');
  }, []);
  
  // 手动发送通话中的指令
  const handleManualSendCall = useCallback(() => {
    if (transcript.fullText.trim()) {
      handleAutoSendCommand(transcript.fullText);
    }
  }, [transcript.fullText, handleAutoSendCommand]);
  
  // 手动清空转写
  const handleClearTranscript = useCallback(() => {
    if (clearTranscriptRef.current) {
      clearTranscriptRef.current();
      lastSentTextRef.current = ""; // 重置防抖
    }
  }, []);

  // 监听 STT 结果
  useEffect(() => {
    const handleSTTResult = (message: WebSocketMessage) => {
      if (message.data && message.data.text) {
        const newText = message.data.text;
        setText(prev => {
          // 简单去重，防止重复追加
          if (prev.endsWith(newText)) return prev;
          return newText; 
        });
      }
    };

    wsService.on('stt_result', handleSTTResult);
    
    return () => {
      wsService.off('stt_result', handleSTTResult);
    };
  }, []);

  const handleSend = async () => {
    const textToSend = text.trim();
    if (!textToSend) return;

    setLoading(true);
    setError(null);

    try {
      const result = await apiService.parseCommand(textToSend);

      if (result.type === "error") {
        setError(result.error || "解析失败");
        return;
      }

      if (result.type === "single") {
        const commandData = result as SingleCommandResult;
        addCommand({
          ...commandData,
          command_id: commandData.command_id || Date.now().toString(),
        });
      } else if (result.type === "sequence") {
        const commandsWithIds = result.commands.map((cmd, index) => ({
          ...cmd,
          command_id: cmd.command_id || `${Date.now()}-${index}`,
        }));
        addCommands(commandsWithIds);
      }

      setText("");
    } catch (err) {
      setError("网络请求失败或服务器错误");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // 通话中状态：显示通话面板
  if (isInCall) {
    return (
      <View 
        className="bg-white dark:bg-black border-t border-gray-200 dark:border-gray-800"
        style={{ paddingBottom: insets.bottom }}
      >
        <CallInProgressPanel
          duration={callDuration}
          isMuted={isMuted}
          isSpeakerOn={isSpeakerOn}
          transcript={transcript.fullText}
          isSpeaking={isSpeaking}
          isSending={callSending}
          onToggleMute={handleToggleMute}
          onToggleSpeaker={handleToggleSpeaker}
          onHangUp={handleEndCall}
          onManualSend={handleManualSendCall}
          onClearTranscript={handleClearTranscript}
        />
      </View>
    );
  }
  
  // 默认状态：显示输入界面
  return (
    <View 
      className="bg-white dark:bg-black border-t border-gray-200 dark:border-gray-800"
      style={{ paddingBottom: insets.bottom }}
    >
      {/* 录音状态提示 - 带动画效果 */}
      {isRecording && <RecordingIndicator />}
      
      <Animated.View 
        entering={FadeIn.duration(300)}
        exiting={FadeOut.duration(200)}
        className="flex-row items-center px-4 pt-4 pb-2 gap-3"
      >
        {/* 电话按钮 - 点击开始通话 */}
        <Pressable
          style={styles.phoneButton}
          onPress={handleStartCall}
        >
          <IconSymbol name="phone.fill" size={22} color="#10B981" />
        </Pressable>

        {/* 输入框容器 - 包含 TextInput 和语音按钮 */}
        <View style={styles.inputContainer}>
          <TextInput
            className="flex-1 leading-5 pl-4 pr-12 py-3 text-gray-900 dark:text-white text-base"
            placeholder="输入指令，例如：向前走 3 米"
            placeholderTextColor="#9CA3AF"
            value={text}
            onChangeText={setText}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            editable={!loading && !isRecording}
            multiline
            numberOfLines={1}
            style={{ maxHeight: 100, minHeight: 48 }}
            textAlignVertical="center"
          />
          
          {/* 语音录制按钮 - 输入框内部右侧 */}
          {hasPermission && (
            <View style={styles.voiceButtonWrapper}>
              <VoiceRecordButton
                isRecording={isRecording}
                onPressIn={startRecording}
                onPressOut={stopRecording}
                size={36}
              />
            </View>
          )}
        </View>
        
        <TouchableOpacity
          className={`h-12 w-12 rounded-full items-center justify-center ${
            !text.trim() || loading
              ? "bg-gray-300 dark:bg-gray-700"
              : "bg-blue-500"
          }`}
          onPress={handleSend}
          disabled={!text.trim() || loading}
        >
          {loading ? (
            <ActivityIndicator color="white" size="small" />
          ) : (
            <Text className="text-white font-bold">发送</Text>
          )}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  recordingContainer: {
    position: 'absolute',
    top: -44,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  recordingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
    gap: 8,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
  },
  recordingText: {
    color: '#DC2626',
    fontWeight: '600',
    fontSize: 14,
  },
  // 电话按钮样式
  phoneButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#D1FAE5', // 浅绿色背景
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  // 输入框容器样式
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6', // gray-100
    borderRadius: 24,
    position: 'relative',
  },
  // 语音按钮在输入框内部的包装器
  voiceButtonWrapper: {
    position: 'absolute',
    right: 6,
    top: '50%',
    transform: [{ translateY: -18 }], // 垂直居中 (36/2 = 18)
  },
  // ===== 通话面板样式 =====
  callPanel: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  // 通话头部（状态 + 时长）
  callHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  callStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  callStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981', // 绿色
  },
  callStatusText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#059669', // 深绿色
  },
  callDuration: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937', // gray-800
    fontVariant: ['tabular-nums'], // 等宽数字
  },
  // 波形动画容器
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
    gap: 6,
    marginBottom: 24,
  },
  waveBar: {
    width: 6,
    borderRadius: 3,
    backgroundColor: '#10B981', // 绿色
  },
  // 实时转写文本容器
  transcriptContainer: {
    minHeight: 50,
    maxHeight: 100,
    marginBottom: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F0FDF4', // 浅绿色背景
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1FAE5',
  },
  transcriptText: {
    fontSize: 16,
    lineHeight: 22,
    color: '#166534', // 深绿色文字
    textAlign: 'center',
  },
  // 通话控制按钮区域
  callControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  callControlButton: {
    alignItems: 'center',
    gap: 6,
  },
  callControlIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callControlLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  // 说话状态指示点（动态）
  callStatusDotSpeaking: {
    backgroundColor: '#F59E0B', // 说话时变为橙色
  },
  // 自动发送提示文字
  vadTipText: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 16,
  },
  // 手动发送按钮
  manualSendButton: {
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#10B981',
    borderRadius: 16,
    alignSelf: 'center',
  },
  manualSendButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // 发送中指示器
  sendingIndicator: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  // 清除按钮样式
  clearButton: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  transcriptContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  sendingText: {
    fontSize: 12,
    color: '#10B981',
  },
});
