const express = require('express');
const { dbHelpers } = require('../database');

const router = express.Router();

// GET /api/models - List available models
router.get('/', async (req, res) => {
  try {
    const configs = await new Promise((resolve, reject) => {
      const { db } = require('../database');
      db.all("SELECT * FROM api_configs ORDER BY provider", (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    // Mask API keys for security
    const safeConfigs = configs.map(config => ({
      id: config.id,
      provider: config.provider,
      model: config.model,
      base_url: config.base_url,
      is_active: config.is_active === 1,
      has_key: !!config.api_key,
      created_at: config.created_at
    }));

    res.json({
      models: safeConfigs,
      providers: [
        { id: 'gemini', name: 'Google Gemini', description: 'Free tier available, fast responses' },
        { id: 'openai', name: 'OpenAI', description: 'GPT-3.5/4, high quality' },
        { id: 'openrouter', name: 'OpenRouter', description: 'Multiple models, pay-per-use' }
      ]
    });
  } catch (err) {
    console.error('Models error:', err);
    res.status(500).json({ error: 'Failed to fetch models' });
  }
});

// POST /api/models/:provider/activate - Switch active model
router.post('/:provider/activate', async (req, res) => {
  try {
    const { provider } = req.params;
    
    const { db } = require('../database');
    
    // Deactivate all
    db.run("UPDATE api_configs SET is_active = 0");
    
    // Activate selected
    db.run(
      "UPDATE api_configs SET is_active = 1 WHERE provider = ?",
      [provider],
      function(err) {
        if (err) {
          return res.status(500).json({ error: 'Failed to activate model' });
        }
        
        if (this.changes === 0) {
          return res.status(404).json({ error: 'Provider not found' });
        }
        
        res.json({ success: true, provider, message: `${provider} is now active` });
      }
    );
  } catch (err) {
    console.error('Activate error:', err);
    res.status(500).json({ error: 'Failed to activate model' });
  }
});

// POST /api/models/:provider/key - Update API key
router.post('/:provider/key', async (req, res) => {
  try {
    const { provider } = req.params;
    const { apiKey } = req.body;
    
    if (!apiKey) {
      return res.status(400).json({ error: 'apiKey is required' });
    }
    
    const { db } = require('../database');
    
    db.run(
      "UPDATE api_configs SET api_key = ? WHERE provider = ?",
      [apiKey, provider],
      function(err) {
        if (err) {
          return res.status(500).json({ error: 'Failed to update API key' });
        }
        
        if (this.changes === 0) {
          // Insert new config if not exists
          db.run(
            "INSERT INTO api_configs (provider, api_key, is_active) VALUES (?, ?, 0)",
            [provider, apiKey],
            function(err) {
              if (err) {
                return res.status(500).json({ error: 'Failed to create API config' });
              }
              res.json({ success: true, message: 'API key saved' });
            }
          );
        } else {
          res.json({ success: true, message: 'API key updated' });
        }
      }
    );
  } catch (err) {
    console.error('Key update error:', err);
    res.status(500).json({ error: 'Failed to update API key' });
  }
});

// POST /api/models/:provider/model - Update model name
router.post('/:provider/model', async (req, res) => {
  try {
    const { provider } = req.params;
    const { model } = req.body;
    
    if (!model) {
      return res.status(400).json({ error: 'model is required' });
    }
    
    const { db } = require('../database');
    
    db.run(
      "UPDATE api_configs SET model = ? WHERE provider = ?",
      [model, provider],
      function(err) {
        if (err) {
          return res.status(500).json({ error: 'Failed to update model' });
        }
        
        res.json({ success: true, provider, model });
      }
    );
  } catch (err) {
    console.error('Model update error:', err);
    res.status(500).json({ error: 'Failed to update model' });
  }
});

// POST /api/models/:provider/test - Test if API key works with a simple request
router.post('/:provider/test', async (req, res) => {
  try {
    const { provider } = req.params;
    const { db } = require('../database');
    
    // Get the config for this provider
    const config = await new Promise((resolve, reject) => {
      db.get("SELECT * FROM api_configs WHERE provider = ?", [provider], (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      });
    });
    
    if (!config) {
      return res.status(404).json({ error: 'Provider not configured' });
    }
    
    if (!config.api_key) {
      return res.status(400).json({ error: 'API key not set for this provider' });
    }
    
    // Test based on provider
    let testResult;
    if (provider === 'gemini') {
      testResult = await testGemini(config);
    } else if (provider === 'openai') {
      testResult = await testOpenAI(config);
    } else if (provider === 'openrouter') {
      testResult = await testOpenRouter(config);
    } else {
      return res.status(400).json({ error: 'Unknown provider' });
    }
    
    res.json({
      success: testResult.success,
      provider,
      model: config.model,
      message: testResult.message,
      latency_ms: testResult.latency,
      error: testResult.error || null
    });
  } catch (err) {
    console.error('Test error:', err);
    res.status(500).json({ error: 'Test failed', message: err.message });
  }
});

// GET /api/models/openrouter/list - Fetch available OpenRouter models with pricing
router.get('/openrouter/list', async (req, res) => {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models');
    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Format models with pricing info
    const models = (data.data || []).map(m => ({
      id: m.id,
      name: m.name,
      description: m.description,
      pricing: {
        prompt: m.pricing?.prompt || 0,
        completion: m.pricing?.completion || 0,
        total: (parseFloat(m.pricing?.prompt || 0) + parseFloat(m.pricing?.completion || 0)).toFixed(6)
      },
      context_length: m.context_length,
      top_provider: m.top_provider?.name || 'Unknown'
    })).sort((a, b) => parseFloat(a.pricing.total) - parseFloat(b.pricing.total));
    
    res.json({ models });
  } catch (err) {
    console.error('OpenRouter list error:', err);
    res.status(500).json({ error: 'Failed to fetch OpenRouter models', message: err.message });
  }
});

// Test functions
async function testGemini(config) {
  const start = Date.now();
  try {
    const model = config.model || 'gemini-1.5-flash';
    const url = `${config.base_url}/models/${model}:generateContent?key=${config.api_key}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Say "OK" and nothing else.' }] }],
        generationConfig: { maxOutputTokens: 10 }
      })
    });
    
    const latency = Date.now() - start;
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        latency,
        message: `HTTP ${response.status}: ${errorData.error?.message || response.statusText}`,
        error: errorData.error?.message || 'Request failed'
      };
    }
    
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';
    
    return {
      success: true,
      latency,
      message: `Working! Response: "${text.trim()}"`,
      error: null
    };
  } catch (err) {
    return {
      success: false,
      latency: Date.now() - start,
      message: err.message,
      error: err.message
    };
  }
}

async function testOpenAI(config) {
  const start = Date.now();
  try {
    const model = config.model || 'gpt-3.5-turbo';
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.api_key}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Say "OK" and nothing else.' }],
        max_tokens: 10
      })
    });
    
    const latency = Date.now() - start;
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        latency,
        message: `HTTP ${response.status}: ${errorData.error?.message || response.statusText}`,
        error: errorData.error?.message || 'Request failed'
      };
    }
    
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || 'No response';
    
    return {
      success: true,
      latency,
      message: `Working! Response: "${text.trim()}"`,
      error: null
    };
  } catch (err) {
    return {
      success: false,
      latency: Date.now() - start,
      message: err.message,
      error: err.message
    };
  }
}

async function testOpenRouter(config) {
  const start = Date.now();
  try {
    const model = config.model || 'meta-llama/llama-3.1-8b-instruct';
    
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.api_key}`,
        'HTTP-Referer': 'https://engage-pro.local',
        'X-Title': 'Engage Pro'
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Say "OK" and nothing else.' }],
        max_tokens: 10
      })
    });
    
    const latency = Date.now() - start;
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        latency,
        message: `HTTP ${response.status}: ${errorData.error?.message || response.statusText}`,
        error: errorData.error?.message || 'Request failed'
      };
    }
    
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || 'No response';
    
    return {
      success: true,
      latency,
      message: `Working! Response: "${text.trim()}"`,
      error: null
    };
  } catch (err) {
    return {
      success: false,
      latency: Date.now() - start,
      message: err.message,
      error: err.message
    };
  }
}

module.exports = router;