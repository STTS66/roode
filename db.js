const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id         SERIAL PRIMARY KEY,
        name       TEXT NOT NULL,
        folder_path TEXT,
        last_file  TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ DB ready (projects table exists)');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
