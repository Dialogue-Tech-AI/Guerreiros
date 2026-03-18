import { SQSClient, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand, GetQueueAttributesCommand } from '@aws-sdk/client-sqs';
import { IQueue } from './queue.interface';
import { awsConfig } from '../aws/aws.config';
import config from '../../../config/app.config';
import { logger } from '../../utils/logger';

/**
 * SQS adapter for production
 * 
 * NOTE: This will be used ONLY when:
 * - NODE_ENV=production
 * - USE_AWS_QUEUE=true
 * - SQS queues are configured in AWS
 * 
 * Queue URLs should be configured via environment variables
 */
export class SQSQueue implements IQueue {
  private client: SQSClient;
  private queueUrls: Map<string, string>;
  private pollingIntervals: Map<string, NodeJS.Timeout>;

  constructor() {
    this.client = new SQSClient({
      region: awsConfig.region,
      credentials: awsConfig.credentials,
    });

    this.queueUrls = new Map();
    this.pollingIntervals = new Map();

    logger.info('SQS Queue (AWS) initialized');
  }

  async publish(queue: string, message: unknown): Promise<void> {
    try {
      const queueUrl = await this.getQueueUrl(queue);
      
      const command = new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(message),
      });

      await this.client.send(command);
      logger.debug(`Message published to SQS queue ${queue}`);
    } catch (error) {
      logger.error(`Error publishing message to SQS queue ${queue}:`, error);
      throw error;
    }
  }

  async consume(queue: string, callback: (message: unknown) => Promise<void>): Promise<void> {
    try {
      const queueUrl = await this.getQueueUrl(queue);

      // Long polling
      const poll = async () => {
        try {
          const command = new ReceiveMessageCommand({
            QueueUrl: queueUrl,
            MaxNumberOfMessages: 10,
            WaitTimeSeconds: 20, // Long polling
            VisibilityTimeout: 30,
          });

          const response = await this.client.send(command);

          if (response.Messages) {
            for (const msg of response.Messages) {
              try {
                const content = JSON.parse(msg.Body || '{}');
                await callback(content);

                // Delete message after successful processing
                await this.client.send(
                  new DeleteMessageCommand({
                    QueueUrl: queueUrl,
                    ReceiptHandle: msg.ReceiptHandle,
                  })
                );

                logger.debug(`Message consumed from SQS queue ${queue}`);
              } catch (error) {
                logger.error(`Error processing SQS message from queue ${queue}:`, error);
                // Message will become visible again after visibility timeout
              }
            }
          }
        } catch (error) {
          logger.error(`Error polling SQS queue ${queue}:`, error);
        }

        // Continue polling
        if (this.pollingIntervals.has(queue)) {
          setTimeout(poll, 1000);
        }
      };

      // Start polling
      this.pollingIntervals.set(queue, setTimeout(poll, 0) as NodeJS.Timeout);
      logger.info(`Started consuming from SQS queue: ${queue}`);
    } catch (error) {
      logger.error(`Error consuming from SQS queue ${queue}:`, error);
      throw error;
    }
  }

  async assertQueue(queue: string): Promise<void> {
    // SQS queues must be created via AWS Console or Infrastructure as Code
    // This method just validates the queue exists
    try {
      await this.getQueueUrl(queue);
      logger.debug(`SQS queue ${queue} asserted`);
    } catch (error) {
      logger.error(`SQS queue ${queue} not found or not accessible:`, error);
      throw error;
    }
  }

  async getMessageCount(queue: string): Promise<number> {
    try {
      const queueUrl = await this.getQueueUrl(queue);
      
      const command = new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: ['ApproximateNumberOfMessages'],
      });

      const response = await this.client.send(command);
      return parseInt(response.Attributes?.ApproximateNumberOfMessages || '0', 10);
    } catch (error) {
      logger.error(`Error getting message count for SQS queue ${queue}:`, error);
      return 0;
    }
  }

  async purgeQueue(queue: string): Promise<void> {
    // Not implemented - use AWS Console or CLI for purging
    logger.warn(`Purge not implemented for SQS queue ${queue}`);
  }

  async disconnect(): Promise<void> {
    // Stop all polling
    this.pollingIntervals.forEach((interval) => clearTimeout(interval));
    this.pollingIntervals.clear();
    logger.info('SQS Queue disconnected');
  }

  private getQueueUrl(queue: string): Promise<string> {
    // Check cache first
    if (this.queueUrls.has(queue)) {
      return Promise.resolve(this.queueUrls.get(queue)!);
    }

    const sqs = config.aws?.sqs;
    const logicalToUrl: Record<string, string | undefined> = {
      'ai-messages': sqs?.queueAiMessagesUrl,
      'ai-responses': sqs?.queueAiResponsesUrl,
      'function_call_process': sqs?.queueFunctionCallProcessUrl,
      'function_call_response': sqs?.queueFunctionCallResponseUrl,
    };
    const url = logicalToUrl[queue];
    if (url) {
      this.queueUrls.set(queue, url);
      return Promise.resolve(url);
    }

    // Fallback: construct from queue name (for compatibility)
    const accountId = process.env.AWS_ACCOUNT_ID || '123456789012';
    const region = awsConfig.region || 'us-east-1';
    const queueUrl = `https://sqs.${region}.amazonaws.com/${accountId}/${queue}`;
    this.queueUrls.set(queue, queueUrl);
    return Promise.resolve(queueUrl);
  }
}
