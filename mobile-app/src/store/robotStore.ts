/**
 * 机器人状态管理
 */

import { create } from 'zustand';

type RobotStatus = 'idle' | 'busy' | 'error';

interface RobotStore {
  // 状态
  isConnected: boolean; // WebSocket连接状态
  robotStatus: RobotStatus; // 机器人状态
  currentAction: string | null; // 当前动作描述
  battery: number; // 电池电量
  position: { x: number; y: number; z: number }; // 机器人位置

  // 操作
  setConnected: (connected: boolean) => void;
  setRobotStatus: (status: RobotStatus) => void;
  setCurrentAction: (action: string | null) => void;
  setBattery: (level: number) => void;
  setPosition: (pos: { x: number; y: number; z: number }) => void;
}

export const useRobotStore = create<RobotStore>((set) => ({
  // 初始状态
  isConnected: false,
  robotStatus: 'idle',
  currentAction: null,
  battery: 100,
  position: { x: 0, y: 0, z: 0 },

  // 设置连接状态
  setConnected: (connected: boolean) => {
    set({ isConnected: connected });
  },

  // 设置机器人状态
  setRobotStatus: (status: RobotStatus) => {
    set({ robotStatus: status });
  },

  // 设置当前动作
  setCurrentAction: (action: string | null) => {
    set({ currentAction: action });
  },

  // 设置电池电量
  setBattery: (level: number) => {
    set({ battery: level });
  },

  // 设置位置
  setPosition: (pos: { x: number; y: number; z: number }) => {
    set({ position: pos });
  },
}));

