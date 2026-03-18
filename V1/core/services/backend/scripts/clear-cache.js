const Redis = require('ioredis');

async function clearCache() {
  const redis = new Redis({ host: 'localhost', port: 6379 });

  try {
    console.log('\n🔄 Limpando cache do Redis...');
    await redis.flushall();
    
    await redis.publish('ai:config:update', JSON.stringify({
      key: 'agent_prompt',
      action: 'update',
      timestamp: new Date().toISOString()
    }));
    
    console.log('✅ Cache limpo e invalidação publicada!\n');
    
  } finally {
    redis.disconnect();
  }
}

clearCache();
