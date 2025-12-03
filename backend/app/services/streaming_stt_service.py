"""
流式 STT 服务 - 基于 FunASR Paraformer-Streaming
支持实时语音识别（边说边转文字）
使用简单的音频能量检测实现静音检测，支持自动发送指令
"""

import base64
import logging
import time
from typing import Any, Dict, Optional

import numpy as np

from app.config import settings

# 尝试导入 funasr
try:
    from funasr import AutoModel
    FUNASR_AVAILABLE = True
except ImportError:
    FUNASR_AVAILABLE = False
    logging.warning("funasr 未安装，流式 STT 服务将不可用")

logger = logging.getLogger(__name__)


class StreamingSTTService:
    """
    基于 FunASR Paraformer-Streaming 的流式语音识别服务
    适合实时语音通话场景
    """
    
    # 流式识别参数配置
    CHUNK_SIZE = [0, 10, 5]  # [0, 10, 5] 对应 600ms 一个 chunk
    ENCODER_CHUNK_LOOK_BACK = 4  # encoder 自注意力回看的 chunk 数
    DECODER_CHUNK_LOOK_BACK = 1  # decoder 交叉注意力回看的 encoder chunk 数
    SAMPLE_RATE = 16000  # 采样率 16kHz
    
    def __init__(self, model_dir: Optional[str] = None):
        """
        初始化流式 STT 服务
        
        Args:
            model_dir: Paraformer-Streaming 模型路径，默认从配置文件读取
        """
        self.model_dir = model_dir or settings.STREAMING_STT_MODEL_DIR
        self.model = None
        
        # 计算 chunk 步长（每个 chunk 的采样点数）
        # chunk_size[1] * 960 = 10 * 960 = 9600 samples = 600ms @ 16kHz
        self.chunk_stride = self.CHUNK_SIZE[1] * 960
        
        if FUNASR_AVAILABLE:
            try:
                logger.info(f"正在加载流式 STT 模型: {self.model_dir} ...")
                self.model = AutoModel(model=self.model_dir)
                logger.info("流式 STT 模型加载完成")
            except Exception as e:
                logger.error(f"流式 STT 模型加载失败: {str(e)}")
                self.model = None
    
    # WAV 文件头大小（标准 PCM WAV 为 44 字节）
    WAV_HEADER_SIZE = 44
    
    # 静音检测配置（简单能量检测，替代 VAD 模型，几乎不消耗 CPU）
    SILENCE_ENERGY_THRESHOLD = 0.01  # 能量阈值，低于此值视为静音（RMS 值，范围 0-1）
    SILENCE_THRESHOLD_MS = 2000  # 静音时间阈值（毫秒）- 连续静音超过此时间才触发发送
    
    def create_session(self) -> Dict[str, Any]:
        """
        创建新的流式识别会话
        
        Returns:
            Dict: 会话上下文，包含 cache 和缓冲区
        """
        return {
            "cache": {},  # 模型推理上下文缓存（关键！）
            "audio_buffer": np.array([], dtype=np.float32),  # 音频缓冲区
            "full_text": "",  # 累积的完整文本
            "chunk_count": 0,  # 已处理的 chunk 数
            "wav_header_skipped": False,  # 是否已跳过 WAV 头
            "last_sent_text": "",  # 上次发送的文本（用于判断是否有新内容）
            # 静音检测（基于音频能量，不使用 VAD 模型）
            "silence_start_time": None,  # 检测到静音的时间戳（毫秒）
            "is_speaking": False,  # 当前是否在说话
        }
    
    def _decode_audio(
        self, 
        audio_chunk_b64: str, 
        skip_wav_header: bool = False
    ) -> Optional[np.ndarray]:
        """
        解码 Base64 音频数据为 PCM float32
        
        Args:
            audio_chunk_b64: Base64 编码的音频数据
            skip_wav_header: 是否跳过 WAV 文件头（第一个块需要跳过）
            
        Returns:
            np.ndarray: float32 音频数据，范围 -1.0 ~ 1.0
        """
        try:
            # Base64 解码
            audio_bytes = base64.b64decode(audio_chunk_b64)
            
            logger.debug(f"收到音频数据: {len(audio_bytes)} 字节, 前4字节: {audio_bytes[:4] if len(audio_bytes) >= 4 else audio_bytes}")
            
            # 如果需要跳过 WAV 头
            if skip_wav_header and len(audio_bytes) > self.WAV_HEADER_SIZE:
                # 检查是否是 WAV 文件（以 "RIFF" 开头）
                if audio_bytes[:4] == b'RIFF':
                    logger.info(f"检测到 WAV 头，跳过前 {self.WAV_HEADER_SIZE} 字节")
                    audio_bytes = audio_bytes[self.WAV_HEADER_SIZE:]
                else:
                    logger.info(f"未检测到 WAV 头（前4字节: {audio_bytes[:4]}），按原始 PCM 处理")
            
            # 检查数据长度是否为偶数（16-bit PCM 要求）
            if len(audio_bytes) % 2 != 0:
                audio_bytes = audio_bytes[:-1]  # 去掉最后一个字节
            
            if len(audio_bytes) == 0:
                return np.array([], dtype=np.float32)
            
            # 转换为 int16，再转为 float32
            audio_int16 = np.frombuffer(audio_bytes, dtype=np.int16)
            audio_float32 = audio_int16.astype(np.float32) / 32768.0
            
            logger.debug(f"解码成功: {len(audio_float32)} 采样点")
            return audio_float32
            
        except Exception as e:
            logger.error(f"音频解码失败: {str(e)}")
            return None
    
    def process_chunk(
        self,
        session: Dict[str, Any],
        audio_chunk_b64: str,
        is_final: bool = False,
        is_first_chunk: bool = False
    ) -> Dict[str, Any]:
        """
        处理音频块，返回实时识别结果
        
        Args:
            session: 会话上下文
            audio_chunk_b64: Base64 编码的音频数据
            is_final: 是否是最后一个音频块
            is_first_chunk: 是否是第一个块（可能包含 WAV 头）
            
        Returns:
            Dict: 识别结果 {
                "text": "...",
                "is_final": bool,
                "full_text": "...",
                "should_send": bool,  # VAD 检测到停止说话，应该发送指令
                "is_speaking": bool,  # 当前是否在说话
            }
        """
        if not self.model:
            return {
                "text": "", 
                "error": "流式 STT 模型未初始化", 
                "is_final": is_final,
                "should_send": False,
                "is_speaking": False,
            }
        
        # 如果是结束信号且没有新数据
        if is_final and not audio_chunk_b64:
            # 处理缓冲区中剩余的数据
            result = self._process_remaining(session)
            # 通话结束时，如果有未发送的文本，标记为应该发送
            should_send = bool(session["full_text"].strip()) and session["full_text"] != session.get("last_sent_text", "")
            result["should_send"] = should_send
            result["is_speaking"] = False
            return result
        
        if not audio_chunk_b64:
            return {
                "text": "", 
                "is_final": False,
                "should_send": False,
                "is_speaking": session.get("is_speaking", False),
            }
        
        # 判断是否需要跳过 WAV 头
        skip_wav_header = is_first_chunk and not session.get("wav_header_skipped", False)
        
        # 解码音频
        audio_data = self._decode_audio(audio_chunk_b64, skip_wav_header=skip_wav_header)
        if audio_data is None:
            return {
                "text": "", 
                "error": "音频解码失败", 
                "is_final": is_final,
                "should_send": False,
                "is_speaking": False,
            }
        
        # 标记已处理 WAV 头
        if skip_wav_header:
            session["wav_header_skipped"] = True
        
        # 简单能量检测（替代 VAD 模型，几乎不消耗 CPU）
        # 计算音频能量（RMS - Root Mean Square）
        if len(audio_data) > 0:
            audio_energy = np.sqrt(np.mean(audio_data ** 2))
        else:
            audio_energy = 0.0
        
        current_time_ms = int(time.time() * 1000)  # 当前时间戳（毫秒）
        is_silent = audio_energy < self.SILENCE_ENERGY_THRESHOLD
        
        # 更新说话状态
        was_speaking = session["is_speaking"]
        is_speaking = not is_silent
        session["is_speaking"] = is_speaking
        
        # 静音检测逻辑
        if is_speaking:
            # 有声音，重置静音计时
            session["silence_start_time"] = None
        elif was_speaking and is_silent:
            # 刚开始静音，记录开始时间
            if session["silence_start_time"] is None:
                session["silence_start_time"] = current_time_ms
        # 如果一直静音，保持 silence_start_time 不变
        
        # 将新数据添加到缓冲区
        session["audio_buffer"] = np.concatenate([session["audio_buffer"], audio_data])
        
        # 收集所有可处理的 chunk 的识别结果
        results = []
        
        # 当缓冲区有足够数据时，处理一个 chunk
        while len(session["audio_buffer"]) >= self.chunk_stride:
            # 取出一个 chunk
            chunk = session["audio_buffer"][:self.chunk_stride]
            session["audio_buffer"] = session["audio_buffer"][self.chunk_stride:]
            
            # 执行流式识别
            result = self._recognize_chunk(session, chunk, is_final=False)
            if result.get("text"):
                results.append(result["text"])
        
        # 如果是最后一块，处理剩余数据
        if is_final:
            final_result = self._process_remaining(session)
            if final_result.get("text"):
                results.append(final_result["text"])
            
            # 通话结束，如果有文本就发送
            should_send = bool(session["full_text"].strip()) and session["full_text"] != session.get("last_sent_text", "")
            
            return {
                "text": "".join(results),
                "is_final": True,
                "full_text": session["full_text"],
                "should_send": should_send,
                "is_speaking": False,
            }
        
        # 返回本次处理的增量结果
        incremental_text = "".join(results)
        if incremental_text:
            session["full_text"] += incremental_text
        
        # 判断是否应该发送指令（带静音时间阈值防抖）：
        # 1. 当前是静音状态
        # 2. 静音时间超过阈值
        # 3. 有累积的文本内容
        # 4. 文本与上次发送的不同（避免重复发送）
        should_send = False
        
        if session["silence_start_time"] is not None:
            # 计算静音持续时间
            silence_duration = current_time_ms - session["silence_start_time"]
            
            if (silence_duration >= self.SILENCE_THRESHOLD_MS 
                and bool(session["full_text"].strip())
                and session["full_text"] != session.get("last_sent_text", "")):
                should_send = True
                logger.info(f"静音触发发送指令（静音 {silence_duration}ms）: {session['full_text']}")
                # 重置静音状态
                session["silence_start_time"] = None
            
        return {
            "text": incremental_text,
            "is_final": False,
            "full_text": session["full_text"],
            "should_send": should_send,
            "is_speaking": is_speaking,
        }
    
    def _process_remaining(self, session: Dict[str, Any]) -> Dict[str, Any]:
        """
        处理缓冲区中剩余的数据（最后一个 chunk）
        
        Args:
            session: 会话上下文
            
        Returns:
            Dict: 识别结果
        """
        if len(session["audio_buffer"]) > 0:
            # 处理剩余数据
            chunk = session["audio_buffer"]
            session["audio_buffer"] = np.array([], dtype=np.float32)
            
            result = self._recognize_chunk(session, chunk, is_final=True)
            if result.get("text"):
                session["full_text"] += result["text"]
                
            return {
                "text": result.get("text", ""),
                "is_final": True,
                "full_text": session["full_text"]
            }
        else:
            # 发送空的 final 信号给模型
            result = self._recognize_chunk(session, np.array([], dtype=np.float32), is_final=True)
            if result.get("text"):
                session["full_text"] += result["text"]
                
            return {
                "text": result.get("text", ""),
                "is_final": True,
                "full_text": session["full_text"]
            }
    
    def _recognize_chunk(
        self,
        session: Dict[str, Any],
        audio_chunk: np.ndarray,
        is_final: bool = False
    ) -> Dict[str, Any]:
        """
        执行单个 chunk 的识别
        
        Args:
            session: 会话上下文（包含 cache）
            audio_chunk: 音频数据
            is_final: 是否是最后一个 chunk
            
        Returns:
            Dict: 识别结果
        """
        try:
            session["chunk_count"] += 1
            
            # 调用模型进行流式识别
            res = self.model.generate(
                input=audio_chunk,
                cache=session["cache"],  # 关键：传递 cache 保持上下文
                is_final=is_final,
                chunk_size=self.CHUNK_SIZE,
                encoder_chunk_look_back=self.ENCODER_CHUNK_LOOK_BACK,
                decoder_chunk_look_back=self.DECODER_CHUNK_LOOK_BACK,
            )
            
            # 解析结果
            text = ""
            if isinstance(res, list) and len(res) > 0:
                if isinstance(res[0], dict) and "text" in res[0]:
                    text = res[0]["text"]
                elif isinstance(res[0], str):
                    text = res[0]
            
            if text:
                text = text.strip()
                logger.debug(f"Chunk {session['chunk_count']} 识别结果: {text}")
            
            return {"text": text, "is_final": is_final}
            
        except Exception as e:
            logger.error(f"流式识别失败: {str(e)}", exc_info=True)
            return {"text": "", "error": str(e), "is_final": is_final}
    
    def mark_as_sent(self, session: Dict[str, Any]) -> None:
        """
        标记当前文本已发送，避免重复发送
        
        Args:
            session: 会话上下文
        """
        session["last_sent_text"] = session["full_text"]
        logger.debug(f"标记已发送: {session['full_text']}")
    
    def clear_text(self, session: Dict[str, Any]) -> None:
        """
        清空累积的文本，准备下一轮识别
        
        Args:
            session: 会话上下文
        """
        session["full_text"] = ""
        session["last_sent_text"] = ""
        logger.debug("清空转写文本")
    
    def close_session(self, session: Dict[str, Any]) -> None:
        """
        关闭会话，清理资源
        
        Args:
            session: 会话上下文
        """
        session["cache"] = {}
        session["audio_buffer"] = np.array([], dtype=np.float32)
        logger.info(f"流式 STT 会话关闭，共处理 {session['chunk_count']} 个 chunk")


# 全局单例
streaming_stt_service = StreamingSTTService()

