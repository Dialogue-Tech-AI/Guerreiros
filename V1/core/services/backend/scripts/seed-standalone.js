#!/usr/bin/env node
/**
 * Seed Super Admin - standalone (usa pg + bcrypt, sem TypeORM).
 * Rode na EC2: node scripts/seed-standalone.js
 * Ou: docker run --rm -v $(pwd):/app -w /app -e DB_HOST=... node:20-alpine sh -c "npm install pg bcrypt uuid && node scripts/seed-standalone.js"
 */
const { Client } = require('pg');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT || '5432', 10);
const DB_USER = process.env.DB_USER || 'altese';
const DB_PASSWORD = process.env.DB_PASSWORD || 'altese123';
const DB_NAME = process.env.DB_NAME || 'altese_autopecas';
const DB_SSL = process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false;

const EMAIL = 'gabriel.dialogue@gmail.com';
const PASSWORD = '0409L@ve';

async function main() {
  const client = new Client({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    ssl: DB_SSL,
  });

  try {
    await client.connect();
    console.log('Connected to database');

    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const res = await client.query(
      `SELECT id FROM users WHERE role = 'SUPER_ADMIN' LIMIT 1`
    );

    if (res.rows.length > 0) {
      await client.query(
        `UPDATE users SET email = $1, password_hash = $2, active = true, updated_at = $3 WHERE id = $4`,
        [EMAIL, passwordHash, now, res.rows[0].id]
      );
      console.log('Super Admin updated');
    } else {
      await client.query(
        `INSERT INTO users (id, name, email, password_hash, role, active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'SUPER_ADMIN', true, $5, $5)`,
        [id, 'Super Administrador', EMAIL, passwordHash, now]
      );
      console.log('Super Admin created');
    }

    console.log('Email:', EMAIL);
    console.log('Password:', PASSWORD);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
