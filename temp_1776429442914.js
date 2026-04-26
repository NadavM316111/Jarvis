process.chdir('C:/Users/nadav/jarvis-web');
const __workdir = 'C:/Users/nadav/jarvis-web';

const fs = require('fs');
const { google } = require('googleapis');
const http = require('http');
const url = require('url');

const credentials = JSON.parse(fs.readFileSync('credentials.json'));
const { client_secret, client_id, redirect_uris } = credentials.installed;

const oAuth2Client = new google.auth.OAuth2(
  client_id,
  client_secret,
  'http://localhost:3333'
);

// Generate auth URL
const authUrl = oAuth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events'
  ]
});

console.log('Google OAuth token has expired and needs to be re-authorized.');
console.log('\nPlease visit this URL to authorize:\n');
console.log(authUrl);

// Create a simple server to handle the callback
const server = http.createServer(async (req, res) => {
  const query = url.parse(req.url, true).query;
  if (query.code) {
    try {
      const { tokens } = await oAuth2Client.getToken(query.code);
      fs.writeFileSync('token.json', JSON.stringify(tokens, null, 2));
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h1>Success! Token saved. You can close this window.</h1>');
      console.log('\n✓ Token saved successfully!');
      server.close();
      process.exit(0);
    } catch (err) {
      res.writeHead(500);
      res.end('Error getting tokens: ' + err.message);
    }
  }
});

server.listen(3333, () => {
  console.log('\nWaiting for authorization on http://localhost:3333 ...');
});

// Auto-timeout after 60 seconds
setTimeout(() => {
  console.log('\nTimeout - please re-run and authorize.');
  server.close();
  process.exit(1);
}, 60000);
