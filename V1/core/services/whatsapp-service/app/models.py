"""
Pydantic models for WhatsApp service
"""
from pydantic import BaseModel
from typing import Optional


class ConnectionRequest(BaseModel):
    """Request to connect WhatsApp"""
    number_id: str
    name: str


class ConnectionResponse(BaseModel):
    """Response from connection request"""
    number_id: str
    status: str
    qr_code: Optional[str] = None
    message: str


class MessageRequest(BaseModel):
    """Request to send a message"""
    number_id: str
    to: str
    message: str


class MessageResponse(BaseModel):
    """Response from send message request"""
    success: bool
    message_id: str
    to: str
    message: str


class StatusResponse(BaseModel):
    """Response for connection status"""
    number_id: str
    status: str
    connected: bool
    last_check: str


class WebhookMessage(BaseModel):
    """Message received from WhatsApp webhook"""
    from_number: str
    to_number: str
    message: str
    message_id: str
    timestamp: str
    message_type: Optional[str] = "text"
    media_url: Optional[str] = None
