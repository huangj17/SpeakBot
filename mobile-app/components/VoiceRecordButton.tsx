import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
    Easing,
    interpolate,
    interpolateColor,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withRepeat,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import { IconSymbol } from './ui/icon-symbol';

interface VoiceRecordButtonProps {
  isRecording: boolean;
  onPressIn: () => void;
  onPressOut: () => void;
  size?: number;
}

/**
 * 语音录制按钮组件
 * 独立封装，带有精美的波纹动画效果
 */
export const VoiceRecordButton = ({
  isRecording,
  onPressIn,
  onPressOut,
  size = 56,
}: VoiceRecordButtonProps) => {
  // 动画值
  const scale = useSharedValue(1);
  const pulse1 = useSharedValue(0);
  const pulse2 = useSharedValue(0);
  const recordingProgress = useSharedValue(0);

  // 录音状态变化时的动画
  useEffect(() => {
    if (isRecording) {
      // 按钮缩小一点表示按下
      scale.value = withSpring(0.92, { damping: 15, stiffness: 150 });
      
      // 背景色过渡
      recordingProgress.value = withTiming(1, { duration: 200 });
      
      // 波纹动画 - 两层波纹，错开时间
      const pulseDuration = 1200;
      const createPulseAnim = () => withRepeat(
        withTiming(1, { duration: pulseDuration, easing: Easing.out(Easing.ease) }),
        -1,
        false
      );
      
      pulse1.value = 0;
      pulse1.value = createPulseAnim();
      
      pulse2.value = 0;
      pulse2.value = withDelay(600, createPulseAnim());
      
    } else {
      // 恢复原始状态
      scale.value = withSpring(1, { damping: 15, stiffness: 150 });
      recordingProgress.value = withTiming(0, { duration: 200 });
      pulse1.value = withTiming(0, { duration: 200 });
      pulse2.value = withTiming(0, { duration: 200 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording]);

  // 按钮动画样式
  const buttonAnimatedStyle = useAnimatedStyle(() => {
    const backgroundColor = interpolateColor(
      recordingProgress.value,
      [0, 1],
      ['#E5E7EB', '#EF4444'] // gray-200 -> red-500
    );
    
    return {
      transform: [{ scale: scale.value }],
      backgroundColor,
    };
  });

  // 波纹 1 动画样式
  const pulse1Style = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pulse1.value, [0, 1], [1, 2]) }],
    opacity: interpolate(pulse1.value, [0, 0.3, 1], [0.5, 0.3, 0]),
  }));

  // 波纹 2 动画样式
  const pulse2Style = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pulse2.value, [0, 1], [1, 2]) }],
    opacity: interpolate(pulse2.value, [0, 0.3, 1], [0.5, 0.3, 0]),
  }));

  // 图标动画样式
  const iconAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(recordingProgress.value, [0, 1], [1, 1.1]) }],
  }));

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* 波纹层 */}
      {isRecording && (
        <>
          <Animated.View
            style={[
              styles.pulseRing,
              { width: size, height: size, borderRadius: size / 2 },
              pulse1Style,
            ]}
          />
          <Animated.View
            style={[
              styles.pulseRing,
              { width: size, height: size, borderRadius: size / 2 },
              pulse2Style,
            ]}
          />
        </>
      )}
      
      {/* 主按钮 - 使用 Pressable 替代 GestureDetector */}
      <Pressable
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={({ pressed }) => [
          styles.pressableContainer,
          { width: size, height: size, borderRadius: size / 2 },
        ]}
      >
        <Animated.View
          style={[
            styles.button,
            { width: size, height: size, borderRadius: size / 2 },
            buttonAnimatedStyle,
          ]}
        >
          <Animated.View style={iconAnimatedStyle}>
            <IconSymbol
              name={isRecording ? 'mic.fill' : 'mic'}
              size={size * 0.5}
              color={isRecording ? 'white' : '#6B7280'}
            />
          </Animated.View>
        </Animated.View>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressableContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    backgroundColor: 'rgba(239, 68, 68, 0.3)',
  },
});
