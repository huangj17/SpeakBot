"""
指令数据模型
"""

from pydantic import BaseModel, Field
from typing import Optional, Literal, List
from datetime import datetime
import uuid


class Command(BaseModel):
    """基础指令模型"""
    command: str = Field(..., description="指令名称")
    params: dict = Field(default_factory=dict, description="指令参数")
    description: str = Field(..., description="中文描述")
    command_id: str = Field(default_factory=lambda: str(uuid.uuid4()), description="唯一标识")
    timestamp: str = Field(default_factory=lambda: datetime.now().isoformat(), description="时间戳")
    order: Optional[int] = Field(None, description="在序列中的顺序")


class SingleCommandResult(Command):
    """单步指令结果"""
    type: Literal["single"] = "single"


class SequenceCommandResult(BaseModel):
    """指令序列结果"""
    type: Literal["sequence"] = "sequence"
    commands: List[Command]
    total_steps: int
    estimated_duration: float


class ErrorResult(BaseModel):
    """错误结果"""
    type: Literal["error"] = "error"
    error: str
    suggestion: str
