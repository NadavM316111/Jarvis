require('dotenv').config({ path: '.env.local' });
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const screenshot = require('screenshot-desktop');
const { execSync, exec } = require('child_process');
const robot = require('@jitsi/robotjs');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { signup, login, verifyToken, loadUserMemory, saveUserMemory } = require('./auth');

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PROACTIVE_LOG_FILE = path.join(__dirname, 'proactive_log.json');

function loadProactiveLog() {
  try {
    if (fs.existsSync(PROACTIVE_LOG_FILE)) return JSON.parse(fs.readFileSync(PROACTIVE_LOG_FILE, 'utf8'));
  } catch (e) {}
  return { updates: [] };
}

function saveProactiveLog(log) {
  try {
    fs.writeFileSync(PROACTIVE_LOG_FILE, JSON.stringify(log, null, 2));
  } catch (e) {}
}

// Per-session state
const sessions = {};

function getSession(userId) {
  if (!sessions[userId]) {
    sessions[userId] = {
      conversationHistory: [],
      userMemory: loadUserMemory(userId)
    };
  }
  return sessions[userId];
}

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  const user = verifyToken(token);
  if (!user) return res.status(401).json({ error: 'Invalid token' });
  req.user = user;
  next();
}

let voiceStatus = { listening: false, speaking: false, transcript: '', response: '' };
let proactiveUpdates = loadProactiveLog().updates || [];

function addProactiveUpdate(message) {
  const update = {
    id: Date.now(),
    message,
    time: new Date().toLocaleTimeString(),
    date: new Date().toLocaleDateString(),
    read: false
  };
  proactiveUpdates.unshift(update);
  if (proactiveUpdates.length > 50) proactiveUpdates = proactiveUpdates.slice(0, 50);
  saveProactiveLog({ updates: proactiveUpdates });
  console.log(`[PROACTIVE UPDATE] ${message}`);
}

async function webSearch(query) {
  try {
    const res = await axios.get('https://api.search.brave.com/res/v1/web/search', {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': process.env.BRAVE_SEARCH_API_KEY
      },
      params: { q: query, count: 5 }
    });
    const results = res.data.web?.results || [];
    return results.map(r => ({ title: r.title, url: r.url, description: r.description }));
  } catch (e) {
    return [];
  }
}

