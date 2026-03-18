import config from '../../../config/app.config';

export const awsConfig = {
  region: config.aws.region || 'us-east-1',
  credentials: config.aws.accessKeyId
    ? {
        accessKeyId: config.aws.accessKeyId,
        secretAccessKey: config.aws.secretAccessKey!,
      }
    : undefined, // Use IAM role in production
};

export const isAwsEnabled = () => {
  return config.app.isProduction && (
    config.aws.useCache ||
    config.aws.useQueue ||
    config.aws.useStorage
  );
};
