import { loadEnv } from '../../src/config/load-env';
loadEnv();

import { AppDataSource } from '../../src/shared/infrastructure/database/typeorm/config/database.config';
import { Message } from '../../src/modules/message/domain/entities/message.entity';
import { logger } from '../../src/shared/utils/logger';

/**
 * Script para identificar e remover mensagens duplicadas no banco de dados
 * Mantém apenas a última ocorrência de cada mensagem única
 */
async function cleanDuplicateMessages() {
  try {
    logger.info('Initializing database connection...');
    await AppDataSource.initialize();
    logger.info('Database connected');

    const messageRepo = AppDataSource.getRepository(Message);

    logger.info('Searching for duplicate messages...');

    const allMessages = await messageRepo
      .createQueryBuilder('message')
      .orderBy('message.attendanceId', 'ASC')
      .addOrderBy('message.sentAt', 'ASC')
      .addOrderBy('message.id', 'ASC')
      .getMany();

    logger.info(`Total messages in database: ${allMessages.length}`);

    const messageGroups = new Map<string, Message[]>();
    
    for (const msg of allMessages) {
      const sentAtSeconds = Math.floor(new Date(msg.sentAt).getTime() / 1000);
      const key = `${msg.attendanceId}_${msg.content}_${sentAtSeconds}_${msg.origin}`;
      
      if (!messageGroups.has(key)) {
        messageGroups.set(key, []);
      }
      messageGroups.get(key)!.push(msg);
    }

    let duplicateCount = 0;
    const messagesToDelete: string[] = [];

    for (const [key, messages] of messageGroups.entries()) {
      if (messages.length > 1) {
        duplicateCount += messages.length - 1;
        logger.info(`Found ${messages.length} duplicates for key: ${key.substring(0, 100)}...`);
        
        const toDelete = messages.slice(0, -1);
        messagesToDelete.push(...toDelete.map(m => m.id));
        
        logger.info(`Will delete ${toDelete.length} duplicate messages, keeping the last one`);
      }
    }

    if (duplicateCount === 0) {
      logger.info('✅ No duplicate messages found!');
    } else {
      logger.warn(`⚠️ Found ${duplicateCount} duplicate messages across ${messagesToDelete.length} records`);
      
      const batchSize = 100;
      for (let i = 0; i < messagesToDelete.length; i += batchSize) {
        const batch = messagesToDelete.slice(i, i + batchSize);
        await messageRepo.delete(batch);
        logger.info(`Deleted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(messagesToDelete.length / batchSize)} (${batch.length} messages)`);
      }

      logger.info(`✅ Successfully deleted ${messagesToDelete.length} duplicate messages`);
    }

    await AppDataSource.destroy();
    logger.info('Database connection closed');
  } catch (error: any) {
    logger.error('Error cleaning duplicate messages', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
}

cleanDuplicateMessages()
  .then(() => {
    logger.info('Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Script failed', { error: error.message });
    process.exit(1);
  });
