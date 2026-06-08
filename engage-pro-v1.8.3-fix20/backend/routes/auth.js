const express = require('express');
const { dbHelpers } = require('../database');

const router = express.Router();

// POST /api/auth/token - Create new auth token
router.post('/token', async (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    
    const result = await dbHelpers.createAuthToken(name);
    
    res.json({
      success: true,
      token: result.token,
      id: result.id,
      name,
      message: 'Token created successfully. Save this token - it will not be shown again.'
    });
  } catch (err) {
    console.error('Create token error:', err);
    res.status(500).json({ error: 'Failed to create token' });
  }
});

// GET /api/auth/tokens - List all tokens (masked)
router.get('/tokens', async (req, res) => {
  try {
    const { db } = require('../database');
    
    db.all(
      `SELECT id, name, is_active, created_at, last_used, 
        CASE WHEN token IS NOT NULL THEN '***' || substr(token, -4) ELSE NULL END as token_preview
       FROM auth_tokens ORDER BY created_at DESC`,
      (err, rows) => {
        if (err) {
          return res.status(500).json({ error: 'Failed to fetch tokens' });
        }
        
        res.json({ tokens: rows || [] });
      }
    );
  } catch (err) {
    console.error('List tokens error:', err);
    res.status(500).json({ error: 'Failed to fetch tokens' });
  }
});

// DELETE /api/auth/tokens/:id - Revoke token
router.delete('/tokens/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { db } = require('../database');
    
    db.run(
      "UPDATE auth_tokens SET is_active = 0 WHERE id = ?",
      [id],
      function(err) {
        if (err) {
          return res.status(500).json({ error: 'Failed to revoke token' });
        }
        
        if (this.changes === 0) {
          return res.status(404).json({ error: 'Token not found' });
        }
        
        res.json({ success: true, message: 'Token revoked' });
      }
    );
  } catch (err) {
    console.error('Revoke token error:', err);
    res.status(500).json({ error: 'Failed to revoke token' });
  }
});

// POST /api/auth/verify - Verify a token (for extension)
router.post('/verify', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ error: 'token is required' });
    }
    
    const isValid = await dbHelpers.validateToken(token);
    
    res.json({
      valid: isValid,
      message: isValid ? 'Token is valid' : 'Invalid or revoked token'
    });
  } catch (err) {
    console.error('Verify token error:', err);
    res.status(500).json({ error: 'Failed to verify token' });
  }
});

module.exports = router;