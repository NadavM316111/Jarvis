const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { neon } = require('@neondatabase/serverless');

const DB_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_kT50YOCedwLf@ep-snowy-darkness-a4sa5ao8-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
const sql = neon(DB_URL);
const JWT_SECRET = process.env.JWT_SECRET || 'jarvis-secret-key-change-in-production';

async function loadUserMemory(userId) {
  try {
    const rows = await sql`SELECT memory FROM user_memory WHERE user_id = ${userId}`;
    if (rows.length > 0) return rows[0].memory;
  } catch (e) { console.log('[DB] loadUserMemory error:', e.message); }
  return {
    userName: '',
    email: '',
    facts: [],
    contacts: {},
    projects: {},
    devices: {},
    preferences: {},
    apis: {},
    dailyChecks: []
  };
}

async function saveUserMemory(userId, memory) {
  try {
    await sql`
      INSERT INTO user_memory (user_id, memory, updated_at)
      VALUES (${userId}, ${JSON.stringify(memory)}, NOW())
      ON CONFLICT (user_id) DO UPDATE SET memory = ${JSON.stringify(memory)}, updated_at = NOW()
    `;
  } catch (e) { console.log('[DB] saveUserMemory error:', e.message); }
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

async function signup(email, password, name) {
  const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
  if (existing.length > 0) throw new Error('User already exists');

  const hash = await bcrypt.hash(password, 10);
  const userId = email.replace(/[^a-z0-9]/gi, '_').toLowerCase();

  await sql`
    INSERT INTO users (id, email, name, password_hash, created_at)
    VALUES (${userId}, ${email}, ${name}, ${hash}, NOW())
    ON CONFLICT (id) DO NOTHING
  `;

  // Init memory
  await saveUserMemory(userId, {
    userName: name,
    email,
    facts: [],
    contacts: {},
    projects: {},
    devices: {},
    preferences: {},
    apis: {},
    dailyChecks: []
  });

  const token = jwt.sign({ userId, email, name }, JWT_SECRET, { expiresIn: '30d' });
  return { token, userId, name };
}

async function login(email, password) {
  const rows = await sql`SELECT * FROM users WHERE email = ${email}`;
  if (rows.length === 0) throw new Error('User not found');
  const user = rows[0];
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw new Error('Wrong password');
  const token = jwt.sign({ userId: user.id, email, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
  return { token, userId: user.id, name: user.name };
}

// Conversation persistence
async function saveConversation(userId, convId, title, messages) {
  try {
    await sql`
      INSERT INTO conversations (id, user_id, title, messages, created_at, updated_at)
      VALUES (${convId}, ${userId}, ${title}, ${JSON.stringify(messages)}, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET title = ${title}, messages = ${JSON.stringify(messages)}, updated_at = NOW()
    `;
  } catch (e) { console.log('[DB] saveConversation error:', e.message); }
}

async function loadConversations(userId) {
  try {
    const rows = await sql`
      SELECT * FROM conversations WHERE user_id = ${userId} ORDER BY updated_at DESC LIMIT 50
    `;
    return rows.map(r => ({ id: r.id, title: r.title, messages: r.messages, createdAt: new Date(r.created_at).getTime() }));
  } catch (e) { console.log('[DB] loadConversations error:', e.message); return []; }
}

async function deleteConversation(convId, userId) {
  try {
    await sql`DELETE FROM conversations WHERE id = ${convId} AND user_id = ${userId}`;
  } catch (e) { console.log('[DB] deleteConversation error:', e.message); }
}

module.exports = { signup, login, verifyToken, loadUserMemory, saveUserMemory, saveConversation, loadConversations, deleteConversation };