// CineVault - Premium Movie Discovery App
const API_BASE = 'https://api.heyjarvis.me/cinevault';
const IMG_BASE = 'https://image.tmdb.org/t/p/';

// State
let currentUser = null;
let watchlist = [];
let currentHeroMovie = null;
let allGenres = [];
let currentSection = 'home';

// Genre mapping
const genres = [
    { id: 28, name: 'Action' },
    { id: 12, name: 'Adventure' },
    { id: 16, name: 'Animation' },
    { id: 35, name: 'Comedy' },
    { id: 80, name: 'Crime' },
    { id: 99, name: 'Documentary' },
    { id: 18, name: 'Drama' },
    { id: 10751, name: 'Family' },
    { id: 14, name: 'Fantasy' },
    { id: 36, name: 'History' },
    { id: 27, name: 'Horror' },
    { id: 10402, name: 'Music' },
    { id: 9648, name: 'Mystery' },
    { id: 10749, name: 'Romance' },
    { id: 878, name: 'Sci-Fi' },
    { id: 53, name: 'Thriller' },
    { id: 10752, name: 'War' },
    { id: 37, name: 'Western' }
];

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        checkAuth();
        loadGenres();
    }, 3500); // Wait for intro animation
});

// Auth check
function checkAuth() {
    const stored = localStorage.getItem('cinevault_user');
    if (stored) {
        currentUser = JSON.parse(stored);
        showMainApp();
        loadWatchlist();
    } else {
        document.getElementById('main-app').classList.remove('hidden');
        showAuthModal();
    }
}

// Auth Modal
function showAuthModal() {
    document.getElementById('auth-modal').classList.remove('hidden');
}

function closeAuthModal() {
    document.getElementById('auth-modal').classList.add('hidden');
}

let isSignup = false;

function toggleAuthMode(e) {
    e.preventDefault();
    isSignup = !isSignup;
    
    document.getElementById('auth-title').textContent = isSignup ? 'Create Account' : 'Sign In';
    document.getElementById('auth-subtitle').textContent = isSignup ? 'Join the CineVault experience' : 'Welcome back to CineVault';
    document.getElementById('auth-btn-text').textContent = isSignup ? 'Create Account' : 'Sign In';
    document.getElementById('signup-fields').classList.toggle('hidden', !isSignup);
    document.getElementById('switch-text').textContent = isSignup ? 'Already have an account?' : 'New to CineVault?';
    document.getElementById('switch-link').textContent = isSignup ? 'Sign In' : 'Create Account';
    document.getElementById('auth-error').classList.add('hidden');
}

// Auth form submit
document.getElementById('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const name = document.getElementById('auth-name')?.value || '';
    
    const endpoint = isSignup ? '/signup' : '/login';
    const body = isSignup ? { email, password, name } : { email, password };
    
    try {
        const res = await fetch(API_BASE + endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        
        const data = await res.json();
        
        if (!res.ok) {
            showAuthError(data.error || 'Authentication failed');
            return;
        }
        
        currentUser = data.user;
        localStorage.setItem('cinevault_user', JSON.stringify(currentUser));
        closeAuthModal();
        showMainApp();
        loadWatchlist();
        
    } catch (err) {
        showAuthError('Connection failed. Please try again.');
    }
});

function showAuthError(msg) {
    const errEl = document.getElementById('auth-error');
    errEl.textContent = msg;
    errEl.classList.remove('hidden');
}

function showMainApp() {
    document.getElementById('main-app').classList.remove('hidden');
    
    if (currentUser) {
        document.getElementById('user-initial').textContent = currentUser.name?.charAt(0).toUpperCase() || currentUser.email.charAt(0).toUpperCase();
        document.getElementById('dropdown-name').textContent = currentUser.name || 'User';
        document.getElementById('dropdown-email').textContent = currentUser.email;
    }
    
    loadHomePage();
}

function logout() {
    currentUser = null;
    watchlist = [];
    localStorage.removeItem('cinevault_user');
    location.reload();
}

// User dropdown toggle
document.getElementById('user-btn').addEventListener('click', () => {
    const dropdown = document.getElementById('user-dropdown');
    dropdown.classList.toggle('hidden');
});

// Close dropdown on outside click
document.addEventListener('click', (e) => {
    if (!e.target.closest('.user-menu')) {
        document.getElementById('user-dropdown').classList.add('hidden');
    }
});

// Load genres
function loadGenres() {
    const scroll = document.getElementById('genre-scroll');
    scroll.innerHTML = genres.map(g => 
        `<button class="genre-pill" data-id="${g.id}" onclick="filterByGenre(${g.id}, '${g.name}')">${g.name}</button>`
    ).join('');
}

// Navigation
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const section = link.dataset.section;
        switchSection(section);
    });
});

