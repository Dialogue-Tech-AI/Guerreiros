const Redis = require('ioredis');

async function clearCache() {
  const redis = new Redis({ host: 'localhost', port: 6379 });

  try {
    console.log('🔄 Limpando cache do Redis...');
    await redis.flushall();
    console.log('✅ Cache limpo!');
    
    await redis.publish('ai:config:update', JSON.stringify({ 
      key: 'agent_prompt',
      action: 'update',
      timestamp: new Date().toISOString()
    }));
    console.log('✅ Invalidação publicada!');
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    redis.disconnect();
  }
}

clearCache();
