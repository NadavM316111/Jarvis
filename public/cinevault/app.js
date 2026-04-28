
// CineVault - Movie Discovery App
const API_BASE = '/cinevault/api';
const IMG_BASE = 'https://image.tmdb.org/t/p';

// State
let currentUser = null;
let authToken = localStorage.getItem('cinevault_token');
let watchlistIds = new Set();
let genres = [];

// DOM Elements
const introOverlay = document.getElementById('intro-overlay');
const homePage = document.getElementById('home-page');
const detailPage = document.getElementById('detail-page');
const watchlistPage = document.getElementById('watchlist-page');
const authModal = document.getElementById('auth-modal');

// ============ INITIALIZATION ============
document.addEventListener('DOMContentLoaded', async () => {
  // Show intro animation
  setTimeout(() => {
    introOverlay.classList.add('hidden');
  }, 3500);

  // Check auth
  if (authToken) {
    await checkAuth();
  }
  updateAuthUI();

  // Load initial data
  await loadGenres();
  await loadHeroMovie();
  await loadTrending();
  await loadNowPlaying();
  await loadTopRated();
  await loadUpcoming();

  // Header scroll effect
  window.addEventListener('scroll', () => {
    document.querySelector('.header').classList.toggle('scrolled', window.scrollY > 50);
  });

  // Search functionality
  setupSearch();
});

// ============ AUTH FUNCTIONS ============
async function checkAuth() {
  try {
    const res = await fetch(API_BASE + '/me', {
      headers: { 'Authorization': 'Bearer ' + authToken }
    });
    if (res.ok) {
      const data = await res.json();
      currentUser = data.user;
      await loadWatchlistIds();
    } else {
      logout();
    }
  } catch (err) {
    console.error('Auth check failed:', err);
  }
}

function updateAuthUI() {
  const authBtn = document.getElementById('auth-btn');
  const userSection = document.getElementById('user-section');
  
  if (currentUser) {
    authBtn.style.display = 'none';
    userSection.style.display = 'flex';
    document.getElementById('user-initial').textContent = currentUser.username.charAt(0).toUpperCase();
  } else {
    authBtn.style.display = 'block';
    userSection.style.display = 'none';
  }
}

function showAuthModal(mode = 'login') {
  authModal.classList.add('show');
  document.getElementById('auth-mode').value = mode;
  document.getElementById('auth-title').textContent = mode === 'login' ? 'Sign In' : 'Create Account';
  document.getElementById('auth-submit-btn').textContent = mode === 'login' ? 'Sign In' : 'Sign Up';
  document.getElementById('username-group').style.display = mode === 'signup' ? 'block' : 'none';
  document.getElementById('auth-switch').innerHTML = mode === 'login' 
    ? 'New to CineVault? <a onclick="showAuthModal(\'signup\')">Sign up now</a>'
    : 'Already have an account? <a onclick="showAuthModal(\'login\')">Sign in</a>';
  document.getElementById('auth-error').classList.remove('show');
}

function hideAuthModal() {
  authModal.classList.remove('show');
}

async function handleAuth(e) {
  e.preventDefault();
  const mode = document.getElementById('auth-mode').value;
  const email = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-password').value;
  const username = document.getElementById('auth-username').value;

  const errorEl = document.getElementById('auth-error');

  try {
    const endpoint = mode === 'login' ? '/login' : '/signup';
    const body = mode === 'login' ? { email, password } : { email, username, password };

    const res = await fetch(API_BASE + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await res.json();

    if (!res.ok) {
      errorEl.textContent = data.error || 'Authentication failed';
      errorEl.classList.add('show');
      return;
    }

    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem('cinevault_token', authToken);
    await loadWatchlistIds();
    updateAuthUI();
    hideAuthModal();
  } catch (err) {
    errorEl.textContent = 'Connection error. Please try again.';
    errorEl.classList.add('show');
  }
}

function logout() {
  fetch(API_BASE + '/logout', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + authToken }
  });
  authToken = null;
  currentUser = null;
  watchlistIds.clear();
  localStorage.removeItem('cinevault_token');
  updateAuthUI();
  showHome();
}

function toggleUserMenu() {
  document.getElementById('user-menu').classList.toggle('show');
}

// ============ DATA LOADING ============
async function loadGenres() {
  try {
    const res = await fetch(API_BASE + '/genres');
    const data = await res.json();
    genres = data.genres || [];
    renderGenreFilters();
  } catch (err) {
    console.error('Failed to load genres:', err);
  }
}

async function loadHeroMovie() {
  try {
    const res = await fetch(API_BASE + '/trending');
    const data = await res.json();
    if (data.results && data.results.length > 0) {
      const movie = data.results[0];
      renderHero(movie);
    }
  } catch (err) {
    console.error('Failed to load hero:', err);
  }
}

