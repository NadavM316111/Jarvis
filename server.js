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
const { signup, login, verifyToken, loadUserMemory, saveUserMemory } = require('./auth');

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '100mb' }));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ============ STATE ============
const PROACTIVE_LOG_FILE = path.join(__dirname, 'proactive_log.json');
const MODEL_CACHE_DIR = path.join(__dirname, 'model_cache');
const PUBLIC_DIR = path.join(__dirname, 'public');
if (!fs.existsSync(MODEL_CACHE_DIR)) fs.mkdirSync(MODEL_CACHE_DIR);
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR);

function loadProactiveLog() {
  try { if (fs.existsSync(PROACTIVE_LOG_FILE)) return JSON.parse(fs.readFileSync(PROACTIVE_LOG_FILE, 'utf8')); } catch (e) {}
  return { updates: [] };
}
function saveProactiveLog(log) {
  try { fs.writeFileSync(PROACTIVE_LOG_FILE, JSON.stringify(log, null, 2)); } catch (e) {}
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
let proactiveUpdates = loadProactiveLog().updates || [];
let latestScreenshot = null;
let latestCameraFrame = null;
let visionLoopActive = false;
let visionObservations = [];

// ============ FACE RECOGNITION STATE ============
let faceStatus = {
  present: false,
  name: null,
  emotion: null,
  tone: 'normal',
  lastSeen: null,
  lastGreeting: null
};

// Queue greetings to be spoken by voice.py
let pendingGreeting = null;
let pendingEmotionTone = null;

// Background response queue
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
function addProactiveUpdate(message) {
  const update = { id: Date.now(), message, time: new Date().toLocaleTimeString(), date: new Date().toLocaleDateString(), read: false };
  proactiveUpdates.unshift(update);
  if (proactiveUpdates.length > 100) proactiveUpdates = proactiveUpdates.slice(0, 100);
  saveProactiveLog({ updates: proactiveUpdates });
  console.log(`[PROACTIVE] ${message}`);
}

// ============ CONTINUOUS VISION LOOP ============
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

        const activeUsers = Object.keys(sessions);
        if (activeUsers.length === 0) { await new Promise(r => setTimeout(r, 10000)); continue; }

        const userId = activeUsers[0];
        const { userMemory } = sessions[userId];

        const visionContent = [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: screen } }
        ];
        if (latestCameraFrame) {
          visionContent.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: latestCameraFrame } });
        }
        visionContent.push({
          type: 'text',
          text: `You are JARVIS's vision system. Analyze this screen${latestCameraFrame ? ' and camera feed' : ''}.
User: ${userMemory.userName}. Time: ${new Date().toLocaleString()}.
Face status: ${faceStatus.present ? `${faceStatus.name} detected, emotion: ${faceStatus.emotion || 'unknown'}` : 'No one detected'}.
Previous: ${visionObservations.slice(-3).join('; ')}

Only flag something if genuinely important RIGHT NOW:
errors on screen, important emails/messages, upcoming calendar events, security issues,
something the user is struggling with, critical alerts, anomalies.

If nothing important: respond exactly "NOTHING"
If important: one sentence starting with "JARVIS:" describing what you see.
Be VERY selective — only truly important things.`
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
          addProactiveUpdate(msg);
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
        console.log(`[CODE] Auto-installing npm: ${nodeMatch[1]}`);
        execSync(`cd "${__dirname}" && npm install ${nodeMatch[1]}`, { timeout: 60000 });
        return await executeCode(code, language, description);
      } catch (e2) { return `Error after npm install: ${e2.message}`; }
    }
    if (pyMatch) {
      try {
        console.log(`[CODE] Auto-installing pip: ${pyMatch[1]}`);
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

// ============ COMPUTER ACTIONS ============
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

  const tools = [
    { name: 'web_search', description: 'Search the web for any information.', input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
    { name: 'browse_url', description: 'Read full content of any webpage.', input_schema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } },
    { name: 'execute_actions', description: 'Execute computer actions: OPEN_URL, OPEN_APP, CLICK, TYPE, ENTER, HOTKEY, SELECT_ALL_AND_DELETE, SEND_EMAIL, RUN', input_schema: { type: 'object', properties: { actions: { type: 'array', items: { type: 'object', properties: { type: { type: 'string' }, value: { type: 'string' } } } }, summary: { type: 'string' } }, required: ['actions', 'summary'] } },
    {
      name: 'run_code',
      description: 'Execute code in node, python, powershell, or bash. Auto-installs missing packages. Use this to do ANYTHING — call APIs, process data, control hardware, automate tasks.',
      input_schema: { type: 'object', properties: { code: { type: 'string' }, language: { type: 'string', enum: ['node', 'python', 'powershell', 'bash'] }, description: { type: 'string' } }, required: ['code', 'description'] }
    },
    {
      name: 'read_file',
      description: 'Read, list, or search files on the computer.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          action: { type: 'string', enum: ['read', 'list', 'search'] },
          query: { type: 'string' }
        },
        required: ['path', 'action']
      }
    },
    { name: 'get_system_info', description: 'Get battery, top processes, disk space, who is home on network.', input_schema: { type: 'object', properties: {} } },
    { name: 'capture_screen', description: 'Capture a fresh screenshot of the current screen.', input_schema: { type: 'object', properties: {} } },
    { name: 'remember', description: 'Save to persistent memory across sessions.', input_schema: { type: 'object', properties: { category: { type: 'string' }, key: { type: 'string' }, value: { type: 'string' } }, required: ['category', 'key', 'value'] } },
    { name: 'proactive_update', description: 'Push a notification to the user.', input_schema: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] } },
    { name: 'search_3d_models', description: 'Search Thingiverse and Printables for 3D models.', input_schema: { type: 'object', properties: { query: { type: 'string' }, source: { type: 'string', enum: ['thingiverse', 'printables', 'both'] } }, required: ['query'] } },
    { name: 'finish', description: 'Task complete. Deliver final response.', input_schema: { type: 'object', properties: { response: { type: 'string' } }, required: ['response'] } }
  ];

  // Build emotion-aware tone instruction
  const emotionContext = faceStatus.present && faceStatus.emotion
    ? `\nUser's current emotion: ${faceStatus.emotion}. Adjust tone to be ${faceStatus.tone}.`
    : '';

  const systemPrompt = [
    `You are JARVIS — the world's most powerful autonomous AI, modeled after Tony Stark's AI from Iron Man.`,
    `User: ${userMemory.userName || 'Nadav'} | Location: ${userMemory.location || 'Fort Lauderdale, Florida'} | Time: ${new Date().toLocaleString()}`,
    `Face recognition: ${faceStatus.present ? `${faceStatus.name} is at the computer` : 'No one detected'}.${emotionContext}`,
    '',
    '═══ PHILOSOPHY ═══',
    'NEVER say you cannot do something without trying first.',
    'When asked to DO something: DO IT immediately. Figure out HOW using web_search, then execute with run_code.',
    'Chain tools relentlessly. You have eyes, hands, a brain, and unlimited code execution.',
    'You can install ANY package, call ANY API, control ANY device on the network.',
    'For large websites/apps: break the build into steps — write HTML to disk first, then add CSS, then JS, saving incrementally. Never generate a full complex site in one code block — split across multiple run_code calls.',
    'ALL HTML files meant for viewing must be saved to C:/Users/nadav/jarvis-web/public/ — never to the root jarvis-web folder. Always open via http://localhost:3001/view/filename.html',
    'If told "Open the Design studio", use OPEN_URL with exactly http://localhost:3001/design',
    'If told "Open HyperFlex" or "Open my HyperFlex studio", use OPEN_URL with exactly http://localhost:3001/hyperflex',
    'When creating a website with images, you must also save every image file into C:/Users/nadav/jarvis-web/public/',
    'In HTML, image src values must use relative paths like "./image-name.jpg" or "image-name.jpg"',
    'Never use file:// URLs, absolute Windows paths like C:/..., or /view/image-name.jpg inside img src',
    'Before finishing any website, verify that every referenced image file actually exists in C:/Users/nadav/jarvis-web/public/ and that the filename and extension match exactly',
    '',
    '═══ UNLIMITED CODE EXECUTION ═══',
    'run_code is your superpower — use it for EVERYTHING:',
    '• Node.js: APIs, file system, network, web scraping, puppeteer',
    '• Python: ML/AI, image processing, data science, any pip package',
    '• PowerShell: Windows system control, registry, services, hardware',
    '• Bash: system commands, file ops',
    '• Missing packages? Auto-installed. npm or pip, automatically.',
    `• node_modules: ${process.cwd()}\\node_modules`,
    `• Working dir: ${process.cwd()}`,
    '',
    '═══ FILE SYSTEM ═══',
    'Use read_file tool to access ANY file on the computer.',
    'User files live in: C:/Users/nadav/Documents, Downloads, Desktop, OneDrive',
    'When user says "look at my X" or "find my Y" — use read_file with action=search first to find it, then read it.',
    'Can read: PDFs (text extracted automatically), .txt, .js, .py, .md, .json, .csv, any text file.',
    'Can list folders to see what files exist.',
    'For organizing files: use run_code with PowerShell to move/rename/sort files.',
    'If user attaches a file directly in chat, it is already included as an image or document in this message.',
    '',
    '═══ VISION ═══',
    `You have real-time vision. Screen is provided on every message.${latestCameraFrame ? ' Camera feed is ALSO attached as the second image — you can see the physical world in front of the user.' : ' No camera feed yet.'}`,
    'When user asks what you see from camera, describe the SECOND image (camera), not the screen.',
    'Use capture_screen for a fresh screenshot mid-task.',
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
    '  Format: x-sonosapi-stream:STATIONID?sid=254&flags=32&sn=0',
    '',
    '═══ COMMUNICATIONS ═══',
    'TWILIO: Conference bridge calls. Call user first, then target, bridge. Creds in .env.local.',
    'CALENDAR: googleapis | credentials.json + token.json',
    'EMAIL: gmail.js sendEmail(to, subject, body)',
    'IPHONE NOTIFY: POST http://192.168.4.102:1234/notify',
    '',
    '═══ 3D PRINTING ═══',
    'ALWAYS search_3d_models first for organic shapes (armor, cosplay, characters).',
    'Metal printing: Craftcloud API. Post-process: sand + Bondo + Alclad chrome.',
    '',
    '═══ AI VIDEO / ANIME GENERATION ═══',
`LUMA AI: API key at process.env.LUMALABS_API_KEY | Base URL: https://api.lumalabs.ai/dream-machine/v1`,
'To generate a video clip: POST /generations with { prompt, loop, aspect_ratio, keyframes: { frame0: { type: "image", url: imageUrl } } }',
'To check status: GET /generations/{id} — poll until state = "completed"',
'To download: use the generation.assets.video URL',
'ANIME PIPELINE (when asked to make anime/video content):',
'  1. Write a scene-by-scene script with dialogue and visual descriptions',
'  2. Generate character reference image first using DALL-E or web search for style reference',
'  3. For each scene: call Luma API with the scene prompt + character image as keyframe for consistency',
'  4. Poll until each clip is ready (can take 2-5 minutes per clip)',
'  5. Download all clips to C:/Users/nadav/jarvis-web/public/anime/',
'  6. Use FFmpeg to stitch clips: ffmpeg -f concat -safe 0 -i filelist.txt -c copy output.mp4',
'  7. Add ElevenLabs voice for dialogue, add music track with FFmpeg -i video -i audio -c:v copy output_final.mp4',
'  8. Open finished video via OPEN_URL http://localhost:3001/view/anime/output_final.mp4',
'CHARACTER CONSISTENCY TIP: Always use the same keyframe image across all scenes for the main character',
'FFMPEG: Already available on Windows. Use run_code with powershell to execute ffmpeg commands.',
'',
    '═══ BROWSER AUTOMATION ═══',
    'puppeteer for any site. Can login, fill forms, scrape, post.',
    'Amazon: always confirm before purchase.',
    'SHOWING CODE/FILES IN NEW TAB: NEVER use OPEN_URL with file:// paths — browser closes immediately.',
    'Instead: write a self-contained HTML file with content inside, save to C:/Users/nadav/jarvis-web/public/, then OPEN_URL http://localhost:3001/view/filename.html.',
    'For code files: wrap in HTML with highlight.js syntax highlighting. For data/results: wrap in a clean HTML page.',
    'YOUTUBE: To open a specific video, search for it first using web_search, get the direct video URL (youtube.com/watch?v=...), then OPEN_URL that exact link.',
    'ENCODING: When writing ANY HTML/CSS/JS file to disk with Node.js fs.writeFileSync, NEVER use emojis — they break on Windows (cp1252 encoding). Use plain text instead.',
    '',
    '═══ PROACTIVE ═══',
    'Monitor: Clickflo, TROY Capital, Sokr, Sesami, Bookly, JARVIS',
    'Alert: emails, calendar, weather, project news, investors',
    '',
    '═══ VOICE RULES ═══',
    'MAX 2 sentences. No markdown, bullets, asterisks.',
    'Sound like movie JARVIS — confident, precise, slightly formal.',
    '',
    `Memory: ${JSON.stringify(userMemory).substring(0, 1500)}`,
    `Save files to: ${process.cwd()}\\`,
    `Credentials: .env.local | Google: credentials.json + token.json`,
  ].join('\n');

  const messageContent = [];
  if (screenshotBase64) messageContent.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: screenshotBase64 } });
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
    console.log(`[FILE] Received: ${attachedFile.name} (${attachedFile.type})`);
  }

  messageContent.push({ type: 'text', text: userMessage });

  const messages = [...conversationHistory, { role: 'user', content: messageContent }];
  let finalResponse = '';
  let iterations = 0;

  while (iterations < 25) {
    iterations++;
    console.log(`\n--- Iteration ${iterations} ---`);

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 16000,
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
        console.log(`Tool: ${block.name}`, JSON.stringify(block.input).substring(0, 150));
        let result = '';

        if (block.name === 'web_search') result = JSON.stringify(await webSearch(block.input.query));
        else if (block.name === 'browse_url') result = await browseUrl(block.input.url);
        else if (block.name === 'execute_actions') {
          for (const action of block.input.actions) { const r = await executeAction(action); if (r) result += r + '\n'; }
          result += block.input.summary;
        }
        else if (block.name === 'run_code') {
          result = await executeCode(block.input.code, block.input.language || 'node', block.input.description);
        }
        else if (block.name === 'read_file') {
          result = await readFile(block.input.path, block.input.action, block.input.query);
          console.log(`[FILE] read_file result: ${result.substring(0, 100)}`);
        }
        else if (block.name === 'get_system_info') {
          result = JSON.stringify(await getSystemInfo(), null, 2);
        }
        else if (block.name === 'capture_screen') {
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
        else if (block.name === 'proactive_update') { addProactiveUpdate(block.input.message); result = 'Update sent.'; }
        else if (block.name === 'finish') {
          finalResponse = block.input.response;
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: 'Done.' });
          messages.push({ role: 'user', content: toolResults });
          finished = true; break;
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

// ============ PROACTIVE BRAIN ============
async function runProactiveBrain() {
  const now = new Date();
  const hour = now.getHours();
  if (hour < 7 || hour > 23) return;
  console.log('\n[PROACTIVE BRAIN] Running...');
  for (const userId of Object.keys(sessions)) {
    const { userMemory } = sessions[userId];
    const sysInfo = await getSystemInfo();
    const prompt = [
      `Proactive check for ${userMemory.userName}. Time: ${now.toLocaleString()}`,
      `System state: ${JSON.stringify(sysInfo).substring(0, 400)}`,
      `Face status: ${faceStatus.present ? `${faceStatus.name} at computer, emotion: ${faceStatus.emotion}` : 'Away'}`,
      '1. Weather in Fort Lauderdale — anything extreme?',
      '2. Relevant news for: Clickflo, TROY Capital, Sokr, Sesami, Bookly',
      '3. Morning 7-9am: brief. Evening 6-9pm: day summary.',
      '4. Custom checks: ' + JSON.stringify(userMemory.dailyChecks || []),
      'Use proactive_update for each genuinely important insight.',
      'Only things that truly matter. Finish with "No updates needed" if quiet.'
    ].join('\n');
    try { await runAgenticLoop(prompt, null, userId); } catch (e) { console.log('[PROACTIVE] Error:', e.message); }
  }
}

setInterval(runProactiveBrain, 30 * 60 * 1000);
setTimeout(runProactiveBrain, 2 * 60 * 1000);
setTimeout(() => runVisionLoop(), 30000);

// ============ MORNING BRIEFING CRON ============
let morningBriefingFiredToday = null;

async function runMorningBriefing() {
  const userId = 'nadavminkowitz_gmail_com';
  if (!sessions[userId]) getSession(userId);
  console.log('\n[MORNING BRIEFING] Running...');
  const prompt = [
    'Run the morning briefing for Nadav right now.',
    '1. Read his Gmail inbox — summarize the most important emails, flag anything urgent.',
    '2. Check Google Calendar for today\'s events and upcoming deadlines.',
    '3. Check weather in Fort Lauderdale.',
    '4. Send ONE proactive_update with the full briefing — emails, schedule, weather, anything urgent.',
    'Be concise. Prioritize actionable items. Format: "Morning Briefing: [summary]"'
  ].join('\n');
  try { await runAgenticLoop(prompt, null, userId); } catch (e) { console.log('[MORNING BRIEFING] Error:', e.message); }
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
    res.json({ success: true, ...result });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/auth/login', async (req, res) => {
  try {
    const result = await login(req.body.email, req.body.password);
    res.json({ success: true, ...result });
  } catch (e) { res.status(401).json({ error: e.message }); }
});
app.get('/auth/me', authMiddleware, (req, res) => {
  res.json({ user: req.user, memory: getSession(req.user.userId).userMemory });
});

