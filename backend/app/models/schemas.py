"""
API 请求/响应模型
"""

from pydantic import BaseModel, Field, validator
from typing import Optional, Union
from .commands import SingleCommandResult, SequenceCommandResult, ErrorResult


class STTResponse(BaseModel):
    """STT API 响应"""
    success: bool
    text: Optional[str] = None
    confidence: Optional[float] = None
    duration: Optional[float] = None
    error: Optional[str] = None
    error_code: Optional[str] = None


class NLURequest(BaseModel):
    """NLU API 请求"""
    text: str = Field(..., min_length=1, max_length=500, description="用户输入文本")
    context: Optional[dict] = Field(None, description="上下文信息")
    
    @validator('text')
    def validate_text(cls, v):
        """验证文本输入"""
        # 去除首尾空格
        v = v.strip()
        if not v:
            raise ValueError("文本不能为空")
        return v


class NLUResponse(BaseModel):
    """NLU API 响应"""
    success: bool
    result: Optional[Union[SingleCommandResult, SequenceCommandResult, ErrorResult]] = None
    processing_time: Optional[float] = None


class WebSocketMessage(BaseModel):
    """WebSocket 消息"""
    type: str = Field(..., description="消息类型")
    data: dict = Field(default_factory=dict, description="消息数据")
    timestamp: str = Field(..., description="时间戳")