async function loadTrending() {
  try {
    const res = await fetch(API_BASE + '/trending');
    const data = await res.json();
    renderMovieRow('trending-row', data.results || []);
  } catch (err) {
    console.error('Failed to load trending:', err);
  }
}

async function loadNowPlaying() {
  try {
    const res = await fetch(API_BASE + '/now-playing');
    const data = await res.json();
    renderMovieRow('now-playing-row', data.results || []);
  } catch (err) {
    console.error('Failed to load now playing:', err);
  }
}

async function loadTopRated() {
  try {
    const res = await fetch(API_BASE + '/top-rated');
    const data = await res.json();
    renderMovieRow('top-rated-row', data.results || []);
  } catch (err) {
    console.error('Failed to load top rated:', err);
  }
}

async function loadUpcoming() {
  try {
    const res = await fetch(API_BASE + '/upcoming');
    const data = await res.json();
    renderMovieRow('upcoming-row', data.results || []);
  } catch (err) {
    console.error('Failed to load upcoming:', err);
  }
}

async function loadWatchlistIds() {
  if (!authToken) return;
  try {
    const res = await fetch(API_BASE + '/watchlist', {
      headers: { 'Authorization': 'Bearer ' + authToken }
    });
    const data = await res.json();
    watchlistIds = new Set((data.watchlist || []).map(m => m.movie_id));
  } catch (err) {
    console.error('Failed to load watchlist:', err);
  }
}

// ============ RENDERING ============
function renderHero(movie) {
  const hero = document.getElementById('hero');
  hero.innerHTML = `
    <div class="hero-backdrop" style="background-image: url('${IMG_BASE}/original${movie.backdrop_path}')"></div>
    <div class="hero-content">
      <h1 class="hero-title">${movie.title}</h1>
      <div class="hero-meta">
        <span class="hero-rating">&#9733; ${movie.vote_average?.toFixed(1)}</span>
        <span class="hero-year">${movie.release_date?.split('-')[0]}</span>
      </div>
      <p class="hero-overview">${movie.overview}</p>
      <div class="hero-buttons">
        <button class="btn-play" onclick="showMovieDetail(${movie.id})">
          &#9658; Watch Trailer
        </button>
        <button class="btn-info" onclick="showMovieDetail(${movie.id})">
          &#8505; More Info
        </button>
      </div>
    </div>
  `;
}

function renderMovieRow(containerId, movies) {
  const container = document.getElementById(containerId);
  container.innerHTML = movies.map(movie => createMovieCard(movie)).join('');
}

