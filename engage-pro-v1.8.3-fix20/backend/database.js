// Engage Pro Backend v1.8.0
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, 'data', 'engage-pro.db');

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new sqlite3.Database(DB_PATH);

// Initialize database tables
db.serialize(() => {
  // System prompts (training instructions)
  db.run(`
    CREATE TABLE IF NOT EXISTS system_prompts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      prompt TEXT NOT NULL,
      is_active BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // API configurations
  db.run(`
    CREATE TABLE IF NOT EXISTS api_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT UNIQUE NOT NULL,
      api_key TEXT,
      base_url TEXT,
      model TEXT,
      is_active BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Generated comments history
  db.run(`
    CREATE TABLE IF NOT EXISTS generated_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tweet_text TEXT NOT NULL,
      tweet_author TEXT,
      tweet_url TEXT,
      generated_reply TEXT NOT NULL,
      model_used TEXT,
      prompt_used TEXT,
      was_posted BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Custom user templates
  db.run(`
    CREATE TABLE IF NOT EXISTS custom_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      template TEXT NOT NULL,
      variables TEXT,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Cache for repeated tweets
  db.run(`
    CREATE TABLE IF NOT EXISTS reply_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tweet_hash TEXT UNIQUE NOT NULL,
      tweet_text TEXT NOT NULL,
      generated_reply TEXT NOT NULL,
      model_used TEXT,
      use_count INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_used DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Auth tokens
  db.run(`
    CREATE TABLE IF NOT EXISTS auth_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT UNIQUE NOT NULL,
      name TEXT,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_used DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Engagement sessions tracking
  db.run(`
    CREATE TABLE IF NOT EXISTS engagement_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT UNIQUE NOT NULL,
      platform TEXT,
      mode TEXT,
      speed TEXT,
      tweets_engaged INTEGER DEFAULT 0,
      likes INTEGER DEFAULT 0,
      replies INTEGER DEFAULT 0,
      follows INTEGER DEFAULT 0,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME,
      status TEXT DEFAULT 'active'
    )
  `);

  // Daily stats tracking
  db.run(`
    CREATE TABLE IF NOT EXISTS daily_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT UNIQUE NOT NULL,
      likes INTEGER DEFAULT 0,
      replies INTEGER DEFAULT 0,
      follows INTEGER DEFAULT 0,
      ai_generated INTEGER DEFAULT 0,
      template_used INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Insert default system prompt
  db.get("SELECT COUNT(*) as count FROM system_prompts", (err, row) => {
    if (err) {
      console.error('Error checking prompts:', err);
      return;
    }
    
    if (row.count === 0) {
      const defaultPrompt = `You are a thoughtful, engaging Twitter user who replies naturally to tweets.

Rules for generating replies:
- Keep replies under 280 characters
- Match the tone and energy of the original tweet
- Reference specific details from the tweet to show you read it
- Ask questions to continue the conversation when appropriate
- Be concise and natural - avoid generic phrases like "great post", "thanks for sharing", "love this"
- Use casual, human-like language with occasional contractions
- If the tweet is technical, reply with insight or curiosity
- If the tweet is personal, reply with empathy or relatability
- If the tweet is humorous, reply with wit or play along
- Never use hashtags in replies unless the original tweet did
- Never include URLs in replies
- Sign off naturally - no signatures or "- AI" tags`;

      db.run(
        "INSERT INTO system_prompts (name, prompt, is_active) VALUES (?, ?, ?)",
        ["default", defaultPrompt, 1]
      );
    }
  });

  // Insert default API config for Gemini
  db.get("SELECT COUNT(*) as count FROM api_configs", (err, row) => {
    if (err) {
      console.error('Error checking API configs:', err);
      return;
    }
    
    if (row.count === 0) {
      db.run(
        "INSERT INTO api_configs (provider, base_url, model, is_active) VALUES (?, ?, ?, ?)",
        ["gemini", "https://generativelanguage.googleapis.com/v1beta", "gemini-1.5-flash", 1]
      );
    }
  });

  // Insert default configs for other providers (inactive)
  db.get("SELECT COUNT(*) as count FROM api_configs WHERE provider = 'openai'", (err, row) => {
    if (!err && row.count === 0) {
      db.run(
        "INSERT INTO api_configs (provider, base_url, model, is_active) VALUES (?, ?, ?, ?)",
        ["openai", "https://api.openai.com/v1", "gpt-3.5-turbo", 0]
      );
    }
  });

  db.get("SELECT COUNT(*) as count FROM api_configs WHERE provider = 'openrouter'", (err, row) => {
    if (!err && row.count === 0) {
      db.run(
        "INSERT INTO api_configs (provider, base_url, model, is_active) VALUES (?, ?, ?, ?)",
        ["openrouter", "https://openrouter.ai/api/v1", "meta-llama/llama-3.1-8b-instruct", 0]
      );
    }
  });
});

// Helper functions
const dbHelpers = {
  // Get active system prompt
  getActivePrompt: () => {
    return new Promise((resolve, reject) => {
      db.get(
        "SELECT * FROM system_prompts WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 1",
        (err, row) => {
          if (err) reject(err);
          else resolve(row || null);
        }
      );
    });
  },

  // Update system prompt
  updatePrompt: (name, prompt) => {
    return new Promise((resolve, reject) => {
      db.run(
        "UPDATE system_prompts SET prompt = ?, updated_at = CURRENT_TIMESTAMP WHERE name = ?",
        [prompt, name],
        function(err) {
          if (err) reject(err);
          else resolve({ changes: this.changes });
        }
      );
    });
  },

  // Get active API config
  getActiveApiConfig: () => {
    return new Promise((resolve, reject) => {
      db.get(
        "SELECT * FROM api_configs WHERE is_active = 1 LIMIT 1",
        (err, row) => {
          if (err) reject(err);
          else resolve(row || null);
        }
      );
    });
  },

  // Update API config
  updateApiConfig: (provider, updates) => {
    return new Promise((resolve, reject) => {
      const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
      const values = Object.values(updates);
      db.run(
        `UPDATE api_configs SET ${fields} WHERE provider = ?`,
        [...values, provider],
        function(err) {
          if (err) reject(err);
          else resolve({ changes: this.changes });
        }
      );
    });
  },

  // Save generated comment
  saveGeneratedComment: (data) => {
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO generated_comments (tweet_text, tweet_author, tweet_url, generated_reply, model_used, prompt_used)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [data.tweetText, data.tweetAuthor, data.tweetUrl, data.generatedReply, data.modelUsed, data.promptUsed],
        function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID });
        }
      );
    });
  },

  // Get cached reply
  getCachedReply: (tweetHash) => {
    return new Promise((resolve, reject) => {
      db.get(
        "SELECT * FROM reply_cache WHERE tweet_hash = ?",
        [tweetHash],
        (err, row) => {
          if (err) reject(err);
          else {
            if (row) {
              // Update use count and last_used
              db.run(
                "UPDATE reply_cache SET use_count = use_count + 1, last_used = CURRENT_TIMESTAMP WHERE id = ?",
                [row.id]
              );
            }
            resolve(row || null);
          }
        }
      );
    });
  },

  // Save to cache
  saveToCache: (data) => {
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT OR REPLACE INTO reply_cache (tweet_hash, tweet_text, generated_reply, model_used)
         VALUES (?, ?, ?, ?)`,
        [data.tweetHash, data.tweetText, data.generatedReply, data.modelUsed],
        function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID });
        }
      );
    });
  },

  // Get custom templates
  getCustomTemplates: () => {
    return new Promise((resolve, reject) => {
      db.all(
        "SELECT * FROM custom_templates WHERE is_active = 1 ORDER BY created_at DESC",
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  },

  // Save custom template
  saveCustomTemplate: (data) => {
    return new Promise((resolve, reject) => {
      db.run(
        "INSERT INTO custom_templates (name, template, variables) VALUES (?, ?, ?)",
        [data.name, data.template, JSON.stringify(data.variables || [])],
        function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID });
        }
      );
    });
  },

  // Get comment history
  getCommentHistory: (limit = 50) => {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM generated_comments ORDER BY created_at DESC LIMIT ?`,
        [limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  },

  // Create auth token
  createAuthToken: (name) => {
    return new Promise((resolve, reject) => {
      const token = uuidv4();
      db.run(
        "INSERT INTO auth_tokens (token, name) VALUES (?, ?)",
        [token, name],
        function(err) {
          if (err) reject(err);
          else resolve({ token, id: this.lastID });
        }
      );
    });
  },

  // Validate auth token
  validateToken: (token) => {
    return new Promise((resolve, reject) => {
      db.get(
        "SELECT * FROM auth_tokens WHERE token = ? AND is_active = 1",
        [token],
        (err, row) => {
          if (err) reject(err);
          else {
            if (row) {
              // Update last_used
              db.run(
                "UPDATE auth_tokens SET last_used = CURRENT_TIMESTAMP WHERE id = ?",
                [row.id]
              );
            }
            resolve(!!row);
          }
        }
      );
    });
  },

  // Get cache stats
  getCacheStats: () => {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT 
          COUNT(*) as total_cached,
          SUM(use_count) as total_uses,
          AVG(use_count) as avg_uses
         FROM reply_cache`,
        (err, row) => {
          if (err) reject(err);
          else resolve(row || { total_cached: 0, total_uses: 0, avg_uses: 0 });
        }
      );
    });
  },

  // Create engagement session
  createSession: (data) => {
    return new Promise((resolve, reject) => {
      const sessionId = require('uuid').v4();
      db.run(
        `INSERT INTO engagement_sessions (session_id, platform, mode, speed)
         VALUES (?, ?, ?, ?)`,
        [sessionId, data.platform || 'twitter', data.mode || 'engagement', data.speed || 'medium'],
        function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID, sessionId });
        }
      );
    });
  },

  // Update engagement session
  updateSession: (sessionId, data) => {
    return new Promise((resolve, reject) => {
      const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
      const values = Object.values(data);
      db.run(
        `UPDATE engagement_sessions SET ${fields} WHERE session_id = ?`,
        [...values, sessionId],
        function(err) {
          if (err) reject(err);
          else resolve({ changes: this.changes });
        }
      );
    });
  },

  // Get daily stats
  getDailyStats: (date) => {
    return new Promise((resolve, reject) => {
      db.get(
        "SELECT * FROM daily_stats WHERE date = ?",
        [date],
        (err, row) => {
          if (err) reject(err);
          else resolve(row || null);
        }
      );
    });
  },

  // Update daily stats
  updateDailyStats: (date, data) => {
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO daily_stats (date, likes, replies, follows, ai_generated, template_used)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(date) DO UPDATE SET
           likes = likes + excluded.likes,
           replies = replies + excluded.replies,
           follows = follows + excluded.follows,
           ai_generated = ai_generated + excluded.ai_generated,
           template_used = template_used + excluded.template_used,
           updated_at = CURRENT_TIMESTAMP`,
        [date, data.likes || 0, data.replies || 0, data.follows || 0, data.aiGenerated || 0, data.templateUsed || 0],
        function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID });
        }
      );
    });
  }
};

module.exports = { db, dbHelpers };