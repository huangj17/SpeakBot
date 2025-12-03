"""
配置管理模块
"""

from typing import Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """应用配置"""
    
    # API 配置
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8020
    API_PREFIX: str = "/api"
    
    # Ollama Cloud API
    OLLAMA_API_KEY: str
    OLLAMA_MODEL: str = "gpt-oss:120b"  # Ollama 云模型 (不带 -cloud 后缀,直接访问API时使用)
    OLLAMA_BASE_URL: str = "https://ollama.com"  # Ollama 云服务地址
    OLLAMA_MAX_TOKENS: int = 1024
    OLLAMA_TEMPERATURE: float = 0.3
    
    # STT 服务
    STT_PROVIDER: str = "aliyun"  # aliyun/tencent/whisper
    STT_API_KEY: Optional[str] = None
    
    # STT 模型路径配置
    STT_MODEL_DIR: str = "/models/FunAudioLLM/SenseVoiceSmall"  # 非流式 SenseVoice 模型
    STREAMING_STT_MODEL_DIR: str = "/models/funasr/paraformer-zh-streaming"  # 流式 Paraformer 模型
    
    # WebSocket
    WS_HEARTBEAT_INTERVAL: int = 30
    WS_TIMEOUT: int = 90
    
    # 日志
    LOG_LEVEL: str = "INFO"
    
    # CORS
    ALLOW_ORIGINS: list[str] = ["*"]
    
    class Config:
        env_file = ".env"
        case_sensitive = True


# 创建全局配置实例
settings = Settings()

