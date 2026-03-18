"""OpenAI Service for Whisper, Vision, and Chat"""
import httpx
from openai import AsyncOpenAI
from config.settings import settings
from utils.logger import logger
from typing import List, Dict, Optional


class OpenAIService:
    """Service for all OpenAI API interactions"""
    
    def __init__(self, agent_config_service=None):
        # Validar API key
        api_key = settings.openai_api_key
        if not api_key or api_key.strip() == '':
            error_msg = "❌ OPENAI_API_KEY não configurada! Configure no arquivo .env ou variável de ambiente"
            logger.error(error_msg)
            raise ValueError("OPENAI_API_KEY is required but not set in environment variables")
        
        # Validar formato básico da API key (deve começar com sk-)
        if not api_key.startswith('sk-'):
            logger.warning(f"⚠️  OPENAI_API_KEY não parece ser válida (deve começar com 'sk-')")
        
        self.client = AsyncOpenAI(api_key=api_key)
        self.model = settings.openai_model
        self.node_api_url = settings.node_api_url
        self.internal_api_key = settings.internal_api_key
        self.agent_config_service = agent_config_service  # Para carregar prompt de imagem do banco
        
        logger.info(f"✅ OpenAI Service initialized with model: {self.model}")
        logger.debug(f"API Key configured: {api_key[:7]}...{api_key[-4:] if len(api_key) > 11 else '***'}")
    
    async def transcribe_audio(self, audio_url: str, message_id: str = None) -> str:
        """
        Download audio from MinIO and transcribe with Whisper
        
        Args:
            audio_url: URL or storage path to audio file in MinIO
            message_id: Optional message UUID for getting signed URL
            
        Returns:
            Transcribed text (will be sent to LLM for processing)
        """
        try:
            logger.info(f"🎤 Transcribing audio from {audio_url[:80]}...")
            
            # Converter caminho relativo para URL completa se necessário
            full_audio_url = await self._get_media_url(audio_url, message_id)
            logger.debug(f"Full audio URL: {full_audio_url[:100]}...")
            
            # Download audio file
            async with httpx.AsyncClient() as client:
                response = await client.get(full_audio_url, timeout=60.0)  # Aumentado timeout para áudios maiores
                response.raise_for_status()
                audio_data = response.content
            
            logger.info(f"Audio downloaded: {len(audio_data)} bytes")
            
            # Create a temporary file-like object
            import io
            audio_file = io.BytesIO(audio_data)
            audio_file.name = "audio.webm"  # Whisper needs a filename
            
            # Transcribe with Whisper
            # IMPORTANTE: Não especificar language para permitir detecção automática
            # Isso permite que a IA transcreva em qualquer idioma que o cliente falar
            transcript = await self.client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                language=None  # Auto-detect language for better accuracy
            )
            
            transcription_text = transcript.text.strip()
            
            # Validar que a transcrição não está vazia
            if not transcription_text or len(transcription_text) == 0:
                logger.warning("⚠️  Whisper returned empty transcription")
                return "[Áudio recebido mas não foi possível transcrever - áudio pode estar vazio ou sem áudio]"
            
            logger.info(f"✅ Audio transcribed successfully (length: {len(transcription_text)} chars)")
            logger.info(f"📝 Transcription preview: {transcription_text[:150]}...")
            
            # A transcrição será enviada para a LLM processar como texto normal
            return transcription_text
            
        except Exception as e:
            logger.error(f"❌ Error transcribing audio: {e}", exc_info=True)
            # Retornar mensagem de erro mais descritiva
            error_msg = str(e)
            if "401" in error_msg or "API key" in error_msg:
                return "[Erro: API key da OpenAI não configurada ou inválida]"
            elif "timeout" in error_msg.lower():
                return "[Erro: Timeout ao processar áudio - áudio pode ser muito longo]"
            else:
                return f"[Erro ao transcrever áudio: {error_msg[:100]}]"
    
    async def _get_media_url(self, storage_path: str, message_id: str = None) -> str:
        """
        Get full MinIO URL from storage path via Node.js API
        
        Args:
            storage_path: Storage path in MinIO (relative) or full URL
            message_id: Optional message UUID from queue data
            
        Returns:
            Full URL with pre-signed access
        """
        try:
            # Se já é uma URL completa (http/https), retorna direto
            if storage_path.startswith('http://') or storage_path.startswith('https://'):
                logger.debug(f"✅ Media URL já é completa: {storage_path[:100]}...")
                return storage_path
            
            logger.info(f"🔄 Convertendo caminho relativo para URL completa: {storage_path[:80]}...")
            
            # Se temos messageId do queue, usar diretamente
            if message_id:
                logger.debug(f"Usando messageId da fila: {message_id}")
            else:
                # Tentar extrair messageId do caminho
                # Formato: whatsappNumberId/messageId/image/filename.jpg
                parts = storage_path.split('/')
                if len(parts) >= 2:
                    # Tentar encontrar UUID no caminho (geralmente segunda posição)
                    for i, part in enumerate(parts):
                        # UUIDs têm formato: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (36 chars)
                        if len(part) == 36 and part.count('-') == 4:
                            if i > 0:  # Não é o primeiro (whatsappNumberId)
                                message_id = part
                                logger.debug(f"MessageId extraído do caminho: {message_id}")
                                break
            
            # Buscar URL assinada do MinIO via API do backend
            if message_id:
                async with httpx.AsyncClient() as client:
                    # Usar endpoint INTERNO da API para obter URL assinada
                    url = f"{self.node_api_url}/api/internal/messages/{message_id}/media-url"
                    headers = {}
                    if self.internal_api_key:
                        headers["X-Internal-Auth"] = self.internal_api_key
                    
                    logger.debug(f"📡 Buscando URL assinada via API interna: {url}")
                    try:
                        response = await client.get(url, headers=headers, timeout=10.0)
                        
                        if response.status_code == 200:
                            data = response.json()
                            if data.get('success') and data.get('data', {}).get('url'):
                                signed_url = data['data']['url']
                                logger.info(f"✅ URL assinada obtida via API interna")
                                return signed_url
                        else:
                            logger.warning(f"⚠️  API interna retornou status {response.status_code}")
                            logger.debug(f"Response: {response.text[:200]}")
                    except httpx.RequestError as req_error:
                        logger.warning(f"⚠️  Erro ao chamar API interna: {req_error}")
            
            # Fallback: tentar construir URL do MinIO diretamente
            # NOTA: Isso pode não funcionar se MinIO requer autenticação
            logger.warning(f"⚠️  Tentando construir URL do MinIO diretamente (fallback)")
            minio_url = os.getenv('MINIO_URL', 'http://localhost:9000')
            bucket = os.getenv('MINIO_BUCKET_MEDIA', 'media')
            fallback_url = f"{minio_url}/{bucket}/{storage_path}"
            logger.debug(f"URL fallback: {fallback_url[:100]}...")
            return fallback_url
                
        except Exception as e:
            logger.error(f"❌ Error getting media URL: {e}", exc_info=True)
            # Fallback: tentar usar o caminho como está (pode não funcionar)
            logger.warning(f"⚠️  Usando caminho original como fallback: {storage_path}")
            return storage_path
    
    async def describe_image(self, image_url: str, message_id: str = None) -> str:
        """
        Analyze image with GPT-4o Vision including OCR (text extraction)
        
        Args:
            image_url: URL or storage path to image file in MinIO
            message_id: Optional message UUID for getting signed URL
            
        Returns:
            Image description with extracted text
        """
        try:
            logger.info(f"🖼️  Describing image from {image_url[:80]}...")
            
            # Converter caminho relativo para URL completa se necessário
            full_image_url = await self._get_media_url(image_url, message_id)
            logger.debug(f"Full image URL obtida: {full_image_url[:100]}...")
            
            # IMPORTANTE: OpenAI Vision API requer URL pública acessível OU base64
            # URLs do MinIO localhost não são acessíveis pela OpenAI
            # SEMPRE converter para base64 para garantir que funcione
            use_base64 = True
            
            # Verificar se é URL válida
            if full_image_url.startswith('http://') or full_image_url.startswith('https://'):
                # Verificar se é URL localhost (não acessível pela OpenAI)
                if 'localhost' in full_image_url or '127.0.0.1' in full_image_url:
                    logger.info("🔄 URL é localhost - convertendo para base64 (OpenAI não acessa localhost)")
                    use_base64 = True
                else:
                    # URL pública - tentar usar diretamente primeiro
                    # Se falhar, converter para base64
                    try:
                        async with httpx.AsyncClient() as client:
                            # Fazer HEAD request rápido para verificar se URL é acessível
                            head_response = await client.head(full_image_url, timeout=3.0, follow_redirects=True)
                            if head_response.status_code == 200:
                                logger.debug("✅ URL da imagem é acessível publicamente")
                                use_base64 = False  # Tentar usar URL diretamente
                            else:
                                logger.warning(f"⚠️  URL retornou status {head_response.status_code}, usando base64")
                                use_base64 = True
                    except Exception as url_check_error:
                        logger.warning(f"⚠️  URL não acessível ({url_check_error}), convertendo para base64")
                        use_base64 = True
            elif full_image_url.startswith('data:'):
                # Já está em base64
                logger.debug("✅ Imagem já está em formato base64")
                use_base64 = False
            else:
                # Não é URL válida, precisa baixar e converter
                use_base64 = True
            
            # Se precisar usar base64, baixar a imagem
            if use_base64 and not full_image_url.startswith('data:'):
                logger.info("📥 Baixando imagem para converter em base64...")
                try:
                    async with httpx.AsyncClient() as client:
                        # Tentar baixar da URL completa primeiro
                        download_url = full_image_url if (full_image_url.startswith('http://') or full_image_url.startswith('https://')) else image_url
                        response = await client.get(download_url, timeout=30.0, follow_redirects=True)
                        response.raise_for_status()
                        
                        import base64
                        image_data = response.content
                        logger.info(f"✅ Imagem baixada: {len(image_data)} bytes")
                        
                        base64_image = base64.b64encode(image_data).decode('utf-8')
                        
                        # Detectar MIME type do conteúdo ou extensão
                        mime_type = 'image/jpeg'  # padrão
                        content_type = response.headers.get('content-type', '')
                        if 'image/png' in content_type or image_url.endswith('.png'):
                            mime_type = 'image/png'
                        elif 'image/gif' in content_type or image_url.endswith('.gif'):
                            mime_type = 'image/gif'
                        elif 'image/webp' in content_type or image_url.endswith('.webp'):
                            mime_type = 'image/webp'
                        elif 'image/jpeg' in content_type or image_url.endswith(('.jpg', '.jpeg')):
                            mime_type = 'image/jpeg'
                        
                        full_image_url = f"data:{mime_type};base64,{base64_image}"
                        logger.info(f"✅ Imagem convertida para base64 ({mime_type}, {len(base64_image)} chars)")
                except Exception as download_error:
                    logger.error(f"❌ Erro ao baixar imagem: {download_error}")
                    return "[Erro ao baixar imagem para análise]"
            
            # Validar que temos uma URL válida (http/https ou data:)
            if not (full_image_url.startswith('http://') or 
                    full_image_url.startswith('https://') or 
                    full_image_url.startswith('data:')):
                logger.error(f"❌ URL da imagem inválida: {full_image_url[:100]}...")
                return "[Erro: URL da imagem inválida]"
            
            logger.info(f"🔍 Enviando imagem para GPT-4o Vision (tipo: {'base64' if full_image_url.startswith('data:') else 'URL'})")
            
            # Usar APENAS o prompt configurado no Super Admin (sem fallback hardcoded)
            if not self.agent_config_service:
                logger.error("❌ agent_config_service não definido - não é possível obter prompt de imagem")
                return "[Erro: Serviço de configuração não disponível. Configure o prompt de descrição de imagem no Super Admin.]"
            
            # Carregar prompt do banco - SEM fallback hardcoded
            image_prompt = await self.agent_config_service.get_image_description_prompt()
            preview = (image_prompt[:80] + "...") if len(image_prompt) > 80 else image_prompt
            logger.info(
                f"✅ Image description prompt loaded from database (len={len(image_prompt)})",
                extra={"prompt_preview": preview},
            )
            
            # Use GPT-4o (não mini) para análise de imagens - melhor qualidade
            # IMPORTANTE: max_tokens aumentado para permitir descrições mais detalhadas
            try:
                response = await self.client.chat.completions.create(
                    model="gpt-4o",  # Usar gpt-4o em vez de gpt-4o-mini para melhor análise
                    messages=[
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "text",
                                    "text": image_prompt
                                },
                                {
                                    "type": "image_url",
                                    "image_url": {"url": full_image_url}
                                }
                            ]
                        }
                    ],
                    max_tokens=800,  # Aumentado para descrições mais completas
                    temperature=0.3  # Menor temperatura para respostas mais precisas
                )
            except Exception as api_error:
                error_str = str(api_error)
                # Se erro 401, pode ser API key OU URL não acessível
                if "401" in error_str:
                    logger.error("❌ Erro 401 da OpenAI - pode ser:")
                    logger.error("   1. API key inválida ou não configurada")
                    logger.error("   2. URL da imagem não é acessível publicamente")
                    logger.error(f"   URL usada: {full_image_url[:100]}...")
                    # Tentar novamente com base64 se ainda não estiver usando
                    if not full_image_url.startswith('data:'):
                        logger.info("🔄 Tentando novamente com base64...")
                        # Já tentamos base64 acima, então o erro é realmente da API key
                        raise api_error
                raise api_error
            
            description = response.choices[0].message.content
            logger.info(f"✅ Image described successfully (length: {len(description)} chars)")
            logger.info(f"📝 Image description (full): {description}")
            
            # Verificar se a resposta é uma recusa
            if description and ("não posso" in description.lower() or 
                               "não consigo" in description.lower() or 
                               "não tenho" in description.lower() or
                               "desculpe" in description.lower() and "analisar" in description.lower()):
                logger.warning(f"⚠️  GPT-4o Vision retornou uma recusa. Tentando com prompt mais direto...")
                # Tentar novamente com prompt mais direto
                try:
                    response2 = await self.client.chat.completions.create(
                        model="gpt-4o",  # Usar mesmo modelo
                        messages=[
                            {
                                "role": "user",
                                "content": [
                                    {
                                        "type": "text",
                                        "text": "Descreva esta imagem em detalhes. O que você vê? Inclua todos os textos, números e elementos visíveis."
                                    },
                                    {
                                        "type": "image_url",
                                        "image_url": {"url": full_image_url}
                                    }
                                ]
                            }
                        ],
                        max_tokens=800,
                        temperature=0.1
                    )
                    description = response2.choices[0].message.content
                    logger.info(f"✅ Retry successful - New description: {description[:200]}...")
                except Exception as retry_error:
                    logger.error(f"❌ Retry failed: {retry_error}")
            
            return description
            
        except Exception as e:
            error_str = str(e)
            logger.error(f"❌ Error describing image: {error_str}", exc_info=True)
            
            # Log mais detalhado do erro
            if "401" in error_str or "API key" in error_str or "invalid_request_error" in error_str:
                logger.error("❌ OPENAI_API_KEY não configurada ou inválida!")
                logger.error("💡 Verifique:")
                logger.error("   1. Arquivo .env na raiz do projeto ai-worker")
                logger.error("   2. Variável OPENAI_API_KEY está definida")
                logger.error("   3. API key é válida (deve começar com 'sk-')")
                logger.error("   4. API key tem permissões para usar GPT-4o Vision")
            
            return "[Erro ao analisar imagem]"
    
    async def chat_completion(
        self,
        messages: List[Dict],
        tools: Optional[List[Dict]] = None,
        temperature: float = 0.7
    ) -> Dict:
        """
        Chat completion with optional function calling
        
        Args:
            messages: List of message dicts with role and content
            tools: Optional list of tool definitions
            temperature: Sampling temperature
            
        Returns:
            Response dict
        """
        try:
            params = {
                "model": self.model,
                "messages": messages,
                "temperature": temperature,
            }
            
            if tools:
                params["tools"] = tools
                params["tool_choice"] = "auto"
            
            response = await self.client.chat.completions.create(**params)
            return response
            
        except Exception as e:
            logger.error(f"Error in chat completion: {e}", exc_info=True)
            raise
    
    async def create_embedding(self, text: str) -> List[float]:
        """
        Create embedding for text
        
        Args:
            text: Text to embed
            
        Returns:
            Embedding vector
        """
        try:
            response = await self.client.embeddings.create(
                model="text-embedding-3-small",
                input=text
            )
            return response.data[0].embedding
        except Exception as e:
            logger.error(f"Error creating embedding: {e}", exc_info=True)
            raise
