let currentMovie = null;

// ── Tone label ──────────────────────────────────────────────────────────────
document.getElementById('tone').addEventListener('input', function () {
  const v = parseInt(this.value);
  document.getElementById('tone-val').textContent =
    v <= 3 ? 'Dead Serious' : v <= 6 ? 'Balanced' : v <= 8 ? 'Lighthearted' : 'Pure Campy';
});

document.getElementById('generate-btn').addEventListener('click', generate);
document.getElementById('prompt').addEventListener('keydown', function (e) {
  if (e.key === 'Enter' && e.ctrlKey) generate();
});

// ── Main generate ────────────────────────────────────────────────────────────
async function generate() {
  const prompt = document.getElementById('prompt').value.trim();
  if (!prompt) { alert('Please enter a movie idea!'); return; }

  const genre     = document.getElementById('genre').value;
  const era       = document.getElementById('era').value;
  const rating    = document.getElementById('rating').value;
  const toneVal   = parseInt(document.getElementById('tone').value);
  const toneDesc  = toneVal <= 3 ? 'Dead Serious' : toneVal <= 6 ? 'Balanced' : toneVal <= 8 ? 'Lighthearted' : 'Pure Campy';

  // UI state
  document.querySelector('.prompt-box').style.display = 'none';
  document.getElementById('loading').style.display    = 'block';
  document.getElementById('result').style.display     = 'none';
  document.getElementById('error-box').style.display  = 'none';

  const loadingMsgs = [
    'Pitching to studio executives...',
    'Assembling the dream cast...',
    'Writing the screenplay...',
    'Negotiating budgets with producers...',
    'Crafting the perfect trailer...',
  ];
  let msgIdx = 0;
  const msgEl       = document.getElementById('loading-msg');
  const msgInterval = setInterval(() => {
    msgIdx = (msgIdx + 1) % loadingMsgs.length;
    msgEl.textContent = loadingMsgs[msgIdx];
  }, 2500);

  const systemPrompt = `You are a Hollywood movie studio executive. Return ONLY valid raw JSON — no markdown, no code blocks, no explanation.`;

  const userMsg = `Create a complete movie concept for: "${prompt}"
Genre: ${genre || 'any'}, Tone: ${toneDesc}, Era: ${era}, Rating: ${rating}.

Return ONLY this exact JSON (no markdown, no backticks):
{
  "title": "Movie Title",
  "tagline": "Catchy tagline",
  "genre": "Action / Thriller",
  "rating": "PG-13",
  "runtime": "2h 15m",
  "synopsis": "3-4 sentence synopsis",
  "director": "Famous Director",
  "composer": "Famous Composer",
  "cast": [
    {"role": "Hero Name",      "actor": "Actor Name", "description": "Character description"},
    {"role": "Villain Name",   "actor": "Actor Name", "description": "Character description"},
    {"role": "Sidekick Name",  "actor": "Actor Name", "description": "Character description"},
    {"role": "Love Interest",  "actor": "Actor Name", "description": "Character description"},
    {"role": "Mentor",         "actor": "Actor Name", "description": "Character description"}
  ],
  "budget": {
    "total": "$150 million",
    "cast": "$45 million",
    "production": "$55 million",
    "vfx": "$35 million",
    "marketing": "$15 million"
  },
  "trailer": [
    {"scene": 1, "timestamp": "0:00 - 0:15", "visual": "...", "audio": "...", "dialogue": "..."},
    {"scene": 2, "timestamp": "0:15 - 0:35", "visual": "...", "audio": "...", "dialogue": "..."},
    {"scene": 3, "timestamp": "0:35 - 0:55", "visual": "...", "audio": "...", "dialogue": "..."},
    {"scene": 4, "timestamp": "0:55 - 1:15", "visual": "...", "audio": "...", "dialogue": "..."},
    {"scene": 5, "timestamp": "1:15 - 1:40", "visual": "...", "audio": "...", "dialogue": "..."},
    {"scene": 6, "timestamp": "1:40 - 2:00", "visual": "...", "audio": "...", "dialogue": "..."}
  ]
}`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMsg }]
      })
    });

    const data = await resp.json();
    clearInterval(msgInterval);

    if (!resp.ok) {
      throw new Error(data.error?.message || 'Anthropic API error ' + resp.status);
    }

    // Extract text and strip any accidental markdown fences
    let raw = data.content.map(b => b.text || '').join('');
    raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

    let movie;
    try {
      movie = JSON.parse(raw);
    } catch (parseErr) {
      throw new Error('AI returned invalid JSON — try again. (' + parseErr.message + ')');
    }

    currentMovie = movie;
    renderMovie(movie);

    document.getElementById('loading').style.display    = 'none';
    document.getElementById('result').style.display     = 'block';
    document.querySelector('.prompt-box').style.display = 'block';
    document.getElementById('result').scrollIntoView({ behavior: 'smooth' });

  } catch (err) {
    clearInterval(msgInterval);
    document.getElementById('loading').style.display    = 'none';
    document.querySelector('.prompt-box').style.display = 'block';
    const errBox = document.getElementById('error-box');
    errBox.style.display = 'block';
    errBox.textContent   = 'Error: ' + err.message;
    console.error(err);
  }
}

