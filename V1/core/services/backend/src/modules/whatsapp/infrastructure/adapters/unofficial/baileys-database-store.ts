// @ts-nocheck
import { AppDataSource } from '../../../../../shared/infrastructure/database/typeorm/config/database.config';
import { BaileysCredential } from '../../../domain/entities/baileys-credential.entity';
import { logger } from '../../../../../shared/utils/logger';
import { AuthenticationState, SignalDataTypeMap, SignalKeyStore } from '@whiskeysockets/baileys';
import { initAuthCreds, BufferJSON, makeCacheableSignalKeyStore } from '@whiskeysockets/baileys';

/**
 * Custom Baileys auth state store that saves credentials to PostgreSQL
 * instead of filesystem
 */
export async function useDatabaseAuthState(whatsappNumberId: string): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}> {
  const credentialRepo = AppDataSource.getRepository(BaileysCredential);

  // Load credentials from database
  const loadCreds = async (): Promise<{ [key: string]: any }> => {
    try {
      const credentials = await credentialRepo.find({
        where: { whatsappNumberId: whatsappNumberId as any },
      });

      const creds: { [key: string]: any } = {};
      const keys: { [keyType: string]: { [keyId: string]: any } } = {};

      for (const cred of credentials) {
        try {
          if (cred.credentialKey === 'creds') {
            // Load main credentials
            creds.creds = JSON.parse(cred.credentialValue, BufferJSON.reviver);
          } else if (cred.credentialKey.startsWith('keys-')) {
            // Load individual keys: keys-{type}-{id}
            const parts = cred.credentialKey.split('-');
            if (parts.length >= 3) {
              const keyType = parts[1];
              const keyId = parts.slice(2).join('-'); // In case id has dashes
              
              if (!keys[keyType]) {
                keys[keyType] = {};
              }
              keys[keyType][keyId] = JSON.parse(cred.credentialValue, BufferJSON.reviver);
            }
          } else {
            // Load other credentials as-is
            creds[cred.credentialKey] = JSON.parse(cred.credentialValue, BufferJSON.reviver);
          }
        } catch (error) {
          logger.warn('Failed to parse credential', {
            whatsappNumberId,
            key: cred.credentialKey,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Reconstruct keys object
      if (Object.keys(keys).length > 0) {
        creds.keys = keys;
        logger.info('Reconstructed keys object from database', {
          whatsappNumberId,
          keyTypes: Object.keys(keys),
          totalKeyEntries: Object.values(keys).reduce((sum: number, keyMap: any) => {
            return sum + (keyMap && typeof keyMap === 'object' ? Object.keys(keyMap).length : 0);
          }, 0),
        });
      } else {
        logger.warn('No keys found in database', {
          whatsappNumberId,
          totalCredentials: credentials.length,
          credentialKeys: credentials.map(c => c.credentialKey),
        });
      }

      return creds;
    } catch (error) {
      logger.error('Failed to load credentials from database', {
        whatsappNumberId,
        error: error instanceof Error ? error.message : String(error),
      });
      return {};
    }
  };

  // Save credentials to database
  const saveCreds = async (): Promise<void> => {
    try {
      if (!AppDataSource.isInitialized) {
        logger.warn('Database not initialized, skipping credential save');
        return;
      }

      // Get current state from the socket (we'll need to pass it)
      // For now, we'll save when creds.update event fires
      logger.debug('saveCreds called', { whatsappNumberId });
    } catch (error) {
      logger.error('Failed to save credentials to database', {
        whatsappNumberId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  // Enhanced save function that receives the credentials
  // Note: Keys are now managed by SignalKeyStore, so we only save 'creds' here
  const saveCredsWithState = async (creds: Partial<SignalDataTypeMap>): Promise<void> => {
    try {
      if (!AppDataSource.isInitialized) {
        logger.warn('Database not initialized, skipping credential save');
        return;
      }

      // Save 'creds' as a single entry
      if (creds.creds !== undefined && creds.creds !== null) {
        const credsValue = JSON.stringify(creds.creds, BufferJSON.replacer);
        await credentialRepo.upsert(
          {
            whatsappNumberId: whatsappNumberId as any,
            credentialKey: 'creds',
            credentialValue: credsValue,
          },
          {
            conflictPaths: ['whatsappNumberId', 'credentialKey'],
            skipUpdateIfNoValuesChanged: false, // Always update to ensure latest state
          }
        );
      }

      // Keys are now managed automatically by SignalKeyStore.set()
      // No need to manually save them here
      
      logger.info('Credentials saved to database', {
        whatsappNumberId,
        hasCreds: !!creds.creds,
        hasKeys: !!creds.keys,
      });
    } catch (error) {
      logger.error('Failed to save credentials to database', {
        whatsappNumberId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  };

  // Create a custom SignalKeyStore that saves to PostgreSQL
  const createDatabaseKeyStore = async (): Promise<SignalKeyStore> => {
    const keyCache: { [key: string]: any } = {};
    
    // Load all keys into cache - MUST be awaited
    const loadKeysIntoCache = async () => {
      try {
        const credentials = await credentialRepo.find({
          where: { whatsappNumberId: whatsappNumberId as any },
        });
        
        let keysLoaded = 0;
        for (const cred of credentials) {
          if (cred.credentialKey.startsWith('keys-')) {
            const parts = cred.credentialKey.split('-');
            if (parts.length >= 3) {
              const keyType = parts[1];
              const keyId = parts.slice(2).join('-');
              const key = `${keyType}-${keyId}`;
              try {
                keyCache[key] = JSON.parse(cred.credentialValue, BufferJSON.reviver);
                keysLoaded++;
              } catch (error) {
                logger.warn('Failed to parse key from database', {
                  whatsappNumberId,
                  key,
                  error: error instanceof Error ? error.message : String(error),
                });
              }
            }
          }
        }
        
        logger.info('Loaded keys into cache', {
          whatsappNumberId,
          keysCount: Object.keys(keyCache).length,
          keysLoaded,
        });
      } catch (error) {
        logger.error('Failed to load keys into cache', {
          whatsappNumberId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };
    
    // Load keys into cache - MUST await this
    await loadKeysIntoCache();
    
    return {
      get: async (type: string, ids: string[]) => {
        const result: { [id: string]: any } = {};
        let found = 0;
        
        // First, try to get from cache
        for (const id of ids) {
          const key = `${type}-${id}`;
          if (keyCache[key] !== undefined) {
            result[id] = keyCache[key];
            found++;
          }
        }
        
        // If not all keys found in cache, try to load from database
        if (found < ids.length) {
          try {
            const missingIds = ids.filter(id => {
              const key = `${type}-${id}`;
              return keyCache[key] === undefined;
            });
            
            if (missingIds.length > 0) {
              logger.debug('Some keys not in cache, loading from database', {
                whatsappNumberId,
                type,
                missingIds: missingIds.length,
              });
              
              // Load missing keys from database
              for (const id of missingIds) {
                const keyPrefix = `keys-${type}-${id}`;
                const cred = await credentialRepo.findOne({
                  where: {
                    whatsappNumberId: whatsappNumberId as any,
                    credentialKey: keyPrefix,
                  },
                });
                
                if (cred) {
                  try {
                    const key = `${type}-${id}`;
                    keyCache[key] = JSON.parse(cred.credentialValue, BufferJSON.reviver);
                    result[id] = keyCache[key];
                    found++;
                  } catch (error) {
                    logger.warn('Failed to parse key from database in get()', {
                      whatsappNumberId,
                      key: keyPrefix,
                      error: error instanceof Error ? error.message : String(error),
                    });
                  }
                }
              }
            }
          } catch (error) {
            logger.error('Failed to load keys from database in get()', {
              whatsappNumberId,
              type,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
        
        logger.debug('SignalKeyStore.get called', {
          whatsappNumberId,
          type,
          requestedIds: ids.length,
          foundKeys: found,
          totalCacheSize: Object.keys(keyCache).length,
        });
        
        return result;
      },
      set: async (data: { [type: string]: { [id: string]: any } }) => {
        try {
          let totalKeysSaved = 0;
          for (const [type, entries] of Object.entries(data)) {
            for (const [id, value] of Object.entries(entries)) {
              const key = `${type}-${id}`;
              keyCache[key] = value;
              
              const keyPrefix = `keys-${type}-${id}`;
              const keyValueStr = JSON.stringify(value, BufferJSON.replacer);
              
              await credentialRepo.upsert(
                {
                  whatsappNumberId: whatsappNumberId as any,
                  credentialKey: keyPrefix,
                  credentialValue: keyValueStr,
                },
                {
                  conflictPaths: ['whatsappNumberId', 'credentialKey'],
                  skipUpdateIfNoValuesChanged: false,
                }
              );
              totalKeysSaved++;
            }
          }
          
          logger.info('Keys saved to database via SignalKeyStore', {
            whatsappNumberId,
            keyTypes: Object.keys(data),
            totalKeysSaved,
            cacheSize: Object.keys(keyCache).length,
          });
        } catch (error) {
          logger.error('Failed to save keys via SignalKeyStore', {
            whatsappNumberId,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          });
        }
      },
    } as SignalKeyStore;
  };

  // Load existing credentials
  const creds = await loadCreds();

  // Initialize auth state
  let state: AuthenticationState;
  
  // Create SignalKeyStore - this will load keys from database into cache
  const keyStore = await createDatabaseKeyStore();
  
  if (Object.keys(creds).length === 0) {
    // No credentials found, initialize new
    state = {
      creds: initAuthCreds(),
      keys: makeCacheableSignalKeyStore(keyStore),
    };
    logger.info('Initialized new Baileys credentials', { whatsappNumberId });
  } else {
    // Load existing credentials
    // Ensure we have valid creds and keys
    const loadedCreds = creds.creds || initAuthCreds();
    
    // The keyStore already has keys loaded from database via createDatabaseKeyStore()
    // No need to call set() again - the cache is already populated
    
    state = {
      creds: loadedCreds,
      keys: makeCacheableSignalKeyStore(keyStore),
    };
    
    // Get keys count from the loaded creds (if available) or from keyStore cache
    const loadedKeysFromCreds = creds.keys || {};
    const keysCountFromCreds = Object.keys(loadedKeysFromCreds).length;
    
    logger.info('Loaded Baileys credentials from database', {
      whatsappNumberId,
      hasCreds: !!creds.creds,
      hasKeys: !!creds.keys,
      credsType: typeof loadedCreds,
      keysType: typeof loadedKeysFromCreds,
      keysCount: keysCountFromCreds,
      keyTypes: Object.keys(loadedKeysFromCreds),
    });
    
    // Validate that creds has required properties
    if (!loadedCreds.me || !loadedCreds.account) {
      logger.warn('Loaded credentials may be incomplete', {
        whatsappNumberId,
        hasMe: !!loadedCreds.me,
        hasAccount: !!loadedCreds.account,
      });
    }
    
    // Validate keys structure
    if (keysCountFromCreds === 0) {
      logger.warn('No keys found in loaded creds - keys may be in SignalKeyStore cache', {
        whatsappNumberId,
      });
    } else {
      logger.info('Keys structure validated', {
        whatsappNumberId,
        keyTypes: Object.keys(loadedKeysFromCreds),
        sampleKeyType: Object.keys(loadedKeysFromCreds)[0],
        sampleKeyCount: Object.keys(loadedKeysFromCreds)[0] ? Object.keys(loadedKeysFromCreds[Object.keys(loadedKeysFromCreds)[0]]).length : 0,
      });
    }
  }

  // Return state and enhanced save function
  return {
    state,
    saveCreds: async () => {
      // This will be called by the creds.update event
      // We need to get the current state from the socket
      // For now, we'll create a wrapper that the adapter can enhance
      await saveCreds();
    },
    // Expose the enhanced save function
    saveCredsWithState,
  } as any;
}
