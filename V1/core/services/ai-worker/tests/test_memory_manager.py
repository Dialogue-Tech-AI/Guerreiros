"""Tests for Memory Manager"""
import pytest
from unittest.mock import Mock, AsyncMock, patch
from services.memory_manager import MemoryManager


@pytest.mark.asyncio
async def test_format_message_content_text():
    """Test formatting text message"""
    vector_db = Mock()
    pg_client = Mock()
    openai_service = Mock()
    
    manager = MemoryManager(vector_db, pg_client, openai_service)
    
    msg = {
        "content": "Olá, preciso de uma peça",
        "metadata": {}
    }
    
    result = manager.format_message_content(msg)
    assert result == "<texto>Olá, preciso de uma peça</texto>"


@pytest.mark.asyncio
async def test_format_message_content_audio():
    """Test formatting audio message with transcription"""
    vector_db = Mock()
    pg_client = Mock()
    openai_service = Mock()
    
    manager = MemoryManager(vector_db, pg_client, openai_service)
    
    msg = {
        "content": "[Áudio]",
        "metadata": {
            "transcription": "Olá, preciso de uma pastilha de freio"
        }
    }
    
    result = manager.format_message_content(msg)
    assert result == "<audio>Olá, preciso de uma pastilha de freio</audio>"


@pytest.mark.asyncio
async def test_format_message_content_image():
    """Test formatting image message with description"""
    vector_db = Mock()
    pg_client = Mock()
    openai_service = Mock()
    
    manager = MemoryManager(vector_db, pg_client, openai_service)
    
    msg = {
        "content": "[Imagem]",
        "metadata": {
            "description": "Imagem de uma pastilha de freio desgastada"
        }
    }
    
    result = manager.format_message_content(msg)
    assert result == "<imagem>Imagem de uma pastilha de freio desgastada</imagem>"


@pytest.mark.asyncio
async def test_get_recent_chat_history():
    """Test getting recent chat history"""
    vector_db = Mock()
    pg_client = Mock()
    openai_service = Mock()
    
    # Mock database response
    pg_client.fetch = AsyncMock(return_value=[
        {
            "origin": "CLIENT",
            "content": "Olá",
            "metadata": {},
            "sent_at": "2026-01-16T10:00:00"
        },
        {
            "origin": "AI",
            "content": "Olá! Como posso ajudar?",
            "metadata": {},
            "sent_at": "2026-01-16T10:00:05"
        }
    ])
    
    manager = MemoryManager(vector_db, pg_client, openai_service)
    
    history = await manager.get_recent_chat_history("attendance-id-123", limit=25)
    
    assert "Cliente: <texto>Olá</texto>" in history
    assert "Assistente: <texto>Olá! Como posso ajudar?</texto>" in history