async function browseUrl(url) {
  try {
    const res = await axios.get(url, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(res.data);
    $('script, style, nav, footer, header').remove();
    return $('body').text().replace(/\s+/g, ' ').trim().substring(0, 4000);
  } catch (e) {
    return `Could not browse ${url}: ${e.message}`;
  }
}

async function executeAction(action) {
  switch (action.type) {
    case 'OPEN_URL': exec(`start "" "${action.value}"`); await new Promise(r => setTimeout(r, 5000)); break;
    case 'OPEN_APP': exec(`start "" "${action.value}"`); await new Promise(r => setTimeout(r, 2000)); break;
    case 'CLICK': {
      const [x, y] = action.value.split(',').map(Number);
      await new Promise(r => setTimeout(r, 400));
      robot.moveMouse(x, y);
      await new Promise(r => setTimeout(r, 300));
      robot.mouseClick();
      await new Promise(r => setTimeout(r, 500));
      break;
    }
    case 'TYPE': {
      await new Promise(r => setTimeout(r, 600));
      const tmpClip = path.join(__dirname, 'clip_tmp.txt');
      fs.writeFileSync(tmpClip, action.value, 'utf8');
      execSync(`powershell -command "Get-Content -Path '${tmpClip}' -Raw | Set-Clipboard"`);
      await new Promise(r => setTimeout(r, 300));
      robot.keyTap('v', ['control']);
      await new Promise(r => setTimeout(r, 300));
      break;
    }
    case 'ENTER': await new Promise(r => setTimeout(r, 200)); robot.keyTap('enter'); await new Promise(r => setTimeout(r, 200)); break;
    case 'HOTKEY': {
      const parts = action.value.split('+');
      const key = parts[parts.length - 1].toLowerCase();
      const modifiers = parts.slice(0, -1).map(m => m.toLowerCase() === 'ctrl' ? 'control' : m.toLowerCase() === 'cmd' ? 'command' : m.toLowerCase());
      await new Promise(r => setTimeout(r, 200));
      try { if (modifiers.length > 0) robot.keyTap(key, modifiers); else robot.keyTap(key); } catch (e) {}
      await new Promise(r => setTimeout(r, 200));
      break;
    }
    case 'SELECT_ALL_AND_DELETE': robot.keyTap('a', ['control']); await new Promise(r => setTimeout(r, 200)); robot.keyTap('delete'); await new Promise(r => setTimeout(r, 200)); break;
    case 'SEND_EMAIL': {
      const parts = (action.value || '').split('|');
      const to = (parts[0] || '').trim();
      const subject = (parts[1] || '').trim();
      const body = parts.slice(2).join('|').trim();
      try { const { sendEmail } = require('./gmail'); await sendEmail(to, subject, body); } catch (e) { console.log('Email failed:', e.message); }
      break;
    }
    case 'RUN': exec(action.value); await new Promise(r => setTimeout(r, 1000)); break;
    default: console.log('Unknown action:', action.type);
  }
}

async function runAgenticLoop(userMessage, screenshotBase64, userId) {
  const session = getSession(userId);
  const { conversationHistory, userMemory } = session;

  const tools = [
    { name: 'web_search', description: 'Search the web.', input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
    { name: 'browse_url', description: 'Read any webpage.', input_schema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } },
    { name: 'execute_actions', description: 'Execute computer actions.', input_schema: { type: 'object', properties: { actions: { type: 'array', items: { type: 'object', properties: { type: { type: 'string' }, value: { type: 'string' } } } }, summary: { type: 'string' } }, required: ['actions', 'summary'] } },
    { name: 'run_code', description: 'Write and execute Node.js code. node_modules at C:\\Users\\nadav\\jarvis-web\\node_modules', input_schema: { type: 'object', properties: { code: { type: 'string' }, description: { type: 'string' } }, required: ['code', 'description'] } },
    { name: 'remember', description: 'Save to user memory.', input_schema: { type: 'object', properties: { category: { type: 'string' }, key: { type: 'string' }, value: { type: 'string' } }, required: ['category', 'key', 'value'] } },
    { name: 'proactive_update', description: 'Send proactive update to user.', input_schema: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] } },
    { name: 'finish', description: 'Task complete.', input_schema: { type: 'object', properties: { response: { type: 'string' } }, required: ['response'] } }
  ];

  const systemPrompt = [
    `You are JARVIS, an autonomous AI agent for ${userMemory.userName || 'the user'}.`,
    "You have a TRUE BRAIN — search the web, browse pages, write and run code, control the computer, remember everything.",
    "MOST IMPORTANT RULE: When asked to DO something, DO IT. Don't explain, don't ask — just do it.",
    "",
    "AUTONOMOUS BEHAVIOR:",
    "- Figure out HOW to do things by searching the web",
    "- Write and run Node.js code to call APIs you discover",
    "- Remember everything important about the user automatically",
    "- Chain multiple tools together to complete complex tasks",
    "- Never say you cant do something without trying first",
    "- node_modules are at ${process.cwd()}\\node_modules",
"- Always start code with: process.chdir('${process.cwd().replace(/\\/g, '/')}');",
    "",
    "TWILIO CALLS: When making calls, ALWAYS create a conference bridge.",
    "Twilio credentials are in .env.local",
    "",
    "SONOS: Discover speakers and play music using the @svrooij/sonos package.",
    "SONOS MUSIC: Use TuneIn format: x-sonosapi-stream:STATIONID?sid=254&flags=32&sn=0",
    "Search 'tunein station id [artist]' to find station IDs.",
    "Always use @svrooij/sonos not the 'sonos' package.",
    "",
    "SMART HOME: Scan network, find devices, figure out APIs, control them.",
    `SONY TV: IP=${userMemory.devices?.sonyTv?.ip || 'unknown'}, PSK=${userMemory.devices?.sonyTv?.psk || 'unknown'}. If unknown, scan the network to find it.`,
    "",
    "VOICE RESPONSE RULES:",
    "- MAX 2 sentences for simple replies",
    "- 1 sentence confirmation after actions",
    "- Never list more than 3 things unless asked",
    "- Sound like a human, not a robot",
    "",
    `Google credentials: ${process.cwd()}\\credentials.json`,
`Google token: ${process.cwd()}\\token.json`,
`Save files to: ${process.cwd()}\\`,
    "TYPING: Use ONLY plain ASCII.",
    "COMPUTER ACTIONS: OPEN_URL, OPEN_APP, CLICK, TYPE, ENTER, HOTKEY, SELECT_ALL_AND_DELETE, SEND_EMAIL, RUN",
    "",
    `User: ${userMemory.userName}`,
    `Memory: ${JSON.stringify(userMemory)}`,
    `Location: ${userMemory.location || 'unknown — ask the user where they are'}`,
    `Current time: ${new Date().toLocaleString()}`
  ].join("\n");

  const messageContent = [];
  if (screenshotBase64) messageContent.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: screenshotBase64 } });
  messageContent.push({ type: 'text', text: userMessage });

  const messages = [...conversationHistory, { role: 'user', content: messageContent }];
  let finalResponse = '';
  let iterations = 0;

  while (iterations < 20) {
    iterations++;
    console.log(`\n--- Iteration ${iterations} ---`);

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 8096,
      system: systemPrompt,
      tools,
      messages
    });

    console.log('Stop reason:', response.stop_reason);
    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'max_tokens') {
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
      if (toolUseBlocks.length > 0) {
        messages.push({ role: 'user', content: toolUseBlocks.map(b => ({ type: 'tool_result', tool_use_id: b.id, content: 'Truncated, continue.' })) });
      }
      continue;
    }

    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find(b => b.type === 'text');
      if (textBlock) finalResponse = textBlock.text;
      break;
    }

    if (response.stop_reason === 'tool_use') {
      const toolResults = [];
      let finished = false;

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;
        console.log(`Tool: ${block.name}`);
        let result = '';

        if (block.name === 'web_search') result = JSON.stringify(await webSearch(block.input.query));
        else if (block.name === 'browse_url') result = await browseUrl(block.input.url);
        else if (block.name === 'execute_actions') {
          for (const action of block.input.actions) { const r = await executeAction(action); if (r) result += r + '\n'; }
          result += block.input.summary;
        }
        else if (block.name === 'run_code') {
          console.log('Running:', block.input.description);
          const codePath = path.join(__dirname, 'temp_code.js');
          fs.writeFileSync(codePath, block.input.code);
          try {
            result = execSync(`node ${codePath}`, { timeout: 30000 }).toString();
          } catch (e) {
            const err = e.stderr ? e.stderr.toString() : e.message;
            const missing = err.match(/Cannot find module '([^']+)'/);
            if (missing) {
              try {
                execSync(`cd C:/Users/nadav/jarvis-web && npm install ${missing[1]}`, { timeout: 60000 });
                result = execSync(`node ${codePath}`, { timeout: 30000 }).toString();
              } catch (e2) { result = `Error: ${e2.message}`; }
            } else { result = `Error: ${err}`; }
          }
          console.log('Code result:', result.substring(0, 300));
        }
        else if (block.name === 'remember') {
          const cat = block.input.category;
          if (!userMemory[cat]) userMemory[cat] = {};
          if (typeof userMemory[cat] === 'object' && !Array.isArray(userMemory[cat])) userMemory[cat][block.input.key] = block.input.value;
          else userMemory.facts.push({ key: block.input.key, value: block.input.value });
          saveUserMemory(userId, userMemory);
          result = `Remembered: ${block.input.key} = ${block.input.value}`;
        }
        else if (block.name === 'proactive_update') { addProactiveUpdate(block.input.message); result = 'Update added.'; }
        else if (block.name === 'finish') {
          finalResponse = block.input.response;
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: 'Done.' });
          messages.push({ role: 'user', content: toolResults });
          finished = true;
          break;
        }

        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result || 'Done.' });
      }

      if (finished) break;
      messages.push({ role: 'user', content: toolResults });
    }
  }

  session.conversationHistory.push(
    { role: 'user', content: messageContent },
    { role: 'assistant', content: finalResponse || 'Done.' }
  );
  if (session.conversationHistory.length > 20) session.conversationHistory = session.conversationHistory.slice(-20);

  return finalResponse || 'Done.';
}

