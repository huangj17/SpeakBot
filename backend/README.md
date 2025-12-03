# 机器人自然语言控制系统 - 后端服务

基于 FastAPI 的机器人自然语言控制后端，将用户自然语言转换为机器人可执行指令。

## 功能特性

- 🤖 自然语言理解（NLU）- Ollama Cloud API
- 🎤 语音转文字（STT）- FunASR
- 🔌 WebSocket 实时通信
- 📝 标准化指令解析

## 快速开始

### 1. 安装依赖

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. 配置 API Key

1. 访问 [ollama.com](https://ollama.com) 注册账号
2. 进入 [API Keys 页面](https://ollama.com/settings/keys) 创建密钥
3. 配置环境变量：

```bash
cp .env.example .env
# 编辑 .env，填入你的 OLLAMA_API_KEY
```

### 3. 启动服务

```bash
# 方式一：直接启动
uvicorn main:app --reload --host 0.0.0.0 --port 8020

# 方式二：使用启动脚本
./start.sh
```

### 4. 验证服务

- API 文档：http://localhost:8020/docs
- 健康检查：http://localhost:8020/health

## API 接口

### NLU 解析

```bash
curl -X POST http://localhost:8020/api/nlu/parse \
  -H "Content-Type: application/json" \
  -d '{"text": "前进2米"}'
```

### STT 语音识别

```bash
curl -X POST http://localhost:8020/api/stt \
  -F "audio_file=@audio.wav" \
  -F "language=zh-CN"
```

### WebSocket

```javascript
const ws = new WebSocket('ws://localhost:8020/ws/robot/client123');
ws.send(JSON.stringify({ type: 'heartbeat', data: {}, timestamp: new Date().toISOString() }));
```

## 项目结构

```
backend/
├── app/
│   ├── config.py           # 配置管理
│   ├── models/             # 数据模型
│   ├── routers/            # API 路由 (nlu, stt, websocket)
│   ├── services/           # 业务逻辑 (llm, stt, ws)
│   ├── prompts/            # NLU 提示词
│   └── utils/              # 工具函数
├── main.py                 # 应用入口
├── requirements.txt        # 依赖列表
└── .env.example            # 环境变量模板
```

## 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `OLLAMA_API_KEY` | Ollama API 密钥 | **必填** |
| `OLLAMA_MODEL` | 使用的模型 | `gpt-oss:120b` |
| `API_PORT` | 服务端口 | `8020` |
| `LOG_LEVEL` | 日志级别 | `INFO` |

## 常见问题

| 问题 | 解决方案 |
|------|----------|
| API 调用失败 | 检查 `.env` 中的 `OLLAMA_API_KEY` 是否正确 |
| 连接超时 | 确认网络能访问 ollama.com |
| 端口被占用 | 更改端口：`--port 8021` |

## 进阶文档

- 模型选择与配置详情：[OLLAMA_CLOUD_指南.md](./OLLAMA_CLOUD_指南.md)

## 许可证

MIT License
