/**
 * Bridge-side JavaScript injector for Android browser
 * Sends command to inject JS that populates chat and clicks Send button
 */

import http from 'http';

const BRIDGE_URL = 'http://localhost:9099';
const MSG = 'check the bridge';

// JavaScript payload that will be injected into the VS Code browser page
const INJECT_PAYLOAD = `
(function() {
  console.log('[Lazarus Injector] Starting payload');
  
  // Step 1: Find the chat input container
  const chatInput = document.querySelector('[class*="chat-input"], textarea[placeholder*="Ask"], input[placeholder*="Ask"]') 
    || document.querySelector('textarea')
    || document.querySelector('input[role="textbox"]');
  
  if (!chatInput) {
    console.error('[Lazarus Injector] Could not find chat input');
    return;
  }
  
  console.log('[Lazarus Injector] Found input element:', chatInput.tagName, chatInput.className);
  
  // Step 2: Focus and populate the input
  chatInput.focus();
  chatInput.value = '${MSG}';
  
  // Trigger input event to notify VS Code
  chatInput.dispatchEvent(new Event('input', { bubbles: true }));
  chatInput.dispatchEvent(new Event('change', { bubbles: true }));
  
  console.log('[Lazarus Injector] Text populated:', chatInput.value);
  
  // Step 3: Find and click the Send button
  setTimeout(() => {
    const sendButton = document.querySelector('[aria-label*="Send"], button[title*="Send"], button:has(svg[class*="send"]), button[class*="send"]')
      || Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Send') || b.innerHTML.includes('send'));
    
    if (!sendButton) {
      console.error('[Lazarus Injector] Could not find Send button');
      return;
    }
    
    console.log('[Lazarus Injector] Found Send button, clicking...');
    sendButton.click();
    console.log('[Lazarus Injector] Send button clicked!');
  }, 300);
})();
`;

/**
 * Send injection command to bridge
 * This will cause the bridge to broadcast a command that the chat page can execute
 */
export async function injectChatSend() {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      from: 'bridge-injector',
      content: `INJECT_JAVASCRIPT:${Buffer.from(INJECT_PAYLOAD).toString('base64')}`,
      type: 'system'
    });

    const options = {
      hostname: 'localhost',
      port: 9099,
      path: '/api/bridge',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('[Bridge Injector] Injection sent:', res.statusCode);
        resolve({ success: res.statusCode === 200, response: data });
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// Allow CLI invocation
if (import.meta.url === `file://${process.argv[1]}`) {
  injectChatSend()
    .then(result => {
      console.log('Injection result:', result);
      process.exit(0);
    })
    .catch(err => {
      console.error('Injection error:', err);
      process.exit(1);
    });
}