// ============ PROACTIVE BRAIN ============
async function runProactiveBrain() {
  const now = new Date();
  const hour = now.getHours();
  if (hour < 7 || hour > 23) return;
  console.log('\n[PROACTIVE BRAIN] Running...');

  // Run for all active sessions
  for (const userId of Object.keys(sessions)) {
    const { userMemory } = sessions[userId];
    const prompt = [
      `You are running a proactive check for ${userMemory.userName}.`,
      "Look at their memory and think: what would genuinely help them right now?",
      "1. Weather in Fort Lauderdale — if extreme, warn them",
      "2. Look at projects and contacts — any relevant news?",
      "3. Morning (7-9am): give a morning brief",
      "4. Evening (6-9pm): summarize the day",
      "5. Custom daily checks: " + JSON.stringify(userMemory.dailyChecks || []),
      "Use proactive_update for each useful insight.",
      "Only send updates that genuinely matter.",
      "If nothing important, use finish with 'No updates needed.'"
    ].join("\n");

    try { await runAgenticLoop(prompt, null, userId); } catch (e) { console.log('[PROACTIVE] Error:', e.message); }
  }
}

setInterval(runProactiveBrain, 30 * 60 * 1000);
setTimeout(runProactiveBrain, 2 * 60 * 1000);

// ============ AUTH ROUTES ============
app.post('/auth/signup', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) return res.status(400).json({ error: 'Email, password and name required' });
    const result = await signup(email, password, name);
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await login(email, password);
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(401).json({ error: e.message });
  }
});

