"""
WhatsApp Unofficial API Service
FastAPI service that manages WhatsApp connections and messages
"""
import os
from pathlib import Path

# Carregar whatsapp-service.local.env / whatsapp-service.prod.env (separado por serviço)
_project_root = Path(__file__).resolve().parent.parent.parent.parent.parent
_local_env = _project_root / "config" / "local" / "credentials" / ".env" / "whatsapp-service.local.env"
_server_env = _project_root / "config" / "server" / "credentials" / "env" / "whatsapp-service.prod.env"
if os.getenv("ENV", "").lower() == "production" and _server_env.exists():
    from dotenv import load_dotenv
    load_dotenv(_server_env)
elif _local_env.exists():
    from dotenv import load_dotenv
    load_dotenv(_local_env)
import json
import asyncio
from typing import Dict, Optional, List
from datetime import datetime

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import httpx

from app.whatsapp_client import WhatsAppClient
from app.models import (
    ConnectionRequest,
    ConnectionResponse,
    MessageRequest,
    MessageResponse,
    StatusResponse,
    WebhookMessage,
)

# Initialize FastAPI app
app = FastAPI(
    title="WhatsApp Unofficial API Service",
    description="Service for managing WhatsApp connections and messages",
    version="1.0.0",
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure properly in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Store active connections
active_connections: Dict[str, WhatsAppClient] = {}

# Webhook URL for forwarding messages to Node.js backend
BACKEND_WEBHOOK_URL = os.getenv("BACKEND_WEBHOOK_URL", "http://localhost:3000/api/whatsapp/webhook")


class HealthResponse(BaseModel):
    status: str
    timestamp: str


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return HealthResponse(
        status="ok",
        timestamp=datetime.now().isoformat()
    )


@app.post("/connect", response_model=ConnectionResponse)
async def connect_whatsapp(request: ConnectionRequest):
    """
    Connect to WhatsApp using unofficial API
    
    This will:
    1. Initialize WhatsApp client
    2. Generate QR code if needed
    3. Wait for connection
    4. Return connection status
    """
    try:
        # Create WhatsApp client
        client = WhatsAppClient(
            number_id=request.number_id,
            name=request.name,
            backend_webhook_url=BACKEND_WEBHOOK_URL
        )
        
        # Start connection process
        await client.connect()
        
        # Store connection
        active_connections[request.number_id] = client
        
        # Get connection status and QR code
        qr_code = client.get_qr_code()
        status = client.get_status()
        
        # If there's a QR code, status must be "connecting" (not "connected")
        # Only return "connected" if there's no QR code
        if qr_code:
            status = "connecting"
        
        return ConnectionResponse(
            number_id=request.number_id,
            status=status,
            qr_code=qr_code,
            message="Connection initiated. Scan QR code if provided." if qr_code else "Connection established."
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/disconnect/{number_id}")
async def disconnect_whatsapp(number_id: str):
    """Disconnect WhatsApp connection"""
    try:
        if number_id not in active_connections:
            raise HTTPException(status_code=404, detail="Connection not found")
        
        client = active_connections[number_id]
        await client.disconnect()
        
        # Remove from active connections
        del active_connections[number_id]
        
        return {"status": "disconnected", "number_id": number_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/status/{number_id}", response_model=StatusResponse)
async def get_connection_status(number_id: str):
    """Get connection status for a WhatsApp number"""
    try:
        if number_id not in active_connections:
            return StatusResponse(
                number_id=number_id,
                status="disconnected",
                connected=False,
                last_check=datetime.now().isoformat()
            )
        
        client = active_connections[number_id]
        status = client.get_status()
        qr_code = client.get_qr_code()
        
        # If there's a QR code, the connection is not complete yet
        # Only return connected=True if there's no QR code (already connected)
        connected = client.is_connected() and not qr_code
        
        return StatusResponse(
            number_id=number_id,
            status=status,
            connected=connected,
            last_check=datetime.now().isoformat()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/send-message", response_model=MessageResponse)
async def send_message(request: MessageRequest):
    """Send a message via WhatsApp"""
    try:
        if request.number_id not in active_connections:
            raise HTTPException(status_code=404, detail="Connection not found")
        
        client = active_connections[request.number_id]
        
        if not client.is_connected():
            raise HTTPException(status_code=400, detail="WhatsApp is not connected")
        
        # Send message
        message_id = await client.send_message(
            to=request.to,
            message=request.message
        )
        
        return MessageResponse(
            success=True,
            message_id=message_id,
            to=request.to,
            message=request.message
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/connections")
async def list_connections():
    """List all active connections"""
    connections = []
    for number_id, client in active_connections.items():
        connections.append({
            "number_id": number_id,
            "status": client.get_status(),
            "connected": client.is_connected(),
        })
    return {"connections": connections}


@app.post("/webhook/receive")
async def receive_webhook(message: WebhookMessage):
    """
    Webhook endpoint for receiving messages from WhatsApp
    
    This will forward messages to the Node.js backend
    """
    try:
        # Forward to Node.js backend
        async with httpx.AsyncClient() as http_client:
            response = await http_client.post(
                BACKEND_WEBHOOK_URL,
                json=message.dict(),
                timeout=10.0
            )
            response.raise_for_status()
        
        return {"status": "received", "forwarded": True}
    except Exception as e:
        # Log error but don't fail (to avoid WhatsApp retries)
        print(f"Error forwarding webhook: {e}")
        return {"status": "received", "forwarded": False, "error": str(e)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)