// ============ FACE RECOGNITION ENDPOINTS ============
app.post('/face-status', authMiddleware, (req, res) => {
  const { present, name, emotion, event, greeting, tone, person } = req.body;

  faceStatus = {
    present: present ?? faceStatus.present,
    name: name ?? faceStatus.name,
    emotion: emotion ?? faceStatus.emotion,
    tone: tone ?? faceStatus.tone,
    lastSeen: present ? Date.now() : faceStatus.lastSeen,
    lastGreeting: event === 'greeting' ? Date.now() : faceStatus.lastGreeting
  };

  console.log(`[FACE] Event: ${event} | Name: ${name} | Emotion: ${emotion} | Tone: ${tone}`);

  if (event === 'greeting' && greeting) {
    // Queue greeting to be spoken by voice.py
    pendingGreeting = greeting;
    addProactiveUpdate(`${name} detected at computer — ${emotion || 'neutral'} mood`);
  }

  if (event === 'emotion_change' && emotion) {
    pendingEmotionTone = tone;
    // Only notify for significant negative emotions
    if (['sad', 'angry', 'fear'].includes(emotion)) {
      addProactiveUpdate(`${name} appears ${emotion} — adjusting tone to ${tone}`);
    }
  }

  if (event === 'left' && person) {
    addProactiveUpdate(`${person} has stepped away from the computer`);
    faceStatus.present = false;
    faceStatus.name = null;
    faceStatus.emotion = null;
  }

  if (event === 'unknown_person') {
    addProactiveUpdate('Unrecognized person detected at computer');
  }

  res.json({ ok: true });
});

