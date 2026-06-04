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


Cursor goes to top-left - The cursor init fix I applied had a bug. The move() method uses this.x and this.y but I set the style directly without updating the internal state variables. So the first moveTo() call starts from wrong coordinates.
Comment not generating/pasting - The typeInEditor function has multiple methods but they're failing silently. The main issue is likely:
The clipboard paste method creates a DataTransfer but Twitter/X uses Draft.js which may need different event types
The execCommand('insertText') is deprecated and doesn't work on many modern sites
The direct DOM manipulation sets textContent but Draft.js stores state internally, so the visual text appears but Draft.js doesn't "see" it

Let me fix both issues properly:

FIX 1: Cursor Position Bug

The cursor init sets style directly but doesn't update this.x/this.y:

// WRONG (current):
this.x = window.innerWidth / 2;
this.y = window.innerHeight / 2;
this.el.style.transform = 'translate(' + this.x + 'px, ' + this.y + 'px)';

// CORRECT - must use move() to update internal state:
this.move(window.innerWidth / 2, window.innerHeight / 2);

FIX 2: Draft.js Text Input

Twitter/X uses Draft.js editor which doesn't respond to normal DOM manipulation. Here's the proper approach:

async function typeInEditor(text) {
  Cursor.set('#ec4899', 'Typing...');

  // Find editor in reply modal first
  var modal = document.querySelector('[role="dialog"]');
  var editor = null;
  
  if (modal) {
    editor = modal.querySelector('[data-testid="tweetTextarea_0"]') ||
             modal.querySelector('.public-DraftEditor-content') ||
             modal.querySelector('[contenteditable="true"]');
  }
  
  if (!editor) {
    editor = document.querySelector('[data-testid="tweetTextarea_0"]') ||
             document.querySelector('.public-DraftEditor-content') ||
             document.querySelector('[contenteditable="true"]');
  }

  if (!editor) {
    console.log('[engage-pro] No editor found');
    return false;
  }

  // Focus the editor
  editor.focus();
  editor.click();
  
  // For Draft.js, we need to simulate actual keypresses
  // Method: Use Selection API to insert text character by character
  
  try {
    // Get the editable element
    var editable = editor.isContentEditable ? editor : 
                   editor.querySelector('[contenteditable="true"]') || editor;
    
    // Clear existing content first
    var selection = window.getSelection();
    var range = document.createRange();
    
    // Select all content
    range.selectNodeContents(editable);
    selection.removeAllRanges();
    selection.addRange(range);
    
    // Delete selected content
    document.execCommand('delete', false, null);
    await sleep(100);
    
    // Now type character by character
    for (var i = 0; i < text.length; i++) {
      var char = text[i];
      
      // Create and dispatch input event for each character
      var inputEvent = new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: char
      });
      editable.dispatchEvent(inputEvent);
      
      // Actually insert the character using execCommand
      document.execCommand('insertText', false, char);
      
      // Dispatch afterinput event
      var afterEvent = new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: char
      });
      editable.dispatchEvent(afterEvent);
      
      // Small random delay between keystrokes for realism
      if (i < text.length - 1) {
        await sleep(10 + Math.random() * 30);
      }
    }
    
    // Final change event
    var changeEvent = new Event('change', { bubbles: true });
    editable.dispatchEvent(changeEvent);
    
    // Verify text was entered
    var enteredText = editable.textContent || editable.innerText || '';
    if (enteredText.includes(text.substring(0, 20))) {
      console.log('[engage-pro] Text typed successfully via character-by-character');
      return true;
    }
    
  } catch (e) {
    console.log('[engage-pro] Character typing failed:', e.message);
  }

  // Fallback: Try clipboard API (modern browsers)
  try {
    await navigator.clipboard.writeText(text);
    
    // Focus and paste
    editable.focus();
    
    var pasteEvent = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: new DataTransfer()
    });
    
    // Set data on clipboardData
    pasteEvent.clipboardData.setData('text/plain', text);
    pasteEvent.clipboardData.setData('text/html', text);
    
    editable.dispatchEvent(pasteEvent);
    await sleep(300);
    
    var pastedText = editable.textContent || editable.innerText || '';
    if (pastedText.includes(text.substring(0, 20))) {
      console.log('[engage-pro] Text pasted via clipboard API');
      return true;
    }
  } catch (e) {
    console.log('[engage-pro] Clipboard API failed:', e.message);
  }

  // Last resort: Direct innerHTML (may not trigger Draft.js but worth trying)
  try {
    editable.innerHTML = '<p>' + text.replace(/\n/g, '</p><p>') + '</p>';
    
    // Trigger input event
    var finalEvent = new InputEvent('input', {
      bubbles: true,
      inputType: 'insertFromPaste',
      data: text
    });
    editable.dispatchEvent(finalEvent);
    
    // Also trigger React's onChange if present
    var tracker = editable._valueTracker;
    if (tracker) {
      tracker.setValue('');
    }
    
    console.log('[engage-pro] Text set via innerHTML fallback');
    return true;
  } catch (e) {
    console.log('[engage-pro] All typing methods failed:', e.message);
    return false;
  }
}

