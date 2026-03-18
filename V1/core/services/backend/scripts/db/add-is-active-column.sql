-- Script para adicionar a coluna is_active manualmente
-- Execute este script no banco de dados PostgreSQL

-- Verificar se a coluna já existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'function_call_configs' 
        AND column_name = 'is_active'
    ) THEN
        -- Adicionar a coluna se não existir
        ALTER TABLE function_call_configs 
        ADD COLUMN is_active BOOLEAN DEFAULT true;
        
        RAISE NOTICE 'Coluna is_active adicionada com sucesso';
    ELSE
        RAISE NOTICE 'Coluna is_active já existe';
    END IF;
END $$;
