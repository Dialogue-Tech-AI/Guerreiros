"""Media processing service"""
import httpx
from services.openai_service import OpenAIService
from utils.logger import logger
from typing import Dict


class MediaProcessor:
    """Process media files (audio, image, video)"""
    
    def __init__(self, openai_service: OpenAIService, node_api_url: str, internal_api_key: str):
        self.openai_service = openai_service
        self.node_api_url = node_api_url
        self.internal_api_key = internal_api_key
    
    async def process_media_content(self, data: Dict) -> str:
        """
        Process media content and return formatted string with tags
        
        Args:
            data: Message data from queue
            
        Returns:
            Formatted content string with appropriate tags
        """
        media_type = data.get('mediaType', 'text')
        media_url = data.get('mediaUrl')
        content = data.get('content', '')
        
        try:
            if media_type == 'audio' and media_url:
                logger.info(f"Processing audio: {media_url}")
                transcription = await self.openai_service.transcribe_audio(media_url)
                
                # Save transcription to message metadata
                await self.save_message_metadata(
                    data['messageId'],
                    {"transcription": transcription}
                )
                
                return f"<audio>\n{transcription}\n</audio>"
            
            elif media_type == 'image' and media_url:
                logger.info(f"Processing image: {media_url}")
                description = await self.openai_service.describe_image(media_url)
                
                # Save description to message metadata
                await self.save_message_metadata(
                    data['messageId'],
                    {"description": description}
                )
                
                return f"<imagem>\n{description}\n</imagem>"
            
            elif media_type == 'video':
                # Videos are ignored as per requirements
                return f"<texto>\n[Cliente enviou um vídeo]\n</texto>"
            
            else:
                # Text message
                return f"<texto>\n{content}\n</texto>"
                
        except Exception as e:
            logger.error(f"Error processing media: {e}", exc_info=True)
            # Return original content on error
            return f"<texto>\n{content}\n</texto>"
    
    async def save_message_metadata(self, message_id: str, metadata: Dict):
        """
        Save metadata to message via internal API
        
        Args:
            message_id: Message UUID
            metadata: Metadata dict to save
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.patch(
                    f"{self.node_api_url}/api/internal/messages/{message_id}/metadata",
                    json={"metadata": metadata},
                    headers={"X-Internal-Auth": self.internal_api_key},
                    timeout=10.0
                )
                response.raise_for_status()
                logger.info(f"Metadata saved for message {message_id}")
        except Exception as e:
            logger.error(f"Error saving message metadata: {e}")
            # Don't raise - metadata save is not critical
