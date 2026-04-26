process.chdir('C:/Users/nadav/jarvis-web');
const __workdir = 'C:/Users/nadav/jarvis-web';

const { google } = require('googleapis');
const fs = require('fs');

// Load credentials
const credentials = JSON.parse(fs.readFileSync('credentials.json'));
const token = JSON.parse(fs.readFileSync('token.json'));

const oauth2Client = new google.auth.OAuth2(
  credentials.installed.client_id,
  credentials.installed.client_secret,
  credentials.installed.redirect_uris[0]
);
oauth2Client.setCredentials(token);

const docs = google.docs({ version: 'v1', auth: oauth2Client });

async function createDoc() {
  try {
    // Create the document
    const createResponse = await docs.documents.create({
      requestBody: {
        title: 'Rhetorical Choices - The Zookeepers Wife'
      }
    });
    
    const documentId = createResponse.data.documentId;
    console.log('Document created with ID:', documentId);
    
    // The essay content
    const essayContent = `Nadav
English
April 20, 2026

Rhetorical Choices in The Zookeeper's Wife

In the opening chapters of The Zookeeper's Wife, Diane Ackerman employs vivid imagery to illustrate the devastating impact of war on both human and animal life. One particularly striking moment occurs when Ackerman describes the aftermath of the German bombing of the Warsaw Zoo, writing that "the world became a hell of falling walls, bombs, and fiery debris" (Ackerman 34). This powerful imagery transforms an abstract historical event into a visceral, sensory experience for the reader. By choosing words like "hell," "fiery," and "falling," Ackerman creates a scene of chaos and destruction that appeals directly to the reader's imagination. This deliberate choice helps readers understand that war does not discriminate; it destroys everything in its path, including the innocent animals who had no part in human conflicts. The imagery forces readers to confront the brutal reality of war rather than viewing it as distant history.

Ackerman's use of imagery serves a deeper purpose beyond mere description; it builds an emotional connection between the reader and the victims of war. When readers visualize the "falling walls" and "fiery debris," they experience a sense of fear and helplessness similar to what the zoo's inhabitants must have felt. This rhetorical choice emphasizes the theme of innocence destroyed, as the animals in the zoo represent creatures entirely removed from the political motivations behind the violence. Furthermore, Ackerman's imagery highlights the courage required to survive such circumstances. The Zabinskis, who dedicated their lives to protecting these animals, are shown facing unimaginable destruction yet choosing to persevere. By painting such a detailed and disturbing picture, Ackerman ensures that readers do not merely understand the facts of World War II but feel the weight of its consequences, ultimately inspiring a deeper appreciation for those who showed resilience and compassion during humanity's darkest hours.
`;

    // Insert the content
    await docs.documents.batchUpdate({
      documentId: documentId,
      requestBody: {
        requests: [
          {
            insertText: {
              location: { index: 1 },
              text: essayContent
            }
          }
        ]
      }
    });
    
    console.log('Content added successfully');
    return 'https://docs.google.com/document/d/' + documentId + '/edit';
    
  } catch(err) {
    console.error('Error:', err.message);
    if (err.errors) console.error('Details:', JSON.stringify(err.errors));
    throw err;
  }
}

createDoc().then(url => {
  console.log('SUCCESS! URL:', url);
}).catch(err => {
  console.error('Failed:', err.message);
});
