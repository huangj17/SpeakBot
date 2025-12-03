/**
 * 指令执行器服务
 * 负责模拟执行机器人指令，与状态管理解耦
 */

import { Command } from '../types/commands';

// 位置类型
export interface Position {
  x: number;
  y: number;
  z: number;
}

// 执行器配置
export interface ExecutorConfig {
  animationDuration?: number; // 动画时长（毫秒）
  animationSteps?: number; // 动画步数
}

// 执行回调
export interface ExecutorCallbacks {
  onPositionUpdate: (position: Position) => void;
  getPosition: () => Position;
  onStatusChange?: (status: 'idle' | 'busy' | 'error') => void;
  onActionChange?: (action: string | null) => void;
}

// 默认配置
const DEFAULT_CONFIG: Required<ExecutorConfig> = {
  animationDuration: 1000,
  animationSteps: 20,
};

/**
 * 指令执行器类
 */
class CommandExecutor {
  private config: Required<ExecutorConfig>;
  private isExecuting: boolean = false;
  private abortController: AbortController | null = null;

  constructor(config?: ExecutorConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 更新配置
   */
  setConfig(config: Partial<ExecutorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 是否正在执行
   */
  getIsExecuting(): boolean {
    return this.isExecuting;
  }

  /**
   * 中止当前执行
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.isExecuting = false;
  }

  /**
   * 计算指令执行后的目标位置
   */
  calculateTargetPosition(command: Command, currentPos: Position): Position {
    const newPos = { ...currentPos };

    switch (command.command) {
      case 'forward': {
        const distance = command.params.distance || 1;
        newPos.z -= distance; // 向前是 -Z 方向
        break;
      }
      case 'backward': {
        const distance = command.params.distance || 1;
        newPos.z += distance; // 向后是 +Z 方向
        break;
      }
      case 'left': {
        const distance = command.params.distance || 1;
        newPos.x -= distance; // 向左是 -X 方向
        break;
      }
      case 'right': {
        const distance = command.params.distance || 1;
        newPos.x += distance; // 向右是 +X 方向
        break;
      }
      case 'up': {
        const distance = command.params.distance || 1;
        newPos.y += distance; // 向上是 +Y 方向
        break;
      }
      case 'down': {
        const distance = command.params.distance || 1;
        newPos.y -= distance; // 向下是 -Y 方向
        break;
      }
      case 'turn_left':
      case 'turn_right':
      case 'stop':
        // 这些指令不改变位置
        break;
      default:
        console.log(`[Executor] 未知指令类型: ${command.command}`);
    }

    return newPos;
  }

  /**
   * 执行单个指令（带动画）
   */
  async executeCommand(
    command: Command,
    callbacks: ExecutorCallbacks
  ): Promise<void> {
    const currentPos = callbacks.getPosition();
    const targetPos = this.calculateTargetPosition(command, currentPos);

    // 如果位置没有变化，直接返回
    if (
      currentPos.x === targetPos.x &&
      currentPos.y === targetPos.y &&
      currentPos.z === targetPos.z
    ) {
      // 短暂延迟模拟执行
      await this.delay(300);
      return;
    }

    // 动画过渡
    const { animationDuration, animationSteps } = this.config;
    const stepDuration = animationDuration / animationSteps;

    const deltaX = (targetPos.x - currentPos.x) / animationSteps;
    const deltaY = (targetPos.y - currentPos.y) / animationSteps;
    const deltaZ = (targetPos.z - currentPos.z) / animationSteps;

    for (let i = 1; i <= animationSteps; i++) {
      // 检查是否被中止
      if (this.abortController?.signal.aborted) {
        throw new Error('执行被中止');
      }

      await this.delay(stepDuration);

      callbacks.onPositionUpdate({
        x: currentPos.x + deltaX * i,
        y: currentPos.y + deltaY * i,
        z: currentPos.z + deltaZ * i,
      });
    }

    // 确保最终位置精确
    callbacks.onPositionUpdate(targetPos);
  }

  /**
   * 执行指令队列
   */
  async executeQueue(
    commands: Command[],
    callbacks: ExecutorCallbacks,
    onCommandStart?: (command: Command, index: number) => void,
    onCommandComplete?: (command: Command, index: number) => void,
    onCommandError?: (command: Command, index: number, error: Error) => void
  ): Promise<void> {
    if (this.isExecuting) {
      console.log('[Executor] 已有执行任务在运行');
      return;
    }

    if (commands.length === 0) {
      return;
    }

    this.isExecuting = true;
    this.abortController = new AbortController();

    callbacks.onStatusChange?.('busy');

    try {
      for (let i = 0; i < commands.length; i++) {
        const command = commands[i];

        // 检查是否被中止
        if (this.abortController.signal.aborted) {
          break;
        }

        // 通知开始执行
        onCommandStart?.(command, i);
        callbacks.onActionChange?.(command.description);

        try {
          await this.executeCommand(command, callbacks);
          onCommandComplete?.(command, i);
        } catch (error) {
          if (error instanceof Error && error.message === '执行被中止') {
            break;
          }
          onCommandError?.(command, i, error as Error);
          // 可以选择继续执行下一个或中止
          // break;
        }
      }

      callbacks.onStatusChange?.('idle');
      callbacks.onActionChange?.(null);
    } catch (error) {
      console.error('[Executor] 执行队列失败:', error);
      callbacks.onStatusChange?.('error');
    } finally {
      this.isExecuting = false;
      this.abortController = null;
    }
  }

  /**
   * 延迟工具函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// 导出单例实例
export const commandExecutor = new CommandExecutor();

// 导出类以便创建自定义实例
export { CommandExecutor };

