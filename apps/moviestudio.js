
const { neon } = require("@neondatabase/serverless");
const Anthropic = require("@anthropic-ai/sdk");

const sql = neon(process.env.DATABASE_URL || "postgresql://neondb_owner:npg_kT50YOCedwLf@ep-snowy-darkness-a4sa5ao8-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require");
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

module.exports = (app) => {

  // Generate full movie concept
  app.post("/api/moviestudio/generate", async (req, res) => {
    try {
      const { prompt, genre, tone, era, rating } = req.body;
      if (!prompt) return res.status(400).json({ error: "Prompt required" });

      const aiResp = await anthropic.messages.create({
        model: "claude-opus-4-5",
        max_tokens: 3000,
        system: "You are a Hollywood movie studio executive. Return ONLY valid raw JSON with no markdown, no code blocks, no explanation.",
        messages: [{
          role: "user",
          content: `Create a complete movie concept for: "${prompt}"
Genre preference: ${genre || "any"}, Tone (1=serious,10=campy): ${tone || 5}, Era: ${era || "modern"}, Rating: ${rating || "PG-13"}.

Return ONLY this JSON structure (no markdown, no backticks):
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
    {"role": "Hero Name", "actor": "Actor Name", "description": "Character description"},
    {"role": "Villain Name", "actor": "Actor Name", "description": "Character description"},
    {"role": "Sidekick Name", "actor": "Actor Name", "description": "Character description"},
    {"role": "Love Interest", "actor": "Actor Name", "description": "Character description"},
    {"role": "Mentor", "actor": "Actor Name", "description": "Character description"}
  ],
  "budget": {
    "total": "$150 million",
    "cast": "$45 million",
    "production": "$55 million",
    "vfx": "$35 million",
    "marketing": "$15 million"
  },
  "trailer": [
    {"scene": 1, "timestamp": "0:00 - 0:15", "visual": "What the audience sees", "audio": "Sound/music description", "dialogue": "Any spoken line or voiceover"},
    {"scene": 2, "timestamp": "0:15 - 0:35", "visual": "Scene description", "audio": "Audio description", "dialogue": "Dialogue or voiceover"},
    {"scene": 3, "timestamp": "0:35 - 0:55", "visual": "Scene description", "audio": "Audio description", "dialogue": "Dialogue"},
    {"scene": 4, "timestamp": "0:55 - 1:15", "visual": "Action/tension scene", "audio": "Audio description", "dialogue": "Dialogue"},
    {"scene": 5, "timestamp": "1:15 - 1:40", "visual": "Climax montage", "audio": "Epic music swell", "dialogue": "Final line"},
    {"scene": 6, "timestamp": "1:40 - 2:00", "visual": "Title card reveal", "audio": "Music fade", "dialogue": "Title + release date"}
  ]
}`
        }]
      });

      let raw = aiResp.content[0].text || "";
      // Strip markdown if AI wraps in code blocks
      raw = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();

      let movie;
      try {
        movie = JSON.parse(raw);
      } catch(e) {
        console.error("[MovieStudio] JSON parse fail:", e.message, "Raw:", raw.substring(0, 300));
        return res.status(500).json({ error: "AI returned invalid JSON", raw: raw.substring(0, 500) });
      }

      // Save to DB
      try {
        const saved = await sql`
          INSERT INTO movie_films (title, tagline, genre, rating, synopsis, full_data, user_prompt)
          VALUES (${movie.title}, ${movie.tagline}, ${movie.genre}, ${movie.rating}, ${movie.synopsis}, ${JSON.stringify(movie)}, ${prompt})
          RETURNING id
        `;
        movie.id = saved[0].id;
      } catch(dbErr) {
        console.error("[MovieStudio] DB save error:", dbErr.message);
      }

      res.json({ success: true, movie });
    } catch (err) {
      console.error("[MovieStudio] Generate error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Get recent movies
  app.get("/api/moviestudio/recent", async (req, res) => {
    try {
      const movies = await sql`SELECT id, title, tagline, genre, rating, created_at FROM movie_films ORDER BY created_at DESC LIMIT 12`;
      res.json({ movies });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get single movie
  app.get("/api/moviestudio/movie/:id", async (req, res) => {
    try {
      const movies = await sql`SELECT full_data FROM movie_films WHERE id = ${req.params.id}`;
      if (!movies.length) return res.status(404).json({ error: "Not found" });
      res.json({ movie: movies[0].full_data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  console.log("[MovieStudio] Routes loaded OK - using Anthropic direct");
};
