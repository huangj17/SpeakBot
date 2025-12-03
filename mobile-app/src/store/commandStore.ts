/**
 * 指令状态管理
 * 负责指令队列的状态管理，执行逻辑委托给 commandExecutor
 */

import { create } from 'zustand';
import { commandExecutor } from '../services/commandExecutor';
import { Command, CommandStatus, CommandWithStatus } from '../types/commands';
import { useRobotStore } from './robotStore';

interface CommandStore {
  // 状态
  commands: CommandWithStatus[]; // 当前指令列表
  currentCommandIndex: number; // 当前执行指令索引
  history: Command[]; // 历史指令
  isProcessing: boolean; // 是否正在处理（NLU解析中）
  error: string | null; // 错误信息

  // 操作
  addCommand: (command: Command) => void;
  addCommands: (commands: Command[]) => void;
  updateCommandStatus: (id: string, status: CommandStatus, error?: string) => void;
  clearCommands: () => void;
  moveToNext: () => void;
  setError: (error: string | null) => void;
  setProcessing: (processing: boolean) => void;
  executeCommands: () => Promise<void>;
  stopExecution: () => void;

  // 计算属性
  isExecuting: () => boolean;
  getPendingCommands: () => CommandWithStatus[];
}

export const useCommandStore = create<CommandStore>((set, get) => ({
  // 初始状态
  commands: [],
  currentCommandIndex: 0,
  history: [],
  isProcessing: false,
  error: null,

  // 添加单个指令
  addCommand: (command: Command) => {
    const commandWithStatus: CommandWithStatus = {
      ...command,
      status: 'pending',
    };

    set((state) => ({
      commands: [...state.commands, commandWithStatus],
      history: [...state.history, command].slice(-100),
    }));

    // 自动开始执行
    setTimeout(() => get().executeCommands(), 100);
  },

  // 添加多个指令
  addCommands: (commands: Command[]) => {
    const commandsWithStatus: CommandWithStatus[] = commands.map((cmd) => ({
      ...cmd,
      status: 'pending' as CommandStatus,
    }));

    set((state) => ({
      commands: [...state.commands, ...commandsWithStatus],
      history: [...state.history, ...commands].slice(-100),
    }));

    // 自动开始执行
    setTimeout(() => get().executeCommands(), 100);
  },

  // 更新指令状态
  updateCommandStatus: (id: string, status: CommandStatus, error?: string) => {
    set((state) => ({
      commands: state.commands.map((cmd) =>
        cmd.command_id === id ? { ...cmd, status, error } : cmd
      ),
    }));
  },

  // 清空指令列表
  clearCommands: () => {
    // 先停止执行
    commandExecutor.abort();
    set({
      commands: [],
      currentCommandIndex: 0,
      error: null,
    });
  },

  // 移动到下一个指令
  moveToNext: () => {
    set((state) => ({
      currentCommandIndex: Math.min(
        state.currentCommandIndex + 1,
        state.commands.length - 1
      ),
    }));
  },

  // 设置错误信息
  setError: (error: string | null) => {
    set({ error });
  },

  // 设置处理状态
  setProcessing: (processing: boolean) => {
    set({ isProcessing: processing });
  },

  // 执行指令队列
  executeCommands: async () => {
    const state = get();

    // 如果已经在执行，跳过
    if (commandExecutor.getIsExecuting()) {
      return;
    }

    // 获取待执行的指令
    const pendingCommands = state.commands.filter(
      (cmd) => cmd.status === 'pending'
    );

    if (pendingCommands.length === 0) {
      return;
    }

    // 获取 robotStore 的方法
    const robotStore = useRobotStore.getState();

    // 使用执行器执行指令队列
    await commandExecutor.executeQueue(
      pendingCommands,
      {
        onPositionUpdate: robotStore.setPosition,
        getPosition: () => robotStore.position,
        onStatusChange: robotStore.setRobotStatus,
        onActionChange: robotStore.setCurrentAction,
      },
      // onCommandStart
      (command, index) => {
        const cmdIndex = state.commands.findIndex(
          (c) => c.command_id === command.command_id
        );
        set({ currentCommandIndex: cmdIndex });
        get().updateCommandStatus(command.command_id, 'executing');
      },
      // onCommandComplete
      (command) => {
        get().updateCommandStatus(command.command_id, 'completed');
      },
      // onCommandError
      (command, _, error) => {
        get().updateCommandStatus(command.command_id, 'failed', error.message);
        get().setError(error.message);
      }
    );
  },

  // 停止执行
  stopExecution: () => {
    commandExecutor.abort();
    const robotStore = useRobotStore.getState();
    robotStore.setRobotStatus('idle');
    robotStore.setCurrentAction(null);
  },

  // 计算属性：是否正在执行
  isExecuting: () => commandExecutor.getIsExecuting(),

  // 计算属性：获取待执行的指令
  getPendingCommands: () =>
    get().commands.filter((cmd) => cmd.status === 'pending'),
}));
