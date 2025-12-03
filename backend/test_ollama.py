"""
测试 Ollama Cloud 集成
运行方式: python test_ollama.py
"""

import os
import sys
import asyncio
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

# 检查 API Key
api_key = os.getenv("OLLAMA_API_KEY")
if not api_key or api_key == "your-ollama-api-key-here":
    print("❌ 错误: 请先在 .env 文件中配置 OLLAMA_API_KEY")
    print("   获取方式: https://ollama.com/settings/keys")
    sys.exit(1)

# 设置 OLLAMA_API_KEY 环境变量 (langchain_ollama 会自动读取)
os.environ["OLLAMA_API_KEY"] = api_key

print(f"✅ API Key 已配置: {api_key[:15]}...")

# 测试导入
try:
    from langchain_ollama import ChatOllama
    from langchain_core.messages import HumanMessage, SystemMessage
    print("✅ 依赖包导入成功")
except ImportError as e:
    print(f"❌ 依赖包导入失败: {e}")
    print("   请运行: pip install langchain-ollama langchain-core ollama")
    sys.exit(1)

# 测试 Ollama 连接
async def test_ollama():
    print("\n🚀 开始测试 Ollama Cloud API...")
    
    try:
        # 初始化客户端
        model = os.getenv("OLLAMA_MODEL", "gpt-oss:120b")
        base_url = os.getenv("OLLAMA_BASE_URL", "https://ollama.com")
        
        print(f"📝 使用模型: {model}")
        print(f"🌐 服务地址: {base_url}")
        
        client = ChatOllama(
            model=model,
            base_url=base_url,
            temperature=0.3,
            num_predict=1024,
        )
        
        print("✅ 客户端初始化成功")
        
        # 测试简单对话
        print("\n📤 发送测试消息: '前进2米'")
        messages = [
            SystemMessage(content="你是一个机器人指令解析助手,请将用户的自然语言转换为JSON格式的指令。"),
            HumanMessage(content="前进2米")
        ]
        
        # 异步调用
        response = await asyncio.to_thread(client.invoke, messages)
        
        print("✅ API 调用成功")
        print(f"\n📥 响应内容:\n{response.content}\n")
        
        # 测试复杂指令
        print("📤 发送复杂指令: '帮我拿桌上的杯子'")
        messages = [
            SystemMessage(content="你是一个机器人指令解析助手,请将用户的自然语言转换为JSON格式的指令序列。"),
            HumanMessage(content="帮我拿桌上的杯子")
        ]
        
        response = await asyncio.to_thread(client.invoke, messages)
        print("✅ 复杂指令测试成功")
        print(f"\n📥 响应内容:\n{response.content}\n")
        
        print("🎉 所有测试通过!")
        return True
        
    except Exception as e:
        print(f"\n❌ 测试失败: {str(e)}")
        print("\n故障排查:")
        print("1. 检查 API Key 是否正确")
        print("2. 确认网络能访问 ollama.com")
        print("3. 检查模型名称是否正确")
        print("4. 查看完整错误信息进行调试")
        return False

if __name__ == "__main__":
    result = asyncio.run(test_ollama())
    sys.exit(0 if result else 1)

