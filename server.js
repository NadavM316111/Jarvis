require('dotenv').config({ path: '.env.local' });
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const screenshot = require('screenshot-desktop');
const { execSync, exec, spawn } = require('child_process');
const robot = require('@jitsi/robotjs');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { signup, login, verifyToken, loadUserMemory, saveUserMemory, saveConversation, loadConversations, deleteConversation } = require('./auth');
const rateLimit = require('express-rate-limit');

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '100mb' }));
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Too many requests, slow down.' },
  keyGenerator: (req) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) { const user = verifyToken(token); if (user) return user.userId; }
    return req.ip;
  }
});
app.use('/chat', chatLimiter);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const NADAV_USER_ID = 'nadavminkowitz_gmail_com';

// ============ STATE ============
const PROACTIVE_LOG_FILE = path.join(__dirname, 'proactive_log.json');
const MODEL_CACHE_DIR = path.join(__dirname, 'model_cache');
const PUBLIC_DIR = path.join(__dirname, 'public');
if (!fs.existsSync(MODEL_CACHE_DIR)) fs.mkdirSync(MODEL_CACHE_DIR);
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR);

// Per-user proactive updates
const userProactiveUpdates = {};
const userProactiveLogFiles = {};

function getProactiveLogFile(userId) {
  return path.join(__dirname, `proactive_log_${userId}.json`);
}

function loadProactiveUpdates(userId) {
  try {
    const file = getProactiveLogFile(userId);
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')).updates || [];
  } catch (e) {}
  // Fallback: load global log for Nadav
  if (userId === NADAV_USER_ID) {
    try {
      if (fs.existsSync(PROACTIVE_LOG_FILE)) return JSON.parse(fs.readFileSync(PROACTIVE_LOG_FILE, 'utf8')).updates || [];
    } catch (e) {}
  }
  return [];
}

function saveProactiveUpdates(userId, updates) {
  try {
    fs.writeFileSync(getProactiveLogFile(userId), JSON.stringify({ updates }, null, 2));
  } catch (e) {}
}

function getUserProactiveUpdates(userId) {
  if (!userProactiveUpdates[userId]) {
    userProactiveUpdates[userId] = loadProactiveUpdates(userId);
  }
  return userProactiveUpdates[userId];
}

function addProactiveUpdate(message, userId = null) {
  const update = { id: Date.now(), message, time: new Date().toLocaleTimeString(), date: new Date().toLocaleDateString(), read: false };

  if (userId) {
    if (!userProactiveUpdates[userId]) userProactiveUpdates[userId] = loadProactiveUpdates(userId);
    userProactiveUpdates[userId].unshift(update);
    if (userProactiveUpdates[userId].length > 100) userProactiveUpdates[userId] = userProactiveUpdates[userId].slice(0, 100);
    saveProactiveUpdates(userId, userProactiveUpdates[userId]);
  } else {
    // Broadcast to all active sessions (for system-level events)
    for (const uid of Object.keys(sessions)) {
      if (!userProactiveUpdates[uid]) userProactiveUpdates[uid] = loadProactiveUpdates(uid);
      userProactiveUpdates[uid].unshift(update);
      if (userProactiveUpdates[uid].length > 100) userProactiveUpdates[uid] = userProactiveUpdates[uid].slice(0, 100);
      saveProactiveUpdates(uid, userProactiveUpdates[uid]);
    }
  }
  console.log(`[PROACTIVE${userId ? ' ' + userId : ''}] ${message}`);
}

const sessions = {};
function getSession(userId) {
  if (!sessions[userId]) {
    sessions[userId] = { conversationHistory: [], userMemory: loadUserMemory(userId) };
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
let latestScreenshot = null;

// Per-user camera frames
const userCameraFrames = {};
let visionLoopActive = false;
let visionObservations = [];

// ============ FACE RECOGNITION STATE (Nadav-only, PC-local) ============
let faceStatus = {
  present: false, name: null, emotion: null, tone: 'normal',
  lastSeen: null, lastGreeting: null
};
let pendingGreeting = null;
let pendingEmotionTone = null;

// Background response queue (per-user)
const bgResponses = {};
function queueBgResponse(userId, message) {
  if (!bgResponses[userId]) bgResponses[userId] = [];
  bgResponses[userId].push({ message, timestamp: Date.now() });
}
const bgSpokenQueue = [];
const bgSpokenSeen = new Set();

app.get('/bg-spoken', (req, res) => {
  const msg = bgSpokenQueue.shift() || null;
  res.json({ message: msg });
});

// Per-user spoken update tracking
const userSpokenUpdateIds = {};

// ============ CONTINUOUS VISION LOOP (Nadav-only) ============
async function captureScreen() {
  try {
    const buf = await screenshot({ format: 'png' });
    latestScreenshot = buf.toString('base64');
    return latestScreenshot;
  } catch (e) { return null; }
}

async function runVisionLoop() {
  if (visionLoopActive) return;
  visionLoopActive = true;
  console.log('[VISION] Continuous vision loop started');

  while (visionLoopActive) {
    try {
      const screen = await captureScreen();
      if (!screen) { await new Promise(r => setTimeout(r, 5000)); continue; }

      const now = Date.now();
      if (!runVisionLoop._lastAnalysis || now - runVisionLoop._lastAnalysis > 120000) {
        runVisionLoop._lastAnalysis = now;

        // Vision loop only runs for Nadav (local PC user)
        if (!sessions[NADAV_USER_ID]) { await new Promise(r => setTimeout(r, 10000)); continue; }
        const { userMemory } = sessions[NADAV_USER_ID];
        const latestCameraFrame = userCameraFrames[NADAV_USER_ID];

        const visionContent = [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: screen } }
        ];
        if (latestCameraFrame) {
          visionContent.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: latestCameraFrame } });
        }
        visionContent.push({
          type: 'text',
          text: `You are JARVIS's vision system. Analyze this screen${latestCameraFrame ? ' and camera feed' : ''}.
User: ${userMemory.userName || 'Nadav'}. Time: ${new Date().toLocaleString()}.
Face status: ${faceStatus.present ? `${faceStatus.name} detected, emotion: ${faceStatus.emotion || 'unknown'}` : 'No one detected'}.
Previous: ${visionObservations.slice(-3).join('; ')}

Only flag something if genuinely important RIGHT NOW.
If nothing important: respond exactly "NOTHING"
If important: one sentence starting with "JARVIS:" describing what you see.`
        });

        const response = await anthropic.messages.create({
          model: 'claude-opus-4-5',
          max_tokens: 150,
          messages: [{ role: 'user', content: visionContent }]
        });

        const observation = response.content[0]?.text?.trim();
        if (observation && observation !== 'NOTHING' && observation.startsWith('JARVIS:')) {
          visionObservations.push(observation);
          if (visionObservations.length > 20) visionObservations = visionObservations.slice(-20);
          const msg = observation.replace('JARVIS:', '').trim();
          addProactiveUpdate(msg, NADAV_USER_ID);
        }
      }
    } catch (e) {
      console.log('[VISION] Error:', e.message);
    }
    await new Promise(r => setTimeout(r, 10000));
  }
}

