(function() {
  'use strict';

  console.log('[engage-pro] Twitter content script loaded - v1.8.0');
  
  // Debug mode helper
  function debugLog(...args) {
    if (config.debugMode) {
      console.log('[engage-pro:debug]', ...args);
    }
  }

  // STATE
  let isRunning = false;
  let shouldStop = false;
  let currentPreset = null;
  let config = { autoLike: true, autoReply: true, autoFollow: false };
  let engagementCount = 0;
  let dailyLimit = 50;
  let sessionStats = { likes: 0, replies: 0, follows: 0 };

  const PRESETS = {
    slow: { actionDelay: { min: 1000, max: 2500 }, scrollDelay: { min: 2500, max: 6000 }, engagementDelay: { min: 6000, max: 15000 } },
    medium: { actionDelay: { min: 500, max: 1200 }, scrollDelay: { min: 1200, max: 3000 }, engagementDelay: { min: 3000, max: 8000 } },
    fast: { actionDelay: { min: 250, max: 600 }, scrollDelay: { min: 700, max: 1400 }, engagementDelay: { min: 1500, max: 3500 } }
  };

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const random = (min, max) => min + Math.random() * (max - min);

  // Retry helper for flaky operations
  async function retryAsync(fn, maxRetries = 3, delay = 1000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await fn();
        if (result) return result;
        if (attempt < maxRetries) {
          console.log(`[engage-pro] Retry ${attempt}/${maxRetries} failed, waiting ${delay}ms...`);
          await sleep(delay);
        }
      } catch (err) {
        console.log(`[engage-pro] Retry ${attempt}/${maxRetries} error:`, err.message);
        if (attempt < maxRetries) {
          await sleep(delay * attempt); // Exponential backoff
        }
      }
    }
    return null;
  }

  // CURSOR
  const Cursor = {
    el: null, dot: null, label: null,
    x: window.innerWidth / 2, y: window.innerHeight / 2,

    init() {
      if (this.el) return;
      const div = document.createElement('div');
      div.id = 'ep-cursor';
      div.style.cssText = 'position:fixed;left:0;top:0;width:20px;height:20px;pointer-events:none;z-index:999999999;transition:transform 0.08s linear;margin:-10px 0 0 -10px;';
      div.innerHTML = '<div id="epc-dot" style="width:12px;height:12px;border-radius:50%;margin:4px;background:#a3e635;box-shadow:0 0 12px #a3e635;transition:background 0.3s;"></div><div id="epc-label" style="position:absolute;left:18px;top:12px;padding:4px 12px;border-radius:10px;font-family:system-ui,sans-serif;font-size:12px;font-weight:600;white-space:nowrap;opacity:0;transform:scale(0.8);transition:all 0.2s;background:#111;color:#a3e635;border:1px solid #333;">Idle</div>';
      document.body.appendChild(div);
      this.el = div;
      this.dot = document.getElementById('epc-dot');
      this.label = document.getElementById('epc-label');
      // Set initial position to center of viewport, not (0,0)
      this.x = window.innerWidth / 2;
      this.y = window.innerHeight / 2;
      // Apply initial transform immediately
      this.el.style.transform = 'translate(' + this.x + 'px, ' + this.y + 'px)';
    },

    move(x, y) {
      this.x = x; this.y = y;
      if (this.el) this.el.style.transform = 'translate(' + x + 'px, ' + y + 'px)';
    },

    set(color, text) {
      this.init();
      if (this.dot) this.dot.style.background = color;
      if (this.label) {
        this.label.style.background = '#111';
        this.label.style.color = color;
        this.label.style.borderColor = color + '40';
        this.label.textContent = text;
        this.label.style.opacity = '1';
        this.label.style.transform = 'scale(1)';
      }
    },

    hide() {
      if (this.label) {
        this.label.style.opacity = '0';
        this.label.style.transform = 'scale(0.8)';
      }
    },

    show() {
      this.init();
      if (this.el) {
        this.el.style.display = 'block';
      }
    }
  };

  // MOUSE / INTERACTION
  async function moveTo(el) {
    const rect = el.getBoundingClientRect();
    const tx = rect.left + rect.width * (0.3 + Math.random() * 0.4);
    const ty = rect.top + rect.height * (0.3 + Math.random() * 0.4);
    const dist = Math.hypot(tx - Cursor.x, ty - Cursor.y);
    const dur = dist * 1.2 + 100;
    const steps = Math.min(30, Math.max(8, Math.floor(dur / 20)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      Cursor.move(Cursor.x + (tx - Cursor.x) * e, Cursor.y + (ty - Cursor.y) * e);
      await sleep(dur / steps);
    }
  }

  async function click(el) {
    await moveTo(el);
    Cursor.set('#f97316', 'Clicking');
    const r = el.getBoundingClientRect();
    const x = r.left + r.width * (0.3 + Math.random() * 0.4);
    const y = r.top + r.height * (0.3 + Math.random() * 0.4);
    el.dispatchEvent(new MouseEvent('mousedown', { clientX: x, clientY: y, bubbles: true }));
    await sleep(random(40, 120));
    el.dispatchEvent(new MouseEvent('mouseup', { clientX: x, clientY: y, bubbles: true }));
    el.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true }));
    await sleep(random(100, 300));
  }

  // TYPING - Clipboard paste approach for Draft.js
  async function typeInEditor(text) {
    Cursor.set('#ec4899', 'Typing...');

    // Find the editor - prefer modal editors over main composer
    var editor = null;
    
    // First, check if there's a reply modal open
    var modal = document.querySelector('[role="dialog"]') || document.querySelector('[data-testid="tweetDialog"]');
    if (modal) {
      editor = modal.querySelector('[data-testid="tweetTextarea_0"]') ||
               modal.querySelector('.public-DraftEditor-content') ||
               modal.querySelector('[contenteditable="true"]') ||
               modal.querySelector('[role="textbox"]');
    }
    
    // Fallback to global search if no modal editor found
    if (!editor) {
      editor = document.querySelector('[data-testid="tweetTextarea_0"]') ||
               document.querySelector('.public-DraftEditor-content') ||
               document.querySelector('[contenteditable="true"]') ||
               document.querySelector('[role="textbox"]');
    }

    if (!editor) {
      console.log('[engage-pro] No editor found');
      return false;
    }

    console.log('[engage-pro] Editor found:', editor.tagName, editor.getAttribute('data-testid'));

    var target = editor;
    if (!editor.isContentEditable) {
      var editable = editor.querySelector('[contenteditable="true"]') ||
                     editor.querySelector('.public-DraftEditor-content') ||
                     editor.querySelector('[role="textbox"]');
      if (editable) target = editable;
    }

    target.focus();
    target.click();
    await sleep(800);

    // METHOD 1: Clipboard paste (most reliable for Draft.js)
    try {
      var clipboardData = new DataTransfer();
      clipboardData.setData('text/plain', text);
      clipboardData.setData('text/html', '<p>' + text + '</p>');

      var pasteEvent = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: clipboardData
      });

      target.dispatchEvent(new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertFromPaste',
        data: text
      }));
      await sleep(50);

      target.dispatchEvent(pasteEvent);
      await sleep(300);

      target.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'insertFromPaste',
        data: text
      }));
      await sleep(200);

      var enteredText = target.textContent || target.innerText || '';
      if (enteredText.includes(text.substring(0, 15))) {
        console.log('[engage-pro] Text pasted via clipboard event - verified');
        return true;
      }
      console.log('[engage-pro] Clipboard paste - text not verified, trying execCommand');
    } catch (e) {
      console.log('[engage-pro] Clipboard paste failed:', e.message);
    }

    // METHOD 2: execCommand (fallback for older browsers)
    try {
      var sel = window.getSelection();
      var range = document.createRange();
      range.selectNodeContents(target);
      sel.removeAllRanges();
      sel.addRange(range);
      await sleep(100);

      document.execCommand('delete', false, null);
      await sleep(100);

      var ok = document.execCommand('insertText', false, text);
      if (ok) {
        console.log('[engage-pro] Text inserted via execCommand');
        target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
        await sleep(200);
        return true;
      }
    } catch (e) {
      console.log('[engage-pro] execCommand failed:', e.message);
    }

    // METHOD 3: Direct DOM manipulation (last resort)
    console.log('[engage-pro] Trying direct DOM manipulation');
    target.textContent = '';
    await sleep(100);
    target.textContent = text;
    target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    target.focus();
    await sleep(100);
    console.log('[engage-pro] Direct DOM - text set');
    return true;
  }

  // SCROLL
  async function scroll(amount) {
    Cursor.set('#6366f1', 'Scrolling');
    // Use configured scroll speed if available
    var scrollAmount = amount || (config.scrollSpeed || 800);
    var steps = Math.min(15, Math.max(5, Math.abs(scrollAmount) / 100));
    for (var i = 0; i < steps; i++) {
      if (shouldStop) return;
      window.scrollBy(0, scrollAmount / steps);
      await sleep(random(30, 60));
    }
  }

  // TEMPLATES
  const TEMPLATES = {
    supportive: ['This is exactly what I needed to hear today. Thank you!', 'Absolutely love this perspective. Well said!', 'This resonates so much. Appreciate you sharing!', 'Couldn\'t agree more. Quality content!'],
    insightful: ['This is a really interesting take. Great analysis!', 'This adds so much value to the conversation.', 'Really thoughtful analysis. The nuance is refreshing.', 'This sparked new ideas for me. Thank you!'],
    engaging: ['What\'s been your biggest learning from this?', 'How long did it take you to get here? Love the journey!', 'This is fascinating! Any tips for beginners?', 'Would love to see a thread expanding on this!'],
    humorous: ['This is too real!', 'Me reading this: wow', 'This just became my new favorite tweet.', 'The accuracy is uncanny. Well done!'],
    crypto: ['This is the alpha the timeline needs. Great breakdown!', 'Solid analysis. The fundamentals are stronger than people realize.', 'This thread aged like fine wine. Bookmarking!', 'The macro perspective here is exactly what\'s missing.'],
    tech: ['This is the builder mindset that separates good from great.', 'The iteration speed here is impressive. Most take months.', 'This solves a real pain point. Timing feels right.', 'Love the focus on UX. Too many forget this part.']
  };

  function categorize(text) {
    var t = text.toLowerCase();
    if (t.indexOf('crypto') >= 0 || t.indexOf('web3') >= 0 || t.indexOf('bitcoin') >= 0 || t.indexOf('ethereum') >= 0 || t.indexOf('token') >= 0) return 'crypto';
    if (t.indexOf('startup') >= 0 || t.indexOf('building') >= 0 || t.indexOf('product') >= 0 || t.indexOf('saas') >= 0 || t.indexOf('dev') >= 0) return 'tech';
    if (t.indexOf('lol') >= 0 || t.indexOf('haha') >= 0) return 'humorous';
    if (t.indexOf('?') >= 0) return 'engaging';
    if (t.indexOf('thank') >= 0 || t.indexOf('appreciate') >= 0) return 'supportive';
    return 'insightful';
  }

  function getTemplate(cat) {
    var arr = TEMPLATES[cat] || TEMPLATES.insightful;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // DOM HELPERS
  // Tweet deduplication cache
  var tweetIdCache = new Map();
  var TWEET_CACHE_MAX_SIZE = 1000;
  var TWEET_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

  function getTweetId(tweet) {
    // Try to get a unique ID for the tweet
    var id = tweet.getAttribute('data-tweet-id');
    if (id) return id;
    
    // Fallback: use tweet text + author as ID
    var text = getTweetText(tweet);
    var author = (tweet.querySelector('[data-testid="User-Name"]') || { textContent: '' }).textContent.trim();
    return (text + '|' + author).substring(0, 200);
  }

  function isTweetAlreadyEngaged(tweet) {
    var tweetId = getTweetId(tweet);
    if (!tweetId) return false;
    
    var cached = tweetIdCache.get(tweetId);
    if (cached) {
      // Check if cache entry is still valid
      if (Date.now() - cached.time < TWEET_CACHE_TTL) {
        return true;
      }
      // Expired, remove from cache
      tweetIdCache.delete(tweetId);
    }
    return false;
  }

  function markTweetEngaged(tweet) {
    var tweetId = getTweetId(tweet);
    if (tweetId) {
      // Clean up old entries if cache is too large
      if (tweetIdCache.size >= TWEET_CACHE_MAX_SIZE) {
        var oldest = tweetIdCache.keys().next().value;
        tweetIdCache.delete(oldest);
      }
      tweetIdCache.set(tweetId, { time: Date.now() });
    }
    tweet.dataset.epEngaged = 'true';
  }

  function findTweets() {
    var sels = ['article[data-testid="tweet"]', '[data-testid="tweet"]', '[data-testid="cellInnerDiv"] article'];
    for (var i = 0; i < sels.length; i++) {
      var els = document.querySelectorAll(sels[i]);
      if (els.length > 0) {
        // Filter out already engaged tweets using both dataset and cache
        var tweets = Array.from(els).filter(function(t) {
          return t.dataset.epEngaged !== 'true' && !isTweetAlreadyEngaged(t);
        });
        return tweets;
      }
    }
    return [];
  }

  function getTweetText(tweet) {
    var el = tweet.querySelector('[data-testid="tweetText"]');
    return el ? (el.textContent || '').trim() : '';
  }

  function findLikeBtn(tweet) {
    var sels = ['[data-testid="like"]', 'button[aria-label*="Like"]'];
    for (var i = 0; i < sels.length; i++) {
      var b = tweet.querySelector(sels[i]);
      if (b) return b;
    }
    return null;
  }

  function isLiked(tweet) {
    return !!tweet.querySelector('[data-testid="unlike"]');
  }

  function findReplyBtn(tweet) {
    // Look for the reply button specifically within the tweet's action bar (role="group")
    var bar = tweet.querySelector('[role="group"]');
    if (!bar) {
      console.log('[engage-pro] No action bar found in tweet');
      return null;
    }
    
    // Reply button should be the first button in the action bar on Twitter/X
    var sels = ['[data-testid="reply"]', 'button[aria-label*="Reply"]', '[data-testid="replyButton"]'];
    for (var i = 0; i < sels.length; i++) {
      var b = bar.querySelector(sels[i]);
      if (b) {
        console.log('[engage-pro] Found reply button in tweet action bar');
        return b;
      }
    }
    
    // Fallback: check all buttons in the action bar for reply-related aria-label
    var btns = bar.querySelectorAll('button');
    for (var j = 0; j < btns.length; j++) {
      var b = btns[j];
      var aria = (b.getAttribute('aria-label') || '').toLowerCase();
      if (aria.indexOf('reply') >= 0) {
        console.log('[engage-pro] Found reply button via aria-label');
        return b;
      }
    }
    
    // Additional fallback: look for any button with reply icon or text
    var allBtns = tweet.querySelectorAll('button');
    for (var k = 0; k < allBtns.length; k++) {
      var btn = allBtns[k];
      var text = (btn.textContent || '').toLowerCase();
      var aria2 = (btn.getAttribute('aria-label') || '').toLowerCase();
      if (text.indexOf('reply') >= 0 || aria2.indexOf('reply') >= 0) {
        console.log('[engage-pro] Found reply button via text/aria fallback');
        return btn;
      }
    }
    
    console.log('[engage-pro] Reply button not found in tweet action bar');
    return null;
  }

  async function waitForEditor() {
    // Wait for a reply composer to appear - should be in a modal/overlay, not the main timeline composer
    var sels = ['[data-testid="tweetTextarea_0"]', '.public-DraftEditor-content', '[contenteditable="true"]', 'div[role="textbox"]'];
    for (var i = 0; i < 30; i++) {
      // First check if there's a modal/dialog open (reply composer)
      var modal = document.querySelector('[role="dialog"]') || document.querySelector('[data-testid="tweetDialog"]');
      if (modal) {
        // Look for editor within the modal
        for (var j = 0; j < sels.length; j++) {
          var el = modal.querySelector(sels[j]);
          if (el && el.offsetParent !== null) {
            var editable = el.querySelector('[contenteditable="true"]') || el;
            if (editable.isContentEditable || editable.getAttribute('contenteditable') === 'true') {
              console.log('[engage-pro] Found editor in reply modal');
              return el;
            }
          }
        }
      }
      
      // Fallback: check all editors but prefer ones not in the main timeline
      for (var j = 0; j < sels.length; j++) {
        var els = document.querySelectorAll(sels[j]);
        for (var k = 0; k < els.length; k++) {
          var el = els[k];
          if (el && el.offsetParent !== null) {
            // Check if this editor is inside a tweet (main composer) or in a modal (reply composer)
            var inTweet = el.closest('article[data-testid="tweet"]');
            var inModal = el.closest('[role="dialog"]') || el.closest('[data-testid="tweetDialog"]');
            
            if (inModal && !inTweet) {
              var editable = el.querySelector('[contenteditable="true"]') || el;
              if (editable.isContentEditable || editable.getAttribute('contenteditable') === 'true') {
                console.log('[engage-pro] Found editor in modal (not in tweet)');
                return el;
              }
            }
          }
        }
      }
      
      await sleep(200);
    }
    console.log('[engage-pro] Editor not found after waiting');
    return null;
  }

  function findSubmitBtn() {
    // First, check if we're in a reply modal
    var modal = document.querySelector('[role="dialog"]') || document.querySelector('[data-testid="tweetDialog"]');
    var searchRoot = modal || document;
    
    var sels = [
      '[data-testid="tweetButton"]', '[data-testid="tweetButtonInline"]',
      'button[data-testid="tweetButton"]', 'button[data-testid="tweetButtonInline"]',
      '[data-testid="replyButtonSubmit"]'
    ];
    for (var i = 0; i < sels.length; i++) {
      var b = searchRoot.querySelector(sels[i]);
      if (b && !b.disabled && b.offsetParent !== null) {
        // Verify this button is in the modal, not the main page
        if (modal && !modal.contains(b)) continue;
        return b;
      }
    }
    
    // Fallback: search all buttons
    var btns = searchRoot.querySelectorAll('button, [role="button"]');
    for (var j = 0; j < btns.length; j++) {
      var b = btns[j];
      var t = (b.textContent || '').trim().toLowerCase();
      var aria = (b.getAttribute('aria-label') || '').toLowerCase();
      if ((t === 'tweet' || t === 'post' || t === 'reply' || aria.indexOf('tweet') >= 0 || aria.indexOf('reply') >= 0 || aria.indexOf('post') >= 0) && !b.disabled && b.offsetParent !== null) {
        // Verify this button is in the modal, not the main page
        if (modal && !modal.contains(b)) continue;
        return b;
      }
    }
    return null;
  }

  // ENGAGEMENT
  async function engageTweet(tweet) {
    if (engagementCount >= dailyLimit || shouldStop) return false;
    if (tweet.dataset.epEngaged === 'true') return false;
    
    // Mark as being processed for skip functionality
    tweet.dataset.epProcessing = 'true';

    try {
      var rect = tweet.getBoundingClientRect();
      if (rect.top < 100 || rect.bottom > window.innerHeight - 100) {
        await scroll(rect.top - window.innerHeight / 2);
        await sleep(random(currentPreset.scrollDelay.min, currentPreset.scrollDelay.max));
      }
      if (shouldStop) return false;

      Cursor.set('#22c55e', 'Reading');
      var text = getTweetText(tweet);
      // Faster reading - just a brief pause to simulate reading
      var readTime = Math.min(2000, Math.max(800, text.length * 15));
      debugLog('Reading tweet (', text.length, 'chars) for', readTime, 'ms');
      await sleep(readTime);
      if (shouldStop) return false;

      if (config.autoLike && !isLiked(tweet)) {
        var likeBtn = findLikeBtn(tweet);
        if (likeBtn) {
          await click(likeBtn);
          engagementCount++;
          sessionStats.likes++;
          updateStats({ likes: 1 });
          await sleep(random(currentPreset.engagementDelay.min, currentPreset.engagementDelay.max));
        }
      }
      if (shouldStop) return false;

      if (config.autoReply && engagementCount < dailyLimit && !shouldStop) {
        Cursor.set('#3b82f6', 'AI Reply');
        
        var text = getTweetText(tweet);
        var authorHandle = (tweet.querySelector('[data-testid="User-Name"]') || { textContent: '@unknown' }).textContent.trim();
        
        // Try to get AI-generated reply from backend if configured
        var replyText = null;
        var aiBackendUrl = config.aiBackendUrl || '';
        var aiApiKey = config.aiApiKey || '';
        
        if (aiBackendUrl && aiApiKey) {
          try {
            console.log('[engage-pro] Fetching AI reply from backend...');
            var aiResponse = await fetch(`${aiBackendUrl}/api/generate`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': aiApiKey
              },
              body: JSON.stringify({
                tweetText: text,
                tweetAuthor: authorHandle,
                useCache: true
              })
            });
            
            var aiData = await aiResponse.json();
            if (aiData.reply) {
              replyText = aiData.reply;
              console.log('[engage-pro] AI reply generated:', replyText.substring(0, 50));
            }
          } catch (aiErr) {
            console.log('[engage-pro] AI generation failed, using template fallback:', aiErr.message);
          }
        }
        
        // Fallback to template if AI failed or not configured
        if (!replyText) {
          var category = categorize(text);
          replyText = getTemplate(category);
          console.log('[engage-pro] Using template reply:', replyText.substring(0, 50));
        }

        var replyBtn = findReplyBtn(tweet);
        if (!replyBtn) {
          console.log('[engage-pro] Reply button not found');
        } else {
          // Verify the reply button is actually inside the tweet we want to reply to
          var tweetCheck = replyBtn.closest('article[data-testid="tweet"]');
          if (tweetCheck !== tweet) {
            console.log('[engage-pro] Reply button is not in target tweet, skipping');
            return false;
          }
          
          await click(replyBtn);
          await sleep(random(1000, 2000));
          debugLog('Reply button clicked, waiting for editor');
          
          // After clicking reply, verify a modal/dialog appeared
          var modalCheck = document.querySelector('[role="dialog"]');
          if (!modalCheck) {
            console.log('[engage-pro] No reply modal appeared after clicking reply, may have clicked wrong button');
            return false;
          }

          if (shouldStop) return false;

          var editor = await retryAsync(waitForEditor, 3, 500);
          if (!editor) {
            console.log('[engage-pro] Editor not found after retries');
          } else {
            debugLog('Editor ready, typing...');
            var typed = await typeInEditor(replyText);

            if (typed && !shouldStop) {
              await sleep(random(800, 1500));
              debugLog('Text entered, looking for submit button');

              var submitBtn = findSubmitBtn();
              if (submitBtn) {
                await click(submitBtn);
                engagementCount++;
                sessionStats.replies++;
                updateStats({ replies: 1 });
                console.log('[engage-pro] Reply posted!');
                var delayMult = config.replyDelayMult || 1.5;
                await sleep(random(currentPreset.engagementDelay.min * delayMult, currentPreset.engagementDelay.max * delayMult));
              } else {
                console.log('[engage-pro] Submit button not found');
              }
            }
          }
        }
      }

      tweet.dataset.epProcessing = '';
      markTweetEngaged(tweet);
      consecutiveErrors = 0; // Reset on success
      return true;
    } catch (err) {
      tweet.dataset.epProcessing = '';
      console.error('[engage-pro] Error in engageTweet:', err);
      consecutiveErrors++;
      
      // Enhanced error recovery
      if (err.message && err.message.includes('Rate limit')) {
        console.log('[engage-pro] Rate limit detected, pausing for 30 seconds');
        await sleep(30000);
        consecutiveErrors = 0; // Reset after long pause
      } else if (err.message && err.message.includes('timeout')) {
        console.log('[engage-pro] Timeout detected, retrying after 5 seconds');
        await sleep(5000);
      } else if (err.message && err.message.includes('network')) {
        console.log('[engage-pro] Network error, retrying after 10 seconds');
        await sleep(10000);
      }
      return false;
    }
  }

  // MAIN LOOP
  async function runLoop() {
    console.log('[engage-pro] Starting loop');
    var scrollAttempts = 0;
    var maxScrollAttempts = config.maxScrollAttempts || 10;
    var consecutiveErrors = 0;
    var maxConsecutiveErrors = 5;
    
    while (isRunning && !shouldStop) {
      var tweets = findTweets();
      console.log('[engage-pro] Found', tweets.length, 'tweets');

      if (tweets.length === 0) {
        // No tweets found - scroll down to load more
        scrollAttempts++;
        var maxAttempts = config.maxScrollAttempts || 10;
        console.log('[engage-pro] No tweets found, scrolling attempt', scrollAttempts, 'of', maxAttempts);
        
        if (scrollAttempts >= maxAttempts) {
          console.log('[engage-pro] Max scroll attempts reached, waiting a bit then resetting');
          await sleep(3000);
          scrollAttempts = 0;
          // Try scrolling back to top and then down again
          window.scrollTo(0, 0);
          await sleep(1000);
        } else {
          await scroll(config.scrollSpeed || 800);
          await sleep(1500);
        }
        continue;
      }
      
      // Reset scroll attempts when we find tweets
      scrollAttempts = 0;

      // Filter out already engaged tweets
      var availableTweets = tweets.filter(function(t) {
        return t.dataset.epEngaged !== 'true';
      });
      
      console.log('[engage-pro]', availableTweets.length, 'tweets available for engagement');
      
      if (availableTweets.length === 0) {
        // All visible tweets already engaged, scroll for more
        console.log('[engage-pro] All visible tweets engaged, scrolling for more');
        await scroll(800);
        await sleep(2000);
        continue;
      }

      for (var i = 0; i < availableTweets.length; i++) {
        if (!isRunning || shouldStop) break;
        
        // Scroll tweet into view before engaging
        var tweet = availableTweets[i];
        var rect = tweet.getBoundingClientRect();
        if (rect.top < 100 || rect.bottom > window.innerHeight - 100) {
          console.log('[engage-pro] Scrolling tweet into view');
          tweet.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await sleep(1000);
        }
        
        await engageTweet(tweet);
        await sleep(random(1000, 3000));
      }

      if (!isRunning || shouldStop) break;
      
      // Check for consecutive errors and back off if needed
      if (consecutiveErrors >= maxConsecutiveErrors) {
        console.log('[engage-pro] Too many consecutive errors, pausing for 30 seconds');
        await sleep(30000);
        consecutiveErrors = 0;
      }
      
      // After processing all available tweets, scroll for more
      debugLog('Scrolling for more tweets');
      await scroll(config.scrollSpeed || 800);
      await sleep(random(2000, 4000));
    }

    isRunning = false;
    shouldStop = false;
    Cursor.hide();
    console.log('[engage-pro] Loop ended');
  }

  function updateStats(data) {
    chrome.runtime.sendMessage({ type: 'UPDATE_STATS', data }).catch(function() {});
  }

  // TEST MODE
  async function runTestMode() {
    console.log('[engage-pro] TEST MODE: Looking for any input field...');

    var inputs = document.querySelectorAll('input[type="text"], textarea, [contenteditable="true"], [role="textbox"]');
    console.log('[engage-pro] Found', inputs.length, 'input fields');

    if (inputs.length === 0) {
      console.log('[engage-pro] TEST MODE: No input fields found.');
      return;
    }

    var target = null;
    for (var i = 0; i < inputs.length; i++) {
      if (inputs[i].offsetParent !== null) {
        target = inputs[i];
        break;
      }
    }

    if (!target) {
      console.log('[engage-pro] TEST MODE: No visible input found');
      return;
    }

    console.log('[engage-pro] TEST MODE: Using input:', target.tagName, target.className ? target.className.substring(0, 30) : '');

    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(1000);

    await click(target);
    await sleep(500);

    var testText = 'This is a test message from engage-pro!';
    console.log('[engage-pro] TEST MODE: Typing:', testText);

    var success = await typeInEditor(testText);

    if (success) {
      console.log('[engage-pro] TEST MODE: SUCCESS! Text entered correctly.');
    } else {
      console.log('[engage-pro] TEST MODE: FAILED to enter text');
    }

    Cursor.hide();
  }

  // ==================== RATE LIMIT & ERROR DETECTION ====================
  
  function detectRateLimit() {
    // Check for rate limit indicators in the DOM
    var rateLimitIndicators = [
      'Rate limit exceeded',
      'You have reached the limit',
      'Too many requests',
      'Please wait a few moments',
      'Something went wrong',
      'Try again later',
      'You are rate limited',
      'slow down',
      'take a break'
    ];
    
    var pageText = document.body ? document.body.innerText.toLowerCase() : '';
    
    for (var i = 0; i < rateLimitIndicators.length; i++) {
      if (pageText.indexOf(rateLimitIndicators[i].toLowerCase()) >= 0) {
        return { detected: true, reason: rateLimitIndicators[i] };
      }
    }
    
    // Check for error dialogs
    var errorDialog = document.querySelector('[role="dialog"]');
    if (errorDialog) {
      var dialogText = (errorDialog.textContent || '').toLowerCase();
      if (dialogText.indexOf('rate limit') >= 0 || 
          dialogText.indexOf('something went wrong') >= 0 ||
          dialogText.indexOf('try again') >= 0 ||
          dialogText.indexOf('blocked') >= 0 ||
          dialogText.indexOf('restricted') >= 0) {
        return { detected: true, reason: 'Error dialog detected' };
      }
    }
    
    // Check for disabled buttons that should be enabled
    var followBtns = findFollowButtons();
    if (followBtns.length === 0 && isFollowersPage()) {
      // If we're on followers page but no buttons found, might be rate limited
      var noResults = document.querySelector('[data-testid="emptyState"]') ||
                      document.querySelector('[data-testid="primaryColumn"]');
      if (noResults && noResults.textContent.toLowerCase().indexOf('rate') >= 0) {
        return { detected: true, reason: 'Rate limit page state' };
      }
    }
    
    return { detected: false };
  }

  function detectLoginRequired() {
    var loginIndicators = [
      'Log in',
      'Sign in',
      'Login',
      'session expired',
      'log in to continue'
    ];
    
    var pageText = document.body ? document.body.innerText.toLowerCase() : '';
    
    for (var i = 0; i < loginIndicators.length; i++) {
      if (pageText.indexOf(loginIndicators[i].toLowerCase()) >= 0) {
        return { detected: true, reason: 'Login required: ' + loginIndicators[i] };
      }
    }
    
    // Check URL for login redirect
    var path = window.location.pathname;
    if (path.indexOf('/login') >= 0 || path.indexOf('/i/flow/login') >= 0) {
      return { detected: true, reason: 'Redirected to login page' };
    }
    
    return { detected: false };
  }

  function detectPageError() {
    var errorIndicators = [
      'Something went wrong',
      'This page doesn\'t exist',
      'Page not found',
      'User not found',
      'Account suspended',
      'Account deactivated',
      'This account doesn\'t exist'
    ];
    
    var pageText = document.body ? document.body.innerText.toLowerCase() : '';
    
    for (var i = 0; i < errorIndicators.length; i++) {
      if (pageText.indexOf(errorIndicators[i].toLowerCase()) >= 0) {
        return { detected: true, reason: errorIndicators[i] };
      }
    }
    
    return { detected: false };
  }

  async function handleErrorDetection() {
    // Check for rate limit
    var rateLimit = detectRateLimit();
    if (rateLimit.detected) {
      console.error('[engage-pro] RATE LIMIT DETECTED:', rateLimit.reason);
      followerMode.shouldStop = true;
      isRunning = false;
      shouldStop = true;
      
      // Update cursor to show error state
      Cursor.set('#ef4444', 'Rate Limited!');
      await sleep(3000);
      Cursor.hide();
      
      // Notify background
      chrome.runtime.sendMessage({
        type: 'FOLLOWER_MODE_STOP',
        reason: 'rate_limit',
        details: rateLimit.reason
      }).catch(function() {});
      
      return true;
    }
    
    // Check for login required
    var loginRequired = detectLoginRequired();
    if (loginRequired.detected) {
      console.error('[engage-pro] LOGIN REQUIRED:', loginRequired.reason);
      followerMode.shouldStop = true;
      isRunning = false;
      shouldStop = true;
      
      Cursor.set('#ef4444', 'Login Required');
      await sleep(3000);
      Cursor.hide();
      
      chrome.runtime.sendMessage({
        type: 'FOLLOWER_MODE_STOP',
        reason: 'login_required',
        details: loginRequired.reason
      }).catch(function() {});
      
      return true;
    }
    
    // Check for page errors
    var pageError = detectPageError();
    if (pageError.detected) {
      console.error('[engage-pro] PAGE ERROR:', pageError.reason);
      followerMode.shouldStop = true;
      isRunning = false;
      shouldStop = true;
      
      Cursor.set('#ef4444', 'Page Error');
      await sleep(3000);
      Cursor.hide();
      
      chrome.runtime.sendMessage({
        type: 'FOLLOWER_MODE_STOP',
        reason: 'page_error',
        details: pageError.reason
      }).catch(function() {});
      
      return true;
    }
    
    return false;
  }

  // ==================== FOLLOWER MODE ====================
  // Follow accounts from a user's followers list with human-like behavior
  
  let followerMode = {
    isRunning: false,
    shouldStop: false,
    followCount: 0,
    targetFollows: 50,
    followedUsers: new Set(),
    preset: null
  };

  const FOLLOWER_PRESETS = {
    slow: { followDelay: { min: 8000, max: 15000 }, scrollDelay: { min: 3000, max: 7000 }, readDelay: { min: 2000, max: 4000 } },
    medium: { followDelay: { min: 4000, max: 8000 }, scrollDelay: { min: 1500, max: 3500 }, readDelay: { min: 1000, max: 2500 } },
    fast: { followDelay: { min: 2000, max: 4000 }, scrollDelay: { min: 800, max: 1800 }, readDelay: { min: 500, max: 1200 } }
  };

  function isFollowersPage() {
    var path = window.location.pathname;
    return path.includes('/followers') || path.includes('/verified_followers');
  }

  function findFollowButtons() {
    // Twitter/X follow button selectors
    var sels = [
      'button[data-testid="follow"]',
      'button[aria-label*="Follow"]',
      'button[role="button"][data-testid="follow"]'
    ];
    var buttons = [];
    for (var i = 0; i < sels.length; i++) {
      var els = document.querySelectorAll(sels[i]);
      for (var j = 0; j < els.length; j++) {
        var btn = els[j];
        // Skip already following buttons
        var isFollowing = btn.getAttribute('data-testid') === 'unfollow' || 
                           btn.textContent.toLowerCase().includes('following');
        if (!isFollowing && btn.offsetParent !== null) {
          buttons.push(btn);
        }
      }
    }
    return buttons;
  }

  function findUserCell(btn) {
    // Find the user cell/container for this follow button
    var cell = btn.closest('[data-testid="cellInnerDiv"]') || 
               btn.closest('div[role="button"]') ||
               btn.closest('div[style*="flex"]') ||
               btn.parentElement?.parentElement?.parentElement;
    return cell;
  }

  function getUsernameFromCell(cell) {
    if (!cell) return null;
    var links = cell.querySelectorAll('a[href^="/"]');
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute('href');
      if (href && href.length > 1 && !href.includes('/status/') && !href.includes('/photo')) {
        return href.replace('/', '');
      }
    }
    return null;
  }

  async function humanLikeScroll(amount) {
    Cursor.set('#6366f1', 'Scrolling');
    var steps = Math.min(20, Math.max(8, Math.abs(amount) / 80));
    var stepSize = amount / steps;
    for (var i = 0; i < steps; i++) {
      if (followerMode.shouldStop) return;
      // Add some randomness to scroll
      var jitter = (Math.random() - 0.5) * 20;
      window.scrollBy(0, stepSize + jitter);
      await sleep(random(40, 80));
    }
    // Pause after scroll to simulate "reading"
    await sleep(random(followerMode.preset.readDelay.min, followerMode.preset.readDelay.max));
  }

  async function humanLikeMoveTo(el) {
    var rect = el.getBoundingClientRect();
    var tx = rect.left + rect.width * (0.3 + Math.random() * 0.4);
    var ty = rect.top + rect.height * (0.3 + Math.random() * 0.4);
    var dist = Math.hypot(tx - Cursor.x, ty - Cursor.y);
    
    // Use bezier-like curve for more natural movement
    var dur = dist * (0.8 + Math.random() * 0.4) + 150;
    var steps = Math.min(40, Math.max(12, Math.floor(dur / 16)));
    
    for (var i = 0; i <= steps; i++) {
      if (followerMode.shouldStop) return;
      var t = i / steps;
      // Ease in-out cubic
      var ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      // Add slight overshoot for natural feel
      if (t > 0.85) {
        ease += (Math.random() - 0.5) * 0.05;
      }
      Cursor.move(Cursor.x + (tx - Cursor.x) * ease, Cursor.y + (ty - Cursor.y) * ease);
      await sleep(dur / steps);
    }
  }

  async function humanLikeClick(el) {
    await humanLikeMoveTo(el);
    Cursor.set('#f97316', 'Following');
    
    var r = el.getBoundingClientRect();
    var x = r.left + r.width * (0.3 + Math.random() * 0.4);
    var y = r.top + r.height * (0.3 + Math.random() * 0.4);
    
    // Simulate mouse down with slight delay
    el.dispatchEvent(new MouseEvent('mousedown', { clientX: x, clientY: y, bubbles: true }));
    await sleep(random(60, 140));
    
    // Mouse up
    el.dispatchEvent(new MouseEvent('mouseup', { clientX: x, clientY: y, bubbles: true }));
    await sleep(random(20, 60));
    
    // Click
    el.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true }));
    
    // Brief pause after click
    await sleep(random(100, 250));
  }

  async function followUser(btn) {
    if (followerMode.followCount >= followerMode.targetFollows || followerMode.shouldStop) {
      return false;
    }

    try {
      var cell = findUserCell(btn);
      var username = getUsernameFromCell(cell);
      
      // Skip if already followed
      if (username && followerMode.followedUsers.has(username)) {
        console.log('[engage-pro] Already followed @' + username + ', skipping');
        return false;
      }

      // Scroll user into view if needed
      var rect = btn.getBoundingClientRect();
      if (rect.top < 120 || rect.bottom > window.innerHeight - 120) {
        await humanLikeScroll(rect.top - window.innerHeight / 2);
        await sleep(random(500, 1000));
      }
      if (followerMode.shouldStop) return false;

      // Check for errors before clicking
      var preClickError = await handleErrorDetection();
      if (preClickError) {
        console.log('[engage-pro] Error detected before follow click');
        return false;
      }

      // Simulate "reading" the profile
      if (cell) {
        Cursor.set('#22c55e', 'Reading profile');
        var readTime = random(followerMode.preset.readDelay.min, followerMode.preset.readDelay.max);
        
        // Slight drift while "reading"
        var driftX = Cursor.x + (Math.random() - 0.5) * 30;
        var driftY = Cursor.y + (Math.random() - 0.5) * 20;
        Cursor.move(driftX, driftY);
        
        await sleep(readTime);
      }
      if (followerMode.shouldStop) return false;

      // Click follow button
      await humanLikeClick(btn);
      
      // Check for errors after clicking follow button
      var postClickError = await handleErrorDetection();
      if (postClickError) {
        console.log('[engage-pro] Error detected after follow click');
        return false;
      }

      // Mark as followed
      if (username) {
        followerMode.followedUsers.add(username);
      }
      followerMode.followCount++;
      sessionStats.follows++;
      updateStats({ follows: 1 });
      
      console.log('[engage-pro] Followed @' + (username || 'unknown') + ' (' + followerMode.followCount + '/' + followerMode.targetFollows + ')');
      
      // Wait before next action
      var delay = random(followerMode.preset.followDelay.min, followerMode.preset.followDelay.max);
      
      // Occasionally add extra "thinking" time
      if (Math.random() < 0.15) {
        delay += random(2000, 5000);
        Cursor.set('#8b5cf6', 'Pausing');
        console.log('[engage-pro] Taking a brief pause...');
      }
      
      await sleep(delay);
      return true;
    } catch (err) {
      console.error('[engage-pro] Follow error:', err);
      return false;
    }
  }

  async function runFollowerLoop() {
    console.log('[engage-pro] Starting follower mode loop');
    Cursor.show();
    
    var scrollAttempts = 0;
    var maxScrollAttempts = 15;
    var noNewButtonsCount = 0;
    var maxNoNewButtons = 5;
    
    while (followerMode.isRunning && !followerMode.shouldStop) {
      // Check for errors before each iteration
      var errorDetected = await handleErrorDetection();
      if (errorDetected) {
        console.log('[engage-pro] Stopping due to error detection');
        break;
      }

      // Check if we're still on followers page
      if (!isFollowersPage()) {
        console.log('[engage-pro] Not on followers page, stopping');
        break;
      }

      var buttons = findFollowButtons();
      console.log('[engage-pro] Found', buttons.length, 'follow buttons');

      if (buttons.length === 0) {
        noNewButtonsCount++;
        console.log('[engage-pro] No follow buttons found (attempt', noNewButtonsCount, 'of', maxNoNewButtons, ')');
        
        if (noNewButtonsCount >= maxNoNewButtons) {
          console.log('[engage-pro] No more buttons found, stopping');
          break;
        }
        
        // Scroll to load more
        scrollAttempts++;
        if (scrollAttempts >= maxScrollAttempts) {
          console.log('[engage-pro] Max scroll attempts reached');
          break;
        }
        
        await humanLikeScroll(600);
        await sleep(random(1500, 3000));
        continue;
      }
      
      // Reset counters when we find buttons
      noNewButtonsCount = 0;
      scrollAttempts = 0;

      // Follow each visible button
      var followedAny = false;
      for (var i = 0; i < buttons.length; i++) {
        if (!followerMode.isRunning || followerMode.shouldStop) break;
        if (followerMode.followCount >= followerMode.targetFollows) break;
        
        var btn = buttons[i];
        var cell = findUserCell(btn);
        var username = getUsernameFromCell(cell);
        
        // Skip if already followed
        if (username && followerMode.followedUsers.has(username)) {
          continue;
        }
        
        var success = await followUser(btn);
        if (success) {
          followedAny = true;
        }
      }

      if (!followedAny) {
        // No new users to follow, scroll for more
        console.log('[engage-pro] No new users to follow, scrolling');
        await humanLikeScroll(500);
        await sleep(random(2000, 4000));
      }

      if (followerMode.followCount >= followerMode.targetFollows) {
        console.log('[engage-pro] Reached target follow count:', followerMode.targetFollows);
        break;
      }
    }

    followerMode.isRunning = false;
    followerMode.shouldStop = false;
    Cursor.hide();
    console.log('[engage-pro] Follower mode ended. Followed', followerMode.followCount, 'users');
    
    // Notify background
    chrome.runtime.sendMessage({ 
      type: 'FOLLOWER_MODE_END', 
      data: { follows: followerMode.followCount } 
    }).catch(function() {});
  }

  // MESSAGE HANDLER
  chrome.runtime.onMessage.addListener(function(req, sender, sendResponse) {
    console.log('[engage-pro] Message received:', req.type);

    if (req.type === 'ENGAGEMENT_START') {
      if (!isRunning) {
        isRunning = true;
        shouldStop = false;
        currentPreset = PRESETS[req.config && req.config.speedMode ? req.config.speedMode : 'medium'];
        config = Object.assign({}, config, req.config || {});
        
        // Apply advanced settings if provided
        if (req.config && req.config.advanced) {
          if (req.config.advanced.scrollSpeed) {
            // Store for use in scroll function
            config.scrollSpeed = req.config.advanced.scrollSpeed;
          }
          if (req.config.advanced.maxScrollAttempts) {
            config.maxScrollAttempts = req.config.advanced.maxScrollAttempts;
          }
          if (req.config.advanced.replyDelayMult) {
            config.replyDelayMult = req.config.advanced.replyDelayMult;
          }
          if (req.config.advanced.debugMode) {
            config.debugMode = true;
            console.log('[engage-pro] Debug mode enabled');
          }
        }
        
        engagementCount = 0;
        sessionStats = { likes: 0, replies: 0, follows: 0 };
        console.log('[engage-pro] Started with preset:', currentPreset);
        runLoop();
      }
      sendResponse({ success: true, isRunning: isRunning });
    } else if (req.type === 'ENGAGEMENT_STOP' || req.type === 'CANCEL_TASK') {
      console.log('[engage-pro] Stop requested');
      isRunning = false;
      shouldStop = true;
      followerMode.isRunning = false;
      followerMode.shouldStop = true;
      Cursor.hide();
      sendResponse({ success: true, isRunning: false });
    } else if (req.type === 'PAUSE_RESUME') {
      // Toggle pause state
      if (isRunning) {
        shouldStop = !shouldStop;
        console.log('[engage-pro]', shouldStop ? 'Paused' : 'Resumed');
        sendResponse({ success: true, isPaused: shouldStop, isRunning: isRunning });
      } else {
        sendResponse({ success: false, error: 'Not running' });
      }
    } else if (req.type === 'SKIP_TWEET') {
      // Skip current tweet and move to next
      console.log('[engage-pro] Skip tweet requested');
      // Find the currently being processed tweet and mark it as engaged
      var currentTweets = findTweets();
      for (var i = 0; i < currentTweets.length; i++) {
        if (currentTweets[i].dataset.epProcessing === 'true') {
          currentTweets[i].dataset.epProcessing = '';
          markTweetEngaged(currentTweets[i]);
          console.log('[engage-pro] Skipped tweet:', getTweetText(currentTweets[i]).substring(0, 50));
          break;
        }
      }
      sendResponse({ success: true });
    } else if (req.type === 'GET_STATUS') {
      sendResponse({ isRunning: isRunning, engagementCount: engagementCount, sessionStats: sessionStats, currentUrl: window.location.href });
    } else if (req.type === 'GET_STATS') {
      // Return detailed stats for dashboard
      sendResponse({
        success: true,
        stats: {
          isRunning: isRunning,
          engagementCount: engagementCount,
          dailyLimit: dailyLimit,
          sessionStats: sessionStats,
          currentUrl: window.location.href,
          currentPreset: currentPreset ? 'configured' : null,
          config: {
            autoLike: config.autoLike,
            autoReply: config.autoReply,
            autoFollow: config.autoFollow,
            aiEnabled: config.aiEnabled || false,
            aiBackendUrl: config.aiBackendUrl || '',
            debugMode: config.debugMode || false,
            scrollSpeed: config.scrollSpeed || 800,
            maxScrollAttempts: config.maxScrollAttempts || 10,
            replyDelayMult: config.replyDelayMult || 1.5
          }
        }
      });
    } else if (req.type === 'SET_DAILY_LIMIT') {
      // Update daily limit on the fly
      if (req.dailyLimit && typeof req.dailyLimit === 'number') {
        dailyLimit = req.dailyLimit;
        console.log('[engage-pro] Daily limit updated to:', dailyLimit);
      }
      sendResponse({ success: true, dailyLimit: dailyLimit });
    } else if (req.type === 'EXPORT_STATS') {
      // Export session statistics
      var exportData = {
        version: '1.8.0',
        exportTime: new Date().toISOString(),
        sessionStats: sessionStats,
        engagementCount: engagementCount,
        dailyLimit: dailyLimit,
        config: {
          autoLike: config.autoLike,
          autoReply: config.autoReply,
          autoFollow: config.autoFollow,
          aiEnabled: config.aiEnabled || false
        },
        tweetCache: Array.from(tweetIdCache.entries()).map(function(entry) {
          return { id: entry[0], time: entry[1].time };
        })
      };
      sendResponse({ success: true, data: exportData });
    } else if (req.type === 'IMPORT_STATS') {
      // Import session statistics
      try {
        if (req.data) {
          if (req.data.sessionStats) {
            sessionStats = req.data.sessionStats;
          }
          if (req.data.engagementCount) {
            engagementCount = req.data.engagementCount;
          }
          if (req.data.dailyLimit) {
            dailyLimit = req.data.dailyLimit;
          }
          if (req.data.tweetCache && Array.isArray(req.data.tweetCache)) {
            tweetIdCache.clear();
            req.data.tweetCache.forEach(function(entry) {
              if (entry.id && entry.time) {
                tweetIdCache.set(entry.id, { time: entry.time });
              }
            });
          }
          console.log('[engage-pro] Stats imported successfully');
          sendResponse({ success: true, message: 'Stats imported' });
        } else {
          sendResponse({ success: false, error: 'No data provided' });
        }
      } catch (err) {
        console.error('[engage-pro] Import error:', err);
        sendResponse({ success: false, error: err.message });
      }
    } else if (req.type === 'GET_VERSION') {
      // Return version info
      sendResponse({
        success: true,
        version: '1.8.0',
        features: [
          'autoLike',
          'autoReply',
          'autoFollow',
          'aiBackend',
          'advancedSettings',
          'pauseResume',
          'skipTweet',
          'tweetCache',
          'exportImport',
          'debugMode',
          'quickReply',
          'feedDisplay'
        ]
      });
    } else if (req.type === 'GET_ADVANCED_SETTINGS') {
      sendResponse({ 
        success: true, 
        advanced: {
          debugMode: config.debugMode || false,
          scrollSpeed: config.scrollSpeed || 800,
          maxScrollAttempts: config.maxScrollAttempts || 10,
          replyDelayMult: config.replyDelayMult || 1.5
        }
      });
    } else if (req.type === 'SET_CONFIG') {
      // Update configuration on the fly
      if (req.config) {
        Object.assign(config, req.config);
        console.log('[engage-pro] Configuration updated:', Object.keys(req.config));
      }
      sendResponse({ success: true, config: config });
    } else if (req.type === 'TEST_MODE') {
      console.log('[engage-pro] TEST MODE activated');
      runTestMode();
      sendResponse({ success: true, message: 'Test mode running - check console' });
    } else if (req.type === 'FOLLOWER_MODE_START') {
      // Start follower mode
      if (!followerMode.isRunning) {
        followerMode.isRunning = true;
        followerMode.shouldStop = false;
        followerMode.followCount = 0;
        // Use the targetFollows from the message config, fallback to storage, then default
        var targetFromConfig = req.config?.targetFollows;
        var targetFromStorage = null;
        
        // Try to get from storage if not in config
        if (!targetFromConfig) {
          try {
            chrome.storage.local.get('targetFollows', function(result) {
              targetFromStorage = result.targetFollows;
            });
          } catch(e) {}
        }
        
        followerMode.targetFollows = targetFromConfig || targetFromStorage || 50;
        followerMode.followedUsers = new Set();
        followerMode.preset = FOLLOWER_PRESETS[req.config?.speedMode || 'medium'];
        
        console.log('[engage-pro] Starting follower mode. Target:', followerMode.targetFollows, '(from config:', targetFromConfig, ', from storage:', targetFromStorage, ')');
        runFollowerLoop();
        sendResponse({ success: true, isRunning: true, targetFollows: followerMode.targetFollows });
      } else {
        sendResponse({ success: false, error: 'Follower mode already running' });
      }
    } else if (req.type === 'FOLLOWER_MODE_STOP') {
      console.log('[engage-pro] Stopping follower mode');
      followerMode.isRunning = false;
      followerMode.shouldStop = true;
      sendResponse({ success: true });
    } else if (req.type === 'FOLLOWER_MODE_STATUS') {
      sendResponse({ 
        isRunning: followerMode.isRunning, 
        followCount: followerMode.followCount,
        targetFollows: followerMode.targetFollows,
        isFollowersPage: isFollowersPage()
      });
    } else if (req.type === 'EXECUTE_TASK') {
      console.log('[engage-pro] EXECUTE_TASK received, replyText:', req.replyText ? req.replyText.substring(0, 30) : 'none');
      (function() {
        var tweets = findTweets();
        var tweet = tweets.length > 0 ? tweets[0] : null;
        if (tweet && req.replyText) {
          var text = req.replyText;
          var replyBtn = findReplyBtn(tweet);
          if (replyBtn) {
            click(replyBtn).then(function() {
              return sleep(1500);
            }).then(function() {
              return waitForEditor();
            }).then(function(editor) {
              if (editor) {
                return typeInEditor(text).then(function(typed) {
                  if (typed) {
                    return sleep(1000).then(function() {
                      var submitBtn = findSubmitBtn();
                      if (submitBtn) {
                        return click(submitBtn).then(function() {
                          sendResponse({ success: true, actions: { reply: 'done' } });
                        });
                      } else {
                        sendResponse({ success: false, error: 'Submit button not found' });
                      }
                    });
                  } else {
                    sendResponse({ success: false, error: 'Typing failed' });
                  }
                });
              } else {
                sendResponse({ success: false, error: 'Editor not found' });
              }
            }).catch(function(e) {
              console.error('[engage-pro] EXECUTE_TASK error:', e);
              sendResponse({ success: false, error: e.message });
            });
            return; // Don't fall through
          }
        }
        // Fallback: normal engagement
        if (tweet) {
          engageTweet(tweet).then(function() {
            sendResponse({ success: true, actions: { like: 'done' } });
          }).catch(function(e) {
            sendResponse({ success: false, error: e.message });
          });
        } else {
          sendResponse({ success: false, error: 'No tweet found' });
        }
      })();
      return true; // async
    } else if (req.type === 'GET_TWEET') {
      var tweets = findTweets();
      var found = tweets.length > 0 ? tweets[0] : null;
      if (found) {
        sendResponse({
          tweet: {
            tweetId: req.tweetId || 'unknown',
            text: getTweetText(found),
            authorHandle: (found.querySelector('[data-testid="User-Name"]') || { textContent: '@unknown' }).textContent.trim()
          }
        });
      } else {
        sendResponse({ tweet: null });
      }
    } else if (req.type === 'LIKE_TWEET') {
      // Manual like a specific tweet
      (async function() {
        try {
          var tweet = findTweets().find(function(t) {
            return getTweetText(t) === req.tweetText;
          }) || findTweets()[0];
          
          if (!tweet) {
            sendResponse({ success: false, error: 'Tweet not found' });
            return;
          }
          
          if (isLiked(tweet)) {
            sendResponse({ success: true, message: 'Already liked' });
            return;
          }
          
          var likeBtn = findLikeBtn(tweet);
          if (!likeBtn) {
            sendResponse({ success: false, error: 'Like button not found' });
            return;
          }
          
          await click(likeBtn);
          engagementCount++;
          sessionStats.likes++;
          updateStats({ likes: 1 });
          markTweetEngaged(tweet);
          
          console.log('[engage-pro] Manual like successful!');
          sendResponse({ success: true });
        } catch (err) {
          console.error('[engage-pro] LIKE_TWEET error:', err);
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true; // async
    } else if (req.type === 'CHECK_FEED') {
      var tweets = findTweets();
      var feedTweets = tweets.filter(function(t) { return t.dataset.epEngaged !== 'true'; }).map(function(t) {
        return {
          tweetId: t.getAttribute('data-tweet-id') || Math.random().toString(36).substr(2, 9),
          text: getTweetText(t),
          authorHandle: (t.querySelector('[data-testid="User-Name"]') || { textContent: '@unknown' }).textContent.trim()
        };
      });
      sendResponse({ tweets: feedTweets });
    } else if (req.type === 'GET_ALL_TWEETS') {
      // Return all visible tweets including already engaged ones
      var allTweets = findTweets();
      var tweetList = allTweets.map(function(t) {
        return {
          tweetId: t.getAttribute('data-tweet-id') || Math.random().toString(36).substr(2, 9),
          text: getTweetText(t),
          authorHandle: (t.querySelector('[data-testid="User-Name"]') || { textContent: '@unknown' }).textContent.trim(),
          engaged: t.dataset.epEngaged === 'true' || isTweetAlreadyEngaged(t)
        };
      });
      sendResponse({ tweets: tweetList, total: allTweets.length });
    } else if (req.type === 'GET_TWEET_BY_TEXT') {
      // Find a specific tweet by text content
      var searchText = req.tweetText || '';
      var allTweets = findTweets();
      var found = null;
      
      for (var i = 0; i < allTweets.length; i++) {
        var tweetText = getTweetText(allTweets[i]);
        if (tweetText === searchText || tweetText.includes(searchText)) {
          found = allTweets[i];
          break;
        }
      }
      
      if (found) {
        sendResponse({
          success: true,
          tweet: {
            tweetId: found.getAttribute('data-tweet-id') || Math.random().toString(36).substr(2, 9),
            text: getTweetText(found),
            authorHandle: (found.querySelector('[data-testid="User-Name"]') || { textContent: '@unknown' }).textContent.trim(),
            engaged: found.dataset.epEngaged === 'true' || isTweetAlreadyEngaged(found)
          }
        });
      } else {
        sendResponse({ success: false, error: 'Tweet not found' });
      }
    } else if (req.type === 'SCROLL_FEED') {
      scroll(800);
      sendResponse({ success: true });
    } else if (req.type === 'CLEAR_CACHE') {
      // Clear all epEngaged markers and the tweet ID cache
      var allTweets = document.querySelectorAll('article[data-testid="tweet"], [data-testid="tweet"], [data-testid="cellInnerDiv"] article');
      for (var i = 0; i < allTweets.length; i++) {
        allTweets[i].dataset.epEngaged = '';
      }
      tweetIdCache.clear();
      console.log('[engage-pro] Cleared engagement cache for', allTweets.length, 'tweets');
      sendResponse({ success: true, cleared: allTweets.length });
    } else if (req.type === 'TWEET_REPLY') {
      // Manual reply to a specific tweet with provided text
      console.log('[engage-pro] TWEET_REPLY received for:', req.tweetText?.substring(0, 50));
      (async function() {
        try {
          var tweet = findTweets().find(function(t) {
            return getTweetText(t) === req.tweetText;
          }) || findTweets()[0];
          
          if (!tweet) {
            sendResponse({ success: false, error: 'Tweet not found' });
            return;
          }
          
          var replyText = req.replyText;
          if (!replyText) {
            sendResponse({ success: false, error: 'No reply text provided' });
            return;
          }
          
          var replyBtn = findReplyBtn(tweet);
          if (!replyBtn) {
            sendResponse({ success: false, error: 'Reply button not found' });
            return;
          }
          
          await click(replyBtn);
          await sleep(random(1000, 2000));
          
          var editor = await retryAsync(waitForEditor, 3, 500);
          if (!editor) {
            sendResponse({ success: false, error: 'Editor not found after retries' });
            return;
          }
          
          var typed = await typeInEditor(replyText);
          if (!typed) {
            sendResponse({ success: false, error: 'Typing failed' });
            return;
          }
          
          await sleep(random(800, 1500));
          
          var submitBtn = findSubmitBtn();
          if (!submitBtn) {
            sendResponse({ success: false, error: 'Submit button not found' });
            return;
          }
          
          await click(submitBtn);
          
          engagementCount++;
          sessionStats.replies++;
          updateStats({ replies: 1 });
          
          markTweetEngaged(tweet);
          
          console.log('[engage-pro] Manual reply posted successfully!');
          sendResponse({ 
            success: true, 
            reply: replyText
          });
        } catch (err) {
          console.error('[engage-pro] TWEET_REPLY error:', err);
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true; // async
    } else if (req.type === 'AI_REPLY_TWEET') {
      // New message type: AI reply to a specific tweet
      console.log('[engage-pro] AI_REPLY_TWEET received');
      (async function() {
        try {
          var tweet = findTweets().find(function(t) {
            return getTweetText(t) === req.tweetText;
          }) || findTweets()[0];
          
          if (!tweet) {
            sendResponse({ success: false, error: 'Tweet not found' });
            return;
          }
          
          // Get AI-generated reply from backend
          var backendUrl = req.backendUrl || 'http://localhost:3000';
          var apiKey = req.apiKey || '';
          var tweetText = getTweetText(tweet);
          var authorHandle = (tweet.querySelector('[data-testid="User-Name"]') || { textContent: '@unknown' }).textContent.trim();
          
          console.log('[engage-pro] Fetching AI reply for:', tweetText.substring(0, 50));
          
          var aiResponse = await fetch(`${backendUrl}/api/generate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey
            },
            body: JSON.stringify({
              tweetText: tweetText,
              tweetAuthor: authorHandle,
              useCache: true
            })
          });
          
          var aiData = await aiResponse.json();
          
          if (!aiData.reply) {
            console.log('[engage-pro] AI generation failed:', aiData.error);
            // Fallback to template
            var category = categorize(tweetText);
            aiData = { reply: getTemplate(category) };
          }
          
          console.log('[engage-pro] AI reply:', aiData.reply.substring(0, 50));
          
          // Now post the reply
          var replyBtn = findReplyBtn(tweet);
          if (!replyBtn) {
            sendResponse({ success: false, error: 'Reply button not found' });
            return;
          }
          
          // Verify the reply button is in the correct tweet
          var tweetCheck = replyBtn.closest('article[data-testid="tweet"]');
          if (tweetCheck !== tweet) {
            console.log('[engage-pro] Reply button mismatch, searching again');
            // Try to find reply button again
            var allTweets = findTweets();
            for (var i = 0; i < allTweets.length; i++) {
              if (allTweets[i] === tweet) {
                var bar = allTweets[i].querySelector('[role="group"]');
                if (bar) {
                  var btns = bar.querySelectorAll('button');
                  for (var j = 0; j < btns.length; j++) {
                    var aria = (btns[j].getAttribute('aria-label') || '').toLowerCase();
                    if (aria.indexOf('reply') >= 0) {
                      replyBtn = btns[j];
                      break;
                    }
                  }
                }
                break;
              }
            }
          }
          
          await click(replyBtn);
          await sleep(random(1000, 2000));
          
          var editor = await retryAsync(waitForEditor, 3, 500);
          if (!editor) {
            sendResponse({ success: false, error: 'Editor not found after retries' });
            return;
          }
          
          var typed = await typeInEditor(aiData.reply);
          if (!typed) {
            sendResponse({ success: false, error: 'Typing failed' });
            return;
          }
          
          await sleep(random(800, 1500));
          
          var submitBtn = findSubmitBtn();
          if (!submitBtn) {
            sendResponse({ success: false, error: 'Submit button not found' });
            return;
          }
          
          await click(submitBtn);
          
          engagementCount++;
          sessionStats.replies++;
          updateStats({ replies: 1 });
          
          tweet.dataset.epEngaged = 'true';
          
          console.log('[engage-pro] AI reply posted successfully!');
          sendResponse({ 
            success: true, 
            reply: aiData.reply,
            model: aiData.model || 'template',
            cached: aiData.cached || false
          });
        } catch (err) {
          console.error('[engage-pro] AI_REPLY_TWEET error:', err);
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true; // async
    }
    return true;
  });

  console.log('[engage-pro] Ready. v1.8.0 loaded successfully. AI auto-reply available.');
})();