function switchSection(section) {
    currentSection = section;
    
    // Update nav active state
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.querySelector(`[data-section="${section}"]`)?.classList.add('active');
    
    // Show/hide sections
    document.getElementById('hero-section').classList.toggle('hidden', section === 'watchlist');
    document.getElementById('genre-section').classList.toggle('hidden', section === 'watchlist');
    document.getElementById('trending-section').classList.toggle('hidden', section !== 'home');
    document.getElementById('toprated-section').classList.toggle('hidden', section !== 'home');
    document.getElementById('upcoming-section').classList.toggle('hidden', section !== 'home');
    document.getElementById('search-section').classList.add('hidden');
    document.getElementById('genre-section-content')?.classList.add('hidden');
    document.getElementById('watchlist-section').classList.toggle('hidden', section !== 'watchlist');
    
    if (section === 'watchlist') {
        displayWatchlist();
    } else if (section === 'movies') {
        loadMoviesPage();
    }
}

function goHome() {
    switchSection('home');
}

// Load home page
async function loadHomePage() {
    try {
        // Load trending for hero
        const trendingRes = await fetch(API_BASE + '/movies/trending');
        const trending = await trendingRes.json();
        
        if (trending.results?.length) {
            setHeroMovie(trending.results[0]);
            renderMovieRow('trending-row', trending.results);
        }
        
        // Load top rated
        const topRatedRes = await fetch(API_BASE + '/movies/top_rated');
        const topRated = await topRatedRes.json();
        if (topRated.results) {
            renderMovieRow('toprated-row', topRated.results);
        }
        
        // Load upcoming
        const upcomingRes = await fetch(API_BASE + '/movies/upcoming');
        const upcoming = await upcomingRes.json();
        if (upcoming.results) {
            renderMovieRow('upcoming-row', upcoming.results);
        }
        
    } catch (err) {
        console.error('Failed to load movies:', err);
    }
}

function loadMoviesPage() {
    // Show all sections when on movies page
    document.getElementById('trending-section').classList.remove('hidden');
    document.getElementById('toprated-section').classList.remove('hidden');
    document.getElementById('upcoming-section').classList.remove('hidden');
}

// Set hero movie
function setHeroMovie(movie) {
    currentHeroMovie = movie;
    
    document.getElementById('hero-backdrop').style.backgroundImage = 
        movie.backdrop_path ? `url(${IMG_BASE}original${movie.backdrop_path})` : 'none';
    document.getElementById('hero-title').textContent = movie.title || movie.name;
    document.getElementById('hero-overview').textContent = movie.overview;
    document.getElementById('hero-rating').innerHTML = `<span style="color: #D4AF37;">&#9733;</span> ${movie.vote_average?.toFixed(1) || 'N/A'}`;
    document.getElementById('hero-year').textContent = (movie.release_date || movie.first_air_date || '').split('-')[0];
    
    updateHeroWatchlistBtn();
}

function updateHeroWatchlistBtn() {
    const btn = document.getElementById('hero-watchlist-btn');
    const inList = watchlist.some(w => w.movie_id === currentHeroMovie?.id);
    
    if (inList) {
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> In Watchlist`;
        btn.classList.add('in-watchlist');
    } else {
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg> Add to Watchlist`;
        btn.classList.remove('in-watchlist');
    }
}

async function toggleHeroWatchlist() {
    if (!currentUser) {
        showAuthModal();
        return;
    }
    await toggleWatchlist(currentHeroMovie);
    updateHeroWatchlistBtn();
}

async function playHeroTrailer() {
    if (currentHeroMovie) {
        openMovieDetail(currentHeroMovie);
    }
}

// Render movie row
function renderMovieRow(containerId, movies) {
    const container = document.getElementById(containerId);
    container.innerHTML = movies.map(movie => createMovieCard(movie)).join('');
}

// Render movie grid
function renderMovieGrid(containerId, movies) {
    const container = document.getElementById(containerId);
    container.innerHTML = movies.map(movie => createMovieCard(movie)).join('');
}

// Create movie card
function createMovieCard(movie) {
    const inWatchlist = watchlist.some(w => w.movie_id === movie.id);
    const posterUrl = movie.poster_path 
        ? `${IMG_BASE}w342${movie.poster_path}`
        : 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 450"><rect fill="%231a1a1a" width="300" height="450"/><text x="150" y="225" fill="%23666" text-anchor="middle" font-family="sans-serif">No Image</text></svg>';
    
    return `
        <div class="movie-card" onclick="openMovieDetail(${JSON.stringify(movie).replace(/"/g, '&quot;')})">
            <img src="${posterUrl}" alt="${movie.title || movie.name}" loading="lazy">
            <div class="movie-card-actions">
                <button class="card-action-btn ${inWatchlist ? 'in-watchlist' : ''}" 
                        onclick="event.stopPropagation(); toggleWatchlistCard(${movie.id}, this)"
                        title="${inWatchlist ? 'Remove from Watchlist' : 'Add to Watchlist'}">
                    <svg viewBox="0 0 24 24" fill="${inWatchlist ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                        ${inWatchlist 
                            ? '<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>'
                            : '<path d="M12 5v14M5 12h14"/>'
                        }
                    </svg>
                </button>
            </div>
            <div class="movie-card-overlay">
                <div class="movie-card-title">${movie.title || movie.name}</div>
                <div class="movie-card-meta">
                    <span class="movie-card-rating">&#9733; ${movie.vote_average?.toFixed(1) || 'N/A'}</span>
                    <span>${(movie.release_date || movie.first_air_date || '').split('-')[0]}</span>
                </div>
            </div>
        </div>
    `;
}