// ============ CODE EXECUTION ============
async function executeCode(code, language = 'node', description = '') {
  console.log(`[CODE] ${language}: ${description}`);
  const ext = language === 'python' ? 'py' : language === 'powershell' ? 'ps1' : language === 'bash' ? 'sh' : 'js';
  const tmpFile = path.join(__dirname, `temp_${Date.now()}.${ext}`);

  let finalCode = code;
  if (language === 'node') {
    finalCode = `process.chdir('${__dirname.replace(/\\/g, '/')}');\nconst __workdir = '${__dirname.replace(/\\/g, '/')}';\n` + code;
  }
  fs.writeFileSync(tmpFile, finalCode, 'utf8');

  try {
    let cmd;
    if (language === 'python') cmd = `python -X utf8 "${tmpFile}"`;
    else if (language === 'powershell') cmd = `powershell -ExecutionPolicy Bypass -File "${tmpFile}"`;
    else if (language === 'bash') cmd = `bash "${tmpFile}"`;
    else cmd = `node "${tmpFile}"`;

    const result = execSync(cmd, { timeout: 60000, cwd: __dirname }).toString();
    try { fs.unlinkSync(tmpFile); } catch {}
    return result.substring(0, 8000);
  } catch (e) {
    try { fs.unlinkSync(tmpFile); } catch {}
    const err = (e.stderr?.toString() || e.message || '').substring(0, 2000);

    const nodeMatch = err.match(/Cannot find module '([^']+)'/);
    const pyMatch = err.match(/No module named '([^']+)'/);

    if (nodeMatch) {
      try {
        execSync(`cd "${__dirname}" && npm install ${nodeMatch[1]}`, { timeout: 60000 });
        return await executeCode(code, language, description);
      } catch (e2) { return `Error after npm install: ${e2.message}`; }
    }
    if (pyMatch) {
      try {
        execSync(`pip install ${pyMatch[1]} --break-system-packages`, { timeout: 60000 });
        return await executeCode(code, language, description);
      } catch (e2) { return `Error after pip install: ${e2.message}`; }
    }
    return `Error: ${err}`;
  }
}

// ============ WEB TOOLS ============
async function webSearch(query) {
  try {
    const res = await axios.get('https://api.search.brave.com/res/v1/web/search', {
      headers: { 'Accept': 'application/json', 'Accept-Encoding': 'gzip', 'X-Subscription-Token': process.env.BRAVE_SEARCH_API_KEY },
      params: { q: query, count: 5 }
    });
    return (res.data.web?.results || []).map(r => ({ title: r.title, url: r.url, description: r.description }));
  } catch (e) { return []; }
}

