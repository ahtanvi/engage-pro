PROJECT: Engage Pro - Twitter/X Automation Tool
What This Is

A Chrome Extension + Node.js Backend that automates Twitter/X engagement. It reads tweets, generates AI-powered replies using LLMs (Gemini, OpenAI, OpenRouter), and posts them automatically. Also supports auto-liking and follower growth mode.

Architecture
Extension: Manifest V3, content script (twitter.js), sidepanel dashboard, popup quick controls
Backend: Node.js + Express + SQLite database with web dashboard
AI Providers: Google Gemini, OpenAI, OpenRouter (with fallback chain)
Communication: Chrome extension message passing between content script ↔ sidepanel ↔ background
VERSION HISTORY BUILT IN THIS CHAT
Version	What Was Added
v1.5.0 - v1.5.6	Base extension with auto-like, AI replies, follower mode, speed presets
v1.6.0	Backend integration, AI provider system, model testing, OpenRouter browser
v1.7.0 - v1.7.1	Bug fixes for connection tests, cursor init, response parsing
v1.8.0	Major reliability overhaul (THIS CHAT)
WHAT WAS DONE IN THIS CHAT (v1.8.0 Development)
Critical Bug Fixes
Cursor Initialization - Fixed starting position bug (was at 0,0 instead of viewport center)
Connection Test - Fixed to check /health endpoint FIRST before auth test
Gemini API URL - Fixed model name construction (models/ prefix handling)
Editor Detection - Enhanced to prefer modal editors over main timeline composer
Reply Button - Added multiple fallback selectors for better detection
Submit Button - Now verifies button is inside reply modal, not main page
Response Parsing - Better handling for OpenRouter/OpenAI response variations
New Features Added
Advanced Settings Tab - Debug mode, scroll speed, max scroll attempts, reply delay multiplier
Pause/Resume - Can pause engagement without fully stopping
Skip Tweet - Skip current tweet and move to next
Quick Reply - Manual reply to specific tweets from sidepanel
Current Feed Display - See visible tweets with Like/Reply buttons
Tweet Deduplication - Map-based cache with 24h TTL prevents re-engaging same tweets
Export/Import Stats - Save session data as JSON, restore later
Daily Limit Update - Change limit on the fly without restart
Runtime Config - Change settings without page reload via SET_CONFIG
Consecutive Error Tracking - Auto-backoff after 5 errors, rate limit detection
Enhanced Error Recovery - Specific handling for rate limits, timeouts, network errors
Retry Logic - retryAsync() helper for flaky operations (3 retries with backoff)
Backend Improvements
Engagement Sessions Table - Track each automation session
Daily Stats Table - Aggregate likes/replies/follows per day
Stats Dashboard Tab - New tab showing daily activity table + recent sessions
Version Info Endpoint - /api returns API documentation
Configurable Base URLs - Support custom OpenAI/OpenRouter-compatible endpoints
FILE LOCATIONS (in workspace)
/workspace/engage-pro-v1.8.0/
├── extension/
│   ├── manifest.json              (v1.8.0, Manifest V3)
│   ├── background.js              (service worker)
│   ├── content-scripts/
│   │   ├── twitter.js             (MAIN LOGIC - 2000+ lines)
│   │   └── twitter.css            (cursor styles)
│   ├── sidepanel/
│   │   ├── sidepanel.html         (dashboard UI)
│   │   ├── sidepanel.js           (dashboard logic)
│   │   └── sidepanel.css          (dashboard styles)
│   ├── popup/
│   │   ├── popup.html             (quick controls)
│   │   ├── popup.js               (popup logic)
│   │   └── popup.css              (popup styles)
│   ├── assets/                    (logo images)
│   └── icons/                     (extension icons)
└── backend/
    ├── server.js                  (Express server)
    ├── database.js                (SQLite + helpers)
    ├── package.json
    └── routes/
        ├── generate.js            (AI reply generation with fallback chain)
        ├── models.js              (AI model management + testing)
        ├── settings.js            (prompts + cache management)
        ├── templates.js           (custom templates)
        ├── history.js             (generation history + sessions + daily stats)
        └── auth.js                (API token management)
    └── dashboard/
        └── index.html             (backend web dashboard)

DOWNLOAD LINKS (v1.8.0)
Extension Only: https://odin.coworker.ai/s/46c851182a92c7b0
Complete Package: https://odin.coworker.ai/s/1d75ef65eafc2a9a
KEY TECHNICAL DETAILS FOR NEXT AI
Content Script Message Handlers (twitter.js)

The content script listens for these message types:

ENGAGEMENT_START / ENGAGEMENT_STOP - Start/stop automation
FOLLOWER_MODE_START / FOLLOWER_MODE_STOP - Follower growth mode
AI_REPLY_TWEET - Generate AI reply and post to specific tweet
TWEET_REPLY - Post manual reply to specific tweet
LIKE_TWEET - Manually like a tweet
EXECUTE_TASK - Execute with pre-generated reply text
GET_STATUS / GET_STATS / GET_ADVANCED_SETTINGS - Retrieve state
SET_CONFIG - Update configuration on the fly
SET_DAILY_LIMIT - Change daily limit
PAUSE_RESUME - Toggle pause state
SKIP_TWEET - Skip current tweet
CLEAR_CACHE - Clear engagement cache
EXPORT_STATS / IMPORT_STATS - Save/restore session data
GET_VERSION - Return version info
GET_TWEET / GET_ALL_TWEETS / GET_TWEET_BY_TEXT - Tweet discovery
CHECK_FEED / SCROLL_FEED - Feed operations
Backend API Endpoints
POST /api/generate - Generate AI reply (requires auth)
GET /api/models - List configured models
POST /api/models/:provider/activate - Set active provider
POST /api/models/:provider/key - Update API key
POST /api/models/:provider/model - Update model name
POST /api/models/:provider/test - Test provider connection
GET /api/models/openrouter/list - Browse OpenRouter models with pricing
GET /api/settings/prompt - Get active prompt
POST /api/settings/prompt - Update prompt
GET /api/settings/prompts - List all prompts
GET /api/settings/cache - Cache statistics
GET /api/history - Generation history
GET /api/history/stats - Generation statistics
GET /api/history/sessions - Engagement sessions
GET /api/history/daily - Daily stats
GET /api/auth/tokens - List tokens
POST /api/auth/token - Generate new token
GET /health - Health check (no auth)
Database Schema
system_prompts - AI system prompts
api_configs - Provider configurations (gemini, openai, openrouter)
generated_comments - History of generated replies
reply_cache - Cached replies by tweet hash
custom_templates - User-defined templates
auth_tokens - API authentication tokens
engagement_sessions (NEW v1.8.0) - Session tracking
daily_stats (NEW v1.8.0) - Daily aggregation
Known Issues / Next Steps
The extension targets Twitter/X DOM selectors which may break when Twitter updates their UI
AI generation requires backend server running on user's VPS (8GB RAM Ubuntu mentioned)
OpenRouter model browser fetches live pricing data
Fallback chain: Primary AI → Backup AI → Template replies
User's local machine is Windows (had Node.js install issues initially)
User's Goal

Build a perfect, reliable, robust AI commenting system for Twitter/X that:

Reads posts intelligently
Generates contextual AI replies
Posts them automatically
Has fallback mechanisms when AI fails
Can be configured for different AI providers
Tracks engagement history
Avoids detection by behaving human-like (delays, cursor movement, reading simulation)
WHAT THE USER ASKED FOR AT THE END

"Gimme the extension files, running out of credit" - Delivered both zip files above.
