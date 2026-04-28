const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const express = require('express');
const pathModule = require('path');

const JWT_SECRET = 'cinevault_secret_2024_luxury_cinema';
const TMDB_API_KEY = '8cf43ad9c085135b9479ad5cf6bbcbda';
const PUBLIC_DIR = pathModule.join(__dirname, '..', 'public');

module.exports = (app, sql) => {

  // ---- MOVIE ROUTES (no auth required) ----
  app.get('/cinevault/movies/trending', async (req, res) => {
    try {
      const response = await fetch('https://api.themoviedb.org/3/trending/movie/week?api_key=' + TMDB_API_KEY);
      const data = await response.json();
      res.json(data);
    } catch (err) {
      console.error('[CineVault] Trending error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/cinevault/movies/top_rated', async (req, res) => {
    try {
      const response = await fetch('https://api.themoviedb.org/3/movie/top_rated?api_key=' + TMDB_API_KEY);
      const data = await response.json();
      res.json(data);
    } catch (err) {
      console.error('[CineVault] Top rated error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/cinevault/movies/upcoming', async (req, res) => {
    try {
      const response = await fetch('https://api.themoviedb.org/3/movie/upcoming?api_key=' + TMDB_API_KEY);
      const data = await response.json();
      res.json(data);
    } catch (err) {
      console.error('[CineVault] Upcoming error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/cinevault/movies/search', async (req, res) => {
    try {
      const query = req.query.query || '';
      const response = await fetch('https://api.themoviedb.org/3/search/movie?api_key=' + TMDB_API_KEY + '&query=' + encodeURIComponent(query));
      const data = await response.json();
      res.json(data);
    } catch (err) {
      console.error('[CineVault] Search error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/cinevault/movies/genre/:genreId', async (req, res) => {
    try {
      const response = await fetch('https://api.themoviedb.org/3/discover/movie?api_key=' + TMDB_API_KEY + '&with_genres=' + req.params.genreId);
      const data = await response.json();
      res.json(data);
    } catch (err) {
      console.error('[CineVault] Genre error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/cinevault/movies/:id', async (req, res) => {
    try {
      const response = await fetch('https://api.themoviedb.org/3/movie/' + req.params.id + '?api_key=' + TMDB_API_KEY + '&append_to_response=videos,credits,similar');
      const data = await response.json();
      res.json(data);
    } catch (err) {
      console.error('[CineVault] Movie detail error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ---- AUTH ROUTES ----
  app.post('/cinevault/api/signup', async (req, res) => {
    try {
      const { username, email, password } = req.body;
      if (!username || !email || !password) return res.status(400).json({ error: 'All fields required' });
      const passwordHash = await bcrypt.hash(password, 10);
      const result = await sql`
        INSERT INTO cinevault_users (username, email, password_hash)
        VALUES (${username}, ${email}, ${passwordHash})
        RETURNING id, username, email
      `;
      const token = jwt.sign({ userId: result[0].id, username: result[0].username }, JWT_SECRET, { expiresIn: '30d' });
      res.json({ success: true, user: result[0], token });
    } catch (err) {
      if (err.message.includes('duplicate') || err.message.includes('unique')) {
        res.status(400).json({ error: 'Username or email already taken' });
      } else {
        res.status(500).json({ error: err.message });
      }
    }
  });

  app.post('/cinevault/api/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
      const users = await sql`SELECT * FROM cinevault_users WHERE email = ${email}`;
      if (users.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
      const user = users[0];
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
      const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
      res.json({ success: true, user: { id: user.id, username: user.username, email: user.email }, token });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.userId = decoded.userId;
      next();
    } catch { res.status(401).json({ error: 'Invalid token' }); }
  };

  app.post('/cinevault/api/watchlist', verifyToken, async (req, res) => {
    try {
      const { movieId, movieTitle, moviePoster, movieYear, movieRating } = req.body;
      await sql`
        INSERT INTO cinevault_watchlist (user_id, movie_id, movie_title, movie_poster, movie_year, movie_rating)
        VALUES (${req.userId}, ${movieId}, ${movieTitle}, ${moviePoster}, ${movieYear}, ${movieRating})
        ON CONFLICT (user_id, movie_id) DO NOTHING
      `;
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.delete('/cinevault/api/watchlist/:movieId', verifyToken, async (req, res) => {
    try {
      await sql`DELETE FROM cinevault_watchlist WHERE user_id = ${req.userId} AND movie_id = ${parseInt(req.params.movieId)}`;
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get('/cinevault/api/watchlist', verifyToken, async (req, res) => {
    try {
      const watchlist = await sql`SELECT * FROM cinevault_watchlist WHERE user_id = ${req.userId} ORDER BY added_at DESC`;
      res.json(watchlist);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get('/cinevault/api/watchlist/check/:movieId', verifyToken, async (req, res) => {
    try {
      const result = await sql`SELECT 1 FROM cinevault_watchlist WHERE user_id = ${req.userId} AND movie_id = ${parseInt(req.params.movieId)}`;
      res.json({ inWatchlist: result.length > 0 });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  console.log('[CineVault] Movie routes loaded - no auth required for browsing!');
};