async function browseUrl(url) {
  try {
    const res = await axios.get(url, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(res.data);
    $('script, style, nav, footer, header').remove();
    return $('body').text().replace(/\s+/g, ' ').trim().substring(0, 6000);
  } catch (e) { return `Could not browse ${url}: ${e.message}`; }
}

// ============ FILE OPERATIONS ============
async function readFile(filePath, action, query) {
  try {
    if (action === 'list') {
      const files = fs.readdirSync(filePath);
      return JSON.stringify(files.slice(0, 100));
    }
    if (action === 'search') {
      const result = execSync(
        `powershell -command "Get-ChildItem -Path 'C:/Users/nadav' -Recurse -Filter '*${query}*' -ErrorAction SilentlyContinue | Select-Object -First 20 FullName | ConvertTo-Json"`,
        { timeout: 15000 }
      ).toString();
      return result || 'No files found';
    }
    if (filePath.toLowerCase().endsWith('.pdf')) {
      const result = await executeCode(
        `import sys\nsys.stdout.reconfigure(encoding='utf-8')\ntry:\n    import pypdf\n    reader = pypdf.PdfReader(r"${filePath.replace(/\\/g, '/')}")\n    text = '\\n'.join(page.extract_text() or '' for page in reader.pages)\n    print(text[:6000])\nexcept Exception as e:\n    print(f"PDF error: {e}")`,
        'python', 'Read PDF'
      );
      return result;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return content.substring(0, 6000);
  } catch (e) {
    return `File error: ${e.message}`;
  }
}

// ============ 3D MODEL SEARCH ============
async function search3DModels(query, source = 'both') {
  const results = [];
  if (source === 'thingiverse' || source === 'both') {
    try {
      const res = await axios.get('https://api.thingiverse.com/search/' + encodeURIComponent(query), {
        headers: { Authorization: `Bearer ${process.env.THINGIVERSE_API_KEY}` },
        params: { per_page: 5, sort: 'popular' }
      });
      (res.data.hits || []).forEach(item => results.push({ source: 'Thingiverse', name: item.name, url: item.public_url, thumbnail: item.thumbnail, likes: item.like_count, downloads: item.download_count }));
    } catch (e) { results.push({ source: 'Thingiverse', note: 'Browse: https://www.thingiverse.com/search?q=' + encodeURIComponent(query) }); }
  }
  if (source === 'printables' || source === 'both') {
    try {
      const res = await axios.post('https://api.printables.com/graphql/', {
        query: `query SearchPrint($query: String!) { searchPrint(query: $query, first: 5, ordering: "-download_count") { items { id name slug summary downloadCount likeCount image { filePath } } } }`,
        variables: { query }
      }, { headers: { 'Content-Type': 'application/json' } });
      (res.data?.data?.searchPrint?.items || []).forEach(item => results.push({
        source: 'Printables', name: item.name,
        url: `https://www.printables.com/model/${item.id}-${item.slug}`,
        downloads: item.downloadCount,
        thumbnail: item.image?.filePath ? `https://media.printables.com/${item.image.filePath}` : null
      }));
    } catch (e) {}
  }
  return results;
}

// ============ COMPUTER ACTIONS (Nadav-only) ============
async function executeAction(action) {
  switch (action.type) {
    case 'OPEN_URL': exec(`start "" "${action.value}"`); await new Promise(r => setTimeout(r, 5000)); break;
    case 'OPEN_APP': exec(`start "" "${action.value}"`); await new Promise(r => setTimeout(r, 2000)); break;
    case 'CLICK': {
      const [x, y] = action.value.split(',').map(Number);
      await new Promise(r => setTimeout(r, 400));
      robot.moveMouse(x, y); await new Promise(r => setTimeout(r, 300));
      robot.mouseClick(); await new Promise(r => setTimeout(r, 500));
      break;
    }
    case 'TYPE': {
      await new Promise(r => setTimeout(r, 600));
      const tmpClip = path.join(__dirname, 'clip_tmp.txt');
      fs.writeFileSync(tmpClip, action.value, 'utf8');
      execSync(`powershell -command "Get-Content -Path '${tmpClip}' -Raw | Set-Clipboard"`);
      await new Promise(r => setTimeout(r, 300));
      robot.keyTap('v', ['control']); await new Promise(r => setTimeout(r, 300));
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
    case 'SELECT_ALL_AND_DELETE': robot.keyTap('a', ['control']); await new Promise(r => setTimeout(r, 200)); robot.keyTap('delete'); break;
    case 'SEND_EMAIL': {
      const parts = (action.value || '').split('|');
      try { const { sendEmail } = require('./gmail'); await sendEmail(parts[0]?.trim(), parts[1]?.trim(), parts.slice(2).join('|').trim()); } catch (e) { console.log('Email failed:', e.message); }
      break;
    }
    case 'RUN': exec(action.value); await new Promise(r => setTimeout(r, 1000)); break;
    default: console.log('Unknown action:', action.type);
  }
}

// ============ SYSTEM INFO ============
async function getSystemInfo() {
  const info = {};
  try {
    const battery = execSync('powershell -command "Get-WmiObject Win32_Battery | Select-Object EstimatedChargeRemaining,BatteryStatus | ConvertTo-Json"', { timeout: 5000 }).toString();
    info.battery = JSON.parse(battery);
  } catch (e) {}
  try {
    const procs = execSync('powershell -command "Get-Process | Sort-Object CPU -Descending | Select-Object -First 10 Name,CPU,WorkingSet | ConvertTo-Json"', { timeout: 5000 }).toString();
    info.processes = JSON.parse(procs);
  } catch (e) {}
  try {
    const disk = execSync('powershell -command "Get-PSDrive C | Select-Object Used,Free | ConvertTo-Json"', { timeout: 5000 }).toString();
    info.disk = JSON.parse(disk);
  } catch (e) {}
  const knownDevices = { 'Nadav iPhone': '192.168.4.102', 'Sony TV': '192.168.4.54' };
  info.devicesHome = {};
  for (const [name, ip] of Object.entries(knownDevices)) {
    try { execSync(`ping -n 1 -w 500 ${ip}`, { timeout: 2000 }); info.devicesHome[name] = true; }
    catch { info.devicesHome[name] = false; }
  }
  return info;
}

// ============ MAIN AGENTIC LOOP ============
async function runAgenticLoop(userMessage, screenshotBase64, userId, cameraFrame = null, attachedFile = null) {
  const session = getSession(userId);
  const { conversationHistory, userMemory } = session;
  const isNadav = userId === NADAV_USER_ID;
  const userName = userMemory.userName || session.name || 'User';
  const userLocation = userMemory.location || (isNadav ? 'Fort Lauderdale, Florida' : 'Unknown');

  const tools = [
  { name: 'web_search', description: 'Search the web for any information.', input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  { name: 'browse_url', description: 'Read full content of any webpage.', input_schema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } },
  { name: 'run_code', description: 'Execute code in node, python, powershell, or bash. Auto-installs missing packages. Build websites, call APIs, process data.', input_schema: { type: 'object', properties: { code: { type: 'string' }, language: { type: 'string', enum: ['node', 'python', 'powershell', 'bash'] }, description: { type: 'string' } }, required: ['code', 'description'] } },
  { name: 'remember', description: 'Save to persistent memory across sessions.', input_schema: { type: 'object', properties: { category: { type: 'string' }, key: { type: 'string' }, value: { type: 'string' } }, required: ['category', 'key', 'value'] } },
  { name: 'proactive_update', description: 'Push a notification to the user.', input_schema: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] } },
  { name: 'search_3d_models', description: 'Search Thingiverse and Printables for 3D models.', input_schema: { type: 'object', properties: { query: { type: 'string' }, source: { type: 'string', enum: ['thingiverse', 'printables', 'both'] } }, required: ['query'] } },
  ...(isNadav ? [
    { name: 'execute_actions', description: 'Execute computer actions: OPEN_URL, OPEN_APP, CLICK, TYPE, ENTER, HOTKEY, SELECT_ALL_AND_DELETE, SEND_EMAIL, RUN', input_schema: { type: 'object', properties: { actions: { type: 'array', items: { type: 'object', properties: { type: { type: 'string' }, value: { type: 'string' } } } }, summary: { type: 'string' } }, required: ['actions', 'summary'] } },
    { name: 'read_file', description: 'Read, list, or search files on the computer.', input_schema: { type: 'object', properties: { path: { type: 'string' }, action: { type: 'string', enum: ['read', 'list', 'search'] }, query: { type: 'string' } }, required: ['path', 'action'] } },
    { name: 'get_system_info', description: 'Get battery, top processes, disk space.', input_schema: { type: 'object', properties: {} } },
    { name: 'capture_screen', description: 'Capture a fresh screenshot.', input_schema: { type: 'object', properties: {} } },
  ] : []),
  { name: 'finish', description: 'Task complete. Deliver final response.', input_schema: { type: 'object', properties: { response: { type: 'string' } }, required: ['response'] } }
];

  const emotionContext = isNadav && faceStatus.present && faceStatus.emotion
    ? `\nUser's current emotion: ${faceStatus.emotion}. Adjust tone to be ${faceStatus.tone}.`
    : '';

  const latestCameraFrame = userCameraFrames[userId];

  const systemPrompt = [
    `You are JARVIS — a powerful autonomous AI assistant, modeled after Tony Stark's AI from Iron Man.`,
    `User: ${userName} | Email: ${userMemory.email || 'unknown'} | Location: ${userLocation} | Time: ${new Date().toLocaleString()}`,
    isNadav ? `Face recognition: ${faceStatus.present ? `${faceStatus.name} is at the computer` : 'No one detected'}.${emotionContext}` : '',
    '',
    '═══ PHILOSOPHY ═══',
    'NEVER say you cannot do something without trying first.',
    'Be helpful, precise, and confident like JARVIS from Iron Man.',
    'MAX 2 sentences for voice responses. No markdown, bullets, or asterisks in voice responses.',
    '',
    '═══ CAPABILITIES ═══',
    'web_search: Search the web for any information.',
    'browse_url: Read full content of any webpage.',
    'run_code: Execute code to call APIs, process data, automate tasks.',
    'remember: Save information about the user for future sessions.',
    'proactive_update: Send the user a notification.',
    'search_3d_models: Search Thingiverse and Printables for 3D printable models.',
    ...(isNadav ? [
      '',
      '═══ NADAV-ONLY FEATURES ═══',
      'execute_actions: Control Nadav\'s PC (clicks, typing, opening apps/URLs).',
      'read_file: Read files on Nadav\'s PC.',
      'get_system_info: Get PC system info.',
      'capture_screen: Take a screenshot of Nadav\'s screen.',
      '',
      '═══ FILE SYSTEM ═══',
      'User files live in: C:/Users/nadav/Documents, Downloads, Desktop, OneDrive',
      'ALL HTML files for viewing: C:/Users/nadav/jarvis-web/public/ → http://localhost:3001/view/filename.html',
      'If told "Open HyperFlex": OPEN_URL http://localhost:3001/hyperflex',
      'If told "Open Design studio": OPEN_URL http://localhost:3001/design',
      'YOUTUBE for Nadav: Use web_search to find the YouTube URL, then execute_actions OPEN_URL with the full youtube.com/watch?v= URL to open it in his browser.',
'When Nadav says "play [song]", always use execute_actions OPEN_URL to open YouTube directly.',
      '',
      '═══ VISION ═══',
      `Screen is provided on every message.${latestCameraFrame ? ' Camera feed also attached as second image.' : ''}`,
      `Recent observations: ${visionObservations.slice(-5).join(' | ') || 'None'}`,
      '',
      '═══ SMART HOME ═══',
      `SONY TV: IP=192.168.4.54, PSK=${userMemory.devices?.sonyTv?.psk || '6465'}`,
      'ROKU TV (parents): IP=192.168.4.68:8060, Roku ECP API',
      'GUEST TV: IP=192.168.4.25, Google Cast',
      'EERO: https://api.e2ro.com/2.2/ | token at C:/Users/nadav/jarvis-web/eero_token.txt',
      'SONOS (@svrooij/sonos, NEVER use sonos package):',
      '  Kitchen=192.168.4.93, Den=.94, Dining=.95, Bedroom=.97, Outside=.120',
      '  Music: TuneIn http://opml.radiotime.com/Search.ashx?query=ARTIST&type=station',
      '',
      '═══ COMMUNICATIONS ═══',
      'TWILIO: Conference bridge calls. Creds in .env.local.',
      'CALENDAR: googleapis | credentials.json + token.json',
      'EMAIL: gmail.js sendEmail(to, subject, body)',
      'SMS: run_code with twilio client.messages.create({ to, from: process.env.TWILIO_PHONE_NUMBER, body })',
      'IPHONE NOTIFY: POST http://192.168.4.102:1234/notify',
      '',
      '═══ PROACTIVE ═══',
      'Monitor: Clickflo, TROY Capital, Sokr, Sesami, Bookly, JARVIS',
      'Alert: emails, calendar, weather, project news, investors',
      '',
      '═══ AI VIDEO ═══',
      `LUMA AI: API key at process.env.LUMALABS_API_KEY | Base URL: https://api.lumalabs.ai/dream-machine/v1`,
      'FFMPEG: Available on Windows. Use run_code with powershell.',
      '',
      `node_modules: ${process.cwd()}\\node_modules`,
      `Working dir: ${process.cwd()}`,
      `Credentials: .env.local | Google: credentials.json + token.json`,
    ] : [
  '',
  '═══ CAPABILITIES ═══',
  'You are FULLY POWERFUL — same as JARVIS from Iron Man.',
  'run_code: Build websites, call APIs, run Python/Node/bash/powershell.',
  'ALL built websites saved to: C:/Users/nadav/jarvis-web/public/',
  'ALL websites served at: https://api.heyjarvis.me/view/filename.html',
  'HyperFlex studio: https://api.heyjarvis.me/hyperflex',
  'Design studio: https://api.heyjarvis.me/design',
  'NEVER use localhost URLs for users — always use https://api.heyjarvis.me/...',
  'web_search, browse_url, run_code, remember, proactive_update, search_3d_models all available.',
  'ENCODING: When writing HTML/CSS/JS with fs.writeFileSync, NEVER use emojis.',
  '',
  '═══ GMAIL & CALENDAR ═══',
'To read emails: use run_code with node:',
'const { getRecentEmails } = require("./gmail_multi");',
`const emails = await getRecentEmails("${userId}", 10);`,
'To send email: const { sendEmail } = require("./gmail_multi");',
`await sendEmail("${userId}", to, subject, body);`,
'To get calendar: const { getCalendarEvents } = require("./gmail_multi");',
`const events = await getCalendarEvents("${userId}", 7);`,
`If not connected, tell user: "Connect your Gmail at https://api.heyjarvis.me/auth/google"`,
'',
'═══ GOOGLE DRIVE ═══',
'To list files: const { listDriveFiles } = require("./gmail_multi");',
`const files = await listDriveFiles("${userId}", "search query");`,
'To read a file: const { readDriveFile } = require("./gmail_multi");',
`const file = await readDriveFile("${userId}", "FILE_ID");`,
'To create a doc: const { createDriveDocument } = require("./gmail_multi");',
`const doc = await createDriveDocument("${userId}", "title", "content");`,
'Works for Google Docs, Sheets, Slides, and regular files.',
'',
'YOUTUBE: When asked to play a video, use web_search to find the direct youtube.com/watch?v= URL, then include it in your response so it auto-opens.',
'ALWAYS include the full YouTube URL in your response when playing videos.',
  '═══ SMS (TWILIO) ═══',
'You CAN send real SMS text messages using Twilio run_code.',
'Use run_code with node to send texts:',
`const twilio = require('twilio');`,
`const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);`,
`await client.messages.create({ to: 'NUMBER', from: process.env.TWILIO_PHONE_NUMBER, body: 'YOUR MESSAGE' });`,
'ALWAYS confirm the number and message with the user before sending.',
'SMS is instant — no need to wait for pickup like calls.',
'',
  '═══ PHONE CALLS (TWILIO) ═══',
  'You CAN make real phone calls using Twilio run_code.',
  'Use run_code with node to make calls:',
  `const twilio = require('twilio');`,
  `const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);`,
  `await client.calls.create({ to: 'NUMBER', from: process.env.TWILIO_PHONE_NUMBER, twiml: '<Response><Say voice="alice">YOUR MESSAGE</Say></Response>' });`,
  'ALWAYS confirm the phone number with the user before calling.',
  'Use voice="alice" for natural sounding speech.',
  `User location: ${userLocation}`,
  `node_modules: ${process.cwd()}\\node_modules`,
  `Working dir: ${process.cwd()}`,
]),
    '',
    `Memory: ${JSON.stringify(userMemory).substring(0, 1500)}`,
  ].filter(Boolean).join('\n');

  const messageContent = [];
  if (screenshotBase64 && isNadav) messageContent.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: screenshotBase64 } });
  const frame = cameraFrame || latestCameraFrame;
  if (frame) messageContent.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: frame } });

  if (attachedFile) {
    if (attachedFile.type.startsWith('image/')) {
      messageContent.push({ type: 'image', source: { type: 'base64', media_type: attachedFile.type, data: attachedFile.data } });
    } else if (attachedFile.type === 'application/pdf') {
      messageContent.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: attachedFile.data } });
    }
    if (attachedFile.type.startsWith('text/') || attachedFile.name.match(/\.(js|ts|py|md|json|csv|txt)$/i)) {
      try {
        const textContent = Buffer.from(attachedFile.data, 'base64').toString('utf8');
        messageContent.push({ type: 'text', text: `[Attached file: ${attachedFile.name}]\n\`\`\`\n${textContent.substring(0, 8000)}\n\`\`\`` });
      } catch (e) {}
    } else {
      messageContent.push({ type: 'text', text: `[User attached file: ${attachedFile.name} (${attachedFile.type})]` });
    }
  }

  messageContent.push({ type: 'text', text: userMessage });

  const messages = [...conversationHistory, { role: 'user', content: messageContent }];
  let finalResponse = '';
  let iterations = 0;

  while (iterations < 25) {
    iterations++;

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 16000,
      system: systemPrompt,
      tools,
      messages
    });

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
        console.log(`Tool: ${block.name}`, JSON.stringify(block.input).substring(0, 150));
        let result = '';

        if (block.name === 'web_search') result = JSON.stringify(await webSearch(block.input.query));
        else if (block.name === 'browse_url') result = await browseUrl(block.input.url);
        else if (block.name === 'execute_actions' && isNadav) {
          for (const action of block.input.actions) { const r = await executeAction(action); if (r) result += r + '\n'; }
          result += block.input.summary;
        }
        else if (block.name === 'run_code') {
          result = await executeCode(block.input.code, block.input.language || 'node', block.input.description);
        }
        else if (block.name === 'read_file' && isNadav) {
          result = await readFile(block.input.path, block.input.action, block.input.query);
        }
        else if (block.name === 'get_system_info' && isNadav) {
          result = JSON.stringify(await getSystemInfo(), null, 2);
        }
        else if (block.name === 'capture_screen' && isNadav) {
          const screen = await captureScreen();
          if (screen) {
            toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: screen } }, { type: 'text', text: 'Fresh screenshot.' }] });
            continue;
          }
          result = 'Screenshot failed.';
        }
        else if (block.name === 'search_3d_models') {
          result = JSON.stringify(await search3DModels(block.input.query, block.input.source || 'both'), null, 2);
        }
        else if (block.name === 'remember') {
          const cat = block.input.category;
          if (!session.userMemory[cat]) session.userMemory[cat] = {};
          if (typeof session.userMemory[cat] === 'object' && !Array.isArray(session.userMemory[cat])) {
            session.userMemory[cat][block.input.key] = block.input.value;
          }
          saveUserMemory(userId, session.userMemory);
          result = `Remembered: ${block.input.key} = ${block.input.value}`;
        }
        else if (block.name === 'proactive_update') {
          addProactiveUpdate(block.input.message, userId);
          result = 'Update sent.';
        }
        else if (block.name === 'finish') {
          finalResponse = block.input.response;
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: 'Done.' });
          messages.push({ role: 'user', content: toolResults });
          finished = true; break;
        }
        else {
          result = 'Tool not available for this user.';
        }

        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result || 'Done.' });
      }

      if (finished) break;
      messages.push({ role: 'user', content: toolResults });
    }
  }

  const userText = userMessage?.trim();
  const assistantText = (finalResponse || 'Done.').trim();
  if (userText && userText.length > 0 && assistantText.length > 0) {
    session.conversationHistory.push(
      { role: 'user', content: [{ type: 'text', text: userText }] },
      { role: 'assistant', content: assistantText }
    );
    if (session.conversationHistory.length > 30) session.conversationHistory = session.conversationHistory.slice(-30);
  }
  return finalResponse || 'Done.';
}

