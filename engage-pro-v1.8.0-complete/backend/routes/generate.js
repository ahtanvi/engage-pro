const express = require('express');
const crypto = require('crypto');
const { dbHelpers } = require('../database');

const router = express.Router();

// Generate a hash of tweet text for caching
function hashTweet(text) {
  return crypto.createHash('md5').update(text.trim().toLowerCase()).digest('hex');
}

// Fallback reply templates when all AI providers fail
const FALLBACK_TEMPLATES = {
  supportive: ['This is exactly what I needed to hear today. Thank you!', 'Absolutely love this perspective. Well said!', 'This resonates so much. Appreciate you sharing!', 'Couldn\'t agree more. Quality content!'],
  insightful: ['This is a really interesting take. Great analysis!', 'This adds so much value to the conversation.', 'Really thoughtful analysis. The nuance is refreshing.', 'This sparked new ideas for me. Thank you!'],
  engaging: ['What\'s been your biggest learning from this?', 'How long did it take you to get here? Love the journey!', 'This is fascinating! Any tips for beginners?', 'Would love to see a thread expanding on this!'],
  humorous: ['This is too real!', 'Me reading this: wow', 'This just became my new favorite tweet.', 'The accuracy is uncanny. Well done!'],
  crypto: ['This is the alpha the timeline needs. Great breakdown!', 'Solid analysis. The fundamentals are stronger than people realize.', 'This thread aged like fine wine. Bookmarking!', 'The macro perspective here is exactly what\'s missing.'],
  tech: ['This is the builder mindset that separates good from great.', 'The iteration speed here is impressive. Most take months.', 'This solves a real pain point. Timing feels right.', 'Love the focus on UX. Too many forget this part.']
};

function categorizeTweet(text) {
  const t = text.toLowerCase();
  if (t.includes('crypto') || t.includes('web3') || t.includes('bitcoin') || t.includes('ethereum') || t.includes('token')) return 'crypto';
  if (t.includes('startup') || t.includes('building') || t.includes('product') || t.includes('saas') || t.includes('dev')) return 'tech';
  if (t.includes('lol') || t.includes('haha')) return 'humorous';
  if (t.includes('?')) return 'engaging';
  if (t.includes('thank') || t.includes('appreciate')) return 'supportive';
  return 'insightful';
}

function getFallbackReply(text) {
  const category = categorizeTweet(text);
  const templates = FALLBACK_TEMPLATES[category] || FALLBACK_TEMPLATES.insightful;
  return templates[Math.floor(Math.random() * templates.length)];
}

