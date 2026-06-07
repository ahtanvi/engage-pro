# Engage Pro - Twitter/X Auto-Engagement Extension

## What This Is

A Chrome Extension + Node.js Backend that automates Twitter/X engagement. It reads tweets, generates AI-powered replies using LLMs (Gemini, OpenAI, OpenRouter), and posts them automatically. Also supports auto-liking and follower growth mode.

## Architecture

- **Extension**: Manifest V3, content script (twitter.js), sidepanel dashboard, popup quick controls
- **Backend**: Node.js + Express + SQLite database with web dashboard
- **AI Providers**: Google Gemini, OpenAI, OpenRouter (with fallback chain)
- **Communication**: Chrome extension message passing between content script ↔ sidepanel ↔ background

## VERSION HISTORY

| Version | What Was Added |
|---------|---------------|
| v1.5.0 - v1.5.6 | Base extension with auto-like, AI replies, follower mode, speed presets |
| v1.6.0 | Backend integration, AI provider system, model testing, OpenRouter browser |
| v1.7.0 - v1.7.1 | Bug fixes for connection tests, cursor init, response parsing |
| v1.8.0 - v1.8.2 | Major reliability overhaul, advanced settings, pause/resume, skip tweet, deduplication |

## CURRENT STATUS (v1.8.2) - CRITICAL BUG: Floating Text Issue

### The Problem
When the extension auto-types a reply into Twitter/X's reply composer, the text appears to **float above the reply box** instead of being properly inserted into the Draft.js editor. The tweet gets posted successfully, but the text is not visible inside the composer before posting.

### What We've Tried (All Failed)
1. **Direct textContent manipulation** - Text appears floating
2. **Character-by-character typing with KeyboardEvents** - Text appears floating
3. **Composition events (compositionstart/update/end)** - Text appears floating
4. **Clipboard paste simulation** - Fails because document isn't focused
5. **execCommand('insertText')** - Console says "verified" but text still floats visually
6. **Targeting different elements** (data-text div, contenteditable div, public-DraftEditor-content) - All produce same floating result

### Console Output Shows
```
[engage-pro] Target element: DIV contenteditable: true class: notranslate public-DraftEditor-content
[engage-pro] execCommand target: DIV contenteditable: true
[engage-pro] execCommand result text: This adds so much value to the conversation.
[engage-pro] Text inserted via execCommand - verified
[engage-pro] Reply posted!
```
- The text IS being inserted into the DOM (textContent shows it)
- But visually it appears floating above the composer, not inside it
- The tweet still gets posted successfully

### Root Cause Hypothesis
The text is being inserted into the wrong DOM element or the Draft.js editor's internal state is not being updated properly. Twitter/X uses React with Draft.js which manages its own virtual DOM. Simply setting textContent or using execCommand may insert text into the DOM but Draft.js doesn't "know" about it, causing visual glitches.