app.get('/auth/me', authMiddleware, (req, res) => {
  const session = getSession(req.user.userId);
  res.json({ user: req.user, memory: session.userMemory });
});

// ============ MAIN ROUTES ============
app.post('/chat', authMiddleware, async (req, res) => {
  try {
    const { message } = req.body;
    const userId = req.user.userId;
    console.log(`\n[${req.user.name}]: ${message}`);

    const session = getSession(userId);
    if (session.conversationHistory.length > 0) {
      const last = session.conversationHistory[session.conversationHistory.length - 1];
      if (Array.isArray(last?.content)) { session.conversationHistory = []; }
    }

    if (message.toLowerCase().includes('check') && message.toLowerCase().includes('every day')) {
      if (!session.userMemory.dailyChecks) session.userMemory.dailyChecks = [];
      session.userMemory.dailyChecks.push(message);
      saveUserMemory(userId, session.userMemory);
    }

    let screenshotBase64 = null;
    try { const imgBuffer = await screenshot({ format: 'png' }); screenshotBase64 = imgBuffer.toString('base64'); } catch (e) {}

    const isLongTask = /play|connect|sonos|tv|call|email|search|find|create|open|print|turn/i.test(message);

    if (isLongTask) {
      res.json({ success: true, message: "On it!", actions: [] });
      runAgenticLoop(message, screenshotBase64, userId).then(response => {
  console.log(`JARVIS (bg): ${response}`);
}).catch(e => console.error('Background error:', e));
    } else {
      const response = await runAgenticLoop(message, screenshotBase64, userId);
      console.log(`JARVIS: ${response}`);
      res.json({ success: true, message: response, actions: [] });
    }
  } catch (error) {
    console.error('Error:', error);
    res.json({ success: false, message: error.message });
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));
app.post('/reset', authMiddleware, (req, res) => { getSession(req.user.userId).conversationHistory = []; res.json({ ok: true }); });
app.get('/voice-status', (req, res) => res.json(voiceStatus));
app.post('/voice-update', (req, res) => { voiceStatus = { ...voiceStatus, ...req.body }; res.json({ ok: true }); });
app.get('/proactive-updates', authMiddleware, (req, res) => res.json({ updates: proactiveUpdates }));
app.post('/proactive-updates/read', authMiddleware, (req, res) => {
  proactiveUpdates = proactiveUpdates.map(u => ({ ...u, read: true }));
  saveProactiveLog({ updates: proactiveUpdates });
  res.json({ ok: true });
});
// ============ VOICE PROCESS CONTROL ============
const { spawn } = require('child_process');
let voiceProcess = null;

app.post('/voice/start', (req, res) => {
  if (voiceProcess) return res.json({ ok: true, already: true });
  voiceProcess = spawn('python', ['voice.py'], {
    cwd: __dirname,
    stdio: 'inherit'
  });
  voiceProcess.on('exit', () => { voiceProcess = null; });
  res.json({ ok: true });
});

app.post('/voice/stop', (req, res) => {
  if (voiceProcess) {
    voiceProcess.kill();
    voiceProcess = null;
  }
  res.json({ ok: true });
});

app.get('/voice/running', (req, res) => {
  res.json({ running: !!voiceProcess });
});
app.listen(3001, () => console.log('JARVIS brain online — port 3001'));