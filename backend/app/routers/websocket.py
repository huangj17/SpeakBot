"""
WebSocket 路由
"""

import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.streaming_stt_service import streaming_stt_service
from app.services.stt_service import stt_service
from app.services.websocket_manager import ws_manager

logger = logging.getLogger(__name__)
router = APIRouter(tags=["WebSocket"])


@router.websocket("/ws/robot/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    """
    WebSocket 连接端点
    
    Args:
        websocket: WebSocket 连接
        client_id: 客户端唯一标识
    """
    await ws_manager.connect(client_id, websocket)
    
    # STT 会话状态（非流式，录完再识别）
    stt_session = None
    
    # 流式 STT 会话状态（实时语音通话）
    streaming_stt_session = None
    
    try:
        while True:
            # 接收客户端消息
            data = await ws_manager.receive_message(client_id, websocket)
            
            # 处理不同类型的消息
            message_type = data.get("type")
            message_data = data.get("data", {})
            
            if message_type == "heartbeat":
                # 响应心跳
                await ws_manager.send_message(client_id, {
                    "type": "heartbeat_ack",
                    "data": {}
                })
            
            elif message_type == "status":
                # 记录状态反馈
                logger.info(f"收到状态反馈: {message_data}")
                # 可以在这里添加状态处理逻辑
            
            # --- STT 音频流处理（非流式，录完再识别） ---
            elif message_type == "audio_start":
                logger.info(f"开始语音识别会话: {client_id}")
                stt_session = stt_service.create_session()
                await ws_manager.send_message(client_id, {
                    "type": "status",
                    "data": {"status": "listening", "message": "开始语音识别"}
                })
                
            elif message_type == "audio_chunk":
                if stt_session:
                    chunk_data = message_data.get("chunk")
                    if chunk_data:
                        logger.info(f"收到音频数据: {len(chunk_data)} bytes (base64)")
                        result = stt_service.process_chunk(stt_session, chunk_data, is_final=False)
                        logger.info(f"STT 识别结果: {result}")
                        if result.get("text"):
                            await ws_manager.send_message(client_id, {
                                "type": "stt_result",
                                "data": result
                            })
                else:
                    logger.warning("收到 audio_chunk 但没有活动的 STT 会话")
            
            elif message_type == "audio_end":
                logger.info(f"结束语音识别会话: {client_id}")
                if stt_session:
                    # 处理最后的数据
                    result = stt_service.process_chunk(stt_session, "", is_final=True)
                    logger.info(f"STT 最终结果: {result}")
                    
                    await ws_manager.send_message(client_id, {
                        "type": "stt_result",
                        "data": result
                    })
                    stt_session = None
                else:
                    logger.warning("收到 audio_end 但没有活动的 STT 会话")
            
            # --- 流式 STT 语音通话处理（实时识别） ---
            elif message_type == "call_start":
                logger.info(f"开始语音通话: {client_id}")
                streaming_stt_session = streaming_stt_service.create_session()
                await ws_manager.send_message(client_id, {
                    "type": "call_status",
                    "data": {"status": "connected", "message": "语音通话已连接"}
                })
            
            elif message_type == "call_audio":
                if streaming_stt_session:
                    chunk_data = message_data.get("chunk")
                    is_first_chunk = message_data.get("is_first_chunk", False)
                    if chunk_data:
                        # 流式识别，实时返回结果
                        result = streaming_stt_service.process_chunk(
                            streaming_stt_session, 
                            chunk_data, 
                            is_final=False,
                            is_first_chunk=is_first_chunk  # 传递是否是第一个块
                        )
                        
                        # 获取 VAD 相关字段
                        should_send = result.get("should_send", False)
                        is_speaking = result.get("is_speaking", True)
                        
                        # 有识别结果或 VAD 信号时返回
                        if result.get("text") or should_send:
                            logger.debug(f"流式识别结果: {result.get('text', '')}, should_send: {should_send}")
                            await ws_manager.send_message(client_id, {
                                "type": "call_transcript",
                                "data": {
                                    "text": result.get("text", ""),
                                    "full_text": result.get("full_text", ""),
                                    "is_final": False,
                                    "should_send": should_send,  # VAD 检测到停止说话
                                    "is_speaking": is_speaking,  # 当前是否在说话
                                }
                            })
                            
                            # 如果触发了发送，标记文本已发送并清空，准备下一轮识别
                            if should_send:
                                streaming_stt_service.mark_as_sent(streaming_stt_session)
                                streaming_stt_service.clear_text(streaming_stt_session)
                        
                        # 如果有错误，也返回
                        if result.get("error"):
                            await ws_manager.send_message(client_id, {
                                "type": "call_error",
                                "data": {"error": result["error"]}
                            })
                else:
                    logger.warning("收到 call_audio 但没有活动的语音通话会话")
            
            elif message_type == "call_end":
                logger.info(f"结束语音通话: {client_id}")
                if streaming_stt_session:
                    # 处理剩余数据并获取最终结果
                    result = streaming_stt_service.process_chunk(
                        streaming_stt_session, 
                        "", 
                        is_final=True
                    )
                    
                    # 发送最终识别结果
                    await ws_manager.send_message(client_id, {
                        "type": "call_transcript",
                        "data": {
                            "text": result.get("text", ""),
                            "full_text": result.get("full_text", ""),
                            "is_final": True,
                            "should_send": result.get("should_send", False),  # 通话结束时也可能触发发送
                            "is_speaking": False,
                        }
                    })
                    
                    # 关闭会话
                    streaming_stt_service.close_session(streaming_stt_session)
                    streaming_stt_session = None
                    
                    await ws_manager.send_message(client_id, {
                        "type": "call_status",
                        "data": {"status": "disconnected", "message": "语音通话已结束"}
                    })
                else:
                    logger.warning("收到 call_end 但没有活动的语音通话会话")
            
            else:
                logger.warning(f"未知的消息类型: {message_type}")
    
    except WebSocketDisconnect:
        # 清理流式 STT 会话
        if streaming_stt_session:
            streaming_stt_service.close_session(streaming_stt_session)
        ws_manager.disconnect(client_id)
    except Exception as e:
        logger.error(f"WebSocket 错误: {str(e)}")
        # 清理流式 STT 会话
        if streaming_stt_session:
            streaming_stt_service.close_session(streaming_stt_session)
        ws_manager.disconnect(client_id)