### What Needs to Be Fixed
The `typeInEditor` function in `twitter.js` needs to properly interact with Twitter/X's Draft.js editor so that:
1. Text appears inside the reply composer (not floating above it)
2. Draft.js recognizes the text as user input
3. The submit button becomes enabled (if it's not already)
4. The tweet posts correctly with the text

## FILE LOCATIONS

```
/workspace/engage-pro-v1.8.2/ (or latest version folder)
├── manifest.json              (Manifest V3)
├── background.js              (service worker)
├── content-scripts/
│   ├── twitter.js             (MAIN LOGIC - 2000+ lines, contains typeInEditor, engageTweet)
│   └── twitter.css            (cursor styles)
├── sidepanel/
│   ├── sidepanel.html         (dashboard UI)
│   ├── sidepanel.js           (dashboard logic)
│   └── sidepanel.css          (dashboard styles)
├── popup/
│   ├── popup.html             (quick controls)
│   ├── popup.js               (popup logic)
│   └── popup.css              (popup styles)
├── assets/                    (logo images)
└── icons/                     (extension icons)

backend/
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
```

## KEY FUNCTIONS TO FIX

### `typeInEditor(text, passedEditor)` in `twitter.js`
This is the main function that needs fixing. It currently has 5 methods:
1. navigator.clipboard API (fails - document not focused)
2. execCommand insertText (says verified but text floats)
3. Character-by-character typing (text floats)
4. innerHTML with Draft.js structure (text floats)
5. Direct textContent (last resort, text floats)

### `engageTweet(tweet)` in `twitter.js`
Orchestrates the engagement flow:
1. Finds reply button
2. Clicks reply button
3. Waits for modal to open
4. Calls `typeInEditor()` to type the reply
5. Finds and clicks submit button

## TESTING APPROACH

1. Load extension in Chrome
2. Go to Twitter/X
3. Open browser console (F12)
4. Manually click Reply on a tweet to open composer
5. Try typing via console to test Draft.js behavior:
   ```javascript
   // Find the contenteditable div
   var editor = document.querySelector('.public-DraftEditor-content');
   editor.focus();
   document.execCommand('insertText', false, 'test');
   ```
6. Check if text appears inside composer or floating above

## POTENTIAL SOLUTIONS TO TRY

1. **Trigger React's synthetic event system** - Dispatch events that React actually listens to (not just standard DOM events)
2. **Use React DevTools or internal React APIs** - Access React's internal fiber tree to find the editor component and call its onChange handler
3. **Simulate actual user input more realistically** - Use proper selection ranges and InputEvent with correct dataTransfer
4. **Find and trigger the actual Draft.js onChange handler** - Look for React props on the editor element and call the onChange function directly
5. **Use Chrome Extension scripting API** - Inject a script that can access page's JavaScript context and interact with React directly
6. **Check if the issue is CSS-related** - The floating text might be a z-index or positioning issue

## BACKEND API ENDPOINTS

- `POST /api/generate` - Generate AI reply (requires auth)
- `GET /api/models` - List configured models
- `GET /health` - Health check (no auth)
- `GET /api/history` - Generation history
- `GET /api/history/stats` - Statistics
- `GET /api/history/sessions` - Engagement sessions
- `GET /api/history/daily` - Daily stats

## DATABASE SCHEMA

- `system_prompts` - AI system prompts
- `api_configs` - Provider configurations (gemini, openai, openrouter)
- `generated_comments` - History of generated replies
- `reply_cache` - Cached replies by tweet hash
- `custom_templates` - User-defined templates
- `auth_tokens` - API authentication tokens
- `engagement_sessions` - Session tracking
- `daily_stats` - Daily aggregation

## KNOWN WORKING FEATURES

- Auto-like tweets
- AI reply generation (backend works correctly)
- Cursor movement and animation
- Tweet discovery and scrolling
- Modal detection and reply button clicking
- Submit button finding and clicking
- Session tracking and statistics
- Daily limits and engagement counting

## KNOWN BROKEN FEATURES

- **Text input into Draft.js editor** - The main floating text issue
- Test function `window.testDraftJsTyping` was added but may not be accessible due to IIFE scope issues

## USER'S SETUP

- Local machine: Windows (had Node.js install issues initially)
- Backend server: Ubuntu VPS with 8GB RAM
- Browser: Chrome with Manifest V3 extension
- Target: Twitter/X (twitter.com / x.com)

## NEXT STEPS FOR FIXING

1. Understand exactly how Twitter/X's Draft.js editor handles input
2. Find the correct way to programmatically insert text that Draft.js recognizes
3. Test different approaches in browser console first
4. Implement the fix in `typeInEditor()`
5. Verify text appears inside composer, not floating
6. Ensure submit button is enabled after typing
7. Test full engagement flow end-to-end

## IMPORTANT NOTES

- The extension uses an IIFE wrapper: `(function() { ... })();`
- All functions are inside the IIFE scope, not globally accessible
- To add test functions, they must be attached to `window` object BEFORE the IIFE closes
- The file is large (~2500 lines), so edits must be precise
- Twitter/X DOM selectors may change, requiring updates to selectors
- The extension must behave human-like to avoid detection (delays, cursor movement, reading simulation)
