const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const scriptPath = path.join(__dirname, '..', 'edge-translator.user.js');

async function launchBrowser() {
  const edgePaths = [
    process.env.PAGELINGO_BROWSER_PATH,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ];
  const executablePath = edgePaths.find(value => value && fs.existsSync(value));
  return chromium.launch({ executablePath, headless: true });
}

function instrument(source) {
  // This export is inserted only into the test copy, never the installable file.
  const marker = /\n  init\(\);\s*\n\}\)\(\);\s*$/;
  assert.ok(marker.test(source), 'Cannot find the userscript entry point');
  return source.replace(marker, `
  window.__TEST = {
    settings, session, startTranslation, stopTranslation, restartTranslation,
    getSourceText, collectCandidates, translateTexts, parseRetryAfter,
    getState: el => elementStates.get(el), getUi: () => ui,
  };
  init();
})();
`);
}

function paragraphs(count, extra = '') {
  return '<main>' + Array.from({ length: count }, (_, index) =>
    `<p id="p${index}">Paragraph ${index}: readable English text for translation. ${extra}</p>`
  ).join('') + '</main>';
}

async function fixture(browser, html, { settings = {}, mock = {}, source, viewport, storage = {} } = {}) {
  const page = await browser.newPage({ viewport: viewport || { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url().startsWith('http://pagelingo.test/')
    ? route.fulfill({ contentType: 'text/html; charset=utf-8', body:
      '<!doctype html><html><head><meta charset="utf-8"></head><body>' + html + '</body></html>' })
    : route.abort());
  await page.goto('http://pagelingo.test/test');
  const boot = async stored => {
    await page.evaluate(({ settings, mock, stored }) => {
      window.__calls = [];
      window.__writes = [];
      window.__store = { 'et:settings:v1': JSON.stringify({
        // Keep feature scenarios explicit when installation defaults change.
        schemaVersion: 4, provider: 'microsoft', targetLang: 'zh-CN', autoFallback: false,
        allowLowQuality: false, fullPage: false, translationOnly: false, showOriginal: true, persistentCache: true,
        ...settings,
      }), ...stored };
      window.GM_getValue = mock.noGMStorage ? undefined : (key, fallback) => window.__store[key] ?? fallback;
      window.GM_setValue = mock.noGMStorage ? undefined : (key, value) => {
        window.__store[key] = value; window.__writes.push({ key, value });
      };
      window.GM_deleteValue = mock.noGMStorage ? undefined : key => { delete window.__store[key]; };
      window.GM_registerMenuCommand = () => {};
      window.GM_setClipboard = () => {};
      window.GM_xmlhttpRequest = options => {
        const url = new URL(options.url);
        const provider = url.hostname.includes('deepl') ? 'deepl' : url.hostname.includes('google') ? 'google'
          : url.hostname.includes('mymemory') ? 'mymemory' : 'microsoft';
        const body = options.data && provider !== 'google' ? JSON.parse(options.data) : null;
        const texts = provider === 'microsoft' ? body : provider === 'deepl' ? body.text
          : provider === 'google' && options.method === 'POST' ? new URLSearchParams(options.data).getAll('q')
          : [url.searchParams.get('q')];
        const target = provider === 'microsoft' ? url.searchParams.get('to')
          : provider === 'deepl' ? body.target_lang : url.searchParams.get(provider === 'google' ? 'tl' : 'langpair');
        const index = window.__calls.length;
        const entry = { provider, texts, target, method: options.method, url: options.url,
          at: performance.now(), endedAt: null, aborted: false };
        window.__calls.push(entry);
        const timer = setTimeout(() => {
          entry.endedAt = performance.now();
          if ((mock.networkErrorFirst && index === 0) || (mock.microsoftNetworkError && provider === 'microsoft')) {
            return options.onerror({ status: 0 });
          }
          let status = mock.statuses?.[index] || 200;
          if (mock.microsoftDenied && provider === 'microsoft') status = 403;
          if (mock.rejectLarge && texts.length > 32) status = 413;
          if (provider === 'deepl' && texts.length > 50) status = 400;
          if (status !== 200) return options.onload({ status, responseText: '', responseHeaders: mock.headers || '' });
          const translate = text => `${provider}/${target}::${text}`;
          let response = provider === 'microsoft' ? texts.map(text => ({ translations: [{ text: translate(text) }] }))
            : provider === 'deepl' ? { translations: texts.map(text => ({ text: translate(text) })) }
            : provider === 'google' ? url.pathname.endsWith('/t')
              ? texts.map(text => mock.googleStringArray ? translate(text) : [translate(text), 'en'])
              : { sentences: [{ trans: translate(texts[0]) }] }
            : { responseStatus: 200, responseData: { translatedText: translate(texts[0]) } };
          if (provider === 'google' && mock.googleBadCount) response = [];
          if (provider === 'google' && mock.googleEmptyItem) response = texts.map(() => ['', 'en']);
          if (provider === 'google' && mock.googleLiteralHtml) response = texts.map(() => ['<img src=x onerror="alert(1)">', 'en']);
          options.onload({ status: 200, responseText: JSON.stringify(response), responseHeaders: '' });
        }, mock.delays?.[index] ?? mock.providerLatencies?.[provider] ?? mock.latencyMs ?? 30);
        return { abort() {
          if (entry.endedAt !== null) return;
          entry.aborted = true;
          entry.endedAt = performance.now();
          clearTimeout(timer);
          options.onabort();
        } };
      };
      window.__renders = [];
      window.__renderObserver = new MutationObserver(records => {
        if (records.some(record => Array.from(record.addedNodes).some(node =>
          node.nodeType === 1 && (node.matches('.et-translation') || node.querySelector('.et-translation'))))) {
          window.__renders.push({ at: performance.now(), count: document.querySelectorAll('.et-translation').length });
        }
      });
      window.__renderObserver.observe(document.body, { childList: true, subtree: true });
    }, { settings, mock, stored });
    await page.addScriptTag({ content: instrument(source || fs.readFileSync(scriptPath, 'utf8')) });
  };
  await boot(storage);
  return { page, errors, reload: async transform => {
    let stored = await page.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent('pagehide'));
      return window.__store;
    });
    if (transform) stored = await transform(stored);
    await page.reload();
    await boot(stored);
  } };
}

async function idle(page, expected, timeout = 10000) {
  await page.waitForFunction(count => {
    const session = window.__TEST.session;
    return session.stats.done >= count && !session.busy && !session.queue.length && !session.scanJobs.length &&
      !session.renderFrame && (!session.renderQueue || !session.renderQueue.size) &&
      document.querySelectorAll('.et-translation').length > 0;
  }, expected, { timeout });
}

async function start(page, expected = 1) {
  await page.evaluate(() => window.__TEST.startTranslation());
  await idle(page, expected);
}

async function change(page, name, value) {
  await page.evaluate(({ name, value }) => {
    const input = window.__TEST.getUi().shadow.querySelector(`[data-field="${name}"]`);
    if (typeof value === 'boolean') input.checked = value;
    else input.value = value;
    input.dispatchEvent(new Event('change'));
  }, { name, value });
}

async function inspect(page) {
  return page.evaluate(() => ({
    mode: window.__TEST.session.scanMode,
    done: window.__TEST.session.stats.done,
    failed: window.__TEST.session.stats.failed,
    translated: document.querySelectorAll('.et-translation').length,
    calls: window.__calls,
    renders: window.__renders,
    translations: Array.from(document.querySelectorAll('.et-translation'), el => el.textContent),
  }));
}

module.exports = { launchBrowser, fixture, paragraphs, start, idle, change, inspect };
