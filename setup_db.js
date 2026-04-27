const { neon } = require('@neondatabase/serverless');
const sql = neon('postgresql://neondb_owner:npg_kT50YOCedwLf@ep-snowy-darkness-a4sa5ao8-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require');
async function setup() {
  await sqlCREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW());
  await sqlCREATE TABLE IF NOT EXISTS user_memory (user_id TEXT PRIMARY KEY, memory JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ DEFAULT NOW());
  await sqlCREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT, messages JSONB NOT NULL DEFAULT '[]', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
  console.log('Tables created!');
}
setup().catch(console.error);
