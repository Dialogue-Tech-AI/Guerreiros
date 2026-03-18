"""Qdrant Vector Database Service"""
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
from config.settings import settings
from utils.logger import logger
from typing import List, Dict, Optional


class VectorDBService:
    """Service for Qdrant Vector Database operations"""
    
    def __init__(self):
        self.client = QdrantClient(
            host=settings.qdrant_host,
            port=settings.qdrant_port
        )
        self.setup_collections()
    
    def setup_collections(self):
        """Create necessary collections if they don't exist"""
        try:
            collections = self.client.get_collections().collections
            collection_names = [c.name for c in collections]
            
            # Collection for attendance summaries
            if "attendance_summaries" not in collection_names:
                logger.info("Creating attendance_summaries collection")
                self.client.create_collection(
                    collection_name="attendance_summaries",
                    vectors_config=VectorParams(
                        size=1536,  # OpenAI text-embedding-3-small dimension
                        distance=Distance.COSINE
                    )
                )
            
            # Collection for key messages
            if "key_messages" not in collection_names:
                logger.info("Creating key_messages collection")
                self.client.create_collection(
                    collection_name="key_messages",
                    vectors_config=VectorParams(
                        size=1536,
                        distance=Distance.COSINE
                    )
                )
            
            logger.info("Qdrant collections setup complete")
            
        except Exception as e:
            logger.error(f"Error setting up Qdrant collections: {e}", exc_info=True)
            raise
    
    async def store_attendance_summary(
        self,
        attendance_id: str,
        summary_text: str,
        embedding: List[float],
        metadata: Dict
    ):
        """
        Store attendance summary with embedding
        
        Args:
            attendance_id: Attendance UUID
            summary_text: Summary text
            embedding: Embedding vector
            metadata: Additional metadata
        """
        try:
            self.client.upsert(
                collection_name="attendance_summaries",
                points=[
                    PointStruct(
                        id=attendance_id,
                        vector=embedding,
                        payload={
                            "attendance_id": attendance_id,
                            "text": summary_text,
                            "client_phone": metadata.get('client_phone'),
                            "vehicle_brand": metadata.get('vehicle_brand'),
                            "timestamp": metadata.get('timestamp')
                        }
                    )
                ]
            )
            logger.info(f"Stored summary for attendance {attendance_id}")
        except Exception as e:
            logger.error(f"Error storing attendance summary: {e}", exc_info=True)
            raise
    
    async def search_similar(
        self,
        collection: str,
        query_vector: List[float],
        limit: int = 5,
        filter_dict: Optional[Dict] = None
    ) -> List[Dict]:
        """
        Search for similar vectors
        
        Args:
            collection: Collection name
            query_vector: Query embedding vector
            limit: Number of results
            filter_dict: Optional filter conditions
            
        Returns:
            List of search results with id, score, and payload
        """
        try:
            results = self.client.search(
                collection_name=collection,
                query_vector=query_vector,
                limit=limit,
                query_filter=filter_dict
            )
            
            return [
                {
                    "id": str(hit.id),
                    "score": hit.score,
                    "payload": hit.payload
                }
                for hit in results
            ]
        except Exception as e:
            logger.error(f"Error searching vectors: {e}", exc_info=True)
            return []
    
    async def get_attendance_summary_by_id(self, attendance_id: str) -> Optional[Dict]:
        """
        Get attendance summary directly by ID (optimization - no embedding needed)
        
        Args:
            attendance_id: Attendance UUID (string)
            
        Returns:
            Summary dict with payload or None if not found
        """
        try:
            # Retrieve point directly by ID (Qdrant accepts string UUIDs)
            # Convert to string to ensure compatibility
            point_id = str(attendance_id)
            result = self.client.retrieve(
                collection_name="attendance_summaries",
                ids=[point_id]
            )
            
            if result and len(result) > 0:
                point = result[0]
                if point.payload:
                    return {
                        "id": str(point.id),
                        "payload": point.payload
                    }
            return None
        except Exception as e:
            # If point doesn't exist, retrieve returns empty list (not an error)
            logger.debug(f"Summary not found for attendance {attendance_id}: {e}")
            return None
    
    async def delete_attendance_summary(self, attendance_id: str):
        """Delete attendance summary"""
        try:
            self.client.delete(
                collection_name="attendance_summaries",
                points_selector=[attendance_id]
            )
            logger.info(f"Deleted summary for attendance {attendance_id}")
        except Exception as e:
            logger.error(f"Error deleting attendance summary: {e}")