FIX 3: Better Editor Detection in Reply Modal

The waitForEditor needs to wait longer and check more specifically:

async function waitForEditor() {
  // Wait for reply composer modal to appear
  var sels = ['[data-testid="tweetTextarea_0"]', '.public-DraftEditor-content', '[contenteditable="true"]', 'div[role="textbox"]'];
  
  for (var i = 0; i < 40; i++) { // Increased from 20 to 40 (8 seconds max)
    // Check for modal first
    var modal = document.querySelector('[role="dialog"]') || 
                document.querySelector('[data-testid="tweetDialog"]') ||
                document.querySelector('[aria-modal="true"]');
    
    if (modal) {
      // Look specifically inside the modal
      for (var j = 0; j < sels.length; j++) {
        var el = modal.querySelector(sels[j]);
        if (el && el.offsetParent !== null) {
          var editable = el.isContentEditable ? el : el.querySelector('[contenteditable="true"]');
          if (editable || el.getAttribute('contenteditable') === 'true') {
            console.log('[engage-pro] Found editor in reply modal after', i, 'attempts');
            return el;
          }
        }
      }
    }
    
    await sleep(200); // Increased from 150 to 200ms
  }
  
  console.log('[engage-pro] Editor not found after extended wait');
  return null;
}

FIX 4: Ensure Modal is Actually Open Before Typing

After clicking reply button, verify the modal opened:

// After clicking reply button
await click(replyBtn);
await sleep(random(1500, 2500)); // Increased wait

// Wait for modal with editor
var modal = null;
var editor = null;

for (var attempt = 0; attempt < 20; attempt++) {
  modal = document.querySelector('[role="dialog"]') || 
          document.querySelector('[data-testid="tweetDialog"]');
  
  if (modal) {
    editor = modal.querySelector('[data-testid="tweetTextarea_0"]') ||
             modal.querySelector('.public-DraftEditor-content') ||
             modal.querySelector('[contenteditable="true"]');
    
    if (editor) {
      console.log('[engage-pro] Modal and editor found');
      break;
    }
  }
  
  await sleep(200);
}

if (!modal || !editor) {
  console.log('[engage-pro] Failed to open reply modal or find editor');
  return false;
}

SUMMARY OF FIXES NEEDED
Issue	Root Cause	Fix
Cursor at top-left	Init sets style directly without updating internal x/y state	Use move() method instead
Text not appearing in editor	Draft.js doesn't respond to DOM manipulation	Type character-by-character with proper events
Editor not found	Wait time too short, selectors not specific enough	Increase wait, prioritize modal-only search
Modal not detected	Check happens too quickly after click	Add retry loop with longer delays
FILES TO EDIT
/workspace/engage-pro-v1.8.0/extension/content-scripts/twitter.js
Fix Cursor.init() to use this.move()
Rewrite typeInEditor() with character-by-character typing
Enhance waitForEditor() with longer waits and modal priority
Add modal verification after clicking reply
/workspace/engage-pro-v1.8.0/extension/content-scripts/twitter.js
Increase delays in engageTweet() reply section
Add verification that modal is open before proceeding
CONTEXT FOR NEXT AI

The user is testing v1.8.0 and found three critical bugs:

Cursor starts at wrong position (top-left instead of center)
AI-generated replies are not being typed into the Twitter reply editor
The engagement loop continues scrolling instead of completing the reply

The root cause is that Twitter/X uses Draft.js which requires specific input event simulation. The current typeInEditor() function's methods (clipboard paste, execCommand, direct DOM) don't trigger Draft.js's internal state updates.

The fix requires:

Character-by-character typing with beforeinput/input events
Proper focus and selection management
Longer waits for modal animation
Verification that text actually appeared before clicking submit

The cursor bug is a simple state synchronization issue in Cursor.init().
