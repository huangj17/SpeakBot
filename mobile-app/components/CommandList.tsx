import React from 'react';
import { View, Text, FlatList } from 'react-native';
import { useCommandStore } from '../src/store/commandStore';
import { CommandWithStatus } from '../src/types/commands';

const CommandItem = ({ item, index }: { item: CommandWithStatus; index: number }) => {
  // 根据状态显示不同的颜色和图标
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 dark:bg-green-900/30 border-green-200 dark:border-green-800';
      case 'running': return 'bg-blue-100 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800';
      case 'failed': return 'bg-red-100 dark:bg-red-900/30 border-red-200 dark:border-red-800';
      default: return 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700';
    }
  };

  const getStatusTextColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-700 dark:text-green-400';
      case 'running': return 'text-blue-700 dark:text-blue-400';
      case 'failed': return 'text-red-700 dark:text-red-400';
      default: return 'text-gray-500 dark:text-gray-400';
    }
  };

  return (
    <View className={`mb-2 p-3 rounded-xl border ${getStatusColor(item.status)}`}>
      <View className="flex-row justify-between items-center mb-1">
        <Text className="font-bold text-gray-900 dark:text-white">
          #{index + 1} {item.command}
        </Text>
        <Text className={`text-xs font-medium uppercase ${getStatusTextColor(item.status)}`}>
          {item.status}
        </Text>
      </View>
      <Text className="text-sm text-gray-600 dark:text-gray-300">
        {item.description}
      </Text>
      {item.params && Object.keys(item.params).length > 0 && (
        <View className="mt-2 flex-row flex-wrap gap-1">
          {Object.entries(item.params).map(([key, value]) => (
            <View key={key} className="bg-black/5 dark:bg-white/10 px-2 py-0.5 rounded text-xs">
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                {key}: {String(value)}
              </Text>
            </View>
          ))}
        </View>
      )}
      {item.error && (
        <Text className="mt-2 text-xs text-red-500">Error: {item.error}</Text>
      )}
    </View>
  );
};

export const CommandList = () => {
  const { commands, history } = useCommandStore();

  // 合并显示历史记录和当前待执行指令（这里主要显示当前的队列）
  // 实际场景可能需要根据设计决定是否显示历史
  const displayList = commands;

  if (displayList.length === 0) {
    return (
      <View className="flex-1 justify-center items-center p-8">
        <Text className="text-gray-400 text-center text-base">
          暂无指令
        </Text>
        <Text className="text-gray-400 text-center text-sm mt-2">
          请在下方输入自然语言指令控制机器人
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      className="flex-1 px-4 pt-4"
      data={displayList}
      keyExtractor={(item) => item.command_id || Math.random().toString()}
      renderItem={({ item, index }) => <CommandItem item={item} index={index} />}
      contentContainerStyle={{ paddingBottom: 20 }}
    />
  );
};

