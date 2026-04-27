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
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/presentations',
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
async function listDriveFiles(userId, query = '', maxResults = 20) {
  const auth = await getAuthForUser(userId);
  if (!auth) return 'Not connected to Google Drive.';
  const drive = google.drive({ version: 'v3', auth });
  const res = await drive.files.list({
    q: query ? `name contains '${query}' and trashed=false` : 'trashed=false',
    pageSize: maxResults,
    fields: 'files(id, name, mimeType, modifiedTime, webViewLink, size)'
  });
  return res.data.files || [];
}

async function readDriveFile(userId, fileId) {
  const auth = await getAuthForUser(userId);
  if (!auth) return 'Not connected to Google Drive.';
  const drive = google.drive({ version: 'v3', auth });
  const meta = await drive.files.get({ fileId, fields: 'mimeType, name' });
  const mimeType = meta.data.mimeType;
  if (mimeType === 'application/vnd.google-apps.document') {
    const docs = google.docs({ version: 'v1', auth });
    const doc = await docs.documents.get({ documentId: fileId });
    const text = doc.data.body.content.map(e => e.paragraph?.elements?.map(el => el.textRun?.content || '').join('') || '').join('');
    return { name: meta.data.name, content: text.substring(0, 8000) };
  }
  if (mimeType === 'application/vnd.google-apps.spreadsheet') {
    const sheets = google.sheets({ version: 'v4', auth });
    const sheet = await sheets.spreadsheets.values.get({ spreadsheetId: fileId, range: 'A1:Z100' });
    return { name: meta.data.name, content: JSON.stringify(sheet.data.values).substring(0, 8000) };
  }
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'text' });
  return { name: meta.data.name, content: String(res.data).substring(0, 8000) };
}

async function createDriveDocument(userId, title, content) {
  const auth = await getAuthForUser(userId);
  if (!auth) return 'Not connected to Google Drive.';
  const docs = google.docs({ version: 'v1', auth });
  const doc = await docs.documents.create({ requestBody: { title } });
  await docs.documents.batchUpdate({
    documentId: doc.data.documentId,
    requestBody: { requests: [{ insertText: { location: { index: 1 }, text: content } }] }
  });
  return { id: doc.data.documentId, link: `https://docs.google.com/document/d/${doc.data.documentId}` };
}
async function isConnected(userId) {
  const rows = await sql`SELECT google_access_token FROM user_oauth WHERE user_id = ${userId}`;
  return rows.length > 0 && !!rows[0].google_access_token;
}

module.exports = { getAuthUrl, saveTokens, getRecentEmails, sendEmail, getCalendarEvents, createCalendarEvent, listDriveFiles, readDriveFile, createDriveDocument, isConnected };