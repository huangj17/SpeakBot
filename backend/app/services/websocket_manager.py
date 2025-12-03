"""
WebSocket 连接管理器
"""

import json
import logging
import asyncio
from typing import Dict
from datetime import datetime
from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)


class WebSocketManager:
    """WebSocket 连接管理器"""
    
    def __init__(self):
        """初始化连接池"""
        self.active_connections: Dict[str, WebSocket] = {}
        self.heartbeat_tasks: Dict[str, asyncio.Task] = {}
    
    async def connect(self, client_id: str, websocket: WebSocket):
        """
        接受客户端连接
        
        Args:
            client_id: 客户端ID
            websocket: WebSocket 连接
        """
        await websocket.accept()
        self.active_connections[client_id] = websocket
        logger.info(f"客户端已连接: {client_id}, 当前连接数: {len(self.active_connections)}")
        
        # 启动心跳任务
        # self.heartbeat_tasks[client_id] = asyncio.create_task(
        #     self._heartbeat_loop(client_id, websocket)
        # )
    
    def disconnect(self, client_id: str):
        """
        断开客户端连接
        
        Args:
            client_id: 客户端ID
        """
        if client_id in self.active_connections:
            del self.active_connections[client_id]
            logger.info(f"客户端已断开: {client_id}, 当前连接数: {len(self.active_connections)}")
        
        # 取消心跳任务
        if client_id in self.heartbeat_tasks:
            self.heartbeat_tasks[client_id].cancel()
            del self.heartbeat_tasks[client_id]
    
    async def send_message(self, client_id: str, message: dict):
        """
        发送消息给指定客户端
        
        Args:
            client_id: 客户端ID
            message: 消息内容
        """
        if client_id not in self.active_connections:
            logger.warning(f"客户端不存在: {client_id}")
            return
        
        websocket = self.active_connections[client_id]
        
        try:
            # 添加时间戳
            if "timestamp" not in message:
                message["timestamp"] = datetime.now().isoformat()
            
            await websocket.send_json(message)
            logger.debug(f"发送消息到 {client_id}: {message.get('type')}")
            
        except Exception as e:
            logger.error(f"发送消息失败: {str(e)}")
            self.disconnect(client_id)
    
    async def broadcast(self, message: dict):
        """
        广播消息给所有客户端
        
        Args:
            message: 消息内容
        """
        # 添加时间戳
        if "timestamp" not in message:
            message["timestamp"] = datetime.now().isoformat()
        
        disconnected_clients = []
        
        for client_id, websocket in self.active_connections.items():
            try:
                await websocket.send_json(message)
            except Exception as e:
                logger.error(f"广播消息到 {client_id} 失败: {str(e)}")
                disconnected_clients.append(client_id)
        
        # 清理断开的连接
        for client_id in disconnected_clients:
            self.disconnect(client_id)
        
        logger.info(f"广播消息到 {len(self.active_connections)} 个客户端")
    
    async def receive_message(self, client_id: str, websocket: WebSocket) -> dict:
        """
        接收客户端消息
        
        Args:
            client_id: 客户端ID
            websocket: WebSocket 连接
        
        Returns:
            消息内容
        """
        try:
            data = await websocket.receive_json()
            logger.debug(f"收到来自 {client_id} 的消息: {data.get('type')}")
            return data
        except WebSocketDisconnect:
            logger.info(f"客户端主动断开连接: {client_id}")
            raise
        except Exception as e:
            logger.error(f"接收消息失败: {str(e)}")
            raise
    
    async def _heartbeat_loop(self, client_id: str, websocket: WebSocket):
        """
        心跳循环（暂时禁用，客户端主动发送心跳）
        
        Args:
            client_id: 客户端ID
            websocket: WebSocket 连接
        """
        try:
            while True:
                await asyncio.sleep(30)  # 每30秒发送一次心跳
                
                if client_id not in self.active_connections:
                    break
                
                await self.send_message(client_id, {
                    "type": "heartbeat",
                    "data": {}
                })
                
        except asyncio.CancelledError:
            logger.debug(f"心跳任务已取消: {client_id}")
        except Exception as e:
            logger.error(f"心跳循环错误: {str(e)}")
            self.disconnect(client_id)


# 创建全局实例
ws_manager = WebSocketManager()