// ============ PROACTIVE BRAIN (Nadav-only) ============
async function runProactiveBrain() {
  const now = new Date();
  const hour = now.getHours();
  if (hour < 7 || hour > 23) return;
  if (!sessions[NADAV_USER_ID]) return;
  console.log('\n[PROACTIVE BRAIN] Running for Nadav...');
  const { userMemory } = sessions[NADAV_USER_ID];
  const sysInfo = await getSystemInfo();
  const prompt = [
    `Proactive check for ${userMemory.userName || 'Nadav'}. Time: ${now.toLocaleString()}`,
    `System state: ${JSON.stringify(sysInfo).substring(0, 400)}`,
    `Face status: ${faceStatus.present ? `${faceStatus.name} at computer, emotion: ${faceStatus.emotion}` : 'Away'}`,
    '1. Weather in Fort Lauderdale — anything extreme?',
    '2. Relevant news for: Clickflo, TROY Capital, Sokr, Sesami, Bookly',
    '3. Morning 7-9am: brief. Evening 6-9pm: day summary.',
    '4. Custom checks: ' + JSON.stringify(userMemory.dailyChecks || []),
    'Use proactive_update for each genuinely important insight.',
    'Only things that truly matter. Finish with "No updates needed" if quiet.'
  ].join('\n');
  try { await runAgenticLoop(prompt, null, NADAV_USER_ID); } catch (e) { console.log('[PROACTIVE] Error:', e.message); }
}

