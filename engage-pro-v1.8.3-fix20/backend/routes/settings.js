const express = require('express');
const { dbHelpers } = require('../database');

const router = express.Router();

// GET /api/settings/prompt - Get active system prompt
router.get('/prompt', async (req, res) => {
  try {
    const prompt = await dbHelpers.getActivePrompt();
    
    if (!prompt) {
      return res.status(404).json({ error: 'No active prompt found' });
    }
    
    res.json({
      id: prompt.id,
      name: prompt.name,
      prompt: prompt.prompt,
      is_active: prompt.is_active === 1,
      created_at: prompt.created_at,
      updated_at: prompt.updated_at
    });
  } catch (err) {
    console.error('Get prompt error:', err);
    res.status(500).json({ error: 'Failed to fetch prompt' });
  }
});

// POST /api/settings/prompt - Update system prompt
router.post('/prompt', async (req, res) => {
  try {
    const { name, prompt } = req.body;
    
    if (!name || !prompt) {
      return res.status(400).json({ error: 'name and prompt are required' });
    }
    
    // Validate prompt length
    if (prompt.length < 50) {
      return res.status(400).json({ error: 'Prompt must be at least 50 characters' });
    }
    
    if (prompt.length > 5000) {
      return res.status(400).json({ error: 'Prompt must be under 5000 characters' });
    }
    
    const result = await dbHelpers.updatePrompt(name, prompt);
    
    res.json({
      success: true,
      name,
      changes: result.changes,
      message: 'System prompt updated successfully'
    });
  } catch (err) {
    console.error('Update prompt error:', err);
    res.status(500).json({ error: 'Failed to update prompt' });
  }
});

// GET /api/settings/prompts - List all prompts
router.get('/prompts', async (req, res) => {
  try {
    const { db } = require('../database');
    
    db.all(
      "SELECT id, name, is_active, created_at, updated_at FROM system_prompts ORDER BY updated_at DESC",
      (err, rows) => {
        if (err) {
          return res.status(500).json({ error: 'Failed to fetch prompts' });
        }
        res.json({ prompts: rows || [] });
      }
    );
  } catch (err) {
    console.error('List prompts error:', err);
    res.status(500).json({ error: 'Failed to fetch prompts' });
  }
});

// POST /api/settings/prompt/:name/activate - Switch active prompt
router.post('/prompt/:name/activate', async (req, res) => {
  try {
    const { name } = req.params;
    const { db } = require('../database');
    
    // Deactivate all
    db.run("UPDATE system_prompts SET is_active = 0");
    
    // Activate selected
    db.run(
      "UPDATE system_prompts SET is_active = 1 WHERE name = ?",
      [name],
      function(err) {
        if (err) {
          return res.status(500).json({ error: 'Failed to activate prompt' });
        }
        
        if (this.changes === 0) {
          return res.status(404).json({ error: 'Prompt not found' });
        }
        
        res.json({ success: true, name, message: `${name} is now active` });
      }
    );
  } catch (err) {
    console.error('Activate prompt error:', err);
    res.status(500).json({ error: 'Failed to activate prompt' });
  }
});

// POST /api/settings/prompt/new - Create new prompt
router.post('/prompt/new', async (req, res) => {
  try {
    const { name, prompt } = req.body;
    
    if (!name || !prompt) {
      return res.status(400).json({ error: 'name and prompt are required' });
    }
    
    const { db } = require('../database');
    
    db.run(
      "INSERT INTO system_prompts (name, prompt, is_active) VALUES (?, ?, 0)",
      [name, prompt],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(409).json({ error: 'Prompt name already exists' });
          }
          return res.status(500).json({ error: 'Failed to create prompt' });
        }
        
        res.json({
          success: true,
          id: this.lastID,
          name,
          message: 'Prompt created successfully'
        });
      }
    );
  } catch (err) {
    console.error('Create prompt error:', err);
    res.status(500).json({ error: 'Failed to create prompt' });
  }
});

// GET /api/settings/cache - Get cache statistics
router.get('/cache', async (req, res) => {
  try {
    const stats = await dbHelpers.getCacheStats();
    res.json(stats);
  } catch (err) {
    console.error('Cache stats error:', err);
    res.status(500).json({ error: 'Failed to fetch cache stats' });
  }
});

module.exports = router;