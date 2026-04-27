const { google } = require('googleapis');
const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.DATABASE_URL);
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT = 'https://api.heyjarvis.me/auth/google/callback';

function getClient() {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT);
}

function getAuthUrl(userId) {
  const auth = getClient();
  return auth.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events',
    ],
    state: userId,
    prompt: 'consent'
  });
}

async function saveTokens(userId, tokens) {
  await sql`
    INSERT INTO user_oauth (user_id, google_access_token, google_refresh_token, google_token_expiry, updated_at)
    VALUES (${userId}, ${tokens.access_token}, ${tokens.refresh_token || null}, ${tokens.expiry_date ? new Date(tokens.expiry_date) : null}, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      google_access_token = ${tokens.access_token},
      google_refresh_token = COALESCE(${tokens.refresh_token || null}, user_oauth.google_refresh_token),
      google_token_expiry = ${tokens.expiry_date ? new Date(tokens.expiry_date) : null},
      updated_at = NOW()
  `;
}

async function getAuthForUser(userId) {
  const rows = await sql`SELECT * FROM user_oauth WHERE user_id = ${userId}`;
  if (!rows.length || !rows[0].google_access_token) return null;
  const auth = getClient();
  auth.setCredentials({
    access_token: rows[0].google_access_token,
    refresh_token: rows[0].google_refresh_token,
    expiry_date: rows[0].google_token_expiry ? new Date(rows[0].google_token_expiry).getTime() : null
  });
  auth.on('tokens', async (tokens) => { await saveTokens(userId, tokens); });
  return auth;
}

async function getRecentEmails(userId, count = 10) {
  const auth = await getAuthForUser(userId);
  if (!auth) return 'Not connected to Gmail. Ask user to connect at https://api.heyjarvis.me/auth/google?token=USER_TOKEN';
  const gmail = google.gmail({ version: 'v1', auth });
  const list = await gmail.users.messages.list({ userId: 'me', maxResults: count, q: 'in:inbox' });
  const messages = [];
  for (const msg of list.data.messages || []) {
    const full = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'metadata', metadataHeaders: ['Subject', 'From', 'Date'] });
    const headers = full.data.payload.headers;
    messages.push({
      subject: headers.find(h => h.name === 'Subject')?.value || 'No subject',
      from: headers.find(h => h.name === 'From')?.value || 'Unknown',
      date: headers.find(h => h.name === 'Date')?.value || '',
      snippet: full.data.snippet
    });
  }
  return messages;
}

async function sendEmail(userId, to, subject, body) {
  const auth = await getAuthForUser(userId);
  if (!auth) return 'Not connected to Gmail.';
  const gmail = google.gmail({ version: 'v1', auth });
  const message = [`To: ${to}`, `Subject: ${subject}`, 'Content-Type: text/plain; charset=utf-8', '', body].join('\n');
  const encoded = Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw: encoded } });
  return 'Email sent!';
}

async function getCalendarEvents(userId, days = 7) {
  const auth = await getAuthForUser(userId);
  if (!auth) return 'Not connected to Google Calendar.';
  const calendar = google.calendar({ version: 'v3', auth });
  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin: new Date().toISOString(),
    timeMax: new Date(Date.now() + days * 86400000).toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 20
  });
  return (res.data.items || []).map(e => ({
    title: e.summary,
    start: e.start?.dateTime || e.start?.date,
    end: e.end?.dateTime || e.end?.date,
    location: e.location
  }));
}

async function createCalendarEvent(userId, title, startTime, endTime, description = '') {
  const auth = await getAuthForUser(userId);
  if (!auth) return 'Not connected to Google Calendar.';
  const calendar = google.calendar({ version: 'v3', auth });
  const event = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary: title,
      description,
      start: { dateTime: new Date(startTime).toISOString(), timeZone: 'America/New_York' },
      end: { dateTime: new Date(endTime || new Date(new Date(startTime).getTime() + 3600000)).toISOString(), timeZone: 'America/New_York' },
    }
  });
  return `Event created: ${event.data.htmlLink}`;
}

async function isConnected(userId) {
  const rows = await sql`SELECT google_access_token FROM user_oauth WHERE user_id = ${userId}`;
  return rows.length > 0 && !!rows[0].google_access_token;
}

module.exports = { getAuthUrl, saveTokens, getRecentEmails, sendEmail, getCalendarEvents, createCalendarEvent, isConnected };