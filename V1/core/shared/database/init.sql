-- Altese Autopeças - PostgreSQL Initialization Script
-- This script runs automatically when the database is first created

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create schema if needed
CREATE SCHEMA IF NOT EXISTS public;

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE altese_autopecas TO altese;
GRANT ALL PRIVILEGES ON SCHEMA public TO altese;

-- Log successful initialization
DO $$
BEGIN
  RAISE NOTICE 'Altese Autopeças database initialized successfully!';
END $$;
