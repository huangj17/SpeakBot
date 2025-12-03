# 机器人自然语言控制系统 - 移动端

基于 React Native + Expo 的移动端应用，通过自然语言和语音控制机器人。

## 功能特性

- 🎤 语音输入 - 录音识别转指令
- ⌨️ 文本输入 - 自然语言解析
- 🔌 实时通信 - WebSocket 自动重连
- 📋 指令历史 - 查看执行记录

## 快速开始

### 1. 安装依赖

```bash
cd mobile-app
pnpm install  # 或 npm install
```

### 2. 配置后端地址

编辑 `src/constants/config.ts`：

```typescript
export const APP_CONFIG = {
  API_BASE_URL: 'http://YOUR_BACKEND_IP:8020',
  WS_BASE_URL: 'ws://YOUR_BACKEND_IP:8020',
  // ...
};
```

### 3. 启动开发

```bash
pnpm start  # 或 npx expo start
```

扫描二维码即可在手机上预览（需安装 [Expo Go](https://expo.dev/go)）。

## 项目结构

```
mobile-app/
├── app/                    # Expo Router 页面
│   ├── _layout.tsx         # 布局
│   └── index.tsx           # 主页
├── components/             # UI 组件
│   ├── CommandInput.tsx    # 输入框
│   ├── CommandList.tsx     # 指令列表
│   ├── StatusPanel.tsx     # 状态面板
│   └── VoiceRecordButton.tsx # 语音按钮
└── src/
    ├── constants/config.ts # 配置
    ├── hooks/              # 自定义 Hooks
    ├── services/           # API & WebSocket
    ├── store/              # Zustand 状态管理
    └── types/              # TypeScript 类型
```

## 常用命令

| 命令 | 说明 |
|------|------|
| `pnpm start` | 启动开发服务器 |
| `pnpm ios` | iOS 模拟器运行 |
| `pnpm android` | Android 模拟器运行 |
| `pnpm lint` | 代码检查 |

## 常见问题

| 问题 | 解决方案 |
|------|----------|
| WebSocket 连接失败 | 检查后端是否启动，确认 `config.ts` 中地址正确 |
| 语音识别无响应 | 确认已授予麦克风权限 |
| 模拟器网络问题 | iOS 用 `localhost`，Android 用 `10.0.2.2` |

## 技术栈

- **框架**: React Native 0.81 + Expo 54
- **样式**: NativeWind (Tailwind CSS)
- **状态**: Zustand
- **通信**: Axios + WebSocket

## 许可证

MIT License
