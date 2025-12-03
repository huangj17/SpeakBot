"""
STT API 路由（语音转文字）
"""

import logging
from fastapi import APIRouter, File, UploadFile, HTTPException, Form

from app.models.schemas import STTResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/stt", tags=["STT"])


@router.post("", response_model=STTResponse)
async def speech_to_text(
    audio_file: UploadFile = File(...),
    language: str = Form("zh-CN")
):
    """
    语音转文字接口
    
    Args:
        audio_file: 音频文件
        language: 语言（默认中文）
    
    Returns:
        STT 响应
    """
    try:
        logger.info(f"收到 STT 请求: {audio_file.filename}, 语言: {language}")
        
        # TODO: 集成实际的 STT 服务
        # 这里暂时返回模拟数据
        
        # 检查文件类型
        if not audio_file.content_type.startswith("audio/"):
            raise HTTPException(
                status_code=400,
                detail="不支持的文件类型，请上传音频文件"
            )
        
        # 检查文件大小（10MB）
        file_size = 0
        contents = await audio_file.read()
        file_size = len(contents)
        
        if file_size > 10 * 1024 * 1024:
            raise HTTPException(
                status_code=400,
                detail="文件过大，请上传小于10MB的音频文件"
            )
        
        # TODO: 调用 STT API
        # 目前返回模拟响应
        return STTResponse(
            success=True,
            text="前进2米",  # 模拟识别结果
            confidence=0.95,
            duration=3.0,
            error=None
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"STT 处理失败: {str(e)}")
        return STTResponse(
            success=False,
            error=str(e),
            error_code="E3001"
        )