// POST /api/generate - Generate AI comment with fallback chain
router.post('/', async (req, res) => {
  try {
    const { tweetText, tweetAuthor, tweetUrl, useCache = true } = req.body;

    if (!tweetText) {
      return res.status(400).json({ error: 'tweetText is required' });
    }

    // Check cache first
    if (useCache) {
      const tweetHash = hashTweet(tweetText);
      const cached = await dbHelpers.getCachedReply(tweetHash);
      
      if (cached) {
        console.log('[CACHE HIT] Returning cached reply for:', tweetText.substring(0, 50));
        return res.json({
          reply: cached.generated_reply,
          model: cached.model_used,
          cached: true,
          tweetHash
        });
      }
    }

    // Get active system prompt
    const prompt = await dbHelpers.getActivePrompt();
    if (!prompt) {
      return res.status(500).json({ error: 'No active system prompt found' });
    }

    // Get active API config (primary)
    const primaryConfig = await dbHelpers.getActiveApiConfig();
    
    // Get all available configs for fallback chain
    const allConfigs = await new Promise((resolve, reject) => {
      const { db } = require('../database');
      db.all("SELECT * FROM api_configs WHERE api_key IS NOT NULL AND api_key != ''", (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    
    // Build fallback chain: active first, then others with keys
    const fallbackChain = [];
    if (primaryConfig && primaryConfig.api_key) {
      fallbackChain.push(primaryConfig);
    }
    // Add other configured providers
    allConfigs.forEach(config => {
      if (!fallbackChain.find(c => c.provider === config.provider)) {
        fallbackChain.push(config);
      }
    });

    if (fallbackChain.length === 0) {
      // No AI providers configured - use fallback template
      console.log('[generate] No AI providers configured, using fallback template');
      const fallbackReply = getFallbackReply(tweetText);
      
      await dbHelpers.saveGeneratedComment({
        tweetText,
        tweetAuthor: tweetAuthor || 'unknown',
        tweetUrl: tweetUrl || '',
        generatedReply: fallbackReply,
        modelUsed: 'fallback-template',
        promptUsed: prompt.name
      });
      
      if (useCache) {
        await dbHelpers.saveToCache({
          tweetHash: hashTweet(tweetText),
          tweetText,
          generatedReply: fallbackReply,
          modelUsed: 'fallback-template'
        });
      }
      
      return res.json({
        reply: fallbackReply,
        model: 'fallback-template',
        cached: false,
        fallback: true,
        tweetHash: hashTweet(tweetText)
      });
    }

    // Try each provider in the fallback chain
    let lastError = null;
    let generatedReply = null;
    let modelUsed = null;
    let providerUsed = null;

    for (const config of fallbackChain) {
      console.log(`[generate] Trying provider: ${config.provider}, model: ${config.model}`);
      
      try {
        if (config.provider === 'gemini') {
          generatedReply = await generateWithGemini(tweetText, tweetAuthor, prompt.prompt, config);
        } else if (config.provider === 'openai') {
          generatedReply = await generateWithOpenAI(tweetText, tweetAuthor, prompt.prompt, config);
        } else if (config.provider === 'openrouter') {
          generatedReply = await generateWithOpenRouter(tweetText, tweetAuthor, prompt.prompt, config);
        } else {
          console.log(`[generate] Unknown provider: ${config.provider}, skipping`);
          continue;
        }
        
        // Success!
        modelUsed = config.model;
        providerUsed = config.provider;
        console.log(`[generate] Success with ${config.provider}!`);
        break;
        
      } catch (err) {
        console.error(`[generate] ${config.provider} failed:`, err.message);
        lastError = err;
        // Continue to next provider in chain
      }
    }

    // If all providers failed, use fallback template
    if (!generatedReply) {
      console.log('[generate] All providers failed, using fallback template');
      generatedReply = getFallbackReply(tweetText);
      modelUsed = 'fallback-template';
      providerUsed = 'fallback';
    }

    // Save to history
    await dbHelpers.saveGeneratedComment({
      tweetText,
      tweetAuthor: tweetAuthor || 'unknown',
      tweetUrl: tweetUrl || '',
      generatedReply,
      modelUsed: modelUsed || 'unknown',
      promptUsed: prompt.name
    });

    // Update daily stats
    const today = new Date().toISOString().split('T')[0];
    await dbHelpers.updateDailyStats(today, {
      replies: 1,
      aiGenerated: modelUsed !== 'fallback-template' ? 1 : 0,
      templateUsed: modelUsed === 'fallback-template' ? 1 : 0
    });

    // Save to cache
    if (useCache) {
      await dbHelpers.saveToCache({
        tweetHash: hashTweet(tweetText),
        tweetText,
        generatedReply,
        modelUsed: modelUsed || 'unknown'
      });
    }

    res.json({
      reply: generatedReply,
      model: modelUsed || 'unknown',
      provider: providerUsed || 'unknown',
      cached: false,
      fallback: providerUsed === 'fallback',
      tweetHash: hashTweet(tweetText)
    });

  } catch (err) {
    console.error('Generate error:', err);
    res.status(500).json({ 
      error: 'Failed to generate reply', 
      message: err.message,
      details: err.stack
    });
  }
});

// Gemini API integration
async function generateWithGemini(tweetText, tweetAuthor, systemPrompt, config) {
  const apiKey = config.api_key;
  const model = config.model || 'gemini-1.5-flash';
  
  // Gemini API v1beta uses the model name directly
  const url = `${config.base_url}/models/${model}:generateContent?key=${apiKey}`;
  
  console.log('[generate] Gemini URL:', url.replace(apiKey, '***'));
  
  const requestBody = {
    contents: [{
      role: 'user',
      parts: [{
        text: `${systemPrompt}\n\nOriginal tweet by @${tweetAuthor || 'user'}:\n"${tweetText}"\n\nGenerate a natural, engaging reply to this tweet. Keep it under 280 characters. Be concise and human-like.`
      }]
    }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 150,
      topP: 0.9
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    let errorMessage = response.statusText;
    try {
      const errorData = await response.json();
      errorMessage = errorData.error?.message || JSON.stringify(errorData);
    } catch (e) {
      errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    }
    throw new Error(`Gemini API error: ${errorMessage}`);
  }

  const data = await response.json();
  
  if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
    throw new Error('Invalid response from Gemini API');
  }

  let reply = data.candidates[0].content.parts[0].text.trim();
  
  // Clean up - remove quotes if wrapped
  reply = reply.replace(/^["']|["']$/g, '').trim();
  
  // Ensure under 280 chars
  if (reply.length > 280) {
    reply = reply.substring(0, 277) + '...';
  }

  return reply;
}

// OpenAI API integration
async function generateWithOpenAI(tweetText, tweetAuthor, systemPrompt, config) {
  const apiKey = config.api_key;
  const model = config.model || 'gpt-3.5-turbo';
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Reply to this tweet by @${tweetAuthor || 'user'}: "${tweetText}"\n\nKeep it under 280 characters. Be natural and engaging.` }
      ],
      temperature: 0.7,
      max_tokens: 150
    })
  });

  if (!response.ok) {
    let errorMessage = response.statusText;
    try {
      const errorData = await response.json();
      errorMessage = errorData.error?.message || JSON.stringify(errorData);
    } catch (e) {
      errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    }
    throw new Error(`OpenAI API error: ${errorMessage}`);
  }

  const data = await response.json();
  
  // Handle OpenRouter response structure - may differ from standard OpenAI
  let reply = '';
  if (data.choices && data.choices[0]) {
    if (data.choices[0].message && data.choices[0].message.content) {
      reply = data.choices[0].message.content.trim();
    } else if (data.choices[0].text) {
      // Some models return text directly
      reply = data.choices[0].text.trim();
    } else if (data.choices[0].delta && data.choices[0].delta.content) {
      // Streaming format fallback
      reply = data.choices[0].delta.content.trim();
    }
  }
  
  if (!reply) {
    console.error('[generate] OpenRouter response structure:', JSON.stringify(data).substring(0, 200));
    throw new Error('OpenRouter returned empty or unexpected response structure');
  }
  
  reply = reply.replace(/^["']|["']$/g, '').trim();
  
  if (reply.length > 280) {
    reply = reply.substring(0, 277) + '...';
  }

  return reply;
}

// OpenRouter API integration
async function generateWithOpenRouter(tweetText, tweetAuthor, systemPrompt, config) {
  const apiKey = config.api_key;
  const model = config.model || 'meta-llama/llama-3.1-8b-instruct';
  
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://engage-pro.local',
      'X-Title': 'Engage Pro'
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Reply to this tweet by @${tweetAuthor || 'user'}: "${tweetText}"\n\nKeep it under 280 characters. Be natural and engaging.` }
      ],
      temperature: 0.7,
      max_tokens: 150
    })
  });

  if (!response.ok) {
    let errorMessage = response.statusText;
    try {
      const errorData = await response.json();
      errorMessage = errorData.error?.message || JSON.stringify(errorData);
    } catch (e) {
      errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    }
    throw new Error(`OpenRouter API error: ${errorMessage}`);
  }

  const data = await response.json();
  let reply = data.choices[0].message.content.trim();
  
  reply = reply.replace(/^["']|["']$/g, '').trim();
  
  if (reply.length > 280) {
    reply = reply.substring(0, 277) + '...';
  }

  return reply;
}

module.exports = router;