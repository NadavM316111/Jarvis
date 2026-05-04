// AI Movie Studio - App Logic

document.addEventListener('DOMContentLoaded', () => {
    const generateBtn = document.getElementById('generateBtn');
    generateBtn.addEventListener('click', generateMovie);
});

async function generateMovie() {
    const idea = document.getElementById('movieIdea').value.trim();
    if (!idea) { alert('Please enter a movie idea!'); return; }

    const genre  = document.getElementById('genre').value;
    const era    = document.getElementById('era').value;
    const tone   = document.getElementById('tone').value;
    const rating = document.getElementById('rating').value;

    const loadingOverlay = document.getElementById('loadingOverlay');
    loadingOverlay.classList.add('active');

    try {
        const response = await fetch('https://api.heyjarvis.me/ai-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: `Generate a complete Hollywood movie pitch for: "${idea}"

Settings: Genre=${genre === 'auto' ? 'auto-detect' : genre}, Era=${era}, Tone=${tone}, Rating=${rating}

Return ONLY valid JSON (no markdown, no code blocks) with this EXACT structure:
{
    "title": "Movie Title",
    "tagline": "Catchy one-liner tagline",
    "genre": "Genre",
    "rating": "${rating}",
    "era": "${era}",
    "runtime": "2h 15m",
    "synopsis": "Compelling 3-4 sentence plot summary",
    "budget": "$150M",
    "director": "Real Director Name",
    "studio": "Fictional or Real Studio Name",
    "cast": [
        {"actor": "Real Actor Name", "role": "Character Name", "note": "Brief note"},
        {"actor": "Real Actor Name", "role": "Character Name", "note": "Brief note"},
        {"actor": "Real Actor Name", "role": "Character Name", "note": "Brief note"},
        {"actor": "Real Actor Name", "role": "Character Name", "note": "Brief note"}
    ],
    "budgetBreakdown": [
        {"category": "Cast Salaries", "amount": 40},
        {"category": "Production", "amount": 35},
        {"category": "Visual Effects", "amount": 30},
        {"category": "Marketing", "amount": 25},
        {"category": "Post-Production", "amount": 15},
        {"category": "Other", "amount": 5}
    ],
    "trailer": [
        {"scene": 1, "visual": "What we see on screen", "dialogue": "Voiceover or dialogue line"},
        {"scene": 2, "visual": "What we see on screen", "dialogue": "Voiceover or dialogue line"},
        {"scene": 3, "visual": "What we see on screen", "dialogue": "Voiceover or dialogue line"},
        {"scene": 4, "visual": "What we see on screen", "dialogue": "Voiceover or dialogue line"},
        {"scene": 5, "visual": "Final epic shot + title reveal", "dialogue": "Closing line"}
    ],
    "awards": [
        {"category": "Best Picture", "prediction": "Strong Contender", "reason": "Why it could win"},
        {"category": "Best Director", "prediction": "Nominated", "reason": "Why it could win"},
        {"category": "Best Actor", "prediction": "Nominated", "reason": "Why it could win"},
        {"category": "Best Visual Effects", "prediction": "Frontrunner", "reason": "Why it could win"},
        {"category": "Best Original Score", "prediction": "Possible Nomination", "reason": "Why it could win"},
        {"category": "Best Screenplay", "prediction": "Strong Contender", "reason": "Why it could win"}
    ],
    "soundtrack": [
        {"track": "Track Title", "artist": "Artist Name", "mood": "Epic / Tense / Emotional"},
        {"track": "Track Title", "artist": "Artist Name", "mood": "Epic / Tense / Emotional"},
        {"track": "Track Title", "artist": "Artist Name", "mood": "Epic / Tense / Emotional"},
        {"track": "Track Title", "artist": "Artist Name", "mood": "Epic / Tense / Emotional"},
        {"track": "Track Title", "artist": "Artist Name", "mood": "Epic / Tense / Emotional"}
    ],
    "trailerSearchQuery": "official trailer YouTube search query for a similar real movie"
}

Use real actors and directors. budgetBreakdown amounts are numbers in millions (no $ sign). Be creative!`,
                system: 'You are a Hollywood movie studio executive. Generate compelling movie pitches. Respond with valid JSON ONLY — no markdown, no code fences, no extra text.'
            })
        });

        const data = await response.json();
        let movieData;

        try {
            let jsonStr = data.response || data.text || JSON.stringify(data);
            jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            // Extract JSON object if there's extra text
            const match = jsonStr.match(/\{[\s\S]*\}/);
            if (match) jsonStr = match[0];
            movieData = JSON.parse(jsonStr);
        } catch (e) {
            console.error('Parse error:', e);
            throw new Error('Failed to parse movie data');
        }

        loadingOverlay.classList.remove('active');
        displayResults(movieData);

    } catch (error) {
        console.error('Error:', error);
        loadingOverlay.classList.remove('active');
        alert('Error generating movie: ' + error.message);
    }
}

function displayResults(movie) {
    const resultsSection = document.getElementById('resultsSection');

    // ---- Hero Header ----
    document.getElementById('resTitle').textContent    = movie.title    || 'Untitled';
    document.getElementById('resTagline').textContent  = '"' + (movie.tagline || '') + '"';
    document.getElementById('resSynopsis').textContent = movie.synopsis  || '';
    document.getElementById('resBudget').textContent   = movie.budget    || 'TBD';
    document.getElementById('resRuntime').textContent  = movie.runtime   || 'TBD';
    document.getElementById('resDirector').textContent = movie.director  || 'TBD';
    document.getElementById('resStudio').textContent   = movie.studio    || 'TBD';

    // Badges
    const badgesEl = document.getElementById('resBadges');
    if (badgesEl) {
        badgesEl.innerHTML = [movie.genre, movie.rating, movie.era]
            .filter(Boolean)
            .map(b => `<span class="res-badge">${b.toUpperCase()}</span>`)
            .join('');
    }

    // ---- CAST (slide 0) ----
    const castGrid = document.getElementById('castGrid');
    if (castGrid && movie.cast) {
        castGrid.innerHTML = movie.cast.map(m => `
            <div class="cast-card">
                <div class="cast-avatar">${m.actor.charAt(0)}</div>
                <div class="cast-actor">${m.actor}</div>
                <div class="cast-role">as ${m.role}</div>
                ${m.note ? `<div class="cast-note">${m.note}</div>` : ''}
            </div>
        `).join('');
    }

    // ---- BUDGET (slide 1) ----
    const budgetBars = document.getElementById('budgetBars');
    const budgetTotal = document.getElementById('budgetTotal');
    if (budgetBars && movie.budgetBreakdown) {
        const total = movie.budgetBreakdown.reduce((s, i) => s + Number(i.amount), 0);
        const max   = Math.max(...movie.budgetBreakdown.map(i => Number(i.amount)));
        if (budgetTotal) budgetTotal.textContent = '$' + total + 'M';
        budgetBars.innerHTML = movie.budgetBreakdown.map(item => {
            const pct = Math.round((Number(item.amount) / max) * 100);
            return `
            <div class="budget-bar-row">
                <div class="budget-bar-label">${item.category}</div>
                <div class="budget-bar-track">
                    <div class="budget-bar-fill" style="width:${pct}%"></div>
                </div>
                <div class="budget-bar-amt">$${item.amount}M</div>
            </div>`;
        }).join('');
    }

    // ---- TRAILER SCRIPT (slide 2) ----
    const trailerScenes = document.getElementById('trailerScenes');
    if (trailerScenes && movie.trailer) {
        trailerScenes.innerHTML = movie.trailer.map(scene => `
            <div class="trailer-scene">
                <span class="scene-number">SCENE ${scene.scene}</span>
                <p class="scene-description">${scene.visual}</p>
                ${scene.dialogue ? `<p class="scene-dialogue">"${scene.dialogue}"</p>` : ''}
            </div>
        `).join('');
    }

    // ---- TRAILER LAUNCH BUTTON ----
    const trailerBtn = document.getElementById('trailerLaunchBtn');
    if (trailerBtn) {
        // Store search query for when user clicks
        trailerBtn._searchQuery = movie.trailerSearchQuery || (movie.title + ' official trailer');
        trailerBtn.classList.remove('hidden');
    }

    // ---- AWARDS (slide 3) ----
    const awardsGrid = document.getElementById('awardsGrid');
    if (awardsGrid && movie.awards) {
        const predictionColors = {
            'Frontrunner':        '#C9A84C',
            'Strong Contender':   '#A0C878',
            'Nominated':          '#78A0C8',
            'Possible Nomination':'#A878C8',
            'Unlikely':           '#888'
        };
        awardsGrid.innerHTML = movie.awards.map(a => {
            const color = predictionColors[a.prediction] || '#888';
            return `
            <div class="award-card">
                <div class="award-category">${a.category}</div>
                <div class="award-prediction" style="color:${color}">${a.prediction}</div>
                <div class="award-reason">${a.reason}</div>
            </div>`;
        }).join('');
    }

    // ---- SOUNDTRACK (slide 4) ----
    const soundtrackList = document.getElementById('soundtrackList');
    if (soundtrackList && movie.soundtrack) {
        soundtrackList.innerHTML = movie.soundtrack.map((t, i) => `
            <div class="soundtrack-item">
                <div class="track-num">${String(i+1).padStart(2,'0')}</div>
                <div class="track-info">
                    <div class="track-title">${t.track}</div>
                    <div class="track-artist">${t.artist}</div>
                </div>
                <div class="track-mood">${t.mood}</div>
            </div>
        `).join('');
    }

    // Show results
    resultsSection.classList.remove('hidden');
    setTimeout(() => resultsSection.scrollIntoView({ behavior: 'smooth' }), 100);

    // Reset carousel to slide 0
    goSlide(0);
}

async function launchTrailer() {
    const btn = document.getElementById('trailerLaunchBtn');
    const query = (btn && btn._searchQuery) || 'official movie trailer';

    // Open YouTube search for the trailer
    const ytSearch = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query);
    window.open(ytSearch, '_blank');
}

// ---- Carousel ----
let currentSlide = 0;
function goSlide(idx) {
    const track = document.getElementById('carouselTrack');
    const slides = track ? track.querySelectorAll('.carousel-slide') : [];
    const btns   = document.querySelectorAll('.carousel-nav-btn');

    currentSlide = idx;
    if (track) track.style.transform = 'translateX(-' + (idx * 100) + '%)';

    btns.forEach((b, i) => b.classList.toggle('active', i === idx));
}

function resetStudio() {
    document.getElementById('resultsSection').classList.add('hidden');
    document.getElementById('movieIdea').value = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function sharePitch() {
    const title   = document.getElementById('resTitle').textContent;
    const tagline = document.getElementById('resTagline').textContent;
    if (navigator.share) {
        navigator.share({ title, text: `Check out this AI movie pitch: ${title} - ${tagline}`, url: window.location.href });
    } else {
        navigator.clipboard.writeText(`${title} - ${tagline} | ${window.location.href}`)
            .then(() => alert('Pitch copied to clipboard!'));
    }
}
