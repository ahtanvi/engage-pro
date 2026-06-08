# Engage Pro - Twitter/X Automation Extension

## Project Overview

Engage Pro is a Chrome Extension + Node.js Backend that automates Twitter/X engagement. It reads tweets, generates AI-powered replies using LLMs (Gemini, OpenAI, OpenRouter), and posts them automatically. Also supports auto-liking and follower growth mode.

## Architecture

- **Extension**: Manifest V3, content script (twitter.js), sidepanel dashboard, popup quick controls
- **Backend**: Node.js + Express + SQLite database with web dashboard
- **AI Providers**: Google Gemini, OpenAI, OpenRouter (with fallback chain)
- **Communication**: Chrome extension message passing between content script, sidepanel, and background

## File Structure

```
engage-pro-v1.8.2-fixed/
├── manifest.json              (Manifest V3)
├── background.js              (service worker - handles start/stop, stats, alarms)
├── content-scripts/
│   ├── twitter.js             (MAIN LOGIC - 2600+ lines, contains anti-detection, humanizing)
│   └── twitter.css            (cursor styles)
├── sidepanel/
│   ├── sidepanel.html         (dashboard UI with tabs: Dashboard, Queue, History, AI, Advanced, Settings)
│   ├── sidepanel.js           (dashboard logic)
│   └── sidepanel.css          (dashboard styles)
├── popup/
│   ├── popup.html             (quick controls - platform tabs, speed mode, operation mode)
│   ├── popup.js               (popup logic)
│   └── popup.css              (popup styles)
├── assets/                    (logo images - logo-light.png, logo-dark.png)
└── icons/                     (extension icons - 16,32,48,128px)

backend/
├── server.js                  (Express server - routes, auth middleware, health check)
├── database.js                (SQLite + helpers - prompts, configs, cache, history)
├── package.json               (dependencies: express, cors, sqlite3, bcryptjs, uuid)
├── data/                      (SQLite database file)
├── dashboard/                 (web dashboard static files)
└── routes/
    ├── generate.js            (AI reply generation with fallback chain)
    ├── models.js              (AI model management + testing)
    ├── settings.js            (prompts + cache management)
    ├── templates.js           (custom templates)
    ├── history.js             (generation history + sessions + daily stats)
    └── auth.js                (API token management)
```

## Key Features

- **Auto-Like**: Automatically likes tweets in the feed with human-like delays
- **AI Replies**: Generates and posts AI-powered replies via backend or template fallback
- **Follower Growth Mode**: Follows accounts from a user's followers list with human-like behavior
- **Speed Presets**: Slow, Medium, Fast with configurable delays (all humanized)
- **AI Backend Integration**: Connects to local/remote backend for AI generation
- **Advanced Settings**: Debug mode, scroll speed, max scroll attempts, reply delay multiplier
- **Pause/Resume**: Can pause and resume engagement mid-session
- **Skip Tweet**: Skip current tweet and move to next
- **Tweet Deduplication**: Cache system to avoid engaging same tweet twice
- **Export/Import Stats**: Session statistics can be exported and imported
- **Live AI Status**: Real-time AI generation status in sidepanel
- **Error Detection**: Rate limit, login required, page error detection
- **Human-like Cursor**: Animated cursor that moves, clicks, and shows status

## Anti-Detection & Humanizing Features (v1.8.3)

### Core Humanizing
- **Random delays**: All actions have +/- 25% jitter so no two actions look the same
- **Mouse jitter**: Small random mouse movements before every click
- **Think pauses**: 300-1500ms random pause before engaging each tweet
- **Hesitation simulation**: Hover near element, sometimes move away, come back
- **Variable scroll amounts**: 300-800px instead of fixed amounts