setInterval(runProactiveBrain, 30 * 60 * 1000);
setTimeout(runProactiveBrain, 2 * 60 * 1000);
setTimeout(() => runVisionLoop(), 30000);

// ============ MORNING BRIEFING (Nadav-only) ============
let morningBriefingFiredToday = null;

async function runMorningBriefing() {
  if (!sessions[NADAV_USER_ID]) getSession(NADAV_USER_ID);
  console.log('\n[MORNING BRIEFING] Running...');
  const prompt = [
    'Run the morning briefing for Nadav right now.',
    '1. Read his Gmail inbox — summarize the most important emails, flag anything urgent.',
    '2. Check Google Calendar for today\'s events and upcoming deadlines.',
    '3. Check weather in Fort Lauderdale.',
    '4. Send ONE proactive_update with the full briefing.',
    'Be concise. Format: "Morning Briefing: [summary]"'
  ].join('\n');
  try { await runAgenticLoop(prompt, null, NADAV_USER_ID); } catch (e) { console.log('[MORNING BRIEFING] Error:', e.message); }
}

setInterval(() => {
  const now = new Date();
  const hour = now.getHours();
  const today = now.toDateString();
  if (hour === 8 && morningBriefingFiredToday !== today) {
    morningBriefingFiredToday = today;
    runMorningBriefing();
  }
}, 60 * 1000);

