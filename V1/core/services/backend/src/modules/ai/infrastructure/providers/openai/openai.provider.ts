import OpenAI from 'openai';
import {
  ILLMProvider,
  CompletionRequest,
  CompletionResponse,
} from '../../../domain/interfaces/llm-provider.interface';
import config from '../../../../../config/app.config';
import { logger } from '../../../../../shared/utils/logger';

export class OpenAIProvider implements ILLMProvider {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: config.openai.apiKey,
      timeout: config.openai.timeout,
    });
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    try {
      const response = await this.client.chat.completions.create({
        model: request.model || config.openai.model,
        messages: request.messages,
        temperature: request.temperature ?? config.openai.temperature,
        max_tokens: request.maxTokens ?? config.openai.maxTokens,
      });

      const choice = response.choices[0];

      logger.debug('OpenAI completion:', {
        model: response.model,
        usage: response.usage,
      });

      return {
        content: choice.message.content || '',
        finishReason: choice.finish_reason,
        usage: {
          promptTokens: response.usage?.prompt_tokens || 0,
          completionTokens: response.usage?.completion_tokens || 0,
          totalTokens: response.usage?.total_tokens || 0,
        },
      };
    } catch (error) {
      logger.error('OpenAI completion error:', error);
      throw error;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch (error) {
      logger.error('OpenAI availability check failed:', error);
      return false;
    }
  }

  getName(): string {
    return 'OpenAI';
  }
}
