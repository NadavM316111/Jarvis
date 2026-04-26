process.chdir('C:/Users/nadav/jarvis-web');
const __workdir = 'C:/Users/nadav/jarvis-web';

const { google } = require('googleapis');
const fs = require('fs');

const credentials = JSON.parse(fs.readFileSync('credentials.json'));
const token = JSON.parse(fs.readFileSync('token.json'));

const { client_secret, client_id, redirect_uris } = credentials.installed;
const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
oAuth2Client.setCredentials(token);

const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });

async function downloadAttachment() {
  const res = await gmail.users.messages.list({
    userId: 'me',
    q: 'from:tom newer_than:7d',
    maxResults: 5
  });
  
  const msg = await gmail.users.messages.get({
    userId: 'me',
    id: res.data.messages[0].id,
    format: 'full'
  });
  
  // Find the HTML attachment
  function findAttachment(part) {
    if (part.filename === 'TROY_AI_Network_Developer_Spec.html' && part.body.attachmentId) {
      return { partId: part.partId, attachmentId: part.body.attachmentId };
    }
    if (part.parts) {
      for (const p of part.parts) {
        const result = findAttachment(p);
        if (result) return result;
      }
    }
    return null;
  }
  
  const attachment = findAttachment(msg.data.payload);
  console.log('Found attachment:', attachment);
  
  if (attachment) {
    const att = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId: res.data.messages[0].id,
      id: attachment.attachmentId
    });
    
    const content = Buffer.from(att.data.data, 'base64').toString('utf-8');
    console.log('\n=== TROY AI DEVELOPER SPEC ===\n');
    console.log(content);
    
    // Save to file for reference
    fs.writeFileSync('C:/Users/nadav/jarvis-web/public/troy_spec.html', content);
    console.log('\n\nSaved to public/troy_spec.html');
  }
}

downloadAttachment().catch(console.error);
