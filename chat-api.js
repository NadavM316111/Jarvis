
const express = require('express');
const { Client } = require('pg');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');

const app = express();
app.use(cors());
app.use(express.json());

const DB_URL = 'postgresql://neondb_owner:npg_NBtzb1RC4cDa@ep-calm-cherry-anbyp633-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

function getClient() {
  return new Client({ connectionString: DB_URL });
}

// Register
app.post('/chat/register', async (req, res) => {
  const { username, display_name, password } = req.body;
  const client = getClient();
  try {
    await client.connect();
    const colors = ['#075e54','#128c7e','#25d366','#34b7f1','#e91e63','#9c27b0','#ff5722','#607d8b'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const result = await client.query(
      'INSERT INTO chat_users (username, display_name, password, avatar_color) VALUES ($1, $2, $3, $4) RETURNING id, username, display_name, avatar_color',
      [username.toLowerCase(), display_name, password, color]
    );
    res.json({ success: true, user: result.rows[0] });
  } catch(e) {
    res.json({ success: false, error: e.message });
  } finally { await client.end(); }
});

// Login
app.post('/chat/login', async (req, res) => {
  const { username, password } = req.body;
  const client = getClient();
  try {
    await client.connect();
    const result = await client.query(
      'SELECT id, username, display_name, avatar_color FROM chat_users WHERE username=$1 AND password=$2',
      [username.toLowerCase(), password]
    );
    if (result.rows.length === 0) return res.json({ success: false, error: 'Invalid credentials' });
    await client.query('UPDATE chat_users SET is_online=TRUE, last_seen=NOW() WHERE id=$1', [result.rows[0].id]);
    res.json({ success: true, user: result.rows[0] });
  } catch(e) {
    res.json({ success: false, error: e.message });
  } finally { await client.end(); }
});

// Get all users
app.get('/chat/users/:myId', async (req, res) => {
  const client = getClient();
  try {
    await client.connect();
    const result = await client.query(
      `SELECT u.id, u.username, u.display_name, u.avatar_color, u.is_online, u.last_seen,
        (SELECT content FROM chat_messages WHERE (sender_id=u.id AND receiver_id=$1) OR (sender_id=$1 AND receiver_id=u.id) ORDER BY created_at DESC LIMIT 1) as last_message,
        (SELECT created_at FROM chat_messages WHERE (sender_id=u.id AND receiver_id=$1) OR (sender_id=$1 AND receiver_id=u.id) ORDER BY created_at DESC LIMIT 1) as last_message_time,
        (SELECT COUNT(*) FROM chat_messages WHERE sender_id=u.id AND receiver_id=$1 AND is_read=FALSE) as unread_count
      FROM chat_users u WHERE u.id != $1 ORDER BY last_message_time DESC NULLS LAST, u.display_name ASC`,
      [req.params.myId]
    );
    res.json({ success: true, users: result.rows });
  } catch(e) {
    res.json({ success: false, error: e.message });
  } finally { await client.end(); }
});

// Get messages between two users
app.get('/chat/messages/:myId/:otherId', async (req, res) => {
  const client = getClient();
  try {
    await client.connect();
    const result = await client.query(
      `SELECT m.*, u.display_name as sender_name, u.avatar_color as sender_color
       FROM chat_messages m JOIN chat_users u ON m.sender_id = u.id
       WHERE (sender_id=$1 AND receiver_id=$2) OR (sender_id=$2 AND receiver_id=$1)
       ORDER BY created_at ASC LIMIT 100`,
      [req.params.myId, req.params.otherId]
    );
    await client.query(
      'UPDATE chat_messages SET is_read=TRUE WHERE sender_id=$2 AND receiver_id=$1',
      [req.params.myId, req.params.otherId]
    );
    res.json({ success: true, messages: result.rows });
  } catch(e) {
    res.json({ success: false, error: e.message });
  } finally { await client.end(); }
});

// Send message
app.post('/chat/send', async (req, res) => {
  const { sender_id, receiver_id, content } = req.body;
  const client = getClient();
  try {
    await client.connect();
    const result = await client.query(
      'INSERT INTO chat_messages (sender_id, receiver_id, content) VALUES ($1, $2, $3) RETURNING *',
      [sender_id, receiver_id, content]
    );
    // Notify via WebSocket
    const msg = result.rows[0];
    wss.clients.forEach(ws => {
      if (ws.userId === receiver_id || ws.userId === sender_id) {
        ws.send(JSON.stringify({ type: 'new_message', message: msg }));
      }
    });
    res.json({ success: true, message: msg });
  } catch(e) {
    res.json({ success: false, error: e.message });
  } finally { await client.end(); }
});

// Logout
app.post('/chat/logout', async (req, res) => {
  const { user_id } = req.body;
  const client = getClient();
  try {
    await client.connect();
    await client.query('UPDATE chat_users SET is_online=FALSE, last_seen=NOW() WHERE id=$1', [user_id]);
    res.json({ success: true });
  } catch(e) {
    res.json({ success: false });
  } finally { await client.end(); }
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/chat/ws' });

wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'auth') ws.userId = parseInt(msg.userId);
    } catch(e) {}
  });
  ws.on('close', async () => {
    if (ws.userId) {
      const client = getClient();
      try {
        await client.connect();
        await client.query('UPDATE chat_users SET is_online=FALSE, last_seen=NOW() WHERE id=$1', [ws.userId]);
      } catch(e) {} finally { await client.end(); }
    }
  });
});

server.listen(4567, () => console.log('Chat API running on port 4567'));