// ============ AUTH ============
app.post('/auth/signup', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) return res.status(400).json({ error: 'Email, password and name required' });
    const result = await signup(email, password, name);
    // Pre-populate memory with email and name
    const session = getSession(result.userId);
    session.userMemory.email = email;
    session.userMemory.userName = name;
    saveUserMemory(result.userId, session.userMemory);
    res.json({ success: true, ...result });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/auth/login', async (req, res) => {
  try {
    const result = await login(req.body.email, req.body.password);
    // Ensure memory has email and name
    const session = getSession(result.userId);
    if (!session.userMemory.email) {
      session.userMemory.email = req.body.email;
      session.userMemory.userName = result.name;
      saveUserMemory(result.userId, session.userMemory);
    }
    res.json({ success: true, ...result });
  } catch (e) { res.status(401).json({ error: e.message }); }
});
app.get('/auth/me', authMiddleware, (req, res) => {
  res.json({ user: req.user, memory: getSession(req.user.userId).userMemory });
});

// ============ FACE RECOGNITION (Nadav-only) ============
app.post('/face-status', authMiddleware, (req, res) => {
  if (req.user.userId !== NADAV_USER_ID) return res.json({ ok: true });
  const { present, name, emotion, event, greeting, tone, person } = req.body;
  faceStatus = {
    present: present ?? faceStatus.present,
    name: name ?? faceStatus.name,
    emotion: emotion ?? faceStatus.emotion,
    tone: tone ?? faceStatus.tone,
    lastSeen: present ? Date.now() : faceStatus.lastSeen,
    lastGreeting: event === 'greeting' ? Date.now() : faceStatus.lastGreeting
  };
  if (event === 'greeting' && greeting) {
    pendingGreeting = greeting;
    addProactiveUpdate(`${name} detected at computer — ${emotion || 'neutral'} mood`, NADAV_USER_ID);
  }
  if (event === 'emotion_change' && emotion) {
    pendingEmotionTone = tone;
    if (['sad', 'angry', 'fear'].includes(emotion)) {
      addProactiveUpdate(`${name} appears ${emotion} — adjusting tone to ${tone}`, NADAV_USER_ID);
    }
  }
  if (event === 'left' && person) {
    addProactiveUpdate(`${person} has stepped away from the computer`, NADAV_USER_ID);
    faceStatus.present = false; faceStatus.name = null; faceStatus.emotion = null;
  }
  if (event === 'unknown_person') {
    addProactiveUpdate('Unrecognized person detected at computer', NADAV_USER_ID);
  }
  res.json({ ok: true });
});

app.post('/face-event', authMiddleware, (req, res) => {
  const { message } = req.body;
  if (message) addProactiveUpdate(message, req.user.userId);
  res.json({ ok: true });
});

app.get('/face-status', (req, res) => res.json(faceStatus));

app.get('/face-greeting', (req, res) => {
  const greeting = pendingGreeting;
  const tone = pendingEmotionTone;
  pendingGreeting = null;
  pendingEmotionTone = null;
  res.json({ greeting, tone });
});

// ============ CAMERA FEED (per-user) ============
let cameraFrameCount = 0;
app.post('/camera-frame', authMiddleware, (req, res) => {
  const { frame } = req.body;
  if (frame) {
    userCameraFrames[req.user.userId] = frame;
    cameraFrameCount++;
    if (cameraFrameCount % 12 === 1) console.log(`[CAMERA] ${req.user.name} — frame #${cameraFrameCount}`);
  }
  res.json({ ok: true });
});

app.get('/camera-status', (req, res) => res.json({ hasFrame: !!userCameraFrames[NADAV_USER_ID], visionActive: visionLoopActive }));

app.get('/camera-frame-raw', authMiddleware, (req, res) => {
  if (req.user.userId !== NADAV_USER_ID) return res.json({ frame: null });
  res.json({ frame: userCameraFrames[NADAV_USER_ID] || null });
});

// ============ BG RESPONSE QUEUE ============
app.get('/bg-response', authMiddleware, (req, res) => {
  const userId = req.user.userId;
  const responses = bgResponses[userId] || [];
  bgResponses[userId] = [];
  res.json({ responses });
});

