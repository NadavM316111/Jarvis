
// RANKED - Community Voting App
module.exports = (app, sql) => {
  
  // Get all categories
  app.get('/api/ranked/categories', async (req, res) => {
    try {
      const categories = await sql`SELECT * FROM ranked_categories ORDER BY id`;
      res.json(categories);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  
  // Get items by category (with pagination)
  app.get('/api/ranked/items/:categoryId', async (req, res) => {
    try {
      const { categoryId } = req.params;
      const { sort = 'hype', limit = 50 } = req.query;
      
      let items;
      if (sort === 'new') {
        items = await sql`SELECT * FROM ranked_items WHERE category_id = ${categoryId} ORDER BY created_at DESC LIMIT ${parseInt(limit)}`;
      } else if (sort === 'controversial') {
        items = await sql`SELECT * FROM ranked_items WHERE category_id = ${categoryId} ORDER BY (upvotes + downvotes) DESC, ABS(upvotes - downvotes) ASC LIMIT ${parseInt(limit)}`;
      } else {
        items = await sql`SELECT * FROM ranked_items WHERE category_id = ${categoryId} ORDER BY hype_score DESC LIMIT ${parseInt(limit)}`;
      }
      res.json(items);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  
  // Get trending (top across all categories)
  app.get('/api/ranked/trending', async (req, res) => {
    try {
      const items = await sql`
        SELECT i.*, c.name as category_name, c.icon as category_icon, c.color as category_color 
        FROM ranked_items i 
        JOIN ranked_categories c ON i.category_id = c.id 
        ORDER BY hype_score DESC 
        LIMIT 10
      `;
      res.json(items);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  
  // Search items
  app.get('/api/ranked/search', async (req, res) => {
    try {
      const { q } = req.query;
      if (!q) return res.json([]);
      const searchTerm = '%' + q + '%';
      const items = await sql`
        SELECT i.*, c.name as category_name, c.icon as category_icon 
        FROM ranked_items i 
        JOIN ranked_categories c ON i.category_id = c.id 
        WHERE LOWER(i.name) LIKE LOWER(${searchTerm}) 
        ORDER BY hype_score DESC 
        LIMIT 20
      `;
      res.json(items);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  
  // Submit new item
  app.post('/api/ranked/items', async (req, res) => {
    try {
      const { category_id, name, description } = req.body;
      if (!category_id || !name) {
        return res.status(400).json({ error: 'Category and name required' });
      }
      const result = await sql`
        INSERT INTO ranked_items (category_id, name, description, upvotes, downvotes, hype_score)
        VALUES (${category_id}, ${name}, ${description || ''}, 1, 0, 1)
        RETURNING *
      `;
      res.json(result[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  
  // Vote on item
  app.post('/api/ranked/vote', async (req, res) => {
    try {
      const { item_id, vote_type, voter_id } = req.body;
      if (!item_id || !vote_type || !voter_id) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      // Check existing vote
      const existing = await sql`SELECT * FROM ranked_votes WHERE item_id = ${item_id} AND voter_id = ${voter_id}`;
      
      if (existing.length > 0) {
        const oldVote = existing[0].vote_type;
        if (oldVote === vote_type) {
          // Remove vote (toggle off)
          await sql`DELETE FROM ranked_votes WHERE item_id = ${item_id} AND voter_id = ${voter_id}`;
          if (vote_type === 'up') {
            await sql`UPDATE ranked_items SET upvotes = upvotes - 1, hype_score = upvotes - downvotes - 1 WHERE id = ${item_id}`;
          } else {
            await sql`UPDATE ranked_items SET downvotes = downvotes - 1, hype_score = upvotes - downvotes + 1 WHERE id = ${item_id}`;
          }
        } else {
          // Change vote
          await sql`UPDATE ranked_votes SET vote_type = ${vote_type} WHERE item_id = ${item_id} AND voter_id = ${voter_id}`;
          if (vote_type === 'up') {
            await sql`UPDATE ranked_items SET upvotes = upvotes + 1, downvotes = downvotes - 1, hype_score = upvotes - downvotes + 2 WHERE id = ${item_id}`;
          } else {
            await sql`UPDATE ranked_items SET upvotes = upvotes - 1, downvotes = downvotes + 1, hype_score = upvotes - downvotes - 2 WHERE id = ${item_id}`;
          }
        }
      } else {
        // New vote
        await sql`INSERT INTO ranked_votes (item_id, voter_id, vote_type) VALUES (${item_id}, ${voter_id}, ${vote_type})`;
        if (vote_type === 'up') {
          await sql`UPDATE ranked_items SET upvotes = upvotes + 1, hype_score = upvotes - downvotes + 1 WHERE id = ${item_id}`;
        } else {
          await sql`UPDATE ranked_items SET downvotes = downvotes + 1, hype_score = upvotes - downvotes - 1 WHERE id = ${item_id}`;
        }
      }
      
      // Return updated item
      const item = await sql`SELECT * FROM ranked_items WHERE id = ${item_id}`;
      res.json(item[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  
  // Get user's votes
  app.get('/api/ranked/myvotes/:voterId', async (req, res) => {
    try {
      const { voterId } = req.params;
      const votes = await sql`SELECT item_id, vote_type FROM ranked_votes WHERE voter_id = ${voterId}`;
      const voteMap = {};
      votes.forEach(v => voteMap[v.item_id] = v.vote_type);
      res.json(voteMap);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  
  console.log('RANKED routes loaded!');
};
