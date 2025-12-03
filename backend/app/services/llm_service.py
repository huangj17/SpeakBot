"""
LLM 服务 - Ollama Cloud API 调用封装
"""

import json
import logging
import os
import time
from typing import Union

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_ollama import ChatOllama

from app.config import settings
from app.models.commands import ErrorResult, SequenceCommandResult, SingleCommandResult
from app.prompts import OLLAMA_CONFIG, SYSTEM_PROMPT

logger = logging.getLogger(__name__)


class LLMService:
    """LLM 服务类 - 基于 Ollama Cloud"""
    
    def __init__(self):
        """初始化 Ollama 客户端"""
        # 关键修复：langchain_ollama 依赖环境变量进行认证
        # 虽然我们可以在 headers 中传递，但为了与测试脚本保持一致（测试脚本只设置了环境变量），
        # 我们这里显式设置环境变量，并不在 ChatOllama 构造函数中传递 headers
        if settings.OLLAMA_API_KEY:
            os.environ["OLLAMA_API_KEY"] = settings.OLLAMA_API_KEY
            logger.info(f"已设置 OLLAMA_API_KEY 环境变量: {settings.OLLAMA_API_KEY[:4]}...")
        else:
            logger.warning("未检测到 OLLAMA_API_KEY，Ollama Cloud 可能无法连接")

        logger.info(f"初始化 Ollama Cloud 服务: model={settings.OLLAMA_MODEL}, base_url={settings.OLLAMA_BASE_URL}")
        
        self.client = ChatOllama(
            model=settings.OLLAMA_MODEL,
            base_url=settings.OLLAMA_BASE_URL,
            temperature=settings.OLLAMA_TEMPERATURE,
            num_predict=settings.OLLAMA_MAX_TOKENS,
            # 移除 headers 参数，让库通过环境变量自动处理
        )
        self.model = settings.OLLAMA_MODEL
        self.max_tokens = settings.OLLAMA_MAX_TOKENS
        self.temperature = settings.OLLAMA_TEMPERATURE
        self.max_retries = 2
        
        logger.info(f"初始化 Ollama Cloud 服务: model={self.model}, base_url={settings.OLLAMA_BASE_URL}")
    
    async def parse_command(
        self,
        text: str,
        context: dict = None
    ) -> tuple[Union[SingleCommandResult, SequenceCommandResult, ErrorResult], float]:
        """
        解析自然语言为指令
        
        Args:
            text: 用户输入文本
            context: 上下文信息(可选)
        
        Returns:
            (解析结果, 处理时间)
        """
        start_time = time.time()
        
        try:
            # 构建用户消息
            user_message = self._build_user_message(text, context)
            
            # 调用 Ollama API
            response = await self._call_ollama_api(user_message)
            
            # 解析响应
            result = self._parse_response(response)
            
            processing_time = time.time() - start_time
            logger.info(f"成功解析指令: {text[:50]}... 耗时: {processing_time:.2f}秒")
            
            return result, processing_time
            
        except Exception as e:
            logger.error(f"解析指令失败: {str(e)}")
            processing_time = time.time() - start_time
            
            error_result = ErrorResult(
                error="系统错误,请稍后重试",
                suggestion="请检查网络连接或稍后再试"
            )
            return error_result, processing_time
    
    def _build_user_message(self, text: str, context: dict = None) -> str:
        """构建用户消息"""
        message = f"用户输入: {text}"
        
        # 如果有上下文,添加到消息中
        if context and context.get("history"):
            history = context["history"]
            if history:
                recent_commands = [cmd.get("command", "") for cmd in history[-3:]]
                message += f"\n\n最近的指令历史: {', '.join(recent_commands)}"
        
        return message
    
    async def _call_ollama_api(self, user_message: str, retry_count: int = 0) -> str:
        """
        调用 Ollama Cloud API
        
        Args:
            user_message: 用户消息
            retry_count: 重试次数
        
        Returns:
            API 响应文本
        """
        try:
            logger.debug(f"调用 Ollama API, 重试次数: {retry_count}")
            
            # 构建消息列表
            messages = [
                SystemMessage(content=SYSTEM_PROMPT),
                HumanMessage(content=user_message)
            ]
            
            # 调用 Ollama (同步调用,因为 langchain_ollama 暂不支持异步)
            # 如果需要异步,可以使用 asyncio.to_thread
            import asyncio
            response = await asyncio.to_thread(self.client.invoke, messages)
            
            # 提取文本内容
            response_text = response.content
            logger.debug(f"Ollama API 响应: {response_text[:200]}...")
            
            return response_text
            
        except TimeoutError as e:
            logger.warning(f"Ollama API 超时: {str(e)}")
            if retry_count < self.max_retries:
                logger.info(f"正在重试... ({retry_count + 1}/{self.max_retries})")
                return await self._call_ollama_api(user_message, retry_count + 1)
            raise
            
        except Exception as e:
            logger.error(f"Ollama API 错误: {str(e)}")
            if retry_count < self.max_retries:
                logger.info(f"正在重试... ({retry_count + 1}/{self.max_retries})")
                return await self._call_ollama_api(user_message, retry_count + 1)
            raise
    
    def _parse_response(
        self,
        response_text: str
    ) -> Union[SingleCommandResult, SequenceCommandResult, ErrorResult]:
        """
        解析 API 响应
        
        Args:
            response_text: API 响应文本
        
        Returns:
            解析后的结果对象
        """
        try:
            # 提取 JSON 部分
            json_str = self._extract_json(response_text)
            
            # 解析 JSON
            data = json.loads(json_str)
            
            # 根据类型创建对应的结果对象
            result_type = data.get("type")
            
            if result_type == "single":
                return SingleCommandResult(**data)
            elif result_type == "sequence":
                return SequenceCommandResult(**data)
            elif result_type == "error":
                return ErrorResult(**data)
            else:
                raise ValueError(f"未知的结果类型: {result_type}")
                
        except json.JSONDecodeError as e:
            logger.error(f"JSON 解析失败: {str(e)}\n响应: {response_text}")
            return ErrorResult(
                error="指令解析失败",
                suggestion="请尝试更清晰的描述"
            )
        except Exception as e:
            logger.error(f"解析响应失败: {str(e)}")
            return ErrorResult(
                error="系统错误",
                suggestion="请稍后重试"
            )
    
    def _extract_json(self, text: str) -> str:
        """
        从文本中提取 JSON
        
        Args:
            text: 包含 JSON 的文本
        
        Returns:
            JSON 字符串
        """
        # 尝试直接解析
        text = text.strip()
        if text.startswith("{"):
            return text
        
        # 尝试提取代码块中的 JSON
        if "```json" in text:
            start = text.find("```json") + 7
            end = text.find("```", start)
            return text[start:end].strip()
        
        if "```" in text:
            start = text.find("```") + 3
            end = text.find("```", start)
            return text[start:end].strip()
        
        # 尝试查找 JSON 对象
        start = text.find("{")
        if start != -1:
            # 找到最后一个 }
            end = text.rfind("}") + 1
            return text[start:end]
        
        return text
