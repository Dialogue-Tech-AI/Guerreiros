import { WhatsAppMessage } from '../../domain/interfaces/whatsapp-adapter.interface';
import { logger } from '../../../../shared/utils/logger';

/**
 * Meta WhatsApp Cloud API webhook payload types.
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/
 */
export interface MetaWebhookPayload {
  object?: string;
  entry?: MetaWebhookEntry[];
}

export interface MetaWebhookEntry {
  id?: string;
  changes?: MetaWebhookChange[];
}

export interface MetaWebhookChange {
  value?: MetaWebhookValue;
  field?: string;
}

export interface MetaWebhookValue {
  metadata?: {
    phone_number_id?: string;
    display_phone_number?: string;
  };
  contacts?: MetaWebhookContact[];
  messages?: MetaWebhookMessage[];
  statuses?: unknown[];
  errors?: unknown[];
}

export interface MetaWebhookContact {
  profile?: { name?: string };
  wa_id?: string;
}

export interface MetaWebhookMessage {
  id: string;
  from: string;
  timestamp: string;
  /**
   * Mensagens suportadas pela Cloud API.
   * 'reaction' é usada quando o usuário reage a uma mensagem (👍, ❤️ etc.).
   * Essas reações são ignoradas na normalização para não disparar fluxo de IA.
   */
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'button' | 'interactive' | 'location' | 'reaction';
  text?: { body: string };
  image?: { id?: string; caption?: string; mime_type?: string };
  video?: { id?: string; caption?: string; mime_type?: string };
  audio?: { id?: string; mime_type?: string };
  document?: { id?: string; caption?: string; filename?: string; mime_type?: string };
  context?: { from?: string };
}

/**
 * Normalizes a single Meta webhook value (one change) into WhatsAppMessage array.
 * Use this when you already resolved whatsappNumberId from phone_number_id.
 */
export function normalizeMetaWebhookValueToWhatsAppMessages(
  value: MetaWebhookValue,
  whatsappNumberId: string
): WhatsAppMessage[] {
  const results: WhatsAppMessage[] = [];
  if (!value?.messages?.length) return results;
  const contactByWaId = buildContactMap(value.contacts);
  const phoneNumberId = value.metadata?.phone_number_id ?? '';
  for (const msg of value.messages) {
    const normalized = normalizeOneMessage(msg, phoneNumberId, contactByWaId, whatsappNumberId);
    if (normalized) results.push(normalized);
  }
  return results;
}

/**
 * Normalizes a Meta webhook payload into one or more WhatsAppMessage objects.
 * Ignores status updates, group messages (if present), and messages from the business.
 *
 * @param payload - Raw webhook body from Meta
 * @param whatsappNumberId - UUID of the whatsapp_numbers record that received the message
 * @returns Array of normalized WhatsAppMessage (one per message in value.messages)
 */
export function normalizeMetaWebhookToWhatsAppMessages(
  payload: MetaWebhookPayload,
  whatsappNumberId: string
): WhatsAppMessage[] {
  const results: WhatsAppMessage[] = [];

  if (!payload?.entry?.length) {
    return results;
  }

  for (const entry of payload.entry) {
    const changes = entry.changes ?? [];
    for (const change of changes) {
      const value = change.value;
      if (!value?.metadata?.phone_number_id || !value.messages?.length) {
        continue;
      }
      results.push(...normalizeMetaWebhookValueToWhatsAppMessages(value, whatsappNumberId));
    }
  }

  return results;
}

function buildContactMap(contacts: MetaWebhookValue['contacts']): Map<string, string> {
  const map = new Map<string, string>();
  if (!contacts) return map;
  for (const c of contacts) {
    if (c?.wa_id) {
      map.set(c.wa_id, c.profile?.name ?? '');
    }
  }
  return map;
}

function normalizeOneMessage(
  msg: MetaWebhookMessage,
  _phoneNumberId: string,
  contactByWaId: Map<string, string>,
  whatsappNumberId: string
): WhatsAppMessage | null {
  const from = String(msg.from || '').trim();
  if (!from) return null;

  const phoneNumber = from.replace(/\D/g, '');
  if (phoneNumber.length < 10) {
    logger.warn('Meta webhook: invalid from (phone)', { from, messageId: msg.id });
    return null;
  }

  // Reações (👍, ❤️ etc.) não devem disparar IA nem aparecer como nova mensagem.
  if (msg.type === 'reaction') {
    logger.info('Meta webhook: ignoring reaction message', { from, phoneNumber, messageId: msg.id });
    return null;
  }

  const fromJid = `${phoneNumber}@s.whatsapp.net`;
  const pushName = contactByWaId.get(from) || undefined;

  let text = '';
  let mediaType: string | undefined;
  let mediaUrl: string | undefined;

  switch (msg.type) {
    case 'text':
      text = msg.text?.body ?? '';
      break;
    case 'image':
      text = msg.image?.caption ?? '[Imagem]';
      mediaType = 'image';
      if (msg.image?.id) mediaUrl = msg.image.id;
      break;
    case 'video':
      text = msg.video?.caption ?? '[Vídeo]';
      mediaType = 'video';
      if (msg.video?.id) mediaUrl = msg.video.id;
      break;
    case 'audio':
      text = '[Áudio]';
      mediaType = 'audio';
      if (msg.audio?.id) mediaUrl = msg.audio.id;
      break;
    case 'document':
      text = msg.document?.caption ?? msg.document?.filename ?? '[Documento]';
      mediaType = 'document';
      if (msg.document?.id) mediaUrl = msg.document.id;
      break;
    default:
      // Tipos não mapeados explicitamente (ex.: stickers, GIFs) - exibir apenas o tipo.
      text = `[${msg.type}]`;
  }

  const timestamp = msg.timestamp ? new Date(Number(msg.timestamp) * 1000) : new Date();
  if (isNaN(timestamp.getTime())) {
    logger.warn('Meta webhook: invalid timestamp', { messageId: msg.id, raw: msg.timestamp });
  }

  const normalized: WhatsAppMessage = {
    id: msg.id,
    from: fromJid,
    to: '',
    phoneNumber,
    text: text || undefined,
    mediaUrl: mediaUrl || undefined,
    mediaType: mediaType || undefined,
    timestamp: isNaN(timestamp.getTime()) ? new Date() : timestamp,
    pushName,
    whatsappNumberId,
  };

  return normalized;
}
