/**
 * API 服务封装
 */

import axios, { AxiosError, AxiosInstance } from 'axios';
import { APP_CONFIG, ErrorCode } from '../constants/config';
import { NLUResponse, STTResponse } from '../types/api';
import { Command } from '../types/commands';

class APIService {
  private client: AxiosInstance;

  constructor(baseURL: string) {
    this.client = axios.create({
      baseURL,
      timeout: APP_CONFIG.HTTP_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // 请求拦截器
    this.client.interceptors.request.use(
      (config) => {
        console.log(`[API] 请求: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // 响应拦截器
    this.client.interceptors.response.use(
      (response) => {
        console.log(`[API] 响应: ${response.status} ${response.config.url}`);
        return response;
      },
      (error: AxiosError) => {
        console.error(`[API] 错误: ${error.message}`);
        return Promise.reject(this.handleError(error));
      }
    );
  }

  /**
   * 语音转文字
   */
  async speechToText(audioFile: Blob, language: string = 'zh-CN'): Promise<STTResponse> {
    try {
      const formData = new FormData();
      formData.append('audio_file', audioFile);
      formData.append('language', language);

      const response = await this.client.post<STTResponse>('/api/stt', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      return response.data;
    } catch (error) {
      console.error('[API] STT 失败:', error);
      return {
        success: false,
        error: '语音识别失败',
        error_code: ErrorCode.STT_ERROR,
      };
    }
  }

  /**
   * 自然语言理解 (原始响应)
   */
  async parseNaturalLanguage(
    text: string,
    context?: {
      user_id?: string;
      session_id?: string;
      history?: Command[];
    }
  ): Promise<NLUResponse> {
    try {
      const response = await this.client.post<NLUResponse>('/api/nlu/parse', {
        text,
        context,
      });

      return response.data;
    } catch (error) {
      console.error('[API] NLU 失败:', error);
      return {
        success: false,
        result: {
          type: 'error',
          error: '指令解析失败',
          suggestion: '请尝试更清晰的描述',
        },
      };
    }
  }

  /**
   * 解析指令 (直接返回结果)
   * 适配 CommandInput 组件的使用方式
   */
  async parseCommand(text: string): Promise<import('../types/commands').NLUResult> {
    const response = await this.parseNaturalLanguage(text);
    if (response.success && response.result) {
      return response.result;
    }
    return (
      response.result || {
        type: 'error',
        error: '未知的解析错误',
        suggestion: '请重试',
      }
    );
  }

  /**
   * 错误处理
   */
  private handleError(error: AxiosError): Error {
    if (error.code === 'ECONNABORTED') {
      return new Error(ErrorCode.TIMEOUT_ERROR);
    }

    if (error.response) {
      // 服务器返回错误
      return new Error(`${ErrorCode.API_ERROR}: ${error.response.status}`);
    } else if (error.request) {
      // 请求发送但没有响应
      return new Error(ErrorCode.NETWORK_ERROR);
    } else {
      // 其他错误
      return new Error(ErrorCode.API_ERROR);
    }
  }
}

// 创建全局实例
export const apiService = new APIService(APP_CONFIG.API_BASE_URL);

