const { neon } = require("@neondatabase/serverless");
const Anthropic = require("@anthropic-ai/sdk");

const sql = neon(process.env.DATABASE_URL);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

module.exports = (app) => {

  app.post("/api/moviestudio/generate", async (req, res) => {
    try {
      const { prompt, genre, tone, era, rating } = req.body;
      if (!prompt) return res.status(400).json({ error: "Prompt required" });

      const aiResp = await anthropic.messages.create({
        model: "claude-opus-4-5",
        max_tokens: 4000,
        system: "You are a Hollywood movie studio executive. Return ONLY valid raw JSON with no markdown, no code blocks, no explanation. Be concise in descriptions to stay within token limits.",
        messages: [{
          role: "user",
          content: `Create a complete movie concept for: "${prompt}"
Genre: ${genre || "any"}, Tone (1=serious,10=campy): ${tone || 5}, Era: ${era || "modern"}, Rating: ${rating || "PG-13"}.

Return ONLY this JSON (no markdown, no backticks):
{
  "title": "Movie Title",
  "tagline": "Catchy tagline",
  "genre": "Action",
  "rating": "PG-13",
  "runtime": "2h 15m",
  "synopsis": "3-4 sentence synopsis.",
  "director": "Famous Director",
  "studio": "Studio Name",
  "cast": [
    {"role": "Hero", "actor": "Actor Name", "description": "Brief description"},
    {"role": "Villain", "actor": "Actor Name", "description": "Brief description"},
    {"role": "Ally", "actor": "Actor Name", "description": "Brief description"},
    {"role": "Love Interest", "actor": "Actor Name", "description": "Brief description"},
    {"role": "Mentor", "actor": "Actor Name", "description": "Brief description"}
  ],
  "budget": {
    "total": "$150M",
    "cast": "$45M",
    "production": "$55M",
    "vfx": "$35M",
    "marketing": "$15M"
  },
  "trailer": [
    {"scene": 1, "timestamp": "0:00-0:15", "visual": "Opening scene", "audio": "Ambient sound", "dialogue": "Voiceover line"},
    {"scene": 2, "timestamp": "0:15-0:35", "visual": "Scene description", "audio": "Music", "dialogue": "Dialogue"},
    {"scene": 3, "timestamp": "0:35-0:55", "visual": "Scene description", "audio": "Music", "dialogue": "Dialogue"},
    {"scene": 4, "timestamp": "0:55-1:15", "visual": "Action scene", "audio": "Score", "dialogue": "Dialogue"},
    {"scene": 5, "timestamp": "1:15-1:40", "visual": "Climax", "audio": "Epic swell", "dialogue": "Final line"},
    {"scene": 6, "timestamp": "1:40-2:00", "visual": "Title card", "audio": "Music fade", "dialogue": "Title + release date"}
  ]
}`
        }]
      });

      let raw = aiResp.content[0].text || "";
      raw = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();

      let movie;
      try {
        movie = JSON.parse(raw);
      } catch(e) {
        console.error("[MovieStudio] JSON parse fail:", e.message, "\nRaw:", raw.substring(0, 500));
        return res.status(500).json({ error: "AI returned invalid JSON: " + e.message, raw: raw.substring(0, 800) });
      }

      // Save to DB (non-blocking)
      sql`
        INSERT INTO movie_films (title, tagline, genre, rating, synopsis, full_data, user_prompt)
        VALUES (${movie.title}, ${movie.tagline}, ${movie.genre}, ${movie.rating}, ${movie.synopsis}, ${JSON.stringify(movie)}, ${prompt})
        RETURNING id
      `.then(saved => { movie.id = saved[0].id; }).catch(e => console.error("[MovieStudio] DB save error:", e.message));

      res.json({ success: true, movie });
    } catch (err) {
      console.error("[MovieStudio] Generate error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/moviestudio/recent", async (req, res) => {
    try {
      const movies = await sql`SELECT id, title, tagline, genre, rating, created_at FROM movie_films ORDER BY created_at DESC LIMIT 12`;
      res.json({ movies });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/moviestudio/movie/:id", async (req, res) => {
    try {
      const movies = await sql`SELECT full_data FROM movie_films WHERE id = ${req.params.id}`;
      if (!movies.length) return res.status(404).json({ error: "Not found" });
      res.json({ movie: movies[0].full_data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  console.log("[MovieStudio] Routes loaded — /api/moviestudio/generate ready");
};