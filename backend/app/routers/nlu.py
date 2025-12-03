
import logging

from fastapi import APIRouter, Depends, HTTPException

from app.models.schemas import NLURequest, NLUResponse
from app.services.llm_service import LLMService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/nlu", tags=["NLU"])

# 创建依赖函数，确保每次请求都使用正确的服务实例
# 或者使用单例模式，但要确保初始化时环境已经就绪
def get_llm_service():
    return LLMService()

@router.post("/parse", response_model=NLUResponse)
async def parse_natural_language(
    request: NLURequest, 
    llm_service: LLMService = Depends(get_llm_service)
):
    """
    自然语言理解接口
    
    将用户的自然语言输入转换为机器人可执行的标准指令
    
    Args:
        request: NLU 请求
    
    Returns:
        NLU 响应
    """
    try:
        logger.info(f"收到 NLU 请求: {request.text}")
        
        # 调用 LLM 服务解析指令
        result, processing_time = await llm_service.parse_command(
            text=request.text,
            context=request.context
        )
        
        return NLUResponse(
            success=True,
            result=result,
            processing_time=processing_time
        )
        
    except Exception as e:
        logger.error(f"NLU 处理失败: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
