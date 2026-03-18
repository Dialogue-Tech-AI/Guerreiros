"""Tests for Routing Service"""
import pytest
from unittest.mock import Mock, AsyncMock
from services.routing_service import RoutingService


@pytest.mark.asyncio
async def test_route_to_seller_new_client():
    """Test routing new client (no history)"""
    pg_client = Mock()
    node_api_url = "http://localhost:3000"
    internal_api_key = "test-key"
    
    # Mock: No existing history
    pg_client.fetchrow = AsyncMock(return_value=None)
    
    # Mock: Available sellers
    pg_client.pool = Mock()
    conn = Mock()
    pg_client.pool.acquire = AsyncMock(return_value=conn)
    pg_client.pool.release = AsyncMock()
    
    conn.transaction = Mock()
    conn.transaction.return_value.__aenter__ = AsyncMock()
    conn.transaction.return_value.__aexit__ = AsyncMock()
    
    conn.fetchrow = AsyncMock(return_value=None)  # No routing state
    conn.fetch = AsyncMock(return_value=[
        {
            "id": "seller-1",
            "user_id": "user-1",
            "supervisor_id": "supervisor-1",
            "name": "João Silva"
        }
    ])
    conn.execute = AsyncMock()
    
    service = RoutingService(pg_client, node_api_url, internal_api_key)
    
    # Mock HTTP call
    with patch('httpx.AsyncClient') as mock_client:
        mock_response = Mock()
        mock_response.raise_for_status = Mock()
        mock_client.return_value.__aenter__.return_value.post = AsyncMock(return_value=mock_response)
        
        result = await service.route_to_seller(
            client_phone="5521999999999",
            vehicle_brand="FORD",
            attendance_id="attendance-123"
        )
    
    assert result["seller_name"] == "João Silva"
    assert result["is_returning"] == False


@pytest.mark.asyncio
async def test_route_to_seller_returning_client():
    """Test routing returning client (has history)"""
    pg_client = Mock()
    node_api_url = "http://localhost:3000"
    internal_api_key = "test-key"
    
    # Mock: Existing history
    pg_client.fetchrow = AsyncMock(side_effect=[
        {
            "seller_id": "user-1",
            "supervisor_id": "supervisor-1"
        },
        {
            "name": "João Silva"
        }
    ])
    
    pg_client.execute = AsyncMock()
    
    service = RoutingService(pg_client, node_api_url, internal_api_key)
    
    # Mock HTTP call
    with patch('httpx.AsyncClient') as mock_client:
        mock_response = Mock()
        mock_response.raise_for_status = Mock()
        mock_client.return_value.__aenter__.return_value.post = AsyncMock(return_value=mock_response)
        
        result = await service.route_to_seller(
            client_phone="5521999999999",
            vehicle_brand="FORD",
            attendance_id="attendance-123"
        )
    
    assert result["seller_name"] == "João Silva"
    assert result["is_returning"] == True
