"""
STT 服务 - 基于 FunASR SenseVoice
支持完整音频识别（录完再发送场景）
"""

import base64
import logging
import os
import tempfile
from typing import Any, Dict, Optional

import numpy as np

from app.config import settings

# 尝试导入 pydub 用于音频格式转换
try:
    from pydub import AudioSegment
    PYDUB_AVAILABLE = True
except ImportError:
    PYDUB_AVAILABLE = False
    logging.warning("pydub 未安装，将无法处理 m4a/aac 格式音频")

# 尝试导入 funasr
try:
    from funasr import AutoModel
    from funasr.utils.postprocess_utils import rich_transcription_postprocess
    FUNASR_AVAILABLE = True
except ImportError:
    FUNASR_AVAILABLE = False
    logging.warning("funasr 未安装，STT 服务将不可用")

logger = logging.getLogger(__name__)

class STTService:
    """
    基于 FunASR SenseVoice 的语音识别服务
    适合完整音频识别（非实时流式）
    """
    
    def __init__(self, model_dir: Optional[str] = None):
        """
        初始化 STT 服务
        
        Args:
            model_dir: SenseVoice 模型路径，默认从配置文件读取
        """
        self.model_dir = model_dir or settings.STT_MODEL_DIR
        self.model = None
        
        if FUNASR_AVAILABLE:
            try:
                logger.info(f"正在加载 STT 模型: {self.model_dir} ...")
                self.model = AutoModel(
                    model=self.model_dir,
                    vad_model="fsmn-vad",
                    vad_kwargs={"max_single_segment_time": 30000},
                    device="cpu",
                )
                logger.info("STT 模型加载完成")
            except Exception as e:
                logger.error(f"STT 模型加载失败: {str(e)}")
                self.model = None
    
    def create_session(self) -> Dict[str, Any]:
        """
        创建新的识别会话
        """
        return {
            "audio_data": None,  # 存储接收到的音频数据
        }

    def _convert_audio_to_pcm(self, audio_bytes: bytes) -> np.ndarray:
        """
        将音频数据转换为 PCM 格式 (16kHz, mono, float32)
        支持 m4a/aac/mp3/wav 等格式
        
        Args:
            audio_bytes: 原始音频字节
            
        Returns:
            np.ndarray: PCM 音频数据 (float32, 范围 -1.0 ~ 1.0)
        """
        if not PYDUB_AVAILABLE:
            # 如果没有 pydub，假设输入就是 PCM int16，转为 float32
            logger.warning("pydub 不可用，假设输入为 PCM 格式")
            audio_int16 = np.frombuffer(audio_bytes, dtype=np.int16)
            return audio_int16.astype(np.float32) / 32768.0
        
        try:
            # 写入临时文件让 pydub 处理
            with tempfile.NamedTemporaryFile(suffix='.m4a', delete=False) as tmp_file:
                tmp_file.write(audio_bytes)
                tmp_path = tmp_file.name
            
            try:
                # 加载音频
                audio = AudioSegment.from_file(tmp_path)
                
                # 转换为 16kHz, mono
                audio = audio.set_frame_rate(16000).set_channels(1)
                
                # 导出为 raw PCM (int16)，然后转为 float32
                pcm_data = audio.raw_data
                audio_int16 = np.frombuffer(pcm_data, dtype=np.int16)
                
                # 转换为 float32，范围 -1.0 ~ 1.0（FunASR 期望的格式）
                audio_float32 = audio_int16.astype(np.float32) / 32768.0
                
                logger.info(f"音频转换成功: {len(audio_bytes)} bytes -> {len(audio_float32)} samples, 时长: {len(audio_float32)/16000:.2f}s")
                
                return audio_float32
                
            finally:
                # 清理临时文件
                os.unlink(tmp_path)
                
        except Exception as e:
            logger.error(f"音频格式转换失败: {str(e)}")
            # 降级：尝试直接当作 PCM int16 处理，转为 float32
            audio_int16 = np.frombuffer(audio_bytes, dtype=np.int16)
            return audio_int16.astype(np.float32) / 32768.0

    def process_chunk(
        self, 
        session: Dict[str, Any], 
        audio_chunk_b64: str, 
        is_final: bool = False
    ) -> Dict[str, Any]:
        """
        处理音频数据
        
        Args:
            session: 会话上下文字典
            audio_chunk_b64: Base64 编码的音频数据
            is_final: 是否是最后一个片段
            
        Returns:
            Dict: 识别结果 {"text": "...", "is_final": bool}
        """
        if not self.model:
            return {"text": "", "error": "STT 模型未初始化"}
        
        # 如果是结束信号且没有数据，且 session 中有数据，则识别
        if is_final and not audio_chunk_b64:
            if session.get("audio_data") is not None:
                return self._recognize(session["audio_data"])
            logger.info("收到结束信号，无音频数据")
            return {"text": "", "is_final": True}
        
        if not audio_chunk_b64:
            return {"text": "", "is_final": is_final}
            
        try:
            # 1. Base64 解码
            audio_bytes = base64.b64decode(audio_chunk_b64)
            logger.info(f"解码音频数据: {len(audio_bytes)} bytes")
            
            # 2. 转换音频格式为 PCM (16kHz, mono, int16)
            audio_data = self._convert_audio_to_pcm(audio_bytes)
            
            if len(audio_data) == 0:
                logger.warning("音频数据为空")
                return {"text": "", "is_final": is_final}
            
            # 存储到 session（如果需要后续合并）
            session["audio_data"] = audio_data
            
            # 如果是最终数据，立即识别
            if is_final:
                return self._recognize(audio_data)
            
            # 非最终数据，暂存不识别（等 audio_end 再识别）
            return {"text": "", "is_final": False}
            
        except Exception as e:
            logger.error(f"音频处理失败: {str(e)}", exc_info=True)
            return {"text": "", "error": str(e)}
    
    def _recognize(self, audio_data: np.ndarray) -> Dict[str, Any]:
        """
        执行语音识别
        
        Args:
            audio_data: PCM 音频数据 (16kHz, mono, float32, 范围 -1.0~1.0)
            
        Returns:
            Dict: 识别结果
        """
        try:
            logger.info(f"开始识别，音频样本数: {len(audio_data)}, 时长: {len(audio_data)/16000:.2f}s")
            
            # SenseVoice 模型推理
            res = self.model.generate(
                input=audio_data,
                cache={},
                language="auto",  # 自动检测语言
                use_itn=True,     # 使用逆文本正则化
                batch_size_s=60,
                merge_vad=True,
                merge_length_s=15,
            )
            
            logger.info(f"模型原始返回: {res}")
            
            # 解析结果
            text = ""
            if isinstance(res, list) and len(res) > 0:
                if isinstance(res[0], dict) and "text" in res[0]:
                    # 使用后处理函数清理文本
                    raw_text = res[0]["text"]
                    text = rich_transcription_postprocess(raw_text)
                    # # 移除表情符号（SenseVoice 情感标签转换的结果）
                    # text = re.sub(r'[\U0001F300-\U0001F9FF]', '', text)
            
            if text:
                text = text.strip()
                logger.info(f"识别文本: {text}")
            else:
                logger.warning("识别结果为空")
                
            return {
                "text": text,
                "is_final": True
            }
            
        except Exception as e:
            logger.error(f"语音识别失败: {str(e)}", exc_info=True)
            return {"text": "", "error": str(e), "is_final": True}

# 全局单例
stt_service = STTService()