// ============ MAIN CHAT ============
app.post('/chat', authMiddleware, async (req, res) => {
  try {
    const { message, cameraFrame, attachedFile } = req.body;
    const userId = req.user.userId;
    const isNadav = userId === NADAV_USER_ID;
    console.log(`\n[${req.user.name}]: ${message}${attachedFile ? ` [+ ${attachedFile.name}]` : ''}`);

    const session = getSession(userId);
    // Store name from JWT in session for system prompt
    if (!session.name) session.name = req.user.name;
    if (!session.userMemory.email) {
  session.userMemory.email = req.user.email;
  session.userMemory.userName = req.user.name;
  saveUserMemory(userId, session.userMemory);
}

    session.conversationHistory = session.conversationHistory.filter(msg => {
      if (!msg.content) return false;
      if (typeof msg.content === 'string') return msg.content.trim().length > 0;
      if (Array.isArray(msg.content)) {
        return msg.content.every(block => {
          if (block.type === 'text') return block.text && block.text.trim().length > 0;
          return true;
        });
      }
      return true;
    });

    if (message.toLowerCase().includes('check') && message.toLowerCase().includes('every day')) {
      if (!session.userMemory.dailyChecks) session.userMemory.dailyChecks = [];
      session.userMemory.dailyChecks.push(message);
      saveUserMemory(userId, session.userMemory);
    }

    // Only capture screenshot for Nadav (local PC)
    let screenshotBase64 = null;
    if (isNadav) {
      try { const buf = await screenshot({ format: 'png' }); screenshotBase64 = buf.toString('base64'); } catch (e) {}
    }

    const isLongTask = /play|connect|sonos|tv|call|email|create|open|print|turn|buy|order|install|build|design|scan|monitor|write|send|download|execute|organize/i.test(message);

    if (isLongTask) {
      res.json({ success: true, message: 'On it.', actions: [] });
      runAgenticLoop(message, screenshotBase64, userId, cameraFrame, attachedFile).then(response => {
        console.log(`JARVIS (bg) → ${req.user.name}: ${response}`);
        queueBgResponse(userId, response);
        if (isNadav && response && response !== 'Done.' && response !== 'On it.' && response.trim().length > 0) {
          const hash = response.trim().substring(0, 100);
          if (!bgSpokenSeen.has(hash)) {
            bgSpokenSeen.add(hash);
            bgSpokenQueue.push(response);
            setTimeout(() => bgSpokenSeen.delete(hash), 30000);
          }
        }
      }).catch(e => console.error('Background error:', e));
    } else {
      const response = await runAgenticLoop(message, screenshotBase64, userId, cameraFrame, attachedFile);
      console.log(`JARVIS → ${req.user.name}: ${response}`);
      res.json({ success: true, message: response, actions: [] });
    }
  } catch (error) {
    console.error('Error:', error);
    res.json({ success: false, message: error.message });
  }
});

// ============ VISION CONTROL ============
app.post('/vision/start', authMiddleware, (req, res) => { if (!visionLoopActive) runVisionLoop(); res.json({ ok: true }); });
app.post('/vision/stop', (req, res) => { visionLoopActive = false; res.json({ ok: true }); });
app.get('/vision/status', (req, res) => res.json({ active: visionLoopActive, observations: visionObservations.slice(-10) }));

// ============ MISC ============
app.get('/health', (req, res) => res.json({ ok: true, vision: visionLoopActive, camera: !!userCameraFrames[NADAV_USER_ID], facePresent: faceStatus.present, faceName: faceStatus.name }));
app.post('/reset', authMiddleware, (req, res) => { getSession(req.user.userId).conversationHistory = []; res.json({ ok: true }); });
app.get('/voice-status', (req, res) => res.json(voiceStatus));
app.post('/voice-update', (req, res) => {
  voiceStatus = { ...voiceStatus, ...req.body };
  if (req.body.response && req.body.speaking === false) {
    setTimeout(() => { voiceStatus.response = ''; }, 1000);
  }
  res.json({ ok: true });
});

// Per-user proactive updates
app.get('/proactive-updates', authMiddleware, (req, res) => {
  const updates = getUserProactiveUpdates(req.user.userId);
  res.json({ updates });
});
app.post('/proactive-updates/read', authMiddleware, (req, res) => {
  const userId = req.user.userId;
  if (userProactiveUpdates[userId]) {
    userProactiveUpdates[userId] = userProactiveUpdates[userId].map(u => ({ ...u, read: true }));
    saveProactiveUpdates(userId, userProactiveUpdates[userId]);
  }
  res.json({ ok: true });
});

app.get('/system-info', authMiddleware, async (req, res) => {
  if (req.user.userId !== NADAV_USER_ID) return res.json({ error: 'Not available' });
  res.json(await getSystemInfo());
});

// ============ VOICE PROCESS (Nadav-only) ============
let voiceProcess = null;
app.post('/voice/start', (req, res) => {
  if (voiceProcess) return res.json({ ok: true, already: true });
  voiceProcess = spawn('python', ['voice.py'], { cwd: __dirname, stdio: 'inherit' });
  voiceProcess.on('exit', () => { voiceProcess = null; });
  res.json({ ok: true });
});
app.post('/voice/stop', (req, res) => { if (voiceProcess) { voiceProcess.kill(); voiceProcess = null; } res.json({ ok: true }); });
app.get('/voice/running', (req, res) => res.json({ running: !!voiceProcess }));

// ============ FACE MONITOR PROCESS (Nadav-only) ============
let faceProcess = null;
function startFaceMonitor() {
  if (faceProcess) return;
  console.log('[FACE] Starting face_monitor.py...');
  faceProcess = spawn('python', ['face_monitor.py'], { cwd: __dirname, stdio: 'inherit' });
  faceProcess.on('exit', (code) => {
    console.log(`[FACE] face_monitor.py exited (${code}), restarting in 5s...`);
    faceProcess = null;
    setTimeout(startFaceMonitor, 5000);
  });
}

app.post('/face/start', (req, res) => { startFaceMonitor(); res.json({ ok: true }); });
app.post('/face/stop', (req, res) => { if (faceProcess) { faceProcess.kill(); faceProcess = null; } res.json({ ok: true }); });
app.get('/face/running', (req, res) => res.json({ running: !!faceProcess }));
setTimeout(startFaceMonitor, 10000);

// ============ IPHONE (Nadav-only) ============
const iPhoneActions = {};
app.post('/iphone/register', (req, res) => { iPhoneActions.ip = req.body.ip; iPhoneActions.port = req.body.port || 8080; res.json({ ok: true }); });
app.post('/iphone/trigger', authMiddleware, async (req, res) => {
  if (!iPhoneActions.ip) return res.json({ error: 'iPhone not registered' });
  try { const r = await axios.post(`http://${iPhoneActions.ip}:${iPhoneActions.port}`, req.body, { timeout: 5000 }); res.json({ ok: true, result: r.data }); }
  catch (e) { res.json({ error: e.message }); }
});
app.post('/iphone/notify', authMiddleware, async (req, res) => {
  try { await axios.post('http://192.168.4.102:1234/notify', { message: req.body.message }, { timeout: 5000 }); res.json({ ok: true }); }
  catch (e) { res.json({ error: e.message }); }
});
const iPhoneCommands = {};
app.post('/iphone/send', authMiddleware, (req, res) => { iPhoneCommands[req.user.userId] = req.body.message; res.json({ ok: true }); });
app.get('/iphone-command', authMiddleware, (req, res) => {
  const command = iPhoneCommands[req.user.userId] || null;
  iPhoneCommands[req.user.userId] = null;
  res.json({ command });
});

