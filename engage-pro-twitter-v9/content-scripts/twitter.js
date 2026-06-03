(function() {
  'use strict';

  console.log('[engage-pro] Twitter content script loaded - v1.5.0');

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
      this.move(this.x, this.y);
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

    var editor = document.querySelector('[data-testid="tweetTextarea_0"]') ||
                 document.querySelector('.public-DraftEditor-content') ||
                 document.querySelector('[contenteditable="true"]') ||
                 document.querySelector('[role="textbox"]');

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

    // METHOD 1: Clipboard paste
    try {
      var clipboardData = new DataTransfer();
      clipboardData.setData('text/plain', text);
      clipboardData.setData('text/html', text);

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
      await sleep(200);

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

    // METHOD 2: execCommand
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

    // METHOD 3: Direct DOM
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
    var steps = Math.min(15, Math.max(5, Math.abs(amount) / 100));
    for (var i = 0; i < steps; i++) {
      if (shouldStop) return;
      window.scrollBy(0, amount / steps);
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
  function findTweets() {
    var sels = ['article[data-testid="tweet"]', '[data-testid="tweet"]', '[data-testid="cellInnerDiv"] article'];
    for (var i = 0; i < sels.length; i++) {
      var els = document.querySelectorAll(sels[i]);
      if (els.length > 0) return Array.from(els);
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
    
    console.log('[engage-pro] Reply button not found in tweet action bar');
    return null;
  }

  async function waitForEditor() {
    // Wait for a reply composer to appear - should be in a modal/overlay, not the main timeline composer
    var sels = ['[data-testid="tweetTextarea_0"]', '.public-DraftEditor-content', '[contenteditable="true"]', 'div[role="textbox"]'];
    for (var i = 0; i < 20; i++) {
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
      
      await sleep(150);
    }
    console.log('[engage-pro] Editor not found after waiting');
    return null;
  }

  function findSubmitBtn() {
    var sels = [
      '[data-testid="tweetButton"]', '[data-testid="tweetButtonInline"]',
      'button[data-testid="tweetButton"]', 'button[data-testid="tweetButtonInline"]',
      '[data-testid="replyButtonSubmit"]'
    ];
    for (var i = 0; i < sels.length; i++) {
      var b = document.querySelector(sels[i]);
      if (b && !b.disabled && b.offsetParent !== null) return b;
    }
    var btns = document.querySelectorAll('button, [role="button"]');
    for (var j = 0; j < btns.length; j++) {
      var b = btns[j];
      var t = (b.textContent || '').trim().toLowerCase();
      var aria = (b.getAttribute('aria-label') || '').toLowerCase();
      if ((t === 'tweet' || t === 'post' || t === 'reply' || aria.indexOf('tweet') >= 0 || aria.indexOf('reply') >= 0 || aria.indexOf('post') >= 0) && !b.disabled && b.offsetParent !== null) return b;
    }
    return null;
  }

  // ENGAGEMENT
  async function engageTweet(tweet) {
    if (engagementCount >= dailyLimit || shouldStop) return false;
    if (tweet.dataset.epEngaged === 'true') return false;

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
      console.log('[engage-pro] Reading tweet (', text.length, 'chars) for', readTime, 'ms');
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
        Cursor.set('#3b82f6', 'Replying');
        var category = categorize(text);
        var replyText = getTemplate(category);
        console.log('[engage-pro] Will reply:', replyText.substring(0, 50));

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
          await sleep(random(800, 1500));
          console.log('[engage-pro] Reply button clicked, waiting for editor');
          
          // After clicking reply, verify a modal/dialog appeared
          var modalCheck = document.querySelector('[role="dialog"]');
          if (!modalCheck) {
            console.log('[engage-pro] No reply modal appeared after clicking reply, may have clicked wrong button');
            return false;
          }

          if (shouldStop) return false;

          var editor = await waitForEditor();
          if (!editor) {
            console.log('[engage-pro] Editor not found');
          } else {
            console.log('[engage-pro] Editor ready, typing...');
            var typed = await typeInEditor(replyText);

            if (typed && !shouldStop) {
              await sleep(random(500, 1000));
              console.log('[engage-pro] Text entered, looking for submit button');

              var submitBtn = findSubmitBtn();
              if (submitBtn) {
                await click(submitBtn);
                engagementCount++;
                sessionStats.replies++;
                updateStats({ replies: 1 });
                console.log('[engage-pro] Reply posted!');
                await sleep(random(currentPreset.engagementDelay.min * 1.5, currentPreset.engagementDelay.max * 1.5));
              } else {
                console.log('[engage-pro] Submit button not found');
              }
            }
          }
        }
      }

      tweet.dataset.epEngaged = 'true';
      return true;
    } catch (err) {
      console.error('[engage-pro] Error:', err);
      return false;
    }
  }

  // MAIN LOOP
  async function runLoop() {
    console.log('[engage-pro] Starting loop');
    var scrollAttempts = 0;
    var maxScrollAttempts = 10;
    
    while (isRunning && !shouldStop) {
      var tweets = findTweets();
      console.log('[engage-pro] Found', tweets.length, 'tweets');

      if (tweets.length === 0) {
        // No tweets found - scroll down to load more
        scrollAttempts++;
        console.log('[engage-pro] No tweets found, scrolling attempt', scrollAttempts, 'of', maxScrollAttempts);
        
        if (scrollAttempts >= maxScrollAttempts) {
          console.log('[engage-pro] Max scroll attempts reached, waiting a bit then resetting');
          await sleep(3000);
          scrollAttempts = 0;
          // Try scrolling back to top and then down again
          window.scrollTo(0, 0);
          await sleep(1000);
        } else {
          await scroll(800);
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
      
      // After processing all available tweets, scroll for more
      console.log('[engage-pro] Scrolling for more tweets');
      await scroll(800);
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

  // MESSAGE HANDLER
  chrome.runtime.onMessage.addListener(function(req, sender, sendResponse) {
    console.log('[engage-pro] Message received:', req.type);

    if (req.type === 'ENGAGEMENT_START') {
      if (!isRunning) {
        isRunning = true;
        shouldStop = false;
        currentPreset = PRESETS[req.config && req.config.speedMode ? req.config.speedMode : 'medium'];
        config = Object.assign({}, config, req.config || {});
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
      Cursor.hide();
      sendResponse({ success: true, isRunning: false });
    } else if (req.type === 'GET_STATUS') {
      sendResponse({ isRunning: isRunning, engagementCount: engagementCount, sessionStats: sessionStats, currentUrl: window.location.href });
    } else if (req.type === 'TEST_MODE') {
      console.log('[engage-pro] TEST MODE activated');
      runTestMode();
      sendResponse({ success: true, message: 'Test mode running - check console' });
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
    } else if (req.type === 'SCROLL_FEED') {
      scroll(800);
      sendResponse({ success: true });
    }
    return true;
  });

  console.log('[engage-pro] Ready. v1.5.0 loaded successfully.');
})();