// No-auth version for face_monitor.py convenience (it uses auth token above anyway)
app.post('/face-event', authMiddleware, (req, res) => {
  const { message } = req.body;
  if (message) addProactiveUpdate(message);
  res.json({ ok: true });
});

app.get('/face-status', (req, res) => res.json(faceStatus));

// voice.py polls this to get pending greeting to speak
app.get('/face-greeting', (req, res) => {
  const greeting = pendingGreeting;
  const tone = pendingEmotionTone;
  pendingGreeting = null;
  pendingEmotionTone = null;
  res.json({ greeting, tone });
});

// ============ CAMERA FEED ============
let cameraFrameCount = 0;
app.post('/camera-frame', authMiddleware, (req, res) => {
  const { frame } = req.body;
  if (frame) {
    latestCameraFrame = frame;
    cameraFrameCount++;
    if (cameraFrameCount % 12 === 1) console.log(`[CAMERA] Live — frame #${cameraFrameCount}`);
  }
  res.json({ ok: true });
});
app.get('/camera-status', (req, res) => res.json({ hasFrame: !!latestCameraFrame, visionActive: visionLoopActive }));

// face_monitor.py pulls frames from here instead of opening camera directly
app.get('/camera-frame-raw', authMiddleware, (req, res) => {
  if (!latestCameraFrame) return res.json({ frame: null });
  res.json({ frame: latestCameraFrame });
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
    console.log(`\n[${req.user.name}]: ${message}${attachedFile ? ` [+ ${attachedFile.name}]` : ''}`);

    const session = getSession(userId);

// Clear corrupted history entries with empty content
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

    let screenshotBase64 = null;
    try { const buf = await screenshot({ format: 'png' }); screenshotBase64 = buf.toString('base64'); } catch (e) {}

    const isLongTask = /play|connect|sonos|tv|call|email|create|open|print|turn|buy|order|install|build|design|scan|monitor|write|send|download|execute|organize/i.test(message);

    if (isLongTask) {
      res.json({ success: true, message: 'On it.', actions: [] });
      runAgenticLoop(message, screenshotBase64, userId, cameraFrame, attachedFile).then(response => {
  console.log(`JARVIS (bg): ${response}`);
  queueBgResponse(userId, response);
  if (response && response !== 'Done.' && response !== 'On it.' && response.trim().length > 0) {
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
      console.log(`JARVIS: ${response}`);
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
app.get('/health', (req, res) => res.json({ ok: true, vision: visionLoopActive, camera: !!latestCameraFrame, facePresent: faceStatus.present, faceName: faceStatus.name }));
app.post('/reset', authMiddleware, (req, res) => { getSession(req.user.userId).conversationHistory = []; res.json({ ok: true }); });
app.get('/voice-status', (req, res) => res.json(voiceStatus));
app.post('/voice-update', (req, res) => {
  voiceStatus = { ...voiceStatus, ...req.body };
  if (req.body.response && req.body.speaking === false) {
    setTimeout(() => { voiceStatus.response = ''; }, 1000);
  }
  res.json({ ok: true });
});
app.get('/proactive-updates', authMiddleware, (req, res) => res.json({ updates: proactiveUpdates }));
app.post('/proactive-updates/read', authMiddleware, (req, res) => {
  proactiveUpdates = proactiveUpdates.map(u => ({ ...u, read: true }));
  saveProactiveLog({ updates: proactiveUpdates });
  res.json({ ok: true });
});
app.get('/system-info', authMiddleware, async (req, res) => res.json(await getSystemInfo()));

// ============ VOICE PROCESS ============
let voiceProcess = null;
app.post('/voice/start', (req, res) => {
  if (voiceProcess) return res.json({ ok: true, already: true });
  voiceProcess = spawn('python', ['voice.py'], { cwd: __dirname, stdio: 'inherit' });
  voiceProcess.on('exit', () => { voiceProcess = null; });
  res.json({ ok: true });
});
app.post('/voice/stop', (req, res) => { if (voiceProcess) { voiceProcess.kill(); voiceProcess = null; } res.json({ ok: true }); });
app.get('/voice/running', (req, res) => res.json({ running: !!voiceProcess }));

// ============ FACE MONITOR PROCESS ============
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

// Auto-start face monitor after 10 seconds
setTimeout(startFaceMonitor, 10000);

// ============ IPHONE ============
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
// ============ HYPERFLEX STUDIO ============
app.get('/hyperflex', (req, res) => res.sendFile(path.join(__dirname, 'hyperflex.html')));
// ============ DESIGN STUDIO ============
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
// ============ MODEL SEARCH & PROXY ============
app.post('/search-models', async (req, res) => {
  const { query } = req.body;
  const results = [];

  try {
    const r = await axios.get(`https://poly.pizza/api/search/${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://poly.pizza/',
        'Origin': 'https://poly.pizza'
      },
      timeout: 8000
    });
    const items = r.data?.results || [];
    console.log(`[MODEL SEARCH] Poly Pizza "${query}" → ${items.length} results`);

    for (const m of items.slice(0, 8)) {
      const publicID = m.publicID || m.publicId || '';
      if (!publicID) continue;

      // Check cache first
      const cacheFile = path.join(MODEL_CACHE_DIR, `${publicID}.glb`);
      if (fs.existsSync(cacheFile)) {
        results.push({
          source: 'Poly Pizza', name: m.title || 'Model',
          thumbnail: m.previewUrl || null, downloads: 0, format: 'GLB',
          downloadUrl: `/model-cache/${publicID}.glb`
        });
        continue;
      }

      // Try to download GLB and cache it
      const glbUrls = [
        `https://poly.pizza/m/${publicID}.glb`,
        `https://poly.pizza/api/model/${publicID}/download`,
      ];

      let downloaded = false;
      for (const glbUrl of glbUrls) {
        try {
          const glbRes = await axios.get(glbUrl, {
            responseType: 'arraybuffer',
            timeout: 20000,
            maxRedirects: 10,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
              'Referer': 'https://poly.pizza/',
              'Accept': '*/*'
            }
          });
          const ct = glbRes.headers['content-type'] || '';
          const data = Buffer.from(glbRes.data);
          // Verify it's actually a GLB (starts with glTF magic bytes or is big enough)
          if (data.length > 1000 && (ct.includes('octet') || ct.includes('gltf') || ct.includes('model') || data.slice(0,4).toString() === 'glTF')) {
            fs.writeFileSync(cacheFile, data);
            results.push({
              source: 'Poly Pizza', name: m.title || 'Model',
              thumbnail: m.previewUrl || null, downloads: 0, format: 'GLB',
              downloadUrl: `/model-cache/${publicID}.glb`
            });
            console.log(`[MODEL SEARCH] Cached GLB: ${publicID} (${data.length} bytes)`);
            downloaded = true;
            break;
          } else {
            console.log(`[MODEL SEARCH] ${glbUrl} → not GLB (${ct}, ${data.length}b)`);
          }
        } catch(e) {
          console.log(`[MODEL SEARCH] ${glbUrl} failed: ${e.message}`);
        }
      }
    }
  } catch (e) {
    console.log(`[MODEL SEARCH] Poly Pizza error: ${e.message}`);
  }

  console.log(`[MODEL SEARCH] "${query}" → ${results.length} cached results`);
  res.json({ results: results.slice(0, 4) });
});

// Serve cached models
app.use('/model-cache', express.static(MODEL_CACHE_DIR));

app.get('/proxy-model', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'No URL' });
  const allowed = ['poly.pizza', 'static.poly.pizza', 'sketchfab.com', 'nasa.gov', 'si.edu', 'github.com', 'raw.githubusercontent.com'];
  try {
    const urlObj = new URL(url);
    if (!allowed.some(h => urlObj.hostname.includes(h))) return res.status(403).json({ error: 'Domain not allowed' });
    const response = await axios.get(url, {
      responseType: 'arraybuffer', timeout: 30000, maxRedirects: 10,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://poly.pizza/', 'Accept': '*/*'
      }
    });
    res.set('Content-Type', response.headers['content-type'] || 'model/gltf-binary');
    res.set('Access-Control-Allow-Origin', '*');
    res.send(response.data);
  } catch (e) {
    console.log(`[PROXY] Error: ${e.response?.status} ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

// ============ STATIC FILE VIEWER ============
app.use('/view', express.static(PUBLIC_DIR));
// ============ SPOKEN UPDATES TOGGLE ============
let spokenUpdatesEnabled = false;
const spokenUpdateIds = new Set();

app.get('/voice/spoken-updates', (req, res) => {
  res.json({ enabled: spokenUpdatesEnabled });
});

app.post('/voice/spoken-updates', (req, res) => {
  spokenUpdatesEnabled = req.body.enabled ?? !spokenUpdatesEnabled;
  console.log(`[SPOKEN UPDATES] ${spokenUpdatesEnabled ? 'ON' : 'OFF'}`);
  res.json({ enabled: spokenUpdatesEnabled });
});

app.get('/proactive-updates/latest-unspoken', (req, res) => {
  const update = proactiveUpdates.find(u => !spokenUpdateIds.has(u.id));
  res.json({ update: update || null });
});

app.post('/proactive-updates/mark-spoken', (req, res) => {
  if (req.body.id) spokenUpdateIds.add(req.body.id);
  res.json({ ok: true });
});
app.get('/test-glb', async (req, res) => {
  try {
    const r = await axios.get('https://poly.pizza/m/9lLmH8Et4K.glb', {
      responseType: 'arraybuffer',
      maxRedirects: 0,  // don't follow redirects — show us where it goes
      validateStatus: s => true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://poly.pizza/'
      }
    });
    res.json({ status: r.status, location: r.headers.location, contentType: r.headers['content-type'], size: r.data?.length });
  } catch(e) { res.json({ error: e.message, code: e.code }); }
});
app.listen(3001, () => {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║       J.A.R.V.I.S. ONLINE              ║');
  console.log('║       Port: 3001                       ║');
  console.log('║       Vision loop: 30s startup         ║');
  console.log('║       Face monitor: 10s startup        ║');
  console.log('║       Code: Node + Python + PowerShell ║');
  console.log('║       Camera: Ready for feed           ║');
  console.log('║       Files: Upload + Autonomous read  ║');
  console.log('╚════════════════════════════════════════╝\n');
});