### Advanced Anti-Detection
- **Pattern detection**: Tracks last 50 actions, detects repetitive timing
- **Adaptive delays**: Adds extra 5-15s delays when patterns become too regular
- **Random tweet skipping**: 15% chance to skip a tweet (humans don't engage with everything)
- **Random breaks**: 10% chance to take 5-15 second break between batches
- **Session limits**: Auto-pauses after 15-45 minutes (typical human session)
- **Long breaks**: 1-3 minute break after 10-20 actions
- **Exponential backoff**: On errors, waits double each time (up to 5 minutes)
- **Daily limit**: Reduced to 30 engagements/day to avoid rate limits
- **Variable typing**: Typing speed randomized 30-150ms per character with burst patterns
- **Reading time**: Adaptive based on content length and complexity

### Behavioral Patterns
- **Burst typing**: Types 3-8 characters at a time with varying speed
- **Pause between bursts**: 30% chance to pause 300-1000ms mid-typing (like thinking)
- **Occasional typos**: 2% chance to simulate typo (if visible typing)
- **Change mind**: 5% chance to start action then abort (human indecision)

## Speed Presets (Humanized)

| Preset | Action Delay | Scroll Delay | Engagement Delay |
|--------|-------------|--------------|------------------|
| Slow | 3-8s | 5-12s | 15-30s |
| Medium | 2-5s | 3-8s | 8-15s |
| Fast | 1-2.5s | 2-5s | 4-8s |

All delays have +/- 25% random variation applied.

## Message Types (Content Script <-> Background <-> Sidepanel)

- ENGAGEMENT_START / ENGAGEMENT_STOP - Start/stop engagement loop
- FOLLOWER_MODE_START / FOLLOWER_MODE_STOP - Start/stop follower growth
- UPDATE_STATS - Update engagement statistics
- GET_STATUS / GET_STATS - Retrieve current status and stats
- PAUSE_RESUME - Toggle pause state
- SKIP_TWEET - Skip current tweet
- SET_DAILY_LIMIT - Update daily engagement limit
- EXPORT_STATS / IMPORT_STATS - Export/import session data
- GET_VERSION / GET_ADVANCED_SETTINGS - Version and settings info
- SET_CONFIG - Update configuration on the fly
- TEST_MODE - Run test mode for typing
- FOLLOWER_MODE_STATUS - Get follower mode status
- EXECUTE_TASK - Manual task execution
- TWEET_REPLY / AI_REPLY_TWEET / LIKE_TWEET - Manual tweet actions
- CHECK_FEED / GET_TWEET / GET_ALL_TWEETS / GET_TWEET_BY_TEXT - Feed inspection
- SCROLL_FEED / CLEAR_CACHE - Feed management
- AI_GENERATION_STATUS - Live AI generation status updates

## Backend API Endpoints

- POST /api/generate - Generate AI reply (requires auth)
- GET /api/models - List configured models
- GET /health - Health check (no auth)
- GET /api/history - Generation history
- GET /api/history/stats - Statistics
- GET /api/history/sessions - Engagement sessions
- GET /api/history/daily - Daily stats

## Database Schema (SQLite)

- system_prompts - AI system prompts
- api_configs - Provider configurations (gemini, openai, openrouter)
- generated_comments - History of generated replies
- reply_cache - Cached replies by tweet hash
- custom_templates - User-defined templates
- auth_tokens - API authentication tokens
- engagement_sessions - Session tracking
- daily_stats - Daily aggregation

## Template Categories (Built-in)

- **supportive**: Appreciation and agreement responses
- **insightful**: Analysis and value-add responses
- **engaging**: Questions and conversation starters
- **humorous**: Light and funny responses
- **crypto**: Crypto/Web3 specific responses
- **tech**: Startup/Builder/Product responses

## Known Issues & Limitations

### Floating Text Issue (DO NOT FIX)
When the extension auto-types a reply into Twitter/X's reply composer, the text may appear to float above the reply box instead of being properly inserted into the Draft.js editor. The tweet gets posted successfully, but the text is not visible inside the composer before posting. This is a known limitation of the clipboard paste approach.

### Twitter Rate Limits
Twitter/X has aggressive rate limiting. Even with humanizing features, excessive use can trigger:
- "This request looks like it might be automated" errors
- Temporary account restrictions
- CAPTCHA challenges

**Mitigation**: Use slow mode, limit daily engagements, take breaks, mix manual and automated actions.

## Development History & Fixes

### v1.8.3 - Anti-Detection Update
- Added comprehensive humanizing features to avoid Twitter automation detection
- Implemented pattern detection and adaptive delays
- Added session duration limits and random breaks
- Reduced daily engagement limit to 30
- Added mouse jitter, hesitation simulation, and variable typing

### v1.8.2 - Syntax Fixes
- Fixed stranded `async` keyword causing parse errors
- Fixed apostrophe escaping in error detection strings
- Verified bracket/parenthesis balance across all files

### v1.8.1 - Background Communication
- Added PING/TELEGRAM_QUEUE_ENGAGE retry logic
- Fixed content script readiness detection
- Improved error handling for background-to-content communication

### v1.8.0 - Initial Release
- Core engagement loop (like, reply, follow)
- AI backend integration with fallback chain
- Sidepanel dashboard with live status
- Popup quick controls
- SQLite backend with history tracking

## Setup Instructions

1. Unzip the extension folder
2. Go to `chrome://extensions/`
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Select the `engage-pro-v1.8.2-fixed` folder
6. **Clear extension storage** first (DevTools → Application → Storage → Clear site data)
7. Configure backend URL and API key in sidepanel settings
8. Start with **Slow mode** and **Auto-like only** before enabling replies

## Recommended Usage

1. **Use SLOW mode** for the first few days to establish a "human" pattern
2. **Don't run for more than 1-2 hours at a time** — take breaks
3. **Mix manual and automated actions** — manually like/reply some tweets too
4. **Start with just auto-like** before enabling auto-reply
5. **If rate limited**, stop for 24 hours and reduce daily limit further
6. **Monitor console logs** for error detection and adaptive delay messages

## Technical Notes for AI Development

### Content Script Architecture
- Main IIFE wrapper with `'use strict'`
- State variables: `isRunning`, `shouldStop`, `config`, `engagementCount`
- `PRESETS` object defines delay ranges for each speed mode
- `humanLike` object: basic humanizing (jitter, think pause, typing delay)
- `antiDetection` object: advanced pattern detection and adaptive behavior
- `Cursor` object: visual cursor simulation with smooth movement

### Key Functions
- `findTweets()`: Scans DOM for tweet elements using data-testid attributes
- `engageTweet(tweet)`: Main engagement logic (like, reply, follow)
- `typeInEditor(text)`: Clipboard paste approach for Draft.js editor
- `click(el)`: Simulates human-like click with pointer events and delays
- `moveTo(el)`: Smooth cursor movement with easing
- `runLoop()`: Main engagement loop with humanizing delays

### Anti-Detection Implementation
- Pattern tracking via `antiDetection.engagementHistory` array
- Variance calculation to detect repetitive timing
- Adaptive delays injected before each engagement
- Session time tracking with automatic breaks
- Random skip logic with configurable probability

### Common Issues During Development
- **Syntax errors**: Stranded `async` keywords, unescaped apostrophes in strings
- **Bracket mismatch**: Always verify with automated checks after edits
- **Content script not ready**: Background script PING retry logic handles this
- **Rate limiting**: Primary cause is insufficient humanizing delays

## License

Private project - not for redistribution.
