import OpenAI from 'openai';
import config from '../../../../config/app.config';
import { logger } from '../../../../shared/utils/logger';
import axios from 'axios';
import { AppDataSource } from '../../../../shared/infrastructure/database/typeorm/config/database.config';
import { AIConfig } from '../../../ai/domain/entities/ai-config.entity';

/**
 * Media Processor Service
 * 
 * Processes audio (transcription) and images (description) BEFORE sending to AI buffer.
 * 
 * Critical distinction:
 * - Audio/Image: MUST be processed (transcribed/described) → sent as TEXT to LLM
 * - PDF/Video/Document: MUST NOT be processed → sent as file reference only
 */
export class MediaProcessorService {
  private openai: OpenAI;

  constructor() {
    if (!config.openai.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    this.openai = new OpenAI({
      apiKey: config.openai.apiKey,
    });
  }

  /**
   * Process audio: transcribe with Whisper
   * Returns transcription text to be sent to LLM
   */
  async processAudio(mediaUrl: string): Promise<string> {
    try {
      logger.info('🎤 Processing audio for transcription', {
        mediaUrl: mediaUrl.substring(0, 100),
      });

      // Download audio from MinIO (presigned URL)
      const response = await axios.get(mediaUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
      });

      const audioBuffer = Buffer.from(response.data);

      logger.debug('Audio downloaded', {
        size: audioBuffer.length,
        contentType: response.headers['content-type'],
      });

      // Create a File-like object for OpenAI
      const audioFile = new File([audioBuffer], 'audio.webm', {
        type: response.headers['content-type'] || 'audio/webm',
      });

      // Transcribe with Whisper
      const transcript = await this.openai.audio.transcriptions.create({
        model: 'whisper-1',
        file: audioFile,
        language: 'pt', // Portuguese
      });

      const transcriptionText = transcript.text.trim();

      if (!transcriptionText || transcriptionText.length === 0) {
        logger.warn('⚠️  Whisper returned empty transcription');
        return '[Áudio recebido mas não foi possível transcrever]';
      }

      logger.info('✅ Audio transcribed successfully', {
        length: transcriptionText.length,
        preview: transcriptionText.substring(0, 150),
      });

      return transcriptionText;
    } catch (error: any) {
      logger.error('❌ Error transcribing audio', {
        error: error.message,
        stack: error.stack,
      });
      return '[Erro ao transcrever áudio]';
    }
  }