// ── Render ───────────────────────────────────────────────────────────────────
function renderMovie(m) {
  document.getElementById('movie-title').textContent   = m.title    || 'Untitled';
  document.getElementById('movie-tagline').textContent = m.tagline  || '';
  document.getElementById('synopsis').textContent      = m.synopsis || '';

  document.getElementById('badges').innerHTML =
    [m.genre, m.rating, m.runtime].filter(Boolean)
      .map(b => '<span class="badge">' + b + '</span>').join('');

  document.getElementById('crew-info').innerHTML =
    (m.director ? '<span class="badge">Dir: ' + m.director + '</span>' : '') +
    (m.composer  ? '<span class="badge">Music: ' + m.composer  + '</span>' : '');

  document.getElementById('poster-area').innerHTML =
    '<div class="poster-placeholder">🎬 ' + (m.title || 'Poster') + '</div>';

  // Cast
  const castEl = document.getElementById('cast-grid');
  castEl.innerHTML = '';
  (m.cast || []).forEach((c, i) => {
    const div = document.createElement('div');
    div.className = 'cast-card';
    div.innerHTML =
      '<div class="cast-role">'   + (c.role || '')        + '</div>' +
      '<div class="cast-actor"><input type="text" value="' + (c.actor || '') +
        '" placeholder="Cast actor..." id="cast-' + i + '"></div>' +
      '<div class="cast-desc">'   + (c.description || '') + '</div>';
    castEl.appendChild(div);
  });

  // Budget
  const budgetEl = document.getElementById('budget-grid');
  budgetEl.innerHTML = '';
  if (m.budget) {
    [
      { label: 'TOTAL BUDGET', amount: m.budget.total,      cls: 'total' },
      { label: 'Cast',         amount: m.budget.cast,       cls: '' },
      { label: 'Production',   amount: m.budget.production, cls: '' },
      { label: 'VFX',          amount: m.budget.vfx,        cls: '' },
      { label: 'Marketing',    amount: m.budget.marketing,  cls: '' },
    ].forEach(item => {
      if (!item.amount) return;
      const div = document.createElement('div');
      div.className = 'budget-item ' + item.cls;
      div.innerHTML =
        '<div class="budget-label">'  + item.label  + '</div>' +
        '<div class="budget-amount">' + item.amount + '</div>';
      budgetEl.appendChild(div);
    });
  }

  // Trailer
  const trailerEl = document.getElementById('trailer-scenes');
  trailerEl.innerHTML = '';
  (m.trailer || []).forEach(scene => {
    const div = document.createElement('div');
    div.className = 'scene-card';
    div.innerHTML =
      '<div class="scene-header">' +
        '<div class="scene-num">'  + scene.scene              + '</div>' +
        '<div class="scene-time">' + (scene.timestamp || '')  + '</div>' +
      '</div>' +
      '<div class="scene-visual">' + (scene.visual   || '')   + '</div>' +
      '<div class="scene-audio">Audio: ' + (scene.audio || '') + '</div>' +
      (scene.dialogue ? '<div class="scene-dialogue">"' + scene.dialogue + '"</div>' : '');
    trailerEl.appendChild(div);
  });
}

// ── Utility ──────────────────────────────────────────────────────────────────
function newMovie() {
  document.getElementById('result').style.display = 'none';
  document.getElementById('prompt').value = '';
  document.querySelector('.prompt-box').scrollIntoView({ behavior: 'smooth' });
}

function shareMovie() {
  if (!currentMovie) return;
  const text = currentMovie.title + ' — ' + currentMovie.tagline +
    '\n\nGenerated by AI Movie Studio';
  if (navigator.share) {
    navigator.share({ title: currentMovie.title, text });
  } else {
    navigator.clipboard.writeText(text).then(() => alert('Copied to clipboard!'));
  }
}