/**
 * Operator OS Stealth Preload
 * Injected into EVERY WebContentsView before page scripts run.
 * Removes all automation fingerprints. Runs in isolated world.
 */
;(function () {
  'use strict'

  // ── 1. Remove webdriver flag ─────────────────────────────────────────────
  try {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
      configurable: true
    })
    delete navigator.__proto__.webdriver
  } catch (_) {}

  // ── 1.5 Spoof userAgentData ─────────────────────────────────────────────
  try {
    const brands = [
      { brand: 'Chromium', version: '124' },
      { brand: 'Google Chrome', version: '124' },
      { brand: 'Not-A.Brand', version: '99' }
    ]
    Object.defineProperty(navigator, 'userAgentData', {
      get: () => ({
        brands,
        mobile: false,
        platform: 'macOS',
        getHighEntropyValues: (hints) => Promise.resolve({
          architecture: 'arm',
          bitness: '64',
          brands,
          fullVersionList: brands,
          mobile: false,
          model: '',
          platform: 'macOS',
          platformVersion: '14.4.1',
          uaFullVersion: '124.0.6367.60'
        })
      }),
      configurable: true
    })
  } catch (_) {}

  // ── 2. Spoof plugins (real Chrome has these) ─────────────────────────────
  try {
    const makePlugin = (name, filename, desc) => {
      const plugin = Object.create(Plugin.prototype)
      Object.defineProperties(plugin, {
        name: { value: name, enumerable: true },
        filename: { value: filename, enumerable: true },
        description: { value: desc, enumerable: true },
        length: { value: 1, enumerable: true }
      })
      return plugin
    }

    const plugins = [
      makePlugin('Chrome PDF Plugin', 'internal-pdf-viewer', 'Portable Document Format'),
      makePlugin('Chrome PDF Viewer', 'mhjfbmdgcfjbbpaeojofohoefgiehjai', ''),
      makePlugin('Native Client', 'internal-nacl-plugin', '')
    ]

    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        const arr = Object.create(PluginArray.prototype)
        plugins.forEach((p, i) => { arr[i] = p })
        arr.length = plugins.length
        arr.item = (i) => arr[i]
        arr.namedItem = (name) => plugins.find(p => p.name === name) || null
        arr.refresh = () => {}
        return arr
      }
    })
  } catch (_) {}

  // ── 3. Spoof mimeTypes ──────────────────────────────────────────────────
  try {
    Object.defineProperty(navigator, 'mimeTypes', {
      get: () => {
        const arr = Object.create(MimeTypeArray.prototype)
        arr.length = 2
        arr.item = () => null
        arr.namedItem = () => null
        return arr
      }
    })
  } catch (_) {}

  // ── 4. Fix chrome object (missing in automation) ─────────────────────────
  try {
    if (!window.chrome) {
      window.chrome = {}
    }
    if (!window.chrome.runtime) {
      window.chrome.runtime = {
        connect: () => {},
        sendMessage: () => {},
        onMessage: { addListener: () => {}, removeListener: () => {} },
        id: undefined
      }
    }
    if (!window.chrome.loadTimes) {
      window.chrome.loadTimes = function () {
        return {
          requestTime: Date.now() / 1000 - Math.random() * 2,
          startLoadTime: Date.now() / 1000 - Math.random(),
          commitLoadTime: Date.now() / 1000 - Math.random() * 0.5,
          finishDocumentLoadTime: Date.now() / 1000 - Math.random() * 0.1,
          finishLoadTime: Date.now() / 1000,
          firstPaintTime: Date.now() / 1000 - Math.random() * 0.3,
          firstPaintAfterLoadTime: 0,
          navigationType: 'Other',
          wasFetchedViaSpdy: false,
          wasNpnNegotiated: true,
          npnNegotiatedProtocol: 'h2',
          wasAlternateProtocolAvailable: false,
          connectionInfo: 'h2'
        }
      }
    }
    if (!window.chrome.csi) {
      window.chrome.csi = function () {
        return {
          startE: Date.now(),
          onloadT: Date.now() + Math.floor(Math.random() * 100),
          pageT: Math.random() * 5000,
          tran: 15
        }
      }
    }
    if (!window.chrome.app) {
      window.chrome.app = {
        isInstalled: false,
        getDetails: () => null,
        getIsInstalled: () => false,
        runningState: () => 'cannot_run'
      }
    }
  } catch (_) {}

  // ── 5. Fix Permissions API ───────────────────────────────────────────────
  try {
    const originalQuery = window.navigator.permissions.query.bind(navigator.permissions)
    window.navigator.permissions.query = (parameters) => {
      if (parameters.name === 'notifications') {
        return Promise.resolve({ state: Notification.permission, onchange: null })
      }
      if (parameters.name === 'clipboard-read' || parameters.name === 'clipboard-write') {
        return Promise.resolve({ state: 'granted', onchange: null })
      }
      return originalQuery(parameters)
    }
  } catch (_) {}

  // ── 6. Hardware concurrency (realistic) ──────────────────────────────────
  try {
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 })
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 })
  } catch (_) {}

  // ── 7. Language spoofing ─────────────────────────────────────────────────
  try {
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en']
    })
  } catch (_) {}

  // ── 8. Canvas fingerprint noise (tiny, consistent) ───────────────────────
  // We add a tiny 1x1 pixel of deterministic noise so fingerprint differs
  // from headless Chrome but is consistent across sessions.
  try {
    const NOISE_R = 2
    const NOISE_G = 5
    const NOISE_B = 3

    const origToDataURL = HTMLCanvasElement.prototype.toDataURL
    HTMLCanvasElement.prototype.toDataURL = function (type, ...args) {
      if (this.width === 0 || this.height === 0) {
        return origToDataURL.apply(this, [type, ...args])
      }
      const ctx = this.getContext('2d')
      if (ctx) {
        const imageData = ctx.getImageData(0, 0, 1, 1)
        imageData.data[0] = Math.min(255, (imageData.data[0] || 0) + NOISE_R)
        imageData.data[1] = Math.min(255, (imageData.data[1] || 0) + NOISE_G)
        imageData.data[2] = Math.min(255, (imageData.data[2] || 0) + NOISE_B)
        ctx.putImageData(imageData, 0, 0)
      }
      return origToDataURL.apply(this, [type, ...args])
    }
  } catch (_) {}

  // ── 9. WebGL vendor/renderer spoofing ────────────────────────────────────
  try {
    const getParam = WebGLRenderingContext.prototype.getParameter
    WebGLRenderingContext.prototype.getParameter = function (parameter) {
      if (parameter === 37445) return 'Intel Inc.' // UNMASKED_VENDOR_WEBGL
      if (parameter === 37446) return 'Intel Iris OpenGL Engine' // UNMASKED_RENDERER_WEBGL
      return getParam.call(this, parameter)
    }
  } catch (_) {}

  // ── 10. Screen properties (match configured profile) ─────────────────────
  try {
    Object.defineProperty(screen, 'colorDepth', { get: () => 24 })
    Object.defineProperty(screen, 'pixelDepth', { get: () => 24 })
  } catch (_) {}

  // ── 11. Connection type (not 'none' like in some headless) ───────────────
  try {
    if (navigator.connection) {
      Object.defineProperty(navigator.connection, 'rtt', { get: () => 100 })
      Object.defineProperty(navigator.connection, 'effectiveType', { get: () => '4g' })
    }
  } catch (_) {}

  // ── 12. Remove automation-specific properties ─────────────────────────────
  try {
    delete window.callPhantom
    delete window._phantom
    delete window.phantom
    delete window.__nightmare
    delete window.__webdriver_script_fn
    delete window.domAutomation
    delete window.domAutomationController
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol
  } catch (_) {}

  console.debug('[OperatorOS] Stealth layer active')
})()

