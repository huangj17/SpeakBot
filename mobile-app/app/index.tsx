import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CommandInput } from '../components/CommandInput';
import { CommandList } from '../components/CommandList';
import { StatusPanel } from '../components/StatusPanel';
import { wsService } from '../src/services/websocket';

export default function HomeScreen() {
  // 建立 WebSocket 连接
  useEffect(() => {
    wsService.connect().catch(err => {
      console.warn('[Home] WebSocket 连接失败:', err);
    });
    
    return () => {
      wsService.disconnect();
    };
  }, []);

  // 点击外部关闭键盘
  const dismissKeyboard = () => {
    Keyboard.dismiss();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#ffffff' }} edges={['top', 'left', 'right']}>
      <StatusBar style="auto" />
      
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <Pressable style={{ flex: 1 }} onPress={dismissKeyboard}>
          <View className="flex-1 bg-gray-50 dark:bg-gray-900">
            {/* 上部：状态面板 (包含 3D 占位符) */}
            <StatusPanel />
            
            {/* 中部：指令列表 (可滚动) */}
            <CommandList />
            
            {/* 底部：输入区域 */}
            <CommandInput />
          </View>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

