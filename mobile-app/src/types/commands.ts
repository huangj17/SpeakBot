/**
 * 指令类型定义
 */

/**
 * 基础指令接口
 */
export interface Command {
  command: string; // 指令名称
  params: Record<string, any>; // 指令参数
  description: string; // 中文描述
  command_id: string; // 唯一标识
  timestamp: string; // ISO 8601时间戳
  order?: number; // 在序列中的顺序
}

/**
 * 单步指令结果 - 扁平化结构，继承 Command
 */
export interface SingleCommandResult extends Command {
  type: 'single';
}

/**
 * 指令序列结果
 */
export interface SequenceCommandResult {
  type: 'sequence';
  commands: Command[];
  total_steps: number;
  estimated_duration: number;
}

/**
 * 错误结果
 */
export interface ErrorResult {
  type: 'error';
  error: string;
  suggestion: string;
}

/**
 * NLU解析结果
 */
export type NLUResult =
  | SingleCommandResult
  | SequenceCommandResult
  | ErrorResult;

/**
 * 指令执行状态
 */
export type CommandStatus = 'pending' | 'executing' | 'completed' | 'failed';

/**
 * 带状态的指令
 */
export interface CommandWithStatus extends Command {
  status: CommandStatus;
  error?: string;
  progress?: number; // 0-100
}
