/**
 * 状态面板组件 - 包含机器人状态信息
 */

import { ActivityIndicator, Text, View } from "react-native";
import { useCommandStore } from "../src/store/commandStore";
import { useRobotStore } from "../src/store/robotStore";
import { IconSymbol } from "./ui/icon-symbol";

// 3D 场景占位符
const Scene3DPlaceholder = () => (
  <View className="flex-1 items-center justify-center bg-slate-900 rounded-2xl">
    <IconSymbol name="cube" size={48} color="#64748B" />
    <Text className="text-gray-400 mt-3 text-sm">3D 场景占位符</Text>
    <Text className="text-gray-500 mt-1 text-xs">待开发</Text>
  </View>
);

export const StatusPanel = () => {
  const { isProcessing, currentCommandIndex, commands } = useCommandStore();
  const { robotStatus, battery, isConnected } = useRobotStore();

  return (
    <View className="p-4 bg-white dark:bg-black border-b border-gray-200 dark:border-gray-800">
      {/* 顶部状态栏 */}
      <View className="flex-row justify-between items-center mb-3">
        <View className="flex-row items-center gap-2">
          <View
            className={`w-2.5 h-2.5 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`}
          />
          <Text className="text-sm font-medium text-gray-600 dark:text-gray-300">
            {isConnected ? "已连接" : "未连接"}
          </Text>
        </View>
        <View className="flex-row items-center gap-4">
          {/* 电量指示 */}
          <View className="flex-row items-center gap-1">
            <IconSymbol
              name={battery > 20 ? "battery.100" : "battery.25"}
              size={18}
              color={battery > 20 ? "#10B981" : "#EF4444"}
            />
            <Text className="text-sm text-gray-600 dark:text-gray-300">
              {battery}%
            </Text>
          </View>
          {/* 状态标签 */}
          <View
            className={`px-3 py-1 rounded-full ${
              robotStatus === "idle"
                ? "bg-blue-100 dark:bg-blue-900"
                : robotStatus === "busy"
                ? "bg-green-100 dark:bg-green-900"
                : "bg-red-100 dark:bg-red-900"
            }`}
          >
            <Text
              className={`text-xs font-bold uppercase ${
                robotStatus === "idle"
                  ? "text-blue-600 dark:text-blue-400"
                  : robotStatus === "busy"
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {robotStatus === "idle" ? "空闲" : robotStatus === "busy" ? "执行中" : "错误"}
            </Text>
          </View>
        </View>
      </View>

      {/* 3D 场景占位区域 */}
      <View className="h-52 rounded-2xl overflow-hidden mb-3">
        <Scene3DPlaceholder />
      </View>

      {/* 当前任务状态 */}
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <IconSymbol name="list.bullet" size={16} color="#6B7280" />
          <Text className="text-sm font-medium text-gray-900 dark:text-white">
            任务进度
          </Text>
        </View>
        <Text className="text-sm text-gray-500 dark:text-gray-400">
          {commands.length > 0
            ? `${Math.min(currentCommandIndex + 1, commands.length)} / ${commands.length}`
            : "无任务"}
        </Text>
      </View>

      {/* 进度条 */}
      {commands.length > 0 && (
        <View className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mt-2 overflow-hidden">
          <View
            className="h-full bg-blue-500 rounded-full"
            style={{
              width: `${Math.max(
                ((currentCommandIndex + 1) / commands.length) * 100,
                5
              )}%`,
            }}
          />
        </View>
      )}

      {/* 处理中提示 */}
      {isProcessing && (
        <View className="flex-row items-center justify-center gap-2 mt-3">
          <ActivityIndicator size="small" color="#3B82F6" />
          <Text className="text-xs text-blue-500">正在处理指令...</Text>
        </View>
      )}
    </View>
  );
};