  /**
   * Process image: describe with GPT-4o Vision + OCR
   * Returns description text to be sent to LLM
   */
  async processImage(mediaUrl: string): Promise<string> {
    try {
      logger.info('🖼️  Processing image for description', {
        mediaUrl: mediaUrl.substring(0, 100),
      });

      // Download image from MinIO (presigned URL)
      const response = await axios.get(mediaUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
      });

      const imageBuffer = Buffer.from(response.data);
      const contentType = response.headers['content-type'] || 'image/jpeg';

      logger.debug('Image downloaded', {
        size: imageBuffer.length,
        contentType,
      });

      // Convert to base64 for Vision API
      const base64Image = imageBuffer.toString('base64');
      const dataUrl = `data:${contentType};base64,${base64Image}`;

      // Get image description prompt from database
      const imagePrompt = await this.getImageDescriptionPrompt();

      logger.debug('Using image description prompt', {
        promptLength: imagePrompt.length,
        preview: imagePrompt.substring(0, 100),
      });

      // Analyze with GPT-4o Vision
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: imagePrompt,
              },
              {
                type: 'image_url',
                image_url: {
                  url: dataUrl,
                  detail: 'high', // High detail for OCR
                },
              },
            ],
          },
        ],
        max_tokens: 1000,
        temperature: 0.3,
      });

      const description = completion.choices[0]?.message?.content?.trim();

      if (!description || description.length === 0) {
        logger.warn('⚠️  GPT-4o Vision returned empty description');
        return '[Imagem recebida mas não foi possível descrever]';
      }

      // Check for refusal patterns
      const refusalPatterns = [
        'não posso',
        'desculpe',
        'não consigo',
        'incapaz',
        'unable to',
        'cannot',
        "can't",
        'sorry',
      ];

      const hasRefusal = refusalPatterns.some((pattern) =>
        description.toLowerCase().includes(pattern.toLowerCase())
      );

      if (hasRefusal && description.length < 100) {
        logger.warn('⚠️  GPT-4o Vision refused to describe image, trying again');
        
        // Retry with more direct prompt
        const retryCompletion = await this.openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Descreva TUDO que você vê nesta imagem. Liste todos os objetos, texto visível, cores, e detalhes. Seja específico e completo.',
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: dataUrl,
                    detail: 'high',
                  },
                },
              ],
            },
          ],
          max_tokens: 1000,
          temperature: 0.3,
        });

        const retryDescription = retryCompletion.choices[0]?.message?.content?.trim();
        
        if (retryDescription && retryDescription.length > 0) {
          logger.info('✅ Image described successfully (retry)', {
            length: retryDescription.length,
            preview: retryDescription.substring(0, 150),
          });
          return retryDescription;
        }
      }

      logger.info('✅ Image described successfully', {
        length: description.length,
        preview: description.substring(0, 150),
      });

      return description;
    } catch (error: any) {
      logger.error('❌ Error describing image', {
        error: error.message,
        stack: error.stack,
      });
      return '[Erro ao descrever imagem]';
    }
  }

  /**
   * Get image description prompt from database
   */
  private async getImageDescriptionPrompt(): Promise<string> {
    try {
      const configRepo = AppDataSource.getRepository(AIConfig);
      const config = await configRepo.findOne({
        where: { key: 'image_description_prompt' },
      });

      if (config && config.value) {
        return config.value;
      }

      // Default prompt if not configured
      return `Você é um assistente especializado em análise de imagens para uma loja de autopeças.

Sua tarefa é analisar a imagem fornecida e descrever TUDO que você vê, incluindo:

1. DESCRIÇÃO VISUAL:
   - O que aparece na imagem (objetos, pessoas, cenários, etc.)
   - Cores, formas, condições (novo, usado, danificado, etc.)
   - Características distintivas

2. EXTRAÇÃO DE TEXTO (OCR):
   - TODO texto visível na imagem
   - Números de peça (part numbers)
   - Códigos de barras legíveis
   - Marcas e fabricantes
   - Qualquer outra informação textual

3. CONTEXTO AUTOMOTIVO:
   - Identificar peça ou componente (se for autopeça)
   - Estado da peça
   - Qualquer informação relevante que possa ajudar a identificar ou entender a imagem

IMPORTANTE:
- Você DEVE analisar a imagem e fornecer uma descrição completa
- NÃO diga que não pode analisar - você TEM a capacidade de ver e descrever imagens
- Seja direto e objetivo
- Responda APENAS com a descrição da imagem, sem desculpas ou recusas

Formato: texto corrido, sem formatação markdown.`;
    } catch (error: any) {
      logger.error('Error getting image description prompt', {
        error: error.message,
      });
      // Return default prompt on error
      return 'Descreva TUDO que você vê nesta imagem. Liste todos os objetos, texto visível, cores, e detalhes.';
    }
  }

  /**
   * Route media processing based on type
   * 
   * Returns processed content or reference based on media type:
   * - audio: transcription text
   * - image: description text
   * - video/document/pdf: file reference (no processing)
   */
  async routeMediaProcessing(
    mediaType: string,
    mediaUrl?: string
  ): Promise<{ content: string; transcription?: string; description?: string }> {
    // No media or text type
    if (!mediaUrl || mediaType === 'text') {
      return { content: '' };
    }

    // ACTIVE PROCESSING: Audio and Image MUST be processed
    if (mediaType === 'audio') {
      const transcription = await this.processAudio(mediaUrl);
      return {
        content: transcription,
        transcription,
      };
    }

    if (mediaType === 'image') {
      const description = await this.processImage(mediaUrl);
      return {
        content: description,
        description,
      };
    }

    // PASSIVE REFERENCE: Video, Document, PDF are NOT processed
    if (mediaType === 'video') {
      return {
        content: 'O cliente enviou um vídeo.',
      };
    }

    if (mediaType === 'document') {
      return {
        content: 'O cliente enviou um documento.',
      };
    }

    // Unknown media type - treat as reference
    return {
      content: `O cliente enviou um arquivo (${mediaType}).`,
    };
  }
}

// Singleton instance
export const mediaProcessorService = new MediaProcessorService();