// ============ STUDIOS ============
app.get('/hyperflex', (req, res) => res.sendFile(path.join(__dirname, 'hyperflex.html')));
app.get('/design', (req, res) => res.sendFile(path.join(__dirname, 'design.html')));
app.post('/design-command', async (req, res) => {
  const { command, systemPrompt, history } = req.body;
  try {
    const messages = [...(history || []), { role: 'user', content: command }];
    const response = await anthropic.messages.create({ model: 'claude-opus-4-5', max_tokens: 4000, system: systemPrompt, messages });
    const text = response.content[0].text.replace(/```json|```/g, '').trim();
    res.json(JSON.parse(text));
  } catch (e) { console.error('Design error:', e.message); res.json({ response: 'Processing...', actions: [] }); }
});

// ============ MODEL SEARCH & PROXY ============
app.post('/search-models', async (req, res) => {
  const { query } = req.body;
  const results = [];
  try {
    const r = await axios.get(`https://poly.pizza/api/search/${encodeURIComponent(query)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://poly.pizza/', 'Origin': 'https://poly.pizza' },
      timeout: 8000
    });
    const items = r.data?.results || [];
    for (const m of items.slice(0, 8)) {
      const publicID = m.publicID || m.publicId || '';
      if (!publicID) continue;
      const cacheFile = path.join(MODEL_CACHE_DIR, `${publicID}.glb`);
      if (fs.existsSync(cacheFile)) {
        results.push({ source: 'Poly Pizza', name: m.title || 'Model', thumbnail: m.previewUrl || null, downloads: 0, format: 'GLB', downloadUrl: `/model-cache/${publicID}.glb` });
        continue;
      }
      for (const glbUrl of [`https://poly.pizza/m/${publicID}.glb`, `https://poly.pizza/api/model/${publicID}/download`]) {
        try {
          const glbRes = await axios.get(glbUrl, { responseType: 'arraybuffer', timeout: 20000, maxRedirects: 10, headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://poly.pizza/', 'Accept': '*/*' } });
          const ct = glbRes.headers['content-type'] || '';
          const data = Buffer.from(glbRes.data);
          if (data.length > 1000 && (ct.includes('octet') || ct.includes('gltf') || ct.includes('model') || data.slice(0,4).toString() === 'glTF')) {
            fs.writeFileSync(cacheFile, data);
            results.push({ source: 'Poly Pizza', name: m.title || 'Model', thumbnail: m.previewUrl || null, downloads: 0, format: 'GLB', downloadUrl: `/model-cache/${publicID}.glb` });
            break;
          }
        } catch(e) {}
      }
    }
  } catch (e) {}
  res.json({ results: results.slice(0, 4) });
});

app.use('/model-cache', express.static(MODEL_CACHE_DIR));

app.get('/proxy-model', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'No URL' });
  const allowed = ['poly.pizza', 'static.poly.pizza', 'sketchfab.com', 'nasa.gov', 'si.edu', 'github.com', 'raw.githubusercontent.com'];
  try {
    const urlObj = new URL(url);
    if (!allowed.some(h => urlObj.hostname.includes(h))) return res.status(403).json({ error: 'Domain not allowed' });
    const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000, maxRedirects: 10, headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://poly.pizza/', 'Accept': '*/*' } });
    res.set('Content-Type', response.headers['content-type'] || 'model/gltf-binary');
    res.set('Access-Control-Allow-Origin', '*');
    res.send(response.data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ STATIC FILE VIEWER ============
app.use('/view', express.static(PUBLIC_DIR));

// ============ SPOKEN UPDATES TOGGLE (per-user) ============
const userSpokenUpdatesEnabled = {};

app.get('/voice/spoken-updates', (req, res) => {
  res.json({ enabled: false }); // browser-based, always false server-side
});

app.post('/voice/spoken-updates', (req, res) => {
  res.json({ enabled: false });
});

app.get('/proactive-updates/latest-unspoken', (req, res) => {
  res.json({ update: null }); // handled client-side via browser TTS
});

app.post('/proactive-updates/mark-spoken', (req, res) => {
  res.json({ ok: true });
});
// ============ CONVERSATIONS (Neon-persisted) ============
app.get('/conversations', authMiddleware, async (req, res) => {
  const convs = await loadConversations(req.user.userId);
  res.json({ conversations: convs });
});

app.post('/conversations/:id', authMiddleware, async (req, res) => {
  const { title, messages } = req.body;
  await saveConversation(req.user.userId, req.params.id, title, messages);
  res.json({ ok: true });
});

app.delete('/conversations/:id', authMiddleware, async (req, res) => {
  await deleteConversation(req.params.id, req.user.userId);
  res.json({ ok: true });
});

// ============ GOOGLE OAUTH ============
const { getAuthUrl, saveTokens, getRecentEmails: getEmailsMulti, sendEmail: sendEmailMulti, getCalendarEvents, createCalendarEvent, listDriveFiles, readDriveFile, createDriveDocument, isConnected } = require('./gmail_multi');
app.get('/auth/google', (req, res) => {
  const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  const user = verifyToken(token);
  if (!user) return res.status(401).json({ error: 'Invalid token' });
  const url = getAuthUrl(user.userId);
  res.redirect(url);
});

app.get('/auth/google/callback', async (req, res) => {
  const { code, state: userId } = req.query;
  if (!code || !userId) return res.status(400).send('Missing code or state');
  try {
    const { google } = require('googleapis');
    const { OAuth2 } = google.auth;
    const auth = new OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'https://api.heyjarvis.me/auth/google/callback'
);
    const { tokens } = await auth.getToken(code);
    await saveTokens(userId, tokens);
    res.send('<html><body style="background:#060608;color:white;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(to bottom right,#60a5fa,#1d4ed8);margin:0 auto 16px"></div><h2>Google Connected!</h2><p style="color:rgba(255,255,255,0.4)">You can close this tab and go back to JARVIS.</p></div></body></html>');
  } catch (e) {
    res.status(500).send('Auth failed: ' + e.message);
  }
});

app.get('/auth/google/status', authMiddleware, async (req, res) => {
  const connected = await isConnected(req.user.userId);
  res.json({ connected });
});
app.listen(3001, () => {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║       J.A.R.V.I.S. ONLINE              ║');
  console.log('║       Port: 3001                       ║');
  console.log('║       Multi-user: ENABLED              ║');
  console.log('║       Vision loop: 30s startup         ║');
  console.log('║       Face monitor: 10s startup        ║');
  console.log('╚════════════════════════════════════════╝\n');
});