// Movie detail modal
async function openMovieDetail(movie) {
    const modal = document.getElementById('movie-modal');
    const container = document.getElementById('movie-detail-container');
    
    // Fetch movie details with videos
    let trailerKey = null;
    try {
        const res = await fetch(`${API_BASE}/movies/${movie.id}`);
        const details = await res.json();
        
        if (details.videos?.results) {
            const trailer = details.videos.results.find(v => v.type === 'Trailer' && v.site === 'YouTube');
            if (trailer) trailerKey = trailer.key;
        }
        
        // Merge details
        movie = { ...movie, ...details };
    } catch (err) {
        console.error('Failed to fetch movie details:', err);
    }
    
    const inWatchlist = watchlist.some(w => w.movie_id === movie.id);
    const backdropUrl = movie.backdrop_path ? `${IMG_BASE}original${movie.backdrop_path}` : '';
    const posterUrl = movie.poster_path ? `${IMG_BASE}w342${movie.poster_path}` : '';
    
    const movieGenres = movie.genres || genres.filter(g => movie.genre_ids?.includes(g.id));
    
    container.innerHTML = `
        <div class="movie-detail-backdrop" style="background-image: url('${backdropUrl}')"></div>
        <div class="movie-detail-info">
            <div class="movie-detail-header">
                <img src="${posterUrl}" alt="${movie.title}" class="movie-detail-poster">
                <div class="movie-detail-text">
                    <h1>${movie.title || movie.name}</h1>
                    <div class="movie-detail-meta">
                        <span><span class="rating-star">&#9733;</span> ${movie.vote_average?.toFixed(1) || 'N/A'}</span>
                        <span>${(movie.release_date || '').split('-')[0]}</span>
                        <span>${movie.runtime ? movie.runtime + ' min' : ''}</span>
                    </div>
                    <div class="movie-detail-genres">
                        ${movieGenres.map(g => `<span class="genre-tag">${g.name}</span>`).join('')}
                    </div>
                </div>
            </div>
            <p class="movie-detail-overview">${movie.overview || 'No overview available.'}</p>
            <div class="movie-detail-actions">
                <button class="btn-primary" id="detail-watchlist-btn" onclick="toggleWatchlistDetail(${movie.id})">
                    ${inWatchlist 
                        ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> In Watchlist'
                        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg> Add to Watchlist'
                    }
                </button>
            </div>
            <div class="trailer-container">
                ${trailerKey 
                    ? `<iframe src="https://www.youtube.com/embed/${trailerKey}?rel=0&modestbranding=1" allowfullscreen></iframe>`
                    : '<div class="no-trailer">No trailer available</div>'
                }
            </div>
        </div>
    `;
    
    // Store for watchlist toggle
    container.dataset.movie = JSON.stringify(movie);
    
    modal.classList.remove('hidden');
}

function closeMovieModal() {
    document.getElementById('movie-modal').classList.add('hidden');
}

// Watchlist functions
async function loadWatchlist() {
    if (!currentUser) return;
    
    try {
        const res = await fetch(`${API_BASE}/watchlist/${currentUser.id}`);
        watchlist = await res.json();
    } catch (err) {
        console.error('Failed to load watchlist:', err);
        watchlist = [];
    }
}

async function toggleWatchlist(movie) {
    if (!currentUser) {
        showAuthModal();
        return;
    }
    
    const inList = watchlist.some(w => w.movie_id === movie.id);
    
    try {
        if (inList) {
            await fetch(`${API_BASE}/watchlist/${currentUser.id}/${movie.id}`, { method: 'DELETE' });
            watchlist = watchlist.filter(w => w.movie_id !== movie.id);
        } else {
            await fetch(`${API_BASE}/watchlist`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: currentUser.id,
                    movie_id: movie.id,
                    title: movie.title || movie.name,
                    poster_path: movie.poster_path,
                    vote_average: movie.vote_average,
                    release_date: movie.release_date || movie.first_air_date
                })
            });
            watchlist.push({
                movie_id: movie.id,
                title: movie.title || movie.name,
                poster_path: movie.poster_path,
                vote_average: movie.vote_average,
                release_date: movie.release_date || movie.first_air_date
            });
        }
    } catch (err) {
        console.error('Failed to update watchlist:', err);
    }
}

