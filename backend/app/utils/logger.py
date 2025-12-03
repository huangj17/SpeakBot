"""
日志配置
"""

import logging
import sys

from app.config import settings


def setup_logging():
    """配置日志"""
    
    # 设置日志级别
    log_level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)
    
    # 配置根日志记录器
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[
            logging.StreamHandler(sys.stdout)
        ],
        force=True  # 强制重新配置，覆盖之前的设置
    )
    
    # 确保应用日志级别正确
    logging.getLogger("app").setLevel(log_level)
    logging.getLogger("app.services").setLevel(log_level)
    logging.getLogger("app.routers").setLevel(log_level)
    
    # 设置第三方库的日志级别（减少噪音）
    logging.getLogger("uvicorn").setLevel(logging.INFO)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("anthropic").setLevel(logging.WARNING)
    logging.getLogger("funasr").setLevel(logging.WARNING)
    logging.getLogger("modelscope").setLevel(logging.WARNING)

