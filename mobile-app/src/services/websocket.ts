/**
 * WebSocket 服务管理
 */

import { APP_CONFIG } from '../constants/config';
import { WebSocketMessage } from '../types/api';

type MessageHandler = (message: WebSocketMessage) => void;

class WebSocketService {
  private ws: WebSocket | null = null;
  private clientId: string;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 3;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private listeners: Map<string, MessageHandler[]> = new Map();
  private isConnecting: boolean = false;
  private manualDisconnect: boolean = false; // 标记是否手动断开

  constructor(clientId: string) {
    this.clientId = clientId;
  }

  /**
   * 检查连接是否就绪
   */
  isReady(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * 连接到 WebSocket 服务器
   */
  connect(url?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // 重置手动断开标记
      this.manualDisconnect = false;
      
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        console.log('[WS] 已连接，无需重复连接');
        resolve();
        return;
      }

      if (this.isConnecting) {
        console.log('[WS] 正在连接中...');
        return;
      }

      this.isConnecting = true;
      const wsUrl = `${url || APP_CONFIG.WS_BASE_URL}/ws/robot/${this.clientId}`;

      console.log(`[WS] 连接到: ${wsUrl}`);

      try {
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          console.log('[WS] 连接成功');
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error('[WS] 解析消息失败:', error);
          }
        };

        this.ws.onerror = (error) => {
          console.error('[WS] 连接错误:', error);
          this.isConnecting = false;
        };

        this.ws.onclose = () => {
          console.log('[WS] 连接关闭');
          this.isConnecting = false;
          this.stopHeartbeat();
          // 只有非手动断开才自动重连
          if (!this.manualDisconnect) {
            this.reconnect();
          }
        };
      } catch (error) {
        console.error('[WS] 创建连接失败:', error);
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    this.manualDisconnect = true; // 标记为手动断开，阻止自动重连
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.stopHeartbeat();
    console.log('[WS] 已断开连接');
  }

  /**
   * 发送消息
   */
  send(message: Partial<WebSocketMessage>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('[WS] 连接未就绪，无法发送消息');
      return;
    }

    const fullMessage: WebSocketMessage = {
      type: message.type || 'status',
      data: message.data || {},
      timestamp: new Date().toISOString(),
    };

    try {
      this.ws.send(JSON.stringify(fullMessage));
      console.log(`[WS] 发送消息: ${fullMessage.type}`);
    } catch (error) {
      console.error('[WS] 发送消息失败:', error);
    }
  }

  /**
   * 发送音频开始信号
   */
  sendAudioStart(sampleRate: number = 16000, encoding: string = 'pcm_s16le'): void {
    this.send({
      type: 'audio_start',
      data: { sample_rate: sampleRate, encoding, channels: 1 },
    });
  }

  /**
   * 发送音频数据片段
   */
  sendAudioChunk(base64Chunk: string): void {
    this.send({
      type: 'audio_chunk',
      data: { chunk: base64Chunk },
    });
  }

  /**
   * 发送音频结束信号
   */
  sendAudioEnd(): void {
    this.send({
      type: 'audio_end',
      data: {},
    });
  }

  // ===== 流式语音通话相关方法 =====

  /**
   * 发送通话开始信号
   */
  sendCallStart(): void {
    this.send({
      type: 'call_start',
      data: {},
    });
  }

  /**
   * 发送通话音频数据（流式）
   * @param base64Chunk Base64 编码的音频数据
   * @param isFirstChunk 是否是第一个块（包含 WAV 头）
   */
  sendCallAudio(base64Chunk: string, isFirstChunk: boolean = false): void {
    this.send({
      type: 'call_audio',
      data: { 
        chunk: base64Chunk,
        is_first_chunk: isFirstChunk,  // 告知后端是否需要跳过 WAV 头
      },
    });
  }

  /**
   * 发送通话结束信号
   */
  sendCallEnd(): void {
    this.send({
      type: 'call_end',
      data: {},
    });
  }

  /**
   * 监听消息
   */
  on(type: string, callback: MessageHandler): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)!.push(callback);
  }

  /**
   * 移除监听
   */
  off(type: string, callback: MessageHandler): void {
    if (!this.listeners.has(type)) return;

    const handlers = this.listeners.get(type)!;
    const index = handlers.indexOf(callback);
    if (index > -1) {
      handlers.splice(index, 1);
    }
  }

  /**
   * 处理消息
   */
  private handleMessage(message: WebSocketMessage): void {
    console.log(`[WS] 收到消息: ${message.type}`);

    // 触发对应类型的监听器
    const handlers = this.listeners.get(message.type);
    if (handlers) {
      handlers.forEach((handler) => handler(message));
    }

    // 触发通用监听器
    const allHandlers = this.listeners.get('*');
    if (allHandlers) {
      allHandlers.forEach((handler) => handler(message));
    }
  }

  /**
   * 自动重连
   */
  private reconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WS] 重连失败，已达到最大重试次数');
      return;
    }

    const delay = APP_CONFIG.WS_RECONNECT_DELAY[this.reconnectAttempts] || 5000;
    this.reconnectAttempts++;

    console.log(`[WS] ${delay}ms 后尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * 启动心跳
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatInterval = setInterval(() => {
      this.send({
        type: 'heartbeat',
        data: {},
      });
    }, 30000); // 每30秒发送一次心跳
  }

  /**
   * 停止心跳
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}

// 生成客户端ID
function generateClientId(): string {
  return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// 创建全局实例
export const wsService = new WebSocketService(generateClientId());

