// AI Movie Studio - App Logic

document.addEventListener('DOMContentLoaded', () => {
    const generateBtn = document.getElementById('generateBtn');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const resultsSection = document.getElementById('resultsSection');
    
    generateBtn.addEventListener('click', generateMovie);
});

async function generateMovie() {
    const idea = document.getElementById('movieIdea').value.trim();
    
    if (!idea) {
        alert('Please enter a movie idea!');
        return;
    }
    
    const genre = document.getElementById('genre').value;
    const era = document.getElementById('era').value;
    const tone = document.getElementById('tone').value;
    const rating = document.getElementById('rating').value;
    
    // Show loading overlay
    const loadingOverlay = document.getElementById('loadingOverlay');
    loadingOverlay.classList.add('active');
    
    try {
        const response = await fetch('https://api.heyjarvis.me/ai-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: `Generate a complete movie pitch based on this idea: "${idea}"
                
Settings:
- Genre: ${genre === 'auto' ? 'auto-detect from the idea' : genre}
- Era: ${era}
- Tone: ${tone}
- Rating: ${rating}

Return a JSON object with this EXACT structure (no markdown, just pure JSON):
{
    "title": "Movie Title Here",
    "tagline": "A catchy one-liner tagline",
    "genre": "The genre",
    "rating": "${rating}",
    "era": "${era}",
    "runtime": "2h 15m",
    "synopsis": "A compelling 3-4 sentence plot summary",
    "budget": "$150M",
    "cast": [
        {"actor": "Real Actor Name", "role": "Character Name", "description": "Brief character description"},
        {"actor": "Real Actor Name", "role": "Character Name", "description": "Brief character description"},
        {"actor": "Real Actor Name", "role": "Character Name", "description": "Brief character description"},
        {"actor": "Real Actor Name", "role": "Character Name", "description": "Brief character description"}
    ],
    "budgetBreakdown": [
        {"category": "Cast Salaries", "amount": "$40M"},
        {"category": "Production", "amount": "$35M"},
        {"category": "Visual Effects", "amount": "$30M"},
        {"category": "Marketing", "amount": "$25M"},
        {"category": "Post-Production", "amount": "$15M"},
        {"category": "Other", "amount": "$5M"}
    ],
    "trailer": [
        {"scene": 1, "visual": "Description of what we see", "dialogue": "Any dialogue or voiceover"},
        {"scene": 2, "visual": "Description of what we see", "dialogue": "Any dialogue or voiceover"},
        {"scene": 3, "visual": "Description of what we see", "dialogue": "Any dialogue or voiceover"},
        {"scene": 4, "visual": "Description of what we see", "dialogue": "Any dialogue or voiceover"},
        {"scene": 5, "visual": "Final shot description", "dialogue": "Closing line and title reveal"}
    ]
}

Use real, well-known actors that would actually fit these roles. Be creative and make it feel like a real Hollywood pitch!`,
                system: 'You are a Hollywood movie studio executive and creative director. Generate compelling, creative movie pitches. Always respond with valid JSON only, no markdown formatting or code blocks.'
            })
        });
        
        const data = await response.json();
        let movieData;
        
        // Parse the AI response
        try {
            // Try to extract JSON from the response
            let jsonStr = data.response || data.text || JSON.stringify(data);
            
            // Remove any markdown code blocks if present
            jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            
            movieData = JSON.parse(jsonStr);
        } catch (e) {
            console.error('Parse error:', e);
            throw new Error('Failed to parse movie data');
        }
        
        // Hide loading, show results
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
    
    // Update movie header
    document.getElementById('movieTitle').textContent = movie.title;
    document.getElementById('movieTagline').textContent = '"' + movie.tagline + '"';
    document.getElementById('movieSynopsis').textContent = movie.synopsis;
    document.getElementById('genreBadge').textContent = movie.genre.toUpperCase();
    document.getElementById('ratingBadge').textContent = movie.rating;
    document.getElementById('eraBadge').textContent = movie.era.toUpperCase();
    document.getElementById('budgetValue').textContent = movie.budget;
    document.getElementById('runtimeValue').textContent = movie.runtime;
    
    // Update cast grid
    const castGrid = document.getElementById('castGrid');
    castGrid.innerHTML = movie.cast.map(member => `
        <div class="cast-card">
            <div class="cast-avatar">${member.actor.charAt(0)}</div>
            <div class="cast-actor">${member.actor}</div>
            <div class="cast-role">as ${member.role}</div>
        </div>
    `).join('');
    
    // Update budget breakdown
    const budgetGrid = document.getElementById('budgetGrid');
    budgetGrid.innerHTML = movie.budgetBreakdown.map(item => `
        <div class="budget-item">
            <div class="budget-category">${item.category}</div>
            <div class="budget-amount">${item.amount}</div>
        </div>
    `).join('');
    
    // Update trailer scenes
    const trailerContainer = document.getElementById('trailerContainer');
    trailerContainer.innerHTML = movie.trailer.map(scene => `
        <div class="trailer-scene">
            <span class="scene-number">SCENE ${scene.scene}</span>
            <p class="scene-description">${scene.visual}</p>
            ${scene.dialogue ? `<p class="scene-dialogue">"${scene.dialogue}"</p>` : ''}
        </div>
    `).join('');
    
    // Show results section
    resultsSection.classList.remove('hidden');
    
    // Scroll to results
    setTimeout(() => {
        resultsSection.scrollIntoView({ behavior: 'smooth' });
    }, 100);
}

function shareMovie() {
    const title = document.getElementById('movieTitle').textContent;
    const tagline = document.getElementById('movieTagline').textContent;
    
    if (navigator.share) {
        navigator.share({
            title: title,
            text: `Check out this AI-generated movie pitch: ${title} - ${tagline}`,
            url: window.location.href
        });
    } else {
        // Fallback - copy to clipboard
        const text = `Check out this movie pitch: ${title} - ${tagline}`;
        navigator.clipboard.writeText(text).then(() => {
            alert('Movie pitch copied to clipboard!');
        });
    }
}