function createMovieCard(movie) {
  const isInWatchlist = watchlistIds.has(movie.id);
  return `
    <div class="movie-card" onclick="showMovieDetail(${movie.id})">
      <div class="movie-poster">
        <img src="${movie.poster_path ? IMG_BASE + '/w342' + movie.poster_path : 'https://via.placeholder.com/200x300?text=No+Image'}" 
             alt="${movie.title}" loading="lazy">
      </div>
      <div class="movie-info">
        <div class="movie-title-small">${movie.title}</div>
        <div class="movie-rating-small">&#9733; ${movie.vote_average?.toFixed(1)}</div>
        <div class="movie-actions">
          <button class="movie-action-btn ${isInWatchlist ? 'active' : ''}" 
                  onclick="event.stopPropagation(); toggleWatchlist(${movie.id}, '${encodeURIComponent(movie.title)}', '${movie.poster_path}', '${movie.backdrop_path}', '${encodeURIComponent(movie.overview || '')}', '${movie.release_date}', ${movie.vote_average})"
                  title="Add to Watchlist">
            ${isInWatchlist ? '&#10003;' : '+'}
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderGenreFilters() {
  const container = document.getElementById('genre-filters');
  container.innerHTML = '<button class="genre-chip active" data-genre="">All</button>' +
    genres.map(g => `<button class="genre-chip" data-genre="${g.id}">${g.name}</button>`).join('');
  
  container.addEventListener('click', async (e) => {
    if (e.target.classList.contains('genre-chip')) {
      document.querySelectorAll('.genre-chip').forEach(c => c.classList.remove('active'));
      e.target.classList.add('active');
      const genreId = e.target.dataset.genre;
      await filterByGenre(genreId);
    }
  });
}

async function filterByGenre(genreId) {
  try {
    const url = genreId ? API_BASE + '/discover?genre=' + genreId : API_BASE + '/popular';
    const res = await fetch(url);
    const data = await res.json();
    renderMovieRow('trending-row', data.results || []);
  } catch (err) {
    console.error('Filter failed:', err);
  }
}

// ============ SEARCH ============
function setupSearch() {
  const searchIcon = document.getElementById('search-icon');
  const searchInput = document.getElementById('search-input');
  let searchTimeout;

  searchIcon.addEventListener('click', () => {
    searchInput.classList.toggle('active');
    if (searchInput.classList.contains('active')) {
      searchInput.focus();
    }
  });

  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => searchMovies(e.target.value), 500);
  });

  searchInput.addEventListener('blur', () => {
    if (!searchInput.value) {
      searchInput.classList.remove('active');
    }
  });
}

async function searchMovies(query) {
  if (!query.trim()) {
    await loadTrending();
    return;
  }
  
  try {
    const res = await fetch(API_BASE + '/search?q=' + encodeURIComponent(query));
    const data = await res.json();
    renderMovieRow('trending-row', data.results || []);
  } catch (err) {
    console.error('Search failed:', err);
  }
}

// ============ MOVIE DETAIL ============
async function showMovieDetail(movieId) {
  try {
    const res = await fetch(API_BASE + '/movie/' + movieId);
    const movie = await res.json();
    
    // Check watchlist status
    let inWatchlist = false;
    if (authToken) {
      const checkRes = await fetch(API_BASE + '/watchlist/check/' + movieId, {
        headers: { 'Authorization': 'Bearer ' + authToken }
      });
      const checkData = await checkRes.json();
      inWatchlist = checkData.inWatchlist;
    }

    // Find trailer
    const trailer = movie.videos?.results?.find(v => v.type === 'Trailer' && v.site === 'YouTube');

    detailPage.innerHTML = `
      <div class="detail-backdrop" style="background-image: url('${IMG_BASE}/original${movie.backdrop_path}')"></div>
      <div class="detail-content">
        <button class="back-btn" onclick="showHome()">&#8592; Back to Browse</button>
        <div class="detail-header">
          <div class="detail-poster">
            <img src="${movie.poster_path ? IMG_BASE + '/w500' + movie.poster_path : 'https://via.placeholder.com/300x450?text=No+Image'}" alt="${movie.title}">
          </div>
          <div class="detail-info">
            <h1 class="detail-title">${movie.title}</h1>
            <div class="detail-meta">
              <span class="detail-rating">&#9733; ${movie.vote_average?.toFixed(1)}</span>
              <span class="detail-year">${movie.release_date?.split('-')[0]}</span>
              <span class="detail-runtime">${movie.runtime} min</span>
            </div>
            <div class="detail-genres">
              ${(movie.genres || []).map(g => `<span class="detail-genre">${g.name}</span>`).join('')}
            </div>
            <p class="detail-overview">${movie.overview}</p>
            <div class="detail-buttons">
              ${trailer ? `<button class="btn-play" onclick="document.getElementById('trailer-frame').scrollIntoView({behavior: 'smooth'})">&#9658; Watch Trailer</button>` : ''}
              <button class="btn-watchlist ${inWatchlist ? 'active' : ''}" id="detail-watchlist-btn"
                      onclick="toggleDetailWatchlist(${movie.id}, '${encodeURIComponent(movie.title)}', '${movie.poster_path}', '${movie.backdrop_path}', '${encodeURIComponent(movie.overview || '')}', '${movie.release_date}', ${movie.vote_average})">
                ${inWatchlist ? '&#10003; In Watchlist' : '+ Add to Watchlist'}
              </button>
            </div>
          </div>
        </div>

        ${trailer ? `
        <div class="trailer-section">
          <h2 class="section-title">Trailer</h2>
          <div class="trailer-container" id="trailer-frame">
            <iframe src="https://www.youtube.com/embed/${trailer.key}?rel=0" allowfullscreen></iframe>
          </div>
        </div>
        ` : ''}

        ${movie.credits?.cast?.length ? `
        <div class="cast-section">
          <h2 class="section-title">Top Cast</h2>
          <div class="cast-row">
            ${movie.credits.cast.slice(0, 10).map(actor => `
              <div class="cast-card">
                <div class="cast-photo">
                  <img src="${actor.profile_path ? IMG_BASE + '/w185' + actor.profile_path : 'https://via.placeholder.com/100x100?text=No+Photo'}" alt="${actor.name}">
                </div>
                <div class="cast-name">${actor.name}</div>
                <div class="cast-character">${actor.character}</div>
              </div>
            `).join('')}
          </div>
        </div>
        ` : ''}

        ${movie.similar?.results?.length ? `
        <div class="content-section">
          <h2 class="section-title">Similar Movies</h2>
          <div class="movie-row">
            ${movie.similar.results.slice(0, 10).map(m => createMovieCard(m)).join('')}
          </div>
        </div>
        ` : ''}
      </div>
    `;

    homePage.style.display = 'none';
    watchlistPage.classList.remove('active');
    detailPage.classList.add('active');
    window.scrollTo(0, 0);
  } catch (err) {
    console.error('Failed to load movie details:', err);
  }
}

function showHome() {
  detailPage.classList.remove('active');
  watchlistPage.classList.remove('active');
  homePage.style.display = 'block';
  window.scrollTo(0, 0);
}

// ============ WATCHLIST ============
async function toggleWatchlist(movieId, title, poster, backdrop, overview, releaseDate, rating) {
  if (!authToken) {
    showAuthModal('login');
    return;
  }

  try {
    if (watchlistIds.has(movieId)) {
      await fetch(API_BASE + '/watchlist/' + movieId, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + authToken }
      });
      watchlistIds.delete(movieId);
    } else {
      await fetch(API_BASE + '/watchlist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + authToken
        },
        body: JSON.stringify({
          movie_id: movieId,
          movie_title: decodeURIComponent(title),
          poster_path: poster,
          backdrop_path: backdrop,
          overview: decodeURIComponent(overview),
          release_date: releaseDate,
          vote_average: rating
        })
      });
      watchlistIds.add(movieId);
    }
    
    // Refresh rows
    await loadTrending();
    await loadNowPlaying();
    await loadTopRated();
    await loadUpcoming();
  } catch (err) {
    console.error('Watchlist toggle failed:', err);
  }
}

async function toggleDetailWatchlist(movieId, title, poster, backdrop, overview, releaseDate, rating) {
  if (!authToken) {
    showAuthModal('login');
    return;
  }

  const btn = document.getElementById('detail-watchlist-btn');
  const isInWatchlist = watchlistIds.has(movieId);

  try {
    if (isInWatchlist) {
      await fetch(API_BASE + '/watchlist/' + movieId, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + authToken }
      });
      watchlistIds.delete(movieId);
      btn.classList.remove('active');
      btn.innerHTML = '+ Add to Watchlist';
    } else {
      await fetch(API_BASE + '/watchlist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + authToken
        },
        body: JSON.stringify({
          movie_id: movieId,
          movie_title: decodeURIComponent(title),
          poster_path: poster,
          backdrop_path: backdrop,
          overview: decodeURIComponent(overview),
          release_date: releaseDate,
          vote_average: rating
        })
      });
      watchlistIds.add(movieId);
      btn.classList.add('active');
      btn.innerHTML = '&#10003; In Watchlist';
    }
  } catch (err) {
    console.error('Watchlist toggle failed:', err);
  }
}

async function showWatchlist() {
  if (!authToken) {
    showAuthModal('login');
    return;
  }

  try {
    const res = await fetch(API_BASE + '/watchlist', {
      headers: { 'Authorization': 'Bearer ' + authToken }
    });
    const data = await res.json();
    const watchlist = data.watchlist || [];

    watchlistPage.innerHTML = `
      <button class="back-btn" onclick="showHome()">&#8592; Back to Browse</button>
      <div class="watchlist-header">
        <h1 class="watchlist-title">My Watchlist</h1>
        <p class="watchlist-count">${watchlist.length} ${watchlist.length === 1 ? 'movie' : 'movies'}</p>
      </div>
      ${watchlist.length === 0 ? `
        <div class="watchlist-empty">
          <div class="watchlist-empty-icon">&#127916;</div>
          <h3>Your watchlist is empty</h3>
          <p>Start adding movies you want to watch!</p>
        </div>
      ` : `
        <div class="movie-grid">
          ${watchlist.map(movie => `
            <div class="movie-card" onclick="showMovieDetail(${movie.movie_id})">
              <div class="movie-poster">
                <img src="${movie.poster_path ? IMG_BASE + '/w342' + movie.poster_path : 'https://via.placeholder.com/200x300?text=No+Image'}" 
                     alt="${movie.movie_title}" loading="lazy">
              </div>
              <div class="movie-info" style="opacity: 1; transform: none;">
                <div class="movie-title-small">${movie.movie_title}</div>
                <div class="movie-rating-small">&#9733; ${parseFloat(movie.vote_average).toFixed(1)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      `}
    `;

    homePage.style.display = 'none';
    detailPage.classList.remove('active');
    watchlistPage.classList.add('active');
    window.scrollTo(0, 0);
  } catch (err) {
    console.error('Failed to load watchlist:', err);
  }
}

// Close user menu when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('#user-section')) {
    document.getElementById('user-menu')?.classList.remove('show');
  }
});
