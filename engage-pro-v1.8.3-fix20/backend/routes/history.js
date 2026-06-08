const express = require('express');
const { dbHelpers } = require('../database');

const router = express.Router();

// GET /api/history - List generated comments
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    
    const { db } = require('../database');
    
    db.all(
      `SELECT * FROM generated_comments ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [limit, offset],
      (err, rows) => {
        if (err) {
          return res.status(500).json({ error: 'Failed to fetch history' });
        }
        
        // Get total count
        db.get(
          "SELECT COUNT(*) as total FROM generated_comments",
          (countErr, countRow) => {
            if (countErr) {
              return res.status(500).json({ error: 'Failed to count history' });
            }
            
            res.json({
              comments: rows || [],
              pagination: {
                total: countRow.total,
                limit,
                offset,
                hasMore: offset + rows.length < countRow.total
              }
            });
          }
        );
      }
    );
  } catch (err) {
    console.error('History error:', err);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// GET /api/history/stats - Get generation statistics
router.get('/stats', async (req, res) => {
  try {
    const { db } = require('../database');
    
    db.get(
      `SELECT 
        COUNT(*) as total_generated,
        SUM(CASE WHEN was_posted = 1 THEN 1 ELSE 0 END) as total_posted,
        COUNT(DISTINCT model_used) as models_used,
        COUNT(DISTINCT DATE(created_at)) as active_days
       FROM generated_comments`,
      (err, row) => {
        if (err) {
          return res.status(500).json({ error: 'Failed to fetch stats' });
        }
        
        // Get model breakdown
        db.all(
          `SELECT model_used, COUNT(*) as count FROM generated_comments GROUP BY model_used ORDER BY count DESC`,
          (modelErr, models) => {
            if (modelErr) {
              return res.status(500).json({ error: 'Failed to fetch model stats' });
            }
            
            res.json({
              totalGenerated: row.total_generated || 0,
              totalPosted: row.total_posted || 0,
              modelsUsed: row.models_used || 0,
              activeDays: row.active_days || 0,
              modelBreakdown: models || []
            });
          }
        );
      }
    );
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// POST /api/history/:id/posted - Mark as posted
router.post('/:id/posted', async (req, res) => {
  try {
    const { id } = req.params;
    const { db } = require('../database');
    
    db.run(
      "UPDATE generated_comments SET was_posted = 1 WHERE id = ?",
      [id],
      function(err) {
        if (err) {
          return res.status(500).json({ error: 'Failed to update' });
        }
        
        if (this.changes === 0) {
          return res.status(404).json({ error: 'Comment not found' });
        }
        
        res.json({ success: true, message: 'Marked as posted' });
      }
    );
  } catch (err) {
    console.error('Mark posted error:', err);
    res.status(500).json({ error: 'Failed to update' });
  }
});

// DELETE /api/history/:id - Delete from history
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { db } = require('../database');
    
    db.run(
      "DELETE FROM generated_comments WHERE id = ?",
      [id],
      function(err) {
        if (err) {
          return res.status(500).json({ error: 'Failed to delete' });
        }
        
        if (this.changes === 0) {
          return res.status(404).json({ error: 'Comment not found' });
        }
        
        res.json({ success: true, message: 'Deleted from history' });
      }
    );
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: 'Failed to delete' });
  }
});


// GET /api/history/sessions - List engagement sessions
router.get('/sessions', async (req, res) => {
  try {
    const { db } = require('../database');
    
    db.all(
      `SELECT * FROM engagement_sessions ORDER BY started_at DESC LIMIT 50`,
      (err, rows) => {
        if (err) {
          return res.status(500).json({ error: 'Failed to fetch sessions' });
        }
        res.json({ sessions: rows || [] });
      }
    );
  } catch (err) {
    console.error('Sessions error:', err);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// GET /api/history/daily - Get daily stats
router.get('/daily', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const { db } = require('../database');
    
    db.all(
      `SELECT * FROM daily_stats 
       WHERE date >= date('now', '-${days} days')
       ORDER BY date DESC`,
      (err, rows) => {
        if (err) {
          return res.status(500).json({ error: 'Failed to fetch daily stats' });
        }
        res.json({ stats: rows || [] });
      }
    );
  } catch (err) {
    console.error('Daily stats error:', err);
    res.status(500).json({ error: 'Failed to fetch daily stats' });
  }
});

module.exports = router;