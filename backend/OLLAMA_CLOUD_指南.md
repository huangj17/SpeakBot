# Ollama Cloud 进阶指南

> 本文档为进阶参考，基础配置请参阅 [README.md](./README.md)

## 模型选择

| 模型 | 特点 | 推荐场景 |
|------|------|----------|
| `gpt-oss:120b` | 通用能力强，性价比高 | **默认推荐** |
| `minimax-m2` | 轻量快速 | 开发测试 |
| `deepseek-v3.1:671b` | 最强性能 | 复杂推理 |
| `qwen3-coder:480b` | 代码理解 | 代码任务 |

在 `.env` 中修改模型：

```bash
OLLAMA_MODEL=gpt-oss:120b
```

## 调用方式

### 方式一：LangChain (本项目使用)

```python
from langchain_ollama import ChatOllama
from langchain_core.messages import HumanMessage, SystemMessage

client = ChatOllama(
    model="gpt-oss:120b",
    base_url="https://ollama.com",
    temperature=0.3,
)

response = client.invoke([
    SystemMessage(content="你是机器人指令解析助手"),
    HumanMessage(content="前进2米")
])
```

### 方式二：Ollama SDK

```python
from ollama import Client
import os

client = Client(
    host="https://ollama.com",
    headers={'Authorization': f'Bearer {os.environ["OLLAMA_API_KEY"]}'}
)

response = client.chat(model='gpt-oss:120b', messages=[{'role': 'user', 'content': '前进2米'}])
```

### 方式三：REST API

```bash
curl https://ollama.com/api/chat \
  -H "Authorization: Bearer $OLLAMA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-oss:120b", "messages": [{"role": "user", "content": "前进2米"}], "stream": false}'
```

## 故障排查

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| `Unauthorized` | API Key 无效 | 检查 `.env` 中的 Key 是否正确 |
| `Model not found` | 模型名称错误 | 模型名不需要 `-cloud` 后缀 |
| `Connection timeout` | 网络问题 | 检查网络或使用代理 |

查看详细日志：

```bash
tail -f logs/app.log
python test_ollama.py  # 运行测试脚本
```

## 从 Claude API 迁移

```bash
# 卸载旧依赖
pip uninstall -y anthropic

# 安装新依赖
pip install langchain-ollama langchain-core ollama
```

更新 `.env`：

```bash
# 旧配置
# CLAUDE_API_KEY=sk-ant-xxx

# 新配置
OLLAMA_API_KEY=ollama_xxx
OLLAMA_MODEL=gpt-oss:120b
```

## 参考资料

- [Ollama Cloud 文档](https://docs.ollama.com/cloud)
- [LangChain Ollama 集成](https://python.langchain.com/docs/integrations/chat/ollama)