async function toggleWatchlistCard(movieId, btn) {
    if (!currentUser) {
        showAuthModal();
        return;
    }
    
    const inList = watchlist.some(w => w.movie_id === movieId);
    
    // Find movie data from existing cards or fetch it
    let movie = { id: movieId };
    const card = btn.closest('.movie-card');
    if (card) {
        const img = card.querySelector('img');
        const title = card.querySelector('.movie-card-title')?.textContent;
        movie = {
            id: movieId,
            title: title,
            poster_path: img?.src.includes('image.tmdb.org') ? img.src.split('/w342')[1] : null,
            vote_average: parseFloat(card.querySelector('.movie-card-rating')?.textContent.replace('\u2605 ', '')) || 0
        };
    }
    
    await toggleWatchlist(movie);
    
    // Update button appearance
    btn.classList.toggle('in-watchlist');
    btn.innerHTML = btn.classList.contains('in-watchlist')
        ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>';
}

async function toggleWatchlistDetail(movieId) {
    if (!currentUser) {
        showAuthModal();
        return;
    }
    
    const container = document.getElementById('movie-detail-container');
    const movie = JSON.parse(container.dataset.movie);
    
    await toggleWatchlist(movie);
    
    const btn = document.getElementById('detail-watchlist-btn');
    const inList = watchlist.some(w => w.movie_id === movieId);
    
    btn.innerHTML = inList
        ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> In Watchlist'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg> Add to Watchlist';
}

function displayWatchlist() {
    const grid = document.getElementById('watchlist-grid');
    const emptyMsg = document.getElementById('watchlist-empty');
    
    if (watchlist.length === 0) {
        grid.innerHTML = '';
        emptyMsg.classList.remove('hidden');
        return;
    }
    
    emptyMsg.classList.add('hidden');
    
    // Convert watchlist items to movie format for card rendering
    const movies = watchlist.map(w => ({
        id: w.movie_id,
        title: w.title,
        poster_path: w.poster_path,
        vote_average: w.vote_average,
        release_date: w.release_date
    }));
    
    renderMovieGrid('watchlist-grid', movies);
}

// Search
let searchTimeout;

document.getElementById('search-input').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        if (e.target.value.trim()) {
            searchMovies();
        }
    }, 500);
});

document.getElementById('search-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        searchMovies();
    }
});

async function searchMovies() {
    const query = document.getElementById('search-input').value.trim();
    if (!query) return;
    
    try {
        const res = await fetch(`${API_BASE}/movies/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        
        // Show search results
        document.getElementById('trending-section').classList.add('hidden');
        document.getElementById('toprated-section').classList.add('hidden');
        document.getElementById('upcoming-section').classList.add('hidden');
        document.getElementById('watchlist-section').classList.add('hidden');
        document.getElementById('genre-section').classList.add('hidden');
        document.getElementById('search-section').classList.remove('hidden');
        
        if (data.results?.length) {
            renderMovieGrid('search-results', data.results);
        } else {
            document.getElementById('search-results').innerHTML = '<p class="empty-message">No movies found</p>';
        }
        
    } catch (err) {
        console.error('Search failed:', err);
    }
}

// Genre filter
async function filterByGenre(genreId, genreName) {
    // Update active state
    document.querySelectorAll('.genre-pill').forEach(p => p.classList.remove('active'));
    document.querySelector(`[data-id="${genreId}"]`)?.classList.add('active');
    
    try {
        const res = await fetch(`${API_BASE}/movies/genre/${genreId}`);
        const data = await res.json();
        
        // Show genre results
        document.getElementById('trending-section').classList.add('hidden');
        document.getElementById('toprated-section').classList.add('hidden');
        document.getElementById('upcoming-section').classList.add('hidden');
        document.getElementById('watchlist-section').classList.add('hidden');
        document.getElementById('search-section').classList.add('hidden');
        document.getElementById('genre-section').classList.remove('hidden');
        
        document.getElementById('genre-name').textContent = genreName;
        
        if (data.results?.length) {
            renderMovieGrid('genre-results', data.results);
        } else {
            document.getElementById('genre-results').innerHTML = '<p class="empty-message">No movies found in this genre</p>';
        }
        
    } catch (err) {
        console.error('Genre filter failed:', err);
    }
}

// Close modals on escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeMovieModal();
        closeAuthModal();
    }
});

// Close modal on backdrop click
document.getElementById('movie-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('movie-modal')) {
        closeMovieModal();
    }
});

document.getElementById('auth-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('auth-modal')) {
        closeAuthModal();
    }
});
