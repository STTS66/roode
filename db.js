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
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name       TEXT NOT NULL,
        folder_path TEXT,
        last_file  TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Safely add user_id to existing projects table if it doesn't have it
    try {
      await client.query('ALTER TABLE projects ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE');
    } catch (e) {
      // Ignore error if column already exists
    }

    // Add last_project_id to users table
    try {
      await client.query('ALTER TABLE users ADD COLUMN last_project_id INTEGER');
    } catch (e) {
      // Ignore if already exists
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS project_versions (
        id         SERIAL PRIMARY KEY,
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        version    TEXT NOT NULL,
        label      TEXT,
        files      TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    console.log('✅ DB ready (users & projects tables exist)');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