// ── 13. Event Recorder ───────────────────────────────────────────────────────
try {
  const { ipcRenderer } = require('electron');
  
  function isGoodId(id) {
    if (!id) return false;
    if (id.includes(':') || id.includes('\\')) return false;
    if (/^r\d+$/i.test(id)) return false;
    if (/^ember\d+$/i.test(id)) return false;
    if (/\d{4,}/.test(id)) return false;
    return true;
  }

  function getCssSelector(el) {
    if (!el) return '';
    if (isGoodId(el.id)) return `#${CSS.escape(el.id)}`;
    let path = [];
    while (el && el.nodeType === Node.ELEMENT_NODE) {
      let selector = el.nodeName.toLowerCase();
      if (isGoodId(el.id)) {
        selector += `#${CSS.escape(el.id)}`;
        path.unshift(selector);
        break;
      } else {
        let sib = el, nth = 1;
        while (sib = sib.previousElementSibling) {
          if (sib.nodeName.toLowerCase() === selector) nth++;
        }
        if (nth !== 1) selector += `:nth-of-type(${nth})`;
      }
      path.unshift(selector);
      el = el.parentNode;
    }
    return path.join(' > ');
  }

  document.addEventListener('click', (e) => {
    if (pickerActive) {
      e.preventDefault();
      e.stopPropagation();
      stopPicker();

      // Extract robust semantic name by climbing the tree
      let current = e.target;
      let levels = 0;
      let semanticName = '';

      while (current && levels < 4) {
        const rawText = current.innerText?.trim() || '';
        const cleanText = rawText.replace(/\s+/g, ' ').slice(0, 40).trim();
        const ariaLabel = current.getAttribute('aria-label');
        const placeholder = current.getAttribute('placeholder');
        const role = current.getAttribute('role') || current.tagName.toLowerCase();
        
        if (cleanText) { semanticName = `"${cleanText}" ${role}`; break; }
        if (ariaLabel) { semanticName = `"${ariaLabel}" ${role}`; break; }
        if (placeholder) { semanticName = `"${placeholder}" input`; break; }
        if (isGoodId(current.id)) { semanticName = `${current.tagName.toLowerCase()} #${current.id}`; break; }
        
        current = current.parentElement;
        levels++;
      }

      if (!semanticName) semanticName = `${e.target.tagName.toLowerCase()} element`;

      ipcRenderer.send('browser:element-picked', {
        selector: getCssSelector(e.target),
        elementName: semanticName.trim()
      });
      return;
    }

    ipcRenderer.send('browser:record-event', {
      type: 'click',
      selector: getCssSelector(e.target),
      text: (e.target.innerText?.trim() || '').replace(/\s+/g, ' ').slice(0, 50),
      url: window.location.href
    });
  }, true);

  // Debounced Typing Engine
  let typingTimeout = null;
  let lastTypingTarget = null;

  function flushTyping() {
    if (lastTypingTarget) {
      const textValue = lastTypingTarget.value !== undefined ? lastTypingTarget.value : lastTypingTarget.innerText;
      if (textValue) {
        ipcRenderer.send('browser:record-event', {
          type: 'type',
          selector: getCssSelector(lastTypingTarget),
          value: textValue,
          url: window.location.href
        });
      }
      lastTypingTarget = null;
    }
    if (typingTimeout) {
      clearTimeout(typingTimeout);
      typingTimeout = null;
    }
  }

  document.addEventListener('input', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) {
      lastTypingTarget = e.target;
      if (typingTimeout) clearTimeout(typingTimeout);
      typingTimeout = setTimeout(flushTyping, 500);
    }
  }, true);

  // If they click away, flush typing immediately
  document.addEventListener('focusout', (e) => {
    if (lastTypingTarget && e.target === lastTypingTarget) {
      flushTyping();
    }
  }, true);

  const SHORTCUT_KEYS = new Set(['Enter', 'Tab', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown']);

  document.addEventListener('keydown', (e) => {
    // If picker is active, Escape cancels it
    if (pickerActive && e.key === 'Escape') {
      stopPicker();
      ipcRenderer.send('browser:picker-cancelled');
      return;
    }

    if (SHORTCUT_KEYS.has(e.key)) {
      if (!pickerActive) {
        if (lastTypingTarget && e.target === lastTypingTarget) {
          flushTyping();
        }
        
        ipcRenderer.send('browser:record-event', {
          type: 'keydown',
          key: e.key,
          selector: getCssSelector(e.target),
          url: window.location.href
        });
      }
    }
  }, true);

  // ── 14. Visual Element Picker Engine ───────────────────────────────────────
  let pickerActive = false;
  let hoveredElement = null;
  
  // Create our overlay container
  const overlay = document.createElement('div');
  overlay.id = 'operator-os-highlighter-overlay';
  Object.assign(overlay.style, {
    position: 'fixed',
    pointerEvents: 'none',
    zIndex: '2147483647',
    background: 'rgba(59, 130, 246, 0.25)',
    border: '2px solid rgb(59, 130, 246)',
    borderRadius: '4px',
    display: 'none',
    boxSizing: 'border-box'
  });

  const label = document.createElement('div');
  Object.assign(label.style, {
    position: 'absolute',
    bottom: '100%',
    left: '-2px',
    background: 'rgb(59, 130, 246)',
    color: '#fff',
    fontSize: '11px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    padding: '2px 6px',
    borderRadius: '4px 4px 4px 0',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
    marginBottom: '2px'
  });
  overlay.appendChild(label);

  let hoverRafId = null;

  function handleMouseOver(e) {
    if (!pickerActive) return;
    e.stopPropagation();
    hoveredElement = e.target;
    
    if (hoverRafId) cancelAnimationFrame(hoverRafId);
    
    hoverRafId = requestAnimationFrame(() => {
      if (!hoveredElement) return;
      const rect = hoveredElement.getBoundingClientRect();
      
      overlay.style.display = 'block';
      overlay.style.top = `${rect.top}px`;
      overlay.style.left = `${rect.left}px`;
      overlay.style.width = `${rect.width}px`;
      overlay.style.height = `${rect.height}px`;
      
      const tag = hoveredElement.tagName.toLowerCase();
      const id = hoveredElement.id ? `#${hoveredElement.id}` : '';
      const cls = hoveredElement.className && typeof hoveredElement.className === 'string' 
        ? `.${hoveredElement.className.split(' ').join('.')}`.slice(0, 30) 
        : '';
      label.innerText = `${tag}${id}${cls} | ${rect.width | 0}x${rect.height | 0}`;
    });
  }

  function handleMouseOut(e) {
    if (!pickerActive) return;
    e.stopPropagation();
    if (hoveredElement) {
      hoveredElement = null;
      overlay.style.display = 'none';
    }
  }

  function stopPicker() {
    pickerActive = false;
    hoveredElement = null;
    overlay.style.display = 'none';
    if (overlay.parentNode) {
      document.body.removeChild(overlay);
    }
    document.removeEventListener('mouseover', handleMouseOver, true);
    document.removeEventListener('mouseout', handleMouseOut, true);
    document.body.style.cursor = 'default';
  }

  ipcRenderer.on('browser:start-picker', () => {
    pickerActive = true;
    document.body.style.cursor = 'crosshair';
    if (!overlay.parentNode) {
      document.body.appendChild(overlay);
    }
    document.addEventListener('mouseover', handleMouseOver, true);
    document.addEventListener('mouseout', handleMouseOut, true);
  });

  ipcRenderer.on('browser:stop-picker', () => {
    stopPicker();
  });

} catch (err) {
  console.error("Failed to init recorder", err);
}
