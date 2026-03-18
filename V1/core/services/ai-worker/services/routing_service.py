"""Routing Service - Round-robin seller assignment"""
import httpx
from utils.postgres_client import PostgresClient
from utils.logger import logger
from typing import Dict, Optional


class RoutingService:
    """
    Manages seller routing with round-robin algorithm
    Ensures returning clients get same seller for same brand
    """
    
    def __init__(self, pg_client: PostgresClient, node_api_url: str, internal_api_key: str):
        self.pg_client = pg_client
        self.node_api_url = node_api_url
        self.internal_api_key = internal_api_key
    
    async def route_to_seller(
        self,
        client_phone: str,
        vehicle_brand: str,
        attendance_id: str
    ) -> Dict:
        """
        Route client to seller using round-robin
        If client has history with this brand, return same seller
        
        Args:
            client_phone: Client phone number
            vehicle_brand: Vehicle brand (FORD, GM, VW, FIAT, IMPORTADOS)
            attendance_id: Current attendance UUID
            
        Returns:
            Dict with seller_id, supervisor_id, seller_name, is_returning
        """
        try:
            logger.info(f"Routing client {client_phone} for brand {vehicle_brand}")
            
            # 1. Check if client has history with this brand
            existing = await self.pg_client.fetchrow("""
                SELECT seller_id, supervisor_id
                FROM client_seller_history
                WHERE client_phone = $1 AND vehicle_brand = $2
            """, client_phone, vehicle_brand)
            
            if existing and existing['seller_id']:
                seller = await self.pg_client.fetchrow("""
                    SELECT s.id, s.supervisor_id, u.name
                    FROM sellers s
                    JOIN users u ON s.id = u.id
                    WHERE s.id = $1
                      AND s.brands @> $2::jsonb
                      AND u.active = true
                      AND u.role = 'SELLER'
                      AND (s.unavailable_until IS NULL OR s.unavailable_until <= NOW())
                """, existing['seller_id'], f'["{vehicle_brand}"]')

                if seller:
                    logger.info(f"Returning client - using previous seller {existing['seller_id']}")

                    # Update last_routed_at and increment counter
                    await self.pg_client.execute("""
                        UPDATE client_seller_history
                        SET last_routed_at = NOW(),
                            total_attendances = total_attendances + 1
                        WHERE client_phone = $1 AND vehicle_brand = $2
                    """, client_phone, vehicle_brand)

                    # Update attendance via API (convert UUIDs to strings for JSON)
                    await self.update_attendance_routing(
                        attendance_id=str(attendance_id),
                        seller_id=str(seller['id']),
                        supervisor_id=str(seller['supervisor_id']) if seller['supervisor_id'] else None,
                        vehicle_brand=vehicle_brand
                    )

                    return {
                        "seller_id": seller['id'],
                        "supervisor_id": seller['supervisor_id'],
                        "seller_name": seller['name'] if seller else 'N/A',
                        "is_returning": True
                    }

                logger.info(
                    f"Returning seller {existing['seller_id']} unavailable/inactive for {vehicle_brand}; using round-robin"
                )
            
            # 2. New client - use round-robin
            logger.info(f"New client for brand {vehicle_brand} - using round-robin")
            
            # Use transaction for atomic round-robin
            conn = await self.pg_client.pool.acquire()
            try:
                async with conn.transaction():
                    # Get current routing state
                    routing_state = await conn.fetchrow("""
                        SELECT last_assigned_seller_id, assignment_counter
                        FROM seller_routing_state
                        WHERE vehicle_brand = $1
                        FOR UPDATE
                    """, vehicle_brand)
                    
                    # Get all active sellers for this brand
                    # Note: sellers.id IS the user_id (foreign key to users.id)
                    # For JSONB arrays, use @> operator or jsonb_array_elements_text
                    sellers = await conn.fetch("""
                        SELECT s.id, s.supervisor_id, u.name
                        FROM sellers s
                        JOIN users u ON s.id = u.id
                        WHERE s.brands @> $1::jsonb
                          AND u.active = true
                          AND u.role = 'SELLER'
                          AND (s.unavailable_until IS NULL OR s.unavailable_until <= NOW())
                        ORDER BY s.round_robin_order, s.id
                    """, f'["{vehicle_brand}"]')
                    
                    if not sellers:
                        raise Exception(f"Nenhum vendedor disponível para a marca {vehicle_brand}")
                    
                    # Determine next seller (round-robin)
                    if routing_state is None:
                        # First routing for this brand
                        next_seller = sellers[0]
                        counter = 0
                    else:
                        # Find index of last assigned seller
                        last_index = -1
                        for i, s in enumerate(sellers):
                            if s['id'] == routing_state['last_assigned_seller_id']:
                                last_index = i
                                break
                        
                        next_index = (last_index + 1) % len(sellers)
                        next_seller = sellers[next_index]
                        counter = routing_state['assignment_counter'] + 1
                    
                    logger.info(f"Selected seller {next_seller['id']} ({next_seller['name']}) - counter: {counter}")
                    
                    # Update routing state
                    await conn.execute("""
                        INSERT INTO seller_routing_state (vehicle_brand, last_assigned_seller_id, assignment_counter)
                        VALUES ($1, $2, $3)
                        ON CONFLICT (vehicle_brand) 
                        DO UPDATE SET 
                            last_assigned_seller_id = $2,
                            assignment_counter = $3,
                            updated_at = NOW()
                    """, vehicle_brand, next_seller['id'], counter)
                    
                    # Create client-seller history
                    await conn.execute("""
                        INSERT INTO client_seller_history 
                        (client_phone, vehicle_brand, seller_id, supervisor_id, first_routed_at, last_routed_at, total_attendances)
                        VALUES ($1, $2, $3, $4, NOW(), NOW(), 1)
                    """, client_phone, vehicle_brand, next_seller['id'], next_seller['supervisor_id'])
                    
                    result = {
                        "seller_id": next_seller['id'],
                        "supervisor_id": next_seller['supervisor_id'],
                        "seller_name": next_seller['name'],
                        "is_returning": False
                    }
                    
            finally:
                await self.pg_client.pool.release(conn)
            
            # Update attendance via API (convert UUIDs to strings for JSON)
            await self.update_attendance_routing(
                attendance_id=str(attendance_id),
                seller_id=str(result['seller_id']),
                supervisor_id=str(result['supervisor_id']) if result['supervisor_id'] else None,
                vehicle_brand=vehicle_brand
            )
            
            return result
            
        except Exception as e:
            logger.error(f"Error routing to seller: {e}", exc_info=True)
            raise
    
    async def update_attendance_routing(
        self,
        attendance_id: str,
        seller_id: str,
        supervisor_id: str,
        vehicle_brand: str
    ):
        """
        Update attendance routing via Node.js internal API
        
        Args:
            attendance_id: Attendance UUID
            seller_id: Seller user UUID
            supervisor_id: Supervisor user UUID
            vehicle_brand: Vehicle brand
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.node_api_url}/api/internal/attendances/{attendance_id}/route",
                    json={
                        "sellerId": seller_id,
                        "supervisorId": supervisor_id,
                        "handledBy": "AI",  # Mantém como AI para continuar processando mensagens
                        "vehicleBrand": vehicle_brand
                    },
                    headers={"X-Internal-Auth": self.internal_api_key},
                    timeout=10.0
                )
                response.raise_for_status()
                logger.info(f"Attendance {attendance_id} routing updated via API")
        except Exception as e:
            logger.error(f"Error updating attendance routing: {e}", exc_info=True)
            # Don't raise - routing was saved in DB, API update is secondary
