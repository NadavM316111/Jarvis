
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const TMDB_KEY = "73a5e3b3a1e4a2f5c3d8e6f7b2c4a9d1";

module.exports = (app, sql) => {

  // ── AUTH ──────────────────────────────────────────────
  app.post("/cinevault/signup", async (req, res) => {
    try {
      const { username, email, password } = req.body;
      if (!username || !email || !password) return res.status(400).json({ error: "All fields required" });
      const hash = await bcrypt.hash(password, 10);
      const colors = ["#e50914","#f5c518","#00d4ff","#a855f7","#22c55e","#f97316"];
      const color = colors[Math.floor(Math.random() * colors.length)];
      const [user] = await sql`INSERT INTO cinevault_users (username, email, password_hash, avatar_color) VALUES (${username}, ${email}, ${hash}, ${color}) RETURNING id, username, email, avatar_color`;
      const token = crypto.randomBytes(32).toString("hex");
      await sql`INSERT INTO cinevault_sessions (user_id, token) VALUES (${user.id}, ${token})`;
      res.json({ token, user });
    } catch (e) {
      if (e.message && e.message.includes("unique")) return res.status(400).json({ error: "Username or email already exists" });
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/cinevault/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      const [user] = await sql`SELECT * FROM cinevault_users WHERE email = ${email}`;
      if (!user) return res.status(401).json({ error: "Invalid credentials" });
      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) return res.status(401).json({ error: "Invalid credentials" });
      const token = crypto.randomBytes(32).toString("hex");
      await sql`INSERT INTO cinevault_sessions (user_id, token) VALUES (${user.id}, ${token})`;
      res.json({ token, user: { id: user.id, username: user.username, email: user.email, avatar_color: user.avatar_color } });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/cinevault/logout", async (req, res) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (token) await sql`DELETE FROM cinevault_sessions WHERE token = ${token}`;
    res.json({ ok: true });
  });

  async function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    const [session] = await sql`SELECT s.*, u.id as uid, u.username, u.email, u.avatar_color FROM cinevault_sessions s JOIN cinevault_users u ON u.id = s.user_id WHERE s.token = ${token}`;
    if (!session) return res.status(401).json({ error: "Invalid session" });
    req.user = { id: session.uid, username: session.username, email: session.email, avatar_color: session.avatar_color };
    next();
  }

  app.get("/cinevault/me", authMiddleware, (req, res) => res.json(req.user));

  // ── WATCHLIST ────────────────────────────────────────
  app.get("/cinevault/watchlist", authMiddleware, async (req, res) => {
    const items = await sql`SELECT * FROM cinevault_watchlist WHERE user_id = ${req.user.id} ORDER BY added_at DESC`;
    res.json(items);
  });

  app.post("/cinevault/watchlist", authMiddleware, async (req, res) => {
    try {
      const { movie_id, movie_title, movie_poster, movie_year, movie_rating } = req.body;
      await sql`INSERT INTO cinevault_watchlist (user_id, movie_id, movie_title, movie_poster, movie_year, movie_rating) VALUES (${req.user.id}, ${movie_id}, ${movie_title}, ${movie_poster}, ${movie_year}, ${movie_rating}) ON CONFLICT (user_id, movie_id) DO NOTHING`;
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/cinevault/watchlist/:movieId", authMiddleware, async (req, res) => {
    await sql`DELETE FROM cinevault_watchlist WHERE user_id = ${req.user.id} AND movie_id = ${req.params.movieId}`;
    res.json({ ok: true });
  });

  // ── TMDB PROXY ───────────────────────────────────────
  const fetch = (...args) => import("node-fetch").then(m => m.default(...args));
  const TMDB = "https://api.themoviedb.org/3";
  const KEY = "api_key=8265bd1679663a7ea12ac168da84d2e8";

  app.get("/cinevault/trending", async (req, res) => {
    try {
      const r = await fetch(`${TMDB}/trending/movie/week?${KEY}`);
      const d = await r.json();
      res.json(d);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get("/cinevault/search", async (req, res) => {
    try {
      const q = encodeURIComponent(req.query.q || "");
      const r = await fetch(`${TMDB}/search/movie?query=${q}&${KEY}`);
      const d = await r.json();
      res.json(d);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get("/cinevault/genre/:id", async (req, res) => {
    try {
      const r = await fetch(`${TMDB}/discover/movie?with_genres=${req.params.id}&sort_by=popularity.desc&${KEY}`);
      const d = await r.json();
      res.json(d);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get("/cinevault/movie/:id", async (req, res) => {
    try {
      const [details, videos, credits, similar] = await Promise.all([
        fetch(`${TMDB}/movie/${req.params.id}?${KEY}`).then(r => r.json()),
        fetch(`${TMDB}/movie/${req.params.id}/videos?${KEY}`).then(r => r.json()),
        fetch(`${TMDB}/movie/${req.params.id}/credits?${KEY}`).then(r => r.json()),
        fetch(`${TMDB}/movie/${req.params.id}/similar?${KEY}`).then(r => r.json())
      ]);
      res.json({ ...details, videos: videos.results, cast: credits.cast?.slice(0,10), similar: similar.results?.slice(0,6) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get("/cinevault/nowplaying", async (req, res) => {
    try {
      const r = await fetch(`${TMDB}/movie/now_playing?${KEY}`);
      const d = await r.json();
      res.json(d);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get("/cinevault/toprated", async (req, res) => {
    try {
      const r = await fetch(`${TMDB}/movie/top_rated?${KEY}`);
      const d = await r.json();
      res.json(d);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
};
