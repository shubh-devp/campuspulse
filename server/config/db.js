const { Pool } = require('pg');

// Managed Postgres (Render, Neon, Railway, Supabase) only accepts TLS connections.
// DB_SSL=true turns it on. Certificate verification is off because these providers
// sign with their own CA, which is not in Node's trust store.
const useSsl = String(process.env.DB_SSL || '').toLowerCase() === 'true';

// Connection settings come from environment variables (see .env.example)
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
});

module.exports = pool;
