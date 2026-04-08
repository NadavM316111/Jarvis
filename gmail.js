const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const http = require('http');
const url = require('url');

const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/documents'
];
function getAuthClient() {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const { client_id, client_secret, redirect_uris } = credentials.installed;
  return new google.auth.OAuth2(client_id, client_secret, 'http://localhost:3002');
}

async function authenticate() {
  const auth = getAuthClient();
  
  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
    auth.setCredentials(token);
    return auth;
  }

  const authUrl = auth.generateAuthUrl({ access_type: 'offline', scope: SCOPES });
  console.log('Opening browser for Gmail auth...');
  require('child_process').exec(`start "" "${authUrl}"`);

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const code = new url.URL(req.url, 'http://localhost:3000').searchParams.get('code');
      if (code) {
        res.end('Auth successful! You can close this tab.');
        server.close();
        const { tokens } = await auth.getToken(code);
        auth.setCredentials(tokens);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
        resolve(auth);
      }
    }).listen(3002);
  });
}

async function sendEmail(to, subject, body) {
  const auth = await authenticate();
  const gmail = google.gmail({ version: 'v1', auth });
  
  const message = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body
  ].join('\n');

  const encoded = Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  
  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encoded }
  });
  
  return 'Email sent successfully!';
}

async function getRecentEmails(count = 5) {
  const auth = await authenticate();
  const gmail = google.gmail({ version: 'v1', auth });
  
  const list = await gmail.users.messages.list({ userId: 'me', maxResults: count });
  const messages = [];
  
  for (const msg of list.data.messages || []) {
    const full = await gmail.users.messages.get({ userId: 'me', id: msg.id });
    const headers = full.data.payload.headers;
    const subject = headers.find(h => h.name === 'Subject')?.value || 'No subject';
    const from = headers.find(h => h.name === 'From')?.value || 'Unknown';
    const date = headers.find(h => h.name === 'Date')?.value || '';
    messages.push({ subject, from, date });
  }
  
  return messages;
}

module.exports = { sendEmail, getRecentEmails, authenticate };