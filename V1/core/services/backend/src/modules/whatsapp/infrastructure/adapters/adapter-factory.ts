// @ts-nocheck
import {
  IWhatsAppAdapter,
} from '../../domain/interfaces/whatsapp-adapter.interface';
import { PythonWhatsAppAdapter } from './unofficial/python-whatsapp.adapter';
import { WhatsAppWebJSAdapter } from './unofficial/whatsapp-webjs.adapter';
import { BaileysAdapter } from './unofficial/baileys.adapter';
import { MetaCloudAdapter } from './official/meta-cloud.adapter';
import { WhatsAppAdapterType } from '../../../../shared/types/common.types';
import { logger } from '../../../../shared/utils/logger';
import AppConfig from '../../../../config/app.config';

interface AdapterConfig {
  numberId: string;
  name: string;
  adapterType: WhatsAppAdapterType;
  config?: Record<string, any>;
}

/**
 * Factory for creating WhatsApp adapters
 */
export class WhatsAppAdapterFactory {
  /**
   * Create a WhatsApp adapter based on type
   */
  static create(config: AdapterConfig): IWhatsAppAdapter {
    switch (config.adapterType) {
      case WhatsAppAdapterType.UNOFFICIAL:
        // Use Baileys adapter (lightweight, no browser)
        // Fallback options: whatsapp-web.js or Python service
        const usePythonService = process.env.USE_PYTHON_SERVICE === 'true';
        const useWhatsAppWebJS = process.env.USE_WHATSAPP_WEBJS === 'true';
        
        if (usePythonService) {
          const pythonServiceUrl =
            config.config?.pythonServiceUrl ||
            AppConfig.whatsappUnofficial.pythonServiceUrl ||
            'http://localhost:5000';

          logger.info('Creating Python WhatsApp adapter', {
            numberId: config.numberId,
            pythonServiceUrl,
          });

          return new PythonWhatsAppAdapter({
            baseUrl: pythonServiceUrl,
            numberId: config.numberId,
            name: config.name,
          });
        }

        if (useWhatsAppWebJS) {
          // Fallback to whatsapp-web.js (heavier, uses browser)
          logger.info('Creating WhatsApp Web.js adapter', {
            numberId: config.numberId,
          });

          return new WhatsAppWebJSAdapter({
            numberId: config.numberId,
            name: config.name,
            dataPath: config.config?.dataPath,
          });
        }

        // Default: Use Baileys (lightweight, recommended)
        logger.info('Creating Baileys WhatsApp adapter', {
          numberId: config.numberId,
        });

        return new BaileysAdapter({
          numberId: config.numberId,
          name: config.name,
          dataPath: config.config?.dataPath,
        });

      case WhatsAppAdapterType.OFFICIAL: {
        const phoneNumberId =
          config.config?.phoneNumberId ?? AppConfig.whatsappOfficial?.phoneNumberId ?? '';
        const accessToken =
          config.config?.accessToken ?? AppConfig.whatsappOfficial?.accessToken ?? '';
        if (!phoneNumberId || !accessToken) {
          throw new Error('Official adapter requires config.phoneNumberId and config.accessToken');
        }
        logger.info('Creating Meta Cloud WhatsApp adapter', {
          numberId: config.numberId,
        });
        return new MetaCloudAdapter({
          numberId: config.numberId,
          name: config.name,
          config: {
            phoneNumberId,
            accessToken,
            verifyToken: config.config?.verifyToken ?? AppConfig.whatsappOfficial?.verifyToken,
          },
        });
      }

      default:
        throw new Error(`Unknown adapter type: ${config.adapterType}`);
    }
  }
}
