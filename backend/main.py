"""
机器人自然语言控制系统 - 后端主程序
"""

import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.utils.logger import setup_logging
from app.routers import nlu, stt, websocket

# 配置日志
setup_logging()
logger = logging.getLogger(__name__)

# 创建 FastAPI 应用
app = FastAPI(
    title="机器人自然语言控制系统 API",
    description="将自然语言转换为机器人可执行指令的后端服务",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOW_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(nlu.router, prefix=settings.API_PREFIX)
app.include_router(stt.router, prefix=settings.API_PREFIX)
app.include_router(websocket.router)


@app.get("/")
async def root():
    """根路径"""
    return {
        "message": "机器人自然语言控制系统 API",
        "version": "1.0.0",
        "docs": "/docs"
    }


@app.get("/health")
async def health_check():
    """健康检查"""
    return {"status": "ok"}


@app.on_event("startup")
async def startup_event():
    """应用启动事件"""
    logger.info("🚀 应用启动中...")
    logger.info(f"📝 API 文档: http://{settings.API_HOST}:{settings.API_PORT}/docs")
    logger.info(f"🔌 WebSocket: ws://{settings.API_HOST}:{settings.API_PORT}/ws/robot/{{client_id}}")


@app.on_event("shutdown")
async def shutdown_event():
    """应用关闭事件"""
    logger.info("👋 应用正在关闭...")
