"""
WhatsApp Client wrapper
Manages WhatsApp connection and message sending/receiving
"""
import os
import asyncio
import json
from typing import Optional, Dict, Callable
from datetime import datetime
import httpx
import qrcode
import io
import base64

# For now, we'll create a mock implementation
# This should be replaced with actual WhatsApp library integration


class WhatsAppClient:
    """Client for managing WhatsApp connections"""
    
    def __init__(
        self,
        number_id: str,
        name: str,
        backend_webhook_url: str
    ):
        self.number_id = number_id
        self.name = name
        self.backend_webhook_url = backend_webhook_url
        self.status = "disconnected"
        self.connected = False
        self.qr_code: Optional[str] = None
        self.whatsapp_number: Optional[str] = None  # Real WhatsApp number (will be set when connected)
        self._connection_task: Optional[asyncio.Task] = None
        
    async def connect(self):
        """Start connection process"""
        self.status = "connecting"
        self.connected = False
        
        # TODO: Implement actual WhatsApp connection
        # For now, this is a mock implementation
        
        # In a real implementation, you would:
        # 1. Initialize WhatsApp Web session
        # 2. Generate QR code if needed
        # 3. Wait for QR scan
        # 4. Establish connection
        # 5. Register webhook for incoming messages
        
        # Mock: Generate a QR code (this would be the actual WhatsApp QR)
        self._generate_mock_qr_code()
        
        # IMPORTANT: Don't set as connected immediately
        # Only set as connected when QR code is actually scanned
        # For now, we remain in "connecting" status until webhook confirms connection
        # This will be updated when the QR code is scanned (via webhook)
        
        # In a real implementation, we would:
        # 1. Wait for QR code scan event
        # 2. When scanned, get the actual WhatsApp number
        # 3. Call backend webhook to update number in database
        # 4. Then set status to "connected"
    
    def on_connected(self, whatsapp_number: str):
        """Called when QR code is scanned and WhatsApp is connected"""
        self.status = "connected"
        self.connected = True
        self.whatsapp_number = whatsapp_number
        
        # Notify backend about connection
        # This should be called by the actual WhatsApp library when connection is established
        asyncio.create_task(self._notify_backend_connection())
    
    async def _notify_backend_connection(self):
        """Notify backend when connection is confirmed"""
        try:
            connection_url = f"{self.backend_webhook_url.replace('/webhook', '/connection-confirmed')}"
            
            async with httpx.AsyncClient() as client:
                await client.post(
                    connection_url,
                    json={
                        "number_id": self.number_id,
                        "whatsapp_number": self.whatsapp_number if self.whatsapp_number else "+5511999999999",  # Mock number for now
                        "connected": True,
                    },
                    timeout=10.0
                )
        except Exception as e:
            print(f"Error notifying backend of connection: {e}")
    
    async def disconnect(self):
        """Disconnect WhatsApp"""
        self.status = "disconnecting"
        
        # Cancel message listener
        if self._connection_task:
            self._connection_task.cancel()
            try:
                await self._connection_task
            except asyncio.CancelledError:
                pass
        
        # TODO: Close WhatsApp session
        
        self.status = "disconnected"
        self.connected = False
        self.qr_code = None
    
    def is_connected(self) -> bool:
        """Check if connected"""
        return self.connected
    
    def get_status(self) -> str:
        """Get connection status"""
        return self.status
    
    def get_qr_code(self) -> Optional[str]:
        """Get QR code for connection"""
        return self.qr_code
    
    async def send_message(self, to: str, message: str) -> str:
        """Send a message via WhatsApp"""
        if not self.connected:
            raise Exception("WhatsApp is not connected")
        
        # TODO: Implement actual message sending
        # For now, this is a mock
        
        # In a real implementation, you would:
        # 1. Validate phone number format
        # 2. Send message via WhatsApp library/API
        # 3. Return message ID
        
        message_id = f"msg_{datetime.now().timestamp()}"
        
        # Mock: simulate message sending
        print(f"[{self.number_id}] Sending message to {to}: {message}")
        
        return message_id
    
    async def _message_listener(self):
        """Listen for incoming messages"""
        # TODO: Implement actual message listening
        # This would register a webhook or poll for messages
        
        # In a real implementation, you would:
        # 1. Set up webhook for incoming messages
        # 2. Or poll for new messages periodically
        # 3. Forward messages to backend webhook
        
        while self.connected:
            try:
                # Poll for messages or wait for webhook
                await asyncio.sleep(5)
                
                # Mock: In production, this would receive actual messages
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"Error in message listener: {e}")
                await asyncio.sleep(5)
    
    def _generate_mock_qr_code(self):
        """Generate a mock QR code for demonstration"""
        # In production, this would be the actual WhatsApp Web QR code
        # For now, we generate a high-quality QR code that can be scanned
        # The QR code format should be similar to WhatsApp Web's format
        # WhatsApp Web QR codes typically contain authentication tokens
        
        # Generate a more realistic QR code data format
        # Format: A long string that represents authentication data
        import secrets
        auth_token = secrets.token_urlsafe(32)
        qr_data = f"2,{auth_token},{self.number_id}"
        
        # Create QR code with high quality settings optimized for scanning
        # WhatsApp QR codes need:
        # - High error correction (L level is fine for short data)
        # - Large box_size for better visibility on screens
        # - Large border (quiet zone) for proper scanning
        qr = qrcode.QRCode(
            version=None,  # Auto-determine version based on data
            error_correction=qrcode.constants.ERROR_CORRECT_L,  # ~7% error correction
            box_size=15,  # Increased for better visibility and scanning
            border=10,  # Large quiet zone (4x box_size is recommended minimum)
        )
        qr.add_data(qr_data)
        qr.make(fit=True)
        
        # Create image with maximum contrast (pure black on pure white)
        # No anti-aliasing to ensure crisp edges
        from PIL import Image
        
        img = qr.make_image(
            fill_color="black",  # Pure black (#000000)
            back_color="white"   # Pure white (#FFFFFF)
        )
        
        # Ensure image is high resolution for better scanning
        # Scale up 2x for better quality on high-DPI displays
        # Use LANCZOS resampling for best quality
        img = img.resize((img.size[0] * 2, img.size[1] * 2), Image.Resampling.LANCZOS)
        
        # Convert to base64 with high quality
        buffer = io.BytesIO()
        # Save as PNG with no compression for maximum quality
        img.save(buffer, format="PNG", optimize=False, compress_level=0)
        img_str = base64.b64encode(buffer.getvalue()).decode()
        
        self.qr_code = f"data:image/png;base64,{img_str}"
