// ==UserScript==
// @name         PageLingo — 双语网页翻译
// @namespace    https://github.com/qinmuran0316/PageLingo
// @version      0.7.2
// @description  PageLingo：将英文、日文、韩文等网页内容快速翻译成中文，支持中英日韩多种语言和划词翻译
// @author       qinmuran0316
// @license      MIT
// @homepage     https://github.com/qinmuran0316/PageLingo
// @homepageURL  https://github.com/qinmuran0316/PageLingo
// @supportURL   https://github.com/qinmuran0316/PageLingo/issues
// @updateURL    https://raw.githubusercontent.com/qinmuran0316/PageLingo/main/edge-translator.user.js
// @downloadURL  https://raw.githubusercontent.com/qinmuran0316/PageLingo/main/edge-translator.user.js
// @match        http://*/*
// @match        https://*/*
// @exclude      *://edge.microsoft.com/*
// @exclude      *://translate.googleapis.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @connect      edge.microsoft.com
// @connect      api.mymemory.translated.net
// @connect      translate.googleapis.com
// @connect      api-free.deepl.com
// @run-at       document-idle
// @noframes
// ==/UserScript==

(() => {
  'use strict';

  if (window.__EDGE_TRANSLATOR_LOADED__) return;
  window.__EDGE_TRANSLATOR_LOADED__ = true;

  const VERSION = '0.7.2';
  const HOST_ID = 'et-translator-host';
  const STYLE_ID = 'et-page-style';
  const SETTINGS_KEY = 'et:settings:v1';
  const CACHE_STORAGE_KEY = 'et:cache:v1';
  const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const AUTO_HEDGE_DELAY_MS = 450;
  const REQUEST_TIMEOUT = 10000;
  const PROVIDER_GAP = 250;
  const PAGE_CONCURRENCY = 2;
  const SCAN_BUDGET_MS = 6;
  const BATCH_WAIT_MS = 16;
  const AUTO_ALL_MAX_CANDIDATES = 160;
  const AUTO_ALL_MAX_CHARS = 32000;
  const VIEWPORT_MARGIN_PX = 0;
  const MAX_BLOCK_CHARS = 1800;
  const PROVIDER_BATCH_LIMITS = {
    microsoft: { items: 128, chars: 24000 },
    deepl: { items: 50, chars: 24000 },
    google: { items: 128, chars: 24000 },
    mymemory: { items: 1, chars: 1800 },
  };
  const CACHE_MAX_ITEMS = 1000;
  const CACHE_MAX_BYTES = 2 * 1024 * 1024;
  const DEBUG = false;

  const AUTO_ORDER = ['microsoft', 'deepl', 'google'];
  const PROVIDER_LABELS = {
    microsoft: '微软',
    deepl: 'DeepL',
    google: 'Google',
    mymemory: 'MyMemory',
  };
  const TARGETS = {
    'zh-CN': { label: '简体中文', microsoft: 'zh-Hans', deepl: 'ZH-HANS', google: 'zh-CN', mymemory: 'zh-CN' },
    'zh-TW': { label: '繁體中文', microsoft: 'zh-Hant', deepl: 'ZH-HANT', google: 'zh-TW', mymemory: 'zh-TW' },
    en: { label: 'English', microsoft: 'en', deepl: 'EN-US', google: 'en', mymemory: 'en' },
    ja: { label: '日本語', microsoft: 'ja', deepl: 'JA', google: 'ja', mymemory: 'ja' },
    ko: { label: '한국어', microsoft: 'ko', deepl: 'KO', google: 'ko', mymemory: 'ko' },
  };
  const PROVIDER_OPTIONS = [
    { value: 'auto', label: '自动择快（推荐）' },
    { value: 'microsoft', label: '微软（免费推荐）' },
    { value: 'deepl', label: 'DeepL（需 Key）' },
    { value: 'google', label: 'Google（整页批量）' },
    { value: 'mymemory', label: 'MyMemory（质量较低）' },
  ];

  const SITE_SKIP_SELECTOR = [
    '.blob-code',
    '.blob-num',
    '.diff-table',
    '.CodeMirror',
    '.monaco-editor',
    '.cm-editor',
    '[data-testid="code-viewer"]',
    '[data-testid="diff-table"]',
  ].join(',');
  const SKIP_CLOSEST_SELECTOR = [
    'pre',
    'code',
    'kbd',
    'samp',
    'textarea',
    'input',
    'select',
    'option',
    '[contenteditable=""]',
    '[contenteditable="true"]',
    '[contenteditable="plaintext-only"]',
    '[contenteditable]',
    '[translate="no"]',
    '.notranslate',
    '.et-translation',
    '.et-source-hidden',
    '#' + HOST_ID,
    '[role="textbox"]',
    '[aria-hidden="true"]',
    '[hidden]',
    'svg',
    'math',
    'canvas',
    'iframe',
    'object',
    'embed',
    'audio',
    'video',
    'button',
    '[role="button"]',
    '[role="tab"]',
    '[role="menuitem"]',
    '[role="menu"]',
    '[role="menubar"]',
    'summary',
  ].join(',');
  const CHROME_SELECTOR = 'nav,aside,footer,header,[role="navigation"],[role="banner"],[role="contentinfo"]';
  const TEXT_FLOW_TAGS = new Set([
    'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TD', 'TH', 'DD', 'DT',
    'BLOCKQUOTE', 'FIGCAPTION', 'CAPTION', 'LABEL',
  ]);
  const INLINE_ORIGIN_TAGS = new Set([
    'A', 'SPAN', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'SMALL', 'MARK',
    'ABBR', 'TIME', 'CITE', 'Q', 'DEL', 'INS', 'LABEL',
  ]);
  const INLINE_DISPLAYS = new Set([
    'inline',
    'contents',
    'ruby',
    'ruby-base',
    'ruby-text',
    'ruby-base-container',
    'ruby-text-container',
  ]);

  const DEFAULTS = {
    schemaVersion: 4,
    provider: 'microsoft',
    targetLang: 'zh-CN',
    autoFallback: false,
    allowLowQuality: true,
    selection: true,
    fullPage: true,
    translationOnly: true,
    showOriginal: false,
    persistentCache: false,
    deeplKey: '',
    shortcuts: { toggle: 'Alt+T', panel: 'Alt+O' },
    position: null,
    sites: {},
  };

  // ---------------------------------------------------------------------------
  // 基础工具
  // ---------------------------------------------------------------------------

  function abortError() {
    const error = new ProviderError('请求已取消', 'abort');
    error.name = 'AbortError';
    return error;
  }

  function throwIfAborted(signal) {
    if (signal && signal.aborted) throw abortError();
  }

  function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal && signal.aborted) { reject(abortError()); return; }
      const cancel = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', cancel);
        reject(abortError());
      };
      const timer = setTimeout(() => {
        if (signal) signal.removeEventListener('abort', cancel);
        resolve();
      }, ms);
      if (signal) signal.addEventListener('abort', cancel, { once: true });
    });
  }

  function linkedController(signal) {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', cancel, { once: true });
    }
    return {
      controller,
      release() { if (signal) signal.removeEventListener('abort', cancel); },
    };
  }

  function logWarn(...args) {
    if (DEBUG) console.warn('[Edge Translator]', ...args);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalizeText(text) {
    return String(text || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t\f\v]+/g, ' ')
      .replace(/\s*\n\s*/g, ' ')
      .replace(/\s+([,.;:!?，。；：！？])/g, '$1')
      .trim();
  }

  function isAbortError(err) {
    return !!err && (err.name === 'AbortError' || err.kind === 'abort');
  }

  class ProviderError extends Error {
    constructor(message, kind, status, retryAfter) {
      super(message);
      this.name = 'ProviderError';
      this.kind = kind || 'protocol';
      this.status = status || 0;
      this.retryAfter = retryAfter || 0;
    }
  }

  function decodeEntities(text) {
    const box = document.createElement('textarea');
    box.innerHTML = text;
    return box.value;
  }

  function splitText(text, limit) {
    const value = String(text || '').trim();
    if (value.length <= limit) return value ? [value] : [];
    const result = [];
    let rest = value;
    while (rest.length > limit) {
      const windowText = rest.slice(0, limit);
      let cut = -1;
      const marks = ['. ', '! ', '? ', '; ', '。', '！', '？', '；', '\n'];
      for (const mark of marks) {
        const index = windowText.lastIndexOf(mark);
        if (index > cut) cut = index + mark.length;
      }
      if (cut < limit * 0.45) {
        cut = windowText.lastIndexOf(' ');
      }
      if (cut < limit * 0.3) cut = limit;
      if (cut > 0 && /[\uD800-\uDBFF]/.test(rest[cut - 1]) && /[\uDC00-\uDFFF]/.test(rest[cut] || '')) cut -= 1;
      result.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) result.push(rest);
    return result.filter(Boolean);
  }

  async function mapConcurrent(values, limit, mapper, signal) {
    const out = new Array(values.length);
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => {
      while (cursor < values.length) {
        throwIfAborted(signal);
        const index = cursor++;
        out[index] = await mapper(values[index], index);
      }
    }));
    return out;
  }

  // ---------------------------------------------------------------------------
  // GM 运行时：存储、跨域请求、菜单、剪贴板
  // ---------------------------------------------------------------------------

  const gm = {
    get(key, fallback) {
      try {
        if (typeof GM_getValue === 'function') {
          const value = GM_getValue(key, null);
          return value === null || value === undefined ? fallback : value;
        }
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : raw;
      } catch (err) {
        logWarn('读取设置失败', err);
        return fallback;
      }
    },
    set(key, value) {
      try {
        if (typeof GM_setValue === 'function') {
          GM_setValue(key, value);
          return;
        }
        // A page storage fallback may hold public preferences, never credentials.
        const safe = JSON.parse(value);
        delete safe.deeplKey;
        localStorage.setItem(key, JSON.stringify(safe));
      } catch (err) {
        logWarn('保存设置失败', err);
      }
    },
    remove(key) {
      try {
        if (typeof GM_deleteValue === 'function') GM_deleteValue(key);
        else localStorage.removeItem(key);
      } catch (err) {
        logWarn('删除设置失败', err);
      }
    },
    menu(label, handler) {
      try {
        if (typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand(label, handler);
      } catch (err) {
        logWarn('注册菜单失败', err);
      }
    },
    async copy(text) {
      try {
        if (typeof GM_setClipboard === 'function') {
          GM_setClipboard(text, 'text');
          return true;
        }
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {
        logWarn('复制失败', err);
        return false;
      }
    },
  };

  function getRequestApi() {
    if (typeof GM_xmlhttpRequest === 'function') return GM_xmlhttpRequest;
    if (typeof GM !== 'undefined' && GM && typeof GM.xmlHttpRequest === 'function') {
      return GM.xmlHttpRequest.bind(GM);
    }
    return null;
  }

  function parseRetryAfter(headers) {
    const match = /(?:^|\n)retry-after\s*:\s*([^\r\n]+)/i.exec(String(headers || ''));
    if (!match) return 0;
    const value = match[1].trim();
    const delay = /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value) - Date.now();
    return Number.isFinite(delay) ? Math.max(0, delay) : 0;
  }

  const activeRequests = new Set();
  const requestLanes = new Map();

  function abortPageRequests() {
    for (const request of Array.from(activeRequests)) {
      if (request.__etPurpose === 'page' && typeof request.abort === 'function') {
        try { request.abort(); } catch (err) { /* ignore */ }
      }
    }
  }

  function gmRequest(options, context = {}) {
    let handle = null;
    let settled = false;
    let cancel;
    const signal = context.signal;

    const promise = new Promise((resolve, reject) => {
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        if (signal && cancel) signal.removeEventListener('abort', cancel);
        fn(value);
      };
      cancel = () => {
        finish(reject, abortError());
        if (handle && typeof handle.abort === 'function') {
          try { handle.abort(); } catch (err) { /* ignore */ }
        }
      };
      if (signal && signal.aborted) { cancel(); return; }
      if (signal) signal.addEventListener('abort', cancel, { once: true });
      const api = getRequestApi();
      if (!api) {
        finish(reject, new ProviderError('脚本管理器没有提供跨域请求能力', 'environment'));
        return;
      }

      const failHttp = (response) => {
        const status = Number(response.status) || 0;
        const retryAfter = parseRetryAfter(response.responseHeaders);
        finish(
          reject,
          new ProviderError(
            status === 429
              ? '接口限流'
              : status === 456
                ? '接口免费额度已用完'
                : status === 401 || status === 403
                  ? '接口拒绝访问'
                  : `接口请求失败（HTTP ${status || '未知'}）`,
            status === 429
              ? 'rate'
              : status === 456
                ? 'quota'
                : status === 401 || status === 403
                  ? 'denied'
                  : 'http',
            status,
            retryAfter
          )
        );
      };

      try {
        handle = api({
          method: options.method || 'GET',
          url: options.url,
          headers: options.headers || {},
          data: options.data,
          timeout: options.timeout || REQUEST_TIMEOUT,
          anonymous: options.anonymous !== false,
          onload: (response) => {
            if (settled) return;
            if (response.status >= 200 && response.status < 300) {
              finish(resolve, {
                status: response.status,
                text: response.responseText || '',
                headers: response.responseHeaders || '',
              });
            } else {
              failHttp(response);
            }
          },
          onerror: (response) => {
            if (settled) return;
            finish(reject, new ProviderError('网络请求失败', 'network', 0, 0));
          },
          ontimeout: () => {
            if (settled) return;
            finish(reject, new ProviderError('请求超时', 'timeout', 0, 0));
          },
          onabort: () => {
            finish(reject, abortError());
          },
        });
      } catch (err) {
        finish(reject, new ProviderError('无法发起跨域请求：' + (err && err.message ? err.message : err), 'environment'));
        return;
      }

      if (signal && signal.aborted && handle && typeof handle.abort === 'function') {
        try { handle.abort(); } catch (err) { /* ignore */ }
      }
    });

    promise.abort = () => cancel && cancel();
    promise.__etPurpose = context.purpose || 'page';
    activeRequests.add(promise);
    const cleanup = () => activeRequests.delete(promise);
    promise.then(cleanup, cleanup);
    return promise;
  }

  function providerGap(name) {
    return Math.max(name === 'mymemory' ? 1000 : name === 'google' ? 400 : PROVIDER_GAP,
      providerStates[name].adaptiveGap || 0);
  }

  function drainRequestLane(name) {
    const lane = requestLanes.get(name);
    if (!lane || lane.timer) return;
    lane.queue = lane.queue.filter((item) => !item.cancelled);
    const maxActive = name === 'mymemory' ? 1 : 2;
    if (!lane.queue.length || lane.active >= maxActive) return;
    if (isCooling(name)) {
      for (const item of lane.queue.splice(0)) {
        item.cleanup();
        item.reject(new ProviderError(cooldownMessage(name), 'cooldown'));
      }
      return;
    }
    const delay = providerStates[name].lastStart + providerGap(name) - Date.now();
    if (delay > 0) {
      lane.timer = setTimeout(() => { lane.timer = 0; drainRequestLane(name); }, delay);
      return;
    }
    const priorityIndex = lane.queue.findIndex((item) => item.context.purpose === 'selection');
    if (priorityIndex < 0 && document.hidden) return;
    const item = lane.queue.splice(priorityIndex < 0 ? 0 : priorityIndex, 1)[0];
    item.started = true;
    item.cleanup();
    if (item.context.signal && item.context.signal.aborted) {
      item.reject(abortError());
      drainRequestLane(name);
      return;
    }
    lane.active += 1;
    providerStates[name].lastStart = Date.now();
    gmRequest(item.options, item.context).then(item.resolve, item.reject).finally(() => {
      lane.active -= 1;
      drainRequestLane(name);
    });
    drainRequestLane(name);
  }

  function providerRequest(name, options, context) {
    return new Promise((resolve, reject) => {
      const signal = context.signal;
      if (signal && signal.aborted) { reject(abortError()); return; }
      let lane = requestLanes.get(name);
      if (!lane) {
        lane = { active: 0, queue: [], timer: 0 };
        requestLanes.set(name, lane);
      }
      const item = { options, context, resolve, reject, cancelled: false, started: false };
      const cancel = () => {
        if (item.started) return;
        item.cancelled = true;
        item.cleanup();
        reject(abortError());
        drainRequestLane(name);
      };
      item.cleanup = () => { if (signal) signal.removeEventListener('abort', cancel); };
      if (signal) signal.addEventListener('abort', cancel, { once: true });
      lane.queue.push(item);
      drainRequestLane(name);
    });
  }

  // ---------------------------------------------------------------------------
  // 设置
  // ---------------------------------------------------------------------------

  function cloneDefaults() {
    return {
      ...DEFAULTS,
      shortcuts: { ...DEFAULTS.shortcuts },
      sites: {},
    };
  }

  function loadSettings() {
    const stored = gm.get(SETTINGS_KEY, null);
    let parsed = null;
    try {
      parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
    } catch (err) {
      logWarn('设置格式损坏，已使用默认值', err);
    }
    const base = cloneDefaults();
    if (!parsed || typeof parsed !== 'object') return base;
    const merged = {
      ...base,
      ...parsed,
      shortcuts: { ...base.shortcuts, ...(parsed.shortcuts || {}) },
      sites: parsed.sites && typeof parsed.sites === 'object' ? { ...parsed.sites } : {},
    };
    if (!TARGETS[merged.targetLang]) merged.targetLang = base.targetLang;
    if (!['auto', 'microsoft', 'deepl', 'google', 'mymemory'].includes(merged.provider)) {
      merged.provider = base.provider;
    }
    merged.schemaVersion = 4;
    merged.autoFallback = merged.autoFallback !== false;
    merged.selection = merged.selection !== false;
    merged.allowLowQuality = merged.allowLowQuality === true;
    merged.fullPage = merged.fullPage === true;
    merged.translationOnly = merged.translationOnly === true;
    merged.showOriginal = merged.showOriginal !== false;
    merged.persistentCache = merged.persistentCache !== false;
    merged.deeplKey = typeof merged.deeplKey === 'string' && merged.deeplKey.trim().endsWith(':fx')
      ? merged.deeplKey.trim() : '';
    return merged;
  }

  const settings = loadSettings();

  function saveSettings() {
    gm.set(SETTINGS_KEY, JSON.stringify(settings));
  }

  function getSiteSettings() {
    const host = location.host || location.hostname || 'local';
    if (!settings.sites[host] || typeof settings.sites[host] !== 'object') {
      settings.sites[host] = { auto: false, disabled: false };
    }
    return settings.sites[host];
  }

  function patchSiteSettings(patch) {
    const site = getSiteSettings();
    Object.assign(site, patch);
    saveSettings();
    return site;
  }

  // ---------------------------------------------------------------------------
  // 缓存：内存 LRU 与脚本管理器本地缓存，隔离接口、站点、语言与协议
  // ---------------------------------------------------------------------------

  const cache = new Map();
  let cacheBytes = 0;
  let cacheWriteTimer = 0;

  function cacheScope() {
    return JSON.stringify([3, location.origin, settings.provider,
      settings.autoFallback, settings.allowLowQuality,
      settings.deeplKey ? settings.deeplKey.slice(-8) : '']);
  }

  function cacheKey(targetLang, text, scope = cacheScope()) {
    return scope + '\u0000' + targetLang + '\u0000' + text;
  }

  function cacheGet(targetLang, text, scope) {
    const key = cacheKey(targetLang, text, scope);
    const value = cache.get(key);
    if (value === undefined) return null;
    if (value.expiresAt <= Date.now()) {
      cacheBytes -= value.bytes;
      cache.delete(key);
      return null;
    }
    cache.delete(key);
    cache.set(key, value);
    return value;
  }

  function cacheSet(targetLang, text, translation, provider, scope) {
    if (!translation) return;
    const key = cacheKey(targetLang, text, scope);
    const size = (key.length + translation.length) * 2 + 80;
    if (cache.has(key)) {
      cacheBytes -= cache.get(key).bytes;
      cache.delete(key);
    }
    cache.set(key, { translation, provider, bytes: size, expiresAt: Date.now() + CACHE_TTL_MS });
    cacheBytes += size;
    trimCache();
    scheduleCacheSave();
  }

  function trimCache() {
    while (cache.size > CACHE_MAX_ITEMS || cacheBytes > CACHE_MAX_BYTES) {
      const oldest = cache.keys().next();
      if (oldest.done) break;
      const oldKey = oldest.value;
      const oldValue = cache.get(oldKey);
      cache.delete(oldKey);
      cacheBytes -= oldValue.bytes;
    }
  }

  function clearCache() {
    if (cacheWriteTimer) clearTimeout(cacheWriteTimer);
    cacheWriteTimer = 0;
    cache.clear();
    cacheBytes = 0;
    if (typeof GM_deleteValue === 'function') gm.remove(CACHE_STORAGE_KEY);
    else if (typeof GM_setValue === 'function') gm.set(CACHE_STORAGE_KEY, JSON.stringify({ entries: [] }));
  }

  function canPersistCache() {
    return settings.persistentCache && typeof GM_getValue === 'function' && typeof GM_setValue === 'function';
  }

  function loadPersistentCache() {
    if (!canPersistCache()) return;
    try {
      const stored = gm.get(CACHE_STORAGE_KEY, null);
      if (typeof stored !== 'string' || stored.length > CACHE_MAX_BYTES * 3) return;
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed.entries)) return;
      for (const entry of parsed.entries.slice(-CACHE_MAX_ITEMS)) {
        if (!Array.isArray(entry) || entry.length !== 4) continue;
        const [key, translation, provider, expiresAt] = entry;
        if (typeof key !== 'string' || typeof translation !== 'string' || !translation.trim() ||
          !PROVIDER_LABELS[provider] || !Number.isFinite(expiresAt) || expiresAt <= Date.now() ||
          expiresAt > Date.now() + CACHE_TTL_MS) continue;
        const bytes = (key.length + translation.length) * 2 + 80;
        if (bytes > CACHE_MAX_BYTES) continue;
        if (cache.has(key)) cacheBytes -= cache.get(key).bytes;
        cache.set(key, { translation, provider, bytes, expiresAt });
        cacheBytes += bytes;
      }
      trimCache();
    } catch (err) { logWarn('读取译文缓存失败', err); }
  }

  function scheduleCacheSave() {
    if (!canPersistCache() || cacheWriteTimer) return;
    cacheWriteTimer = setTimeout(flushPersistentCache, 800);
  }

  function flushPersistentCache() {
    if (cacheWriteTimer) clearTimeout(cacheWriteTimer);
    cacheWriteTimer = 0;
    if (!canPersistCache()) return;
    const entries = Array.from(cache).filter(([, value]) => value.expiresAt > Date.now())
      .map(([key, value]) => [key, value.translation, value.provider, value.expiresAt]);
    gm.set(CACHE_STORAGE_KEY, JSON.stringify({ entries }));
  }

  // ---------------------------------------------------------------------------
  // 接口适配器
  // ---------------------------------------------------------------------------

  const providerStates = {
    microsoft: createProviderState(),
    deepl: createProviderState(),
    google: createProviderState(),
    mymemory: createProviderState(),
  };
  let preferredAutoProvider = 'microsoft';

  function createProviderState() {
    return {
      lastStart: 0,
      coolingUntil: 0,
      failStreak: 0,
      lastFailAt: 0,
      lastError: '',
      lastOkAt: 0,
      adaptiveGap: 0,
      smallBatches: false,
    };
  }

  function providerLabel(name) {
    return PROVIDER_LABELS[name] || name;
  }

  function isCooling(name) {
    return providerStates[name].coolingUntil > Date.now();
  }

  function cooldownMessage(name) {
    const remaining = Math.max(0, providerStates[name].coolingUntil - Date.now());
    const seconds = Math.ceil(remaining / 1000);
    return `${providerLabel(name)} 暂不可用${seconds > 0 ? `，约 ${seconds} 秒后重试` : ''}`;
  }

  function getProviderOrder() {
    if (settings.provider === 'auto') {
      const order = [preferredAutoProvider];
      if (!settings.autoFallback) return order;
      order.push(preferredAutoProvider === 'google' ? 'microsoft' : 'google');
      if (settings.deeplKey) order.push('deepl');
      if (settings.allowLowQuality) order.push('mymemory');
      return order;
    }

    const order = [settings.provider];
    if (!settings.autoFallback) return order;
    for (const name of AUTO_ORDER) {
      if (name !== settings.provider && (name !== 'deepl' || settings.deeplKey)) order.push(name);
    }
    if (settings.allowLowQuality && settings.provider !== 'mymemory') order.push('mymemory');
    return order;
  }

  function noteProviderFailure(name, err) {
    if (!err || isAbortError(err)) return;
    const state = providerStates[name];
    const now = Date.now();
    if (now - state.lastFailAt > 60 * 1000) state.failStreak = 0;
    state.failStreak += 1;
    state.lastFailAt = now;
    state.lastError = err.message || String(err);

    if (err.kind === 'rate') {
      state.coolingUntil = now + (err.retryAfter || 60 * 1000);
      state.adaptiveGap = Math.min(4000, Math.max(providerGap(name) * 2, 800));
    } else if (err.kind === 'denied') {
      state.coolingUntil = now + 10 * 60 * 1000;
    } else if (err.kind === 'protocol') {
      state.coolingUntil = now + 10 * 60 * 1000;
    } else if (err.kind === 'quota') {
      state.coolingUntil = now + 60 * 60 * 1000;
    } else if (state.failStreak >= 3) {
      state.coolingUntil = now + 60 * 1000;
    }
    logWarn('接口失败', name, err.kind, err.message, '冷却至', new Date(state.coolingUntil).toISOString());
  }

  function noteProviderSuccess(name) {
    const state = providerStates[name];
    state.lastOkAt = Date.now();
    // A success from an older parallel request must not clear a newer 429.
    if (state.coolingUntil <= Date.now()) {
      state.failStreak = 0;
      state.lastError = '';
      state.coolingUntil = 0;
      state.adaptiveGap = Math.max(0, state.adaptiveGap - 50);
    }
  }

  async function microsoftTranslate(texts, targetLang, context) {
    const to = TARGETS[targetLang].microsoft;
    const url =
      'https://edge.microsoft.com/translate/translatetext?from=&to=' +
      encodeURIComponent(to) +
      '&isEnterpriseClient=false';
    const response = await providerRequest('microsoft', {
      method: 'POST',
      url,
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify(texts),
    }, context);
    let data;
    try {
      data = JSON.parse(response.text);
    } catch (err) {
      throw new ProviderError('微软接口返回了无法解析的数据', 'protocol');
    }
    if (!Array.isArray(data) || data.length !== texts.length) {
      throw new ProviderError('微软接口返回数量不一致', 'protocol');
    }
    return data.map((item, index) => {
      const text = item && item.translations && item.translations[0] && item.translations[0].text;
      if (typeof text !== 'string' || !text.trim()) {
        throw new ProviderError(`微软接口第 ${index + 1} 段译文为空或格式异常`, 'protocol');
      }
      return text.trim();
    });
  }

  async function mymemoryTranslate(texts, targetLang, context) {
    const out = [];
    for (const text of texts) {
      const chunks = [];
      let chunk = '';
      let bytes = 0;
      for (const char of text) {
        const length = new TextEncoder().encode(char).length;
        if (bytes + length > 450) { chunks.push(chunk); chunk = ''; bytes = 0; }
        chunk += char;
        bytes += length;
      }
      if (chunk) chunks.push(chunk);
      let joined = '';
      for (const chunk of chunks) {
        throwIfAborted(context.signal);
        const url =
          'https://api.mymemory.translated.net/get?q=' +
          encodeURIComponent(chunk) +
          '&langpair=' +
          encodeURIComponent('autodetect|' + TARGETS[targetLang].mymemory);
        const response = await providerRequest('mymemory', { method: 'GET', url }, context);
        let data;
        try {
          data = JSON.parse(response.text);
        } catch (err) {
          throw new ProviderError('MyMemory 返回了无法解析的数据', 'protocol');
        }
        if (data && data.quotaFinished) {
          throw new ProviderError('MyMemory 今日免费额度已用完', 'quota');
        }
        const status = Number(data && data.responseStatus);
        const translated = data && data.responseData && data.responseData.translatedText;
        if (status !== 200 || typeof translated !== 'string' || !translated.trim()) {
          const detail = (data && data.responseDetails) || '译文为空';
          throw new ProviderError('MyMemory 翻译失败：' + detail, 'protocol');
        }
        joined += (joined ? ' ' : '') + decodeEntities(translated).trim();
      }
      out.push(joined);
    }
    return out;
  }

  async function googleTranslate(texts, targetLang, context) {
    // Repeated q fields preserve paragraph boundaries without HTML markers.
    const response = await providerRequest('google', {
      method: 'POST',
      url: 'https://translate.googleapis.com/translate_a/t?client=gtx&sl=auto&tl=' +
        encodeURIComponent(TARGETS[targetLang].google),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      data: texts.map(text => 'q=' + encodeURIComponent(text)).join('&'),
    }, context);
    let data;
    try { data = JSON.parse(response.text); }
    catch (err) { throw new ProviderError('Google 接口返回了无法解析的数据', 'protocol'); }
    if (!Array.isArray(data) || data.length !== texts.length) {
      throw new ProviderError('Google 接口返回数量不一致', 'protocol');
    }
    return data.map((item, index) => {
      const translation = typeof item === 'string' ? item : Array.isArray(item) ? item[0] : null;
      if (typeof translation !== 'string' || !translation.trim()) {
        throw new ProviderError(`Google 接口第 ${index + 1} 段译文为空或格式异常`, 'protocol');
      }
      return translation.trim();
    });
  }

  async function deeplTranslate(texts, targetLang, context) {
    const key = context.deeplKey;
    if (!key || !key.endsWith(':fx')) {
      throw new ProviderError('请在设置中填写 DeepL 免费版 API Key（以 :fx 结尾）', 'environment');
    }
    const url = 'https://api-free.deepl.com/v2/translate';
    const response = await providerRequest('deepl', {
      method: 'POST',
      url,
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'DeepL-Auth-Key ' + key,
      },
      data: JSON.stringify({
        text: texts,
        target_lang: TARGETS[targetLang].deepl,
        preserve_formatting: true,
      }),
    }, context);
    let data;
    try {
      data = JSON.parse(response.text);
    } catch (err) {
      throw new ProviderError('DeepL 返回了无法解析的数据', 'protocol');
    }
    if (!data || !Array.isArray(data.translations) || data.translations.length !== texts.length) {
      throw new ProviderError('DeepL 返回数量不一致', 'protocol');
    }
    return data.translations.map((item, index) => {
      const text = item && item.text;
      if (typeof text !== 'string' || !text.trim()) {
        throw new ProviderError(`DeepL 第 ${index + 1} 段译文为空`, 'protocol');
      }
      return text.trim();
    });
  }

  const providerImpl = {
    microsoft: microsoftTranslate,
    deepl: deeplTranslate,
    google: googleTranslate,
    mymemory: mymemoryTranslate,
  };

  function providerBatchLimits(name) {
    const limits = PROVIDER_BATCH_LIMITS[name];
    return providerStates[name].smallBatches
      ? { items: Math.min(limits.items, 32), chars: Math.min(limits.chars, 8000) }
      : limits;
  }

  async function translateProviderBatch(name, texts, targetLang, context) {
    // Fallback providers have different batch sizes; never pass a Microsoft
    // batch unchanged to DeepL or a single-text adapter.
    const limits = providerBatchLimits(name);
    const batches = [];
    let batch = [];
    let chars = 0;
    for (const text of texts) {
      if (batch.length && (batch.length >= limits.items || chars + text.length > limits.chars)) {
        batches.push(batch);
        batch = [];
        chars = 0;
      }
      batch.push(text);
      chars += text.length;
    }
    if (batch.length) batches.push(batch);
    const results = await mapConcurrent(batches, 2,
      part => providerImpl[name](part, targetLang, context), context.signal);
    return results.flat();
  }

  async function requestWithRetry(name, texts, targetLang, budget, context) {
    let lastError = null;
    const attempts = context.attempts || 2;
    // A size rejection may still use the second slot to shrink the payload,
    // even when automatic routing skips ordinary retries on a failing line.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      throwIfAborted(context.signal);
      if (budget.remaining <= 0) break;
      budget.remaining -= 1;
      const linked = linkedController(context.signal);
      try {
        const result = await translateProviderBatch(name, texts, targetLang,
          { ...context, signal: linked.controller.signal });
        throwIfAborted(context.signal);
        noteProviderSuccess(name);
        return result;
      } catch (err) {
        linked.controller.abort();
        throwIfAborted(context.signal);
        lastError = err;
        if ((err.status === 413 || err.status === 414) &&
          !providerStates[name].smallBatches && texts.length > 1 &&
          attempt === 0 && budget.remaining > 0) {
          providerStates[name].smallBatches = true;
          continue;
        }
        if (!isAbortError(err) && err.kind !== 'cooldown') noteProviderFailure(name, err);
        if (
          isAbortError(err) ||
          err.kind === 'rate' ||
          err.kind === 'denied' ||
          err.kind === 'protocol' ||
          err.kind === 'quota' ||
          err.kind === 'environment' ||
          err.kind === 'cooldown' ||
          (err.kind === 'http' && err.status < 500 && err.status !== 408) ||
          attempt >= attempts - 1 ||
          budget.remaining <= 0
        ) {
          throw err;
        }
        await sleep(500 + Math.random() * 300, context.signal);
      } finally {
        linked.release();
      }
    }
    throw lastError || new ProviderError('翻译请求尝试次数已用完', 'budget');
  }

  function raceFreeProviders(names, texts, targetLang, budget, context) {
    return new Promise((resolve, reject) => {
      let timer = 0;
      let next = 0;
      let pending = 0;
      let settled = false;
      let lastError;
      const requests = [];
      const finish = (result, error) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        for (const request of requests) {
          request.controller.abort();
          request.release();
        }
        if (error) reject(error);
        else {
          preferredAutoProvider = result.provider;
          resolve(result);
        }
      };
      const launch = () => {
        if (settled || next >= names.length) return;
        if (context.signal && context.signal.aborted) { finish(null, abortError()); return; }
        const name = names[next++];
        const request = linkedController(context.signal);
        requests.push(request);
        pending += 1;
        requestWithRetry(name, texts, targetLang, budget,
          { ...context, signal: request.controller.signal, attempts: 1 })
          .then(translations => finish({ translations, provider: name }), error => {
            pending -= 1;
            if (settled) return;
            if (isAbortError(error)) { finish(null, error); return; }
            lastError = error;
            if (timer) { clearTimeout(timer); timer = 0; }
            if (next < names.length) launch();
            else if (!pending) finish(null, lastError);
          });
      };
      launch();
      if (!settled && next < names.length) timer = setTimeout(launch, AUTO_HEDGE_DELAY_MS);
    });
  }

  async function translateTexts(texts, targetLang, purpose = 'page', options = {}) {
    const clean = texts.map((text) => String(text || '').trim());
    if (!clean.length || clean.some((text) => !text)) {
      throw new ProviderError('存在空文本，已取消请求', 'protocol');
    }

      const context = {
        purpose,
        signal: options.signal || (purpose === 'page' && session.controller ? session.controller.signal : undefined),
        deeplKey: settings.deeplKey,
      };
      throwIfAborted(context.signal);
      const order = getProviderOrder();
      const allowFallback = settings.autoFallback;
      const budget = { remaining: 3 };
      let lastError = null;

      // Only keyless services participate in speculative work. DeepL is used
      // after failures or when explicitly selected, never as a racing probe.
      const raced = new Set();
      if (settings.provider === 'auto' && allowFallback) {
        const names = order.filter(name => (name === 'microsoft' || name === 'google') && !isCooling(name));
        if (names.length === 2) {
          names.forEach(name => raced.add(name));
          try {
            const result = await raceFreeProviders(names, clean, targetLang, budget, context);
            throwIfAborted(context.signal);
            reportStatus({ provider: result.provider, message: `正在使用 ${providerLabel(result.provider)}`, kind: 'working' });
            return result;
          } catch (err) {
            if (isAbortError(err)) throw err;
            lastError = err;
          }
        }
      }

      for (const name of order) {
        throwIfAborted(context.signal);
        if (raced.has(name)) continue;
        if (budget.remaining <= 0) break;
        if (isCooling(name)) {
          lastError = new ProviderError(cooldownMessage(name), 'cooldown');
          continue;
        }
        try {
          const translations = await requestWithRetry(name, clean, targetLang, budget, context);
          throwIfAborted(context.signal);
          reportStatus({
            provider: name,
            message: `正在使用 ${providerLabel(name)}`,
            kind: 'working',
          });
          return { translations, provider: name };
        } catch (err) {
          if (isAbortError(err)) throw err;
          lastError = err;
          if (!allowFallback) break;
        }
      }

      if (!lastError) lastError = new ProviderError('没有可用的翻译接口', 'unavailable');
      if (lastError.kind === 'cooldown') throw lastError;
      throw lastError;
  }

  // ---------------------------------------------------------------------------
  // 页面状态与状态通知
  // ---------------------------------------------------------------------------

  const statusState = {
    kind: 'idle',
    message: '就绪',
    provider: '',
    done: 0,
    failed: 0,
    pending: 0,
  };
  let statusListener = null;

  function reportStatus(patch) {
    Object.assign(statusState, patch || {});
    if (typeof statusListener === 'function') {
      try {
        statusListener(statusState);
      } catch (err) {
        logWarn('刷新界面状态失败', err);
      }
    }
  }

  function onStatus(listener) {
    statusListener = listener;
  }

  function syncUi() {
    if (typeof updateUi === 'function') {
      try {
        updateUi();
      } catch (err) {
        logWarn('更新界面失败', err);
      }
    }
  }

  const session = {
    active: false,
    generation: 0,
    queue: [],
    busy: false,
    inFlight: 0,
    controller: null,
    elements: new Set(),
    pendingTexts: new Map(),
    scanJobs: [],
    scanRoots: new Set(),
    scanHandle: 0,
    scanStats: { slices: 0, maxSliceMs: 0, candidates: 0 },
    scanMode: 'pending',
    scanCandidates: [],
    scanCandidateChars: 0,
    scopeChars: 0,
    renderQueue: new Map(),
    renderFrame: 0,
    cleanupJobs: [],
    cleanupHandle: 0,
    io: null,
    mo: null,
    urlTimer: 0,
    retryTimer: 0,
    scanTimer: 0,
    lastRoute: '',
    failedElements: new Set(),
    translations: new Set(),
    sourceWrappers: new Set(),
    stats: { total: 0, done: 0, failed: 0 },
  };

  const MUTATION_OBSERVER_OPTIONS = {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['hidden', 'aria-hidden', 'class', 'style', 'translate', 'lang'],
  };

  let mutationPauseDepth = 0;

  function withMutationPaused(task) {
    if (mutationPauseDepth) return task();
    mutationPauseDepth += 1;
    const shouldResume = !!(session.mo && session.active && document.body);
    let pending = [];
    if (shouldResume) {
      pending = session.mo.takeRecords();
      try { session.mo.disconnect(); } catch (err) { /* ignore */ }
    }
    try {
      return task();
    } finally {
      mutationPauseDepth -= 1;
      if (shouldResume && session.mo && session.active && document.body) {
        try { session.mo.observe(document.body, MUTATION_OBSERVER_OPTIONS); } catch (err) { /* ignore */ }
        if (pending.length) handleMutations(pending);
      }
    }
  }

  let elementStates = new WeakMap();
  let observed = new WeakSet();
  let lastProvider = '';
  const pendingScanRoots = new Set();
  const recheckTimers = new WeakMap();
  let changeGuard = new WeakMap();

  function resetSessionState() {
    cancelScan();
    cancelCleanup();
    if (session.renderFrame) cancelAnimationFrame(session.renderFrame);
    session.renderFrame = 0;
    session.renderQueue.clear();
    session.queue = [];
    session.inFlight = 0;
    session.busy = false;
    session.elements = new Set();
    session.pendingTexts = new Map();
    session.scanStats = { slices: 0, maxSliceMs: 0, candidates: 0 };
    session.scanMode = settings.fullPage ? 'all' : 'pending';
    session.scanCandidates = [];
    session.scanCandidateChars = 0;
    session.scopeChars = 0;
    session.failedElements = new Set();
    session.translations = new Set();
    session.sourceWrappers = new Set();
    session.stats = { total: 0, done: 0, failed: 0 };
    elementStates = new WeakMap();
    observed = new WeakSet();
    changeGuard = new WeakMap();
    if (session.retryTimer) {
      clearTimeout(session.retryTimer);
      session.retryTimer = 0;
    }
  }

  function unwrapSourceWrapper(wrapper) {
    if (!wrapper) return;
    session.sourceWrappers.delete(wrapper);
    if (!wrapper.parentNode) return;
    withMutationPaused(() => {
      const parent = wrapper.parentNode;
      while (wrapper.firstChild) parent.insertBefore(wrapper.firstChild, wrapper);
      wrapper.remove();
    });
  }

  function wrapSourceContent(el) {
    let wrapper = el.querySelector(':scope > .et-source-hidden');
    if (wrapper) {
      session.sourceWrappers.add(wrapper);
      return wrapper;
    }

    wrapper = document.createElement('span');
    wrapper.className = 'et-source-hidden';
    wrapper.setAttribute('aria-hidden', 'true');
    wrapper.style.setProperty('display', 'none', 'important');

    withMutationPaused(() => {
      for (const child of Array.from(el.childNodes)) {
        if (
          child.nodeType === 1 &&
          (child.classList.contains('et-translation') || child.classList.contains('et-source-hidden'))
        ) {
          continue;
        }
        wrapper.appendChild(child);
      }
      el.appendChild(wrapper);
    });
    session.sourceWrappers.add(wrapper);
    return wrapper;
  }

  function removeTranslationNode(node) {
    if (!node) return;
    if (node.__etSourceWrapper) {
      unwrapSourceWrapper(node.__etSourceWrapper);
      node.__etSourceWrapper = null;
    }
    try { node.remove(); } catch (err) { /* ignore */ }
    session.translations.delete(node);
  }

  function removeAllTranslations() {
    for (const node of Array.from(session.translations)) {
      removeTranslationNode(node);
    }
    session.translations.clear();
    for (const wrapper of Array.from(session.sourceWrappers)) {
      unwrapSourceWrapper(wrapper);
    }
    session.sourceWrappers.clear();
    for (const el of Array.from(session.failedElements)) {
      const state = elementStates.get(el);
      if (state && state.translationEl) removeTranslationNode(state.translationEl);
    }
  }

  // ---------------------------------------------------------------------------
  // 段落提取
  // ---------------------------------------------------------------------------

  const TEXT_SKIP_SELECTOR = [
    '.et-translation', 'script', 'style', 'noscript', 'template', 'pre', 'code',
    'kbd', 'samp', '[hidden]', '[aria-hidden="true"]', '[translate="no"]',
    '.notranslate', '[contenteditable]', 'button', '[role="button"]',
    '[role="tab"]', '[role="menuitem"]', '[role="menu"]', '[role="menubar"]',
    'summary', 'svg', 'math', 'canvas', 'iframe', 'object', 'embed', 'audio',
    'video', 'textarea', 'input', 'select', 'option',
  ].join(',');

  function textContext() {
    return { styles: new WeakMap() };
  }

  function readStyle(el, context) {
    let style = context.styles.get(el);
    if (!style) {
      try { style = getComputedStyle(el); } catch (err) { return null; }
      context.styles.set(el, style);
    }
    return style;
  }

  function hiddenStyle(style) {
    return !style || style.display === 'none' || style.visibility === 'hidden' ||
      style.visibility === 'collapse' || style.contentVisibility === 'hidden';
  }

  function extractNodeText(node, context = textContext()) {
    if (node.nodeType === 3) return node.nodeValue || '';
    if (node.nodeType !== 1) return '';
    const originalWrapper = session.sourceWrappers.has(node);
    if (!originalWrapper && node.matches(TEXT_SKIP_SELECTOR)) return '';
    const style = readStyle(node, context);
    if (!originalWrapper && hiddenStyle(style)) return '';
    if (node.tagName === 'BR') return ' ';
    const layout = !originalWrapper && style &&
      (style.display.includes('flex') || style.display.includes('grid'));
    let text = '';
    for (const child of node.childNodes) {
      const fragment = extractNodeText(child, context);
      if (!fragment) continue;
      if (layout && text && child.nodeType === 1) text += ' ';
      text += fragment;
    }
    // Inline markup can divide a word. Only actual block boundaries add spaces.
    if (!originalWrapper && style && isBlockLikeDisplay(style.display) &&
      !isInlineBoxDisplay(style.display)) return ' ' + text + ' ';
    return text;
  }

  function getSourceText(el, context) {
    return normalizeText(extractNodeText(el, context));
  }

  function isChromeElement(el) {
    if (settings.fullPage) return false;
    const chrome = el.closest(CHROME_SELECTOR);
    return !!chrome && !chrome.closest('main,article,[role="main"]');
  }

  function isWorthTranslating(text, el) {
    const value = normalizeText(text);
    if (value.length < 2 || !/[\p{L}].*[\p{L}]/u.test(value)) return false;
    // Script/alphabet ratios cannot distinguish French from English or Han variants.
    const langNode = el && el.closest('[lang]');
    const lang = langNode ? (langNode.getAttribute('lang') || '').toLowerCase().replace(/_/g, '-') : '';
    const target = settings.targetLang;
    if (target === 'zh-CN' && /^(zh-hans(?:-|$)|zh-(cn|sg)$)/.test(lang)) return false;
    if (target === 'zh-TW' && /^(zh-hant(?:-|$)|zh-(tw|hk|mo)$)/.test(lang)) return false;
    if (target === 'en' && /^en(?:-|$)/.test(lang)) return false;
    if (target === 'ja' && /^ja(?:-|$)/.test(lang)) return false;
    if (target === 'ko' && /^ko(?:-|$)/.test(lang)) return false;
    return true;
  }

  function isEligibleTextBlock(el, context) {
    if (!el || !el.isConnected || !el.tagName) return false;
    if (el === document.body || el === document.documentElement) return false;
    if (el.closest('#' + HOST_ID + ',.et-translation')) return false;
    if (el.closest(SKIP_CLOSEST_SELECTOR) || el.closest(SITE_SKIP_SELECTOR)) return false;
    if (isChromeElement(el)) return false;
    const state = elementStates.get(el);
    if (state && ['done', 'queued', 'active'].includes(state.status)) return false;
    return isWorthTranslating(getSourceText(el, context), el);
  }

  function isBlockLikeDisplay(display) {
    return !!display && display !== 'none' && !INLINE_DISPLAYS.has(display);
  }

  function isInlineBoxDisplay(display) {
    return ['inline-block', 'inline-flex', 'inline-grid', 'inline-table'].includes(display);
  }

  function hasDirectText(el) {
    for (const node of el.childNodes) {
      if (node.nodeType === 3 && normalizeText(node.nodeValue)) return true;
    }
    return false;
  }

  function* candidateSteps(root) {
    const base = root && root.nodeType === 9 ? (root.body || root.documentElement) : root;
    if (!base || !base.isConnected || base.nodeType !== 1) return;
    if (base.closest('#' + HOST_ID + ',.et-translation,.et-source-hidden')) return;
    const context = textContext();
    const skipped = el => el.matches(SKIP_CLOSEST_SELECTOR) || !!el.closest(SITE_SKIP_SELECTOR);

    function* childrenOf(el) {
      for (let child = el.firstElementChild; child; child = child.nextElementSibling) {
        yield* visit(child);
      }
    }

    function* visit(el) {
      yield null; // Let discovery yield even in a large tree with no candidates.
      if (!el.isConnected || skipped(el) || isChromeElement(el)) return;
      const previous = elementStates.get(el);
      if (previous && ['done', 'queued', 'active'].includes(previous.status)) return;
      const style = readStyle(el, context);
      if (hiddenStyle(style)) return;
      if (el === document.body || el === document.documentElement) {
        yield* childrenOf(el);
        return;
      }
      if (INLINE_DISPLAYS.has(style.display)) {
        if (el.parentElement === document.body && isEligibleTextBlock(el, context)) yield el;
        else yield* childrenOf(el);
        return;
      }
      const flowText = TEXT_FLOW_TAGS.has(el.tagName);
      const directText = hasDirectText(el);
      const layout = style.display.includes('flex') || style.display.includes('grid');
      // Stream article/feed children immediately instead of inspecting all siblings.
      if (!flowText && !directText && !layout && el.childElementCount > 1) {
        const first = el.firstElementChild;
        const second = first.nextElementSibling;
        const firstStyle = readStyle(first, context);
        const secondStyle = readStyle(second, context);
        if (!hiddenStyle(firstStyle) && !hiddenStyle(secondStyle) &&
          isBlockLikeDisplay(firstStyle.display) && !isInlineBoxDisplay(firstStyle.display) &&
          isBlockLikeDisplay(secondStyle.display) && !isInlineBoxDisplay(secondStyle.display)) {
          yield* childrenOf(el);
          return;
        }
      }
      const blockChildren = [];
      for (const child of el.children) {
        yield null;
        if (skipped(child)) continue;
        const childStyle = readStyle(child, context);
        if (hiddenStyle(childStyle)) continue;
        if (childStyle.display === 'contents') {
          if (normalizeText(child.textContent)) blockChildren.push(child);
          continue;
        }
        if (!isBlockLikeDisplay(childStyle.display)) continue;
        if (isInlineBoxDisplay(childStyle.display) && (flowText || directText)) continue;
        if (normalizeText(child.textContent)) blockChildren.push(child);
      }
      if (!blockChildren.length) {
        if (isEligibleTextBlock(el, context)) yield el;
        return;
      }
      if (layout && blockChildren.length >= 2) {
        const lengths = blockChildren.map(child => normalizeText(child.textContent).length);
        if (blockChildren.every(child => INLINE_ORIGIN_TAGS.has(child.tagName)) &&
          lengths.every(length => length <= 120) &&
          lengths.reduce((sum, length) => sum + length, 0) / lengths.length <= 40) {
          if (isEligibleTextBlock(el, context)) yield el;
          return;
        }
      }
      if (directText && (flowText ||
        (blockChildren.length <= 2 && normalizeText(el.textContent).length <= 260))) {
        if (isEligibleTextBlock(el, context)) yield el;
        return;
      }
      for (const child of blockChildren) yield* visit(child);
    }
    yield* visit(base);
  }

  function collectCandidates(root) {
    return Array.from(candidateSteps(root)).filter(Boolean);
  }

  const scanChannel = new MessageChannel();
  const scanTasks = new Map();
  let scanTaskId = 0;
  scanChannel.port1.onmessage = event => {
    const task = scanTasks.get(event.data);
    scanTasks.delete(event.data);
    if (task) task();
  };

  function postScanTask(task) {
    const id = ++scanTaskId;
    scanTasks.set(id, task);
    scanChannel.port2.postMessage(id);
    return id;
  }

  function observeCandidateInViewport(el) {
    if (!el || !el.isConnected) return;
    if (session.io) session.io.observe(el);
    else if (isInViewport(el)) enqueueElement(el);
  }

  function isInViewport(el) {
    const rect = el.getBoundingClientRect();
    return rect.bottom > -VIEWPORT_MARGIN_PX && rect.top < innerHeight + VIEWPORT_MARGIN_PX &&
      rect.right > 0 && rect.left < innerWidth;
  }

  function switchToViewportMode() {
    if (session.scanMode === 'viewport') return;
    session.scanMode = 'viewport';
    ensureIntersectionObserver();
    const candidates = session.scanCandidates;
    session.scanCandidates = [];
    session.scanCandidateChars = 0;
    for (const el of candidates) observeCandidateInViewport(el);
    reportStatus({
      kind: 'working',
      message: '页面内容较多，正在集中翻译当前屏幕；滚动后继续',
    });
    syncUi();
  }

  function switchToAllMode() {
    session.scanMode = 'all';
    const candidates = session.scanCandidates;
    session.scanCandidates = [];
    session.scanCandidateChars = 0;
    for (const el of candidates) enqueueElement(el);
    reportStatus({
      kind: 'working',
      message: `页面规模适中，正在一次性翻译全部 ${candidates.length} 段`,
    });
    syncUi();
  }

  function finishAdaptiveScan() {
    if (session.scanMode === 'all' && session.scanCandidates.length) {
      switchToAllMode();
      return;
    }
    if (session.scanMode !== 'pending') return;
    if (
      session.scanCandidates.length <= AUTO_ALL_MAX_CANDIDATES &&
      session.scanCandidateChars <= AUTO_ALL_MAX_CHARS
    ) {
      switchToAllMode();
    } else {
      switchToViewportMode();
    }
  }

  function queueDiscoveredCandidate(el) {
    const textLength = getSourceText(el).length;
    session.scopeChars += textLength;
    if (session.scanMode === 'all' && !settings.fullPage &&
      (session.scanStats.candidates > AUTO_ALL_MAX_CANDIDATES || session.scopeChars > AUTO_ALL_MAX_CHARS)) {
      switchToViewportMode();
    }
    if (session.scanMode === 'all') {
      session.scanCandidates.push(el);
      return;
    }
    if (session.scanMode === 'viewport') {
      observeCandidateInViewport(el);
      return;
    }
    session.scanCandidates.push(el);
    session.scanCandidateChars += textLength;
    if (
      session.scanCandidates.length > AUTO_ALL_MAX_CANDIDATES ||
      session.scanCandidateChars > AUTO_ALL_MAX_CHARS
    ) {
      switchToViewportMode();
    }
  }

  function runScanSlice() {
    session.scanHandle = 0;
    if (!session.active || document.hidden) return;
    const started = performance.now();
    let steps = 0;
    while (session.scanJobs.length && steps++ < 160 && performance.now() - started < SCAN_BUDGET_MS) {
      const job = session.scanJobs[0];
      const next = job.iterator.next();
      if (next.done) {
        session.scanJobs.shift();
        session.scanRoots.delete(job.root);
      } else if (next.value) {
        const el = next.value;
        if (observed.has(el) || !el.isConnected) continue;
        observed.add(el);
        session.scanStats.candidates += 1;
        queueDiscoveredCandidate(el);
      }
    }
    if (!session.scanJobs.length) {
      finishAdaptiveScan();
      scheduleRenderCommit();
      pushStatusProgress();
    }
    session.scanStats.slices += 1;
    session.scanStats.maxSliceMs = Math.max(session.scanStats.maxSliceMs, performance.now() - started);
    if (session.scanJobs.length && session.active) session.scanHandle = postScanTask(runScanSlice);
  }

  function cancelScan() {
    if (session.scanHandle) scanTasks.delete(session.scanHandle);
    session.scanHandle = 0;
    session.scanJobs = [];
    session.scanRoots.clear();
    session.scanCandidates = [];
    session.scanCandidateChars = 0;
  }

  function ensureIntersectionObserver() {
    if (session.io || typeof IntersectionObserver !== 'function') return;
    session.io = new IntersectionObserver(
      (entries) => {
        if (!session.active) return;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          try { session.io.unobserve(entry.target); } catch (err) { /* ignore */ }
          enqueueElement(entry.target);
        }
      },
      { root: null, rootMargin: `${VIEWPORT_MARGIN_PX}px 0px`, threshold: 0 }
    );
  }

  function observeCandidates(root) {
    if (!session.active) return;
    if (session.scanMode === 'viewport') ensureIntersectionObserver();
    if (!root || session.scanRoots.has(root)) return;
    session.scanRoots.add(root);
    session.scanJobs.push({ root, iterator: candidateSteps(root) });
    if (!session.scanHandle && !document.hidden) session.scanHandle = postScanTask(runScanSlice);
  }

  // ---------------------------------------------------------------------------
  // 动态页面与 SPA
  // ---------------------------------------------------------------------------

  function isOwnNode(node) {
    if (!node) return false;
    if (node.nodeType !== 1) return false;
    if (node.id === HOST_ID) return true;
    if (node.classList && (node.classList.contains('et-translation') || node.classList.contains('et-source-hidden'))) {
      return true;
    }
    if (node.closest && node.closest('#' + HOST_ID + ',.et-translation,.et-source-hidden')) return true;
    return false;
  }

  function scheduleScan() {
    if (session.scanTimer || !session.active) return;
    session.scanTimer = window.setTimeout(() => {
      session.scanTimer = 0;
      if (!session.active) return;
      const roots = Array.from(pendingScanRoots);
      pendingScanRoots.clear();
      for (const root of roots) {
        if (root.isConnected && !isOwnNode(root)) observeCandidates(root);
      }
    }, 120);
  }

  function bumpChangeGuard(el) {
    const guard = changeGuard.get(el) || { count: 0, since: Date.now() };
    if (Date.now() - guard.since > 30 * 1000) {
      guard.count = 0;
      guard.since = Date.now();
    }
    guard.count += 1;
    changeGuard.set(el, guard);
    return guard.count <= 3;
  }

  function scheduleRecheck(el) {
    if (!session.active || !el || !el.isConnected) return;
    if (el.closest('.et-translation,#' + HOST_ID)) return;
    const previous = recheckTimers.get(el);
    if (previous) clearTimeout(previous);
    const generation = session.generation;
    const timer = window.setTimeout(() => {
      recheckTimers.delete(el);
      if (!session.active || generation !== session.generation || !el.isConnected) return;
      const state = elementStates.get(el);
      if (!state || state.status === 'paused' || state.status === 'queued' || state.status === 'active') return;
      const text = getSourceText(el);
      if (text === state.text && ((state.translationEl && state.translationEl.isConnected) ||
        session.renderQueue.get(el) === state)) return;
      if (!bumpChangeGuard(el)) {
        state.status = 'paused';
        removeTranslationNode(state.translationEl);
        state.translationEl = null;
        session.failedElements.add(el);
        reportStatus({ kind: 'error', message: '页面内容频繁变化，已暂停此段，可点击重试继续' });
        return;
      }
      removeTranslationNode(state.translationEl);
      session.renderQueue.delete(el);
      elementStates.delete(el);
      session.elements.delete(el);
      observed.delete(el);
      enqueueElement(el);
    }, 250);
    recheckTimers.set(el, timer);
  }

  function findStatefulAncestor(start) {
    let node = start;
    while (node && node !== document.body) {
      if (elementStates.has(node)) return node;
      node = node.parentElement;
    }
    return null;
  }

  function mutationRoot(node) {
    let el = node && (node.nodeType === 1 ? node : node.parentElement);
    if (!el) return null;
    const wrapper = el.closest('.et-source-hidden');
    if (wrapper) return wrapper.parentElement;
    while (el.parentElement && el.parentElement !== document.body &&
      INLINE_ORIGIN_TAGS.has(el.tagName)) el = el.parentElement;
    return el;
  }

  function* detachedSteps(root) {
    yield root;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let node;
    while ((node = walker.nextNode())) yield node;
  }

  function queueDetachedCleanup(root) {
    if (!root || root.nodeType !== 1) return;
    session.cleanupJobs.push({ root, iterator: detachedSteps(root) });
    if (!session.cleanupHandle) session.cleanupHandle = postScanTask(runCleanupSlice);
  }

  function runCleanupSlice() {
    session.cleanupHandle = 0;
    if (!session.active) return;
    const start = performance.now();
    while (session.cleanupJobs.length && performance.now() - start < SCAN_BUDGET_MS) {
      const job = session.cleanupJobs[0];
      if (job.root.isConnected) { session.cleanupJobs.shift(); continue; }
      const next = job.iterator.next();
      if (next.done) { session.cleanupJobs.shift(); continue; }
      const el = next.value;
      if (session.io) session.io.unobserve(el);
      observed.delete(el);
      const state = elementStates.get(el);
      if (state) {
        removeTranslationNode(state.translationEl);
        session.renderQueue.delete(el);
        elementStates.delete(el);
        session.elements.delete(el);
        session.failedElements.delete(el);
      }
      if (session.translations.has(el)) {
        const owner = el.__etOwner;
        removeTranslationNode(el);
        if (owner && owner.isConnected) scheduleRecheck(owner);
      }
      if (session.sourceWrappers.has(el)) unwrapSourceWrapper(el);
    }
    if (session.cleanupJobs.length) session.cleanupHandle = postScanTask(runCleanupSlice);
  }

  function cancelCleanup() {
    if (session.cleanupHandle) scanTasks.delete(session.cleanupHandle);
    session.cleanupHandle = 0;
    session.cleanupJobs = [];
  }

  function handleMutations(records) {
    if (!session.active) return;
    for (const record of records) {
      const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      if (!target || target.closest('.et-translation,#' + HOST_ID)) continue;
      const stateful = findStatefulAncestor(target);
      if (stateful) scheduleRecheck(stateful);
      if (record.type === 'childList') {
        for (const node of record.removedNodes) queueDetachedCleanup(node);
        if (!stateful && (record.removedNodes.length ||
          Array.from(record.addedNodes).some(node => node.nodeType === 3))) {
          const root = mutationRoot(target);
          if (root) pendingScanRoots.add(root);
        }
        for (const node of record.addedNodes) {
          if (node.nodeType !== 1 || isOwnNode(node)) continue;
          if (node.closest('.et-source-hidden')) continue;
          const root = mutationRoot(node);
          if (root) pendingScanRoots.add(root);
        }
      } else if (record.type === 'characterData' && !stateful) {
        const root = mutationRoot(target);
        if (root) pendingScanRoots.add(root);
      } else if (record.type === 'attributes') {
        for (const el of session.elements) {
          if (el !== target && target.contains(el)) scheduleRecheck(el);
        }
        if (!stateful && !isOwnNode(target)) {
          const root = mutationRoot(target);
          if (root) pendingScanRoots.add(root);
        }
      }
    }
    if (pendingScanRoots.size) scheduleScan();
  }

  function ensureMutationObserver() {
    if (session.mo || !document.body || typeof MutationObserver !== 'function') return;
    session.mo = new MutationObserver(handleMutations);
    session.mo.observe(document.body, MUTATION_OBSERVER_OPTIONS);
  }

  function startUrlWatcher() {
    if (session.urlTimer) return;
    session.lastRoute = location.pathname + location.search;
    session.urlTimer = window.setInterval(() => {
      if (!session.active) return;
      const route = location.pathname + location.search;
      if (route === session.lastRoute) return;
      session.lastRoute = route;
      reportStatus({ kind: 'working', message: '检测到页面切换，正在重新翻译…' });
      syncUi();
      window.setTimeout(() => restartTranslation(), 250);
    }, 1200);
  }

  function stopUrlWatcher() {
    if (session.urlTimer) {
      clearInterval(session.urlTimer);
      session.urlTimer = 0;
    }
  }

  // ---------------------------------------------------------------------------
  // 调度与渲染
  // ---------------------------------------------------------------------------

  let progressFrame = 0;
  let progressMessage = '';

  function pushStatusProgress(extraMessage) {
    if (extraMessage) progressMessage = extraMessage;
    if (progressFrame) return;
    progressFrame = requestAnimationFrame(() => {
      progressFrame = 0;
      if (!session.active) { progressMessage = ''; return; }
      const pending = session.queue.length + session.inFlight + session.renderQueue.size;
      const scope = session.scanMode === 'viewport' ? '当前屏幕' : '整页';
      const message = progressMessage || (session.scanMode === 'pending'
        ? `正在分析页面规模… 已发现 ${session.scanCandidates.length} 段`
        : pending > 0
          ? `正在批量翻译${scope}… 已准备 ${session.stats.done}/${session.stats.total} 段，完成后一起显示`
          : `已翻译 ${session.stats.done} 段${session.stats.failed ? `，失败 ${session.stats.failed} 段` : ''}`);
      reportStatus({
        message,
        provider: lastProvider,
        done: session.stats.done,
        failed: session.stats.failed,
        pending,
        kind: session.stats.failed ? 'error' : (pending || session.scanJobs.length) ? 'working' : 'done',
      });
      progressMessage = '';
    });
  }

  function canCommitTranslations() {
    return session.active && !document.hidden && session.scanMode !== 'pending' &&
      session.inFlight === 0 && session.queue.length === 0 &&
      (session.scanMode === 'viewport' || session.scanJobs.length === 0);
  }

  function scheduleRenderCommit(allowPending = false) {
    if (!session.active || document.hidden || session.renderFrame || !session.renderQueue.size) return;
    if (!allowPending && !canCommitTranslations()) return;
    const generation = session.generation;
    session.renderFrame = requestAnimationFrame(() => {
      session.renderFrame = 0;
      if (generation !== session.generation || !session.active) return;
      if (!allowPending && !canCommitTranslations()) return;
      const ready = [];
      // Finish source and layout reads before doing any writes. A slow response
      // must not make an earlier result overwrite content edited in the meantime.
      for (const [el, state] of session.renderQueue) {
        session.renderQueue.delete(el);
        if (!el.isConnected || elementStates.get(el) !== state || state.generation !== generation) continue;
        if (getSourceText(el) !== state.text) {
          scheduleRecheck(el);
          continue;
        }
        state.layout = readElementLayout(el);
        ready.push([el, state]);
      }
      withMutationPaused(() => {
        for (const [el, state] of ready) writeElementTranslation(el, state);
      });
      pushStatusProgress();
    });
  }

  function schedulePump(delay) {
    if (!session.active) return;
    if (session.retryTimer) return;
    session.retryTimer = window.setTimeout(() => {
      session.retryTimer = 0;
      if (!session.active) return;
      pump();
    }, delay === undefined ? BATCH_WAIT_MS : delay);
  }

  function readElementLayout(el) {
    const style = getComputedStyle(el);
    const parentStyle = el.parentElement ? getComputedStyle(el.parentElement) : null;
    return {
      display: style.display,
      direction: style.flexDirection || 'row',
      parentLayout: !!parentStyle &&
        (parentStyle.display.includes('flex') || parentStyle.display.includes('grid')),
    };
  }

  function ensureTranslationNode(el, state) {
    if (state.translationEl && state.translationEl.isConnected) return;
    const node = document.createElement('span');
    node.className = 'et-translation';
    node.lang = settings.targetLang;
    node.dir = 'auto';
    node.dataset.et = 'translation';
    node.dataset.state = 'loading';
    node.dataset.mode = settings.translationOnly ? 'only' : 'bilingual';
    node.__etOwner = el;

    if (settings.translationOnly) {
      node.__etSourceWrapper = wrapSourceContent(el);
    }

    const layout = state.layout || readElementLayout(el);
    const parent = el.parentElement;
    const isFlex = layout.display.includes('flex');
    const isGrid = layout.display.includes('grid');
    const keepInside = el.matches('td,th,li') || !parent || layout.parentLayout;

    if ((isFlex || isGrid) && !keepInside) {
      parent.insertBefore(node, el.nextSibling);
    } else {
      el.appendChild(node);
      if (isFlex || isGrid) {
        node.style.flexShrink = '1';
        node.style.width = '100%';
        if (isGrid) {
          node.style.gridColumn = '1 / -1';
        } else {
          const direction = layout.direction;
          if (!direction.startsWith('column')) node.style.flexBasis = '100%';
        }
      }
    }

    state.translationEl = node;
    session.translations.add(node);
  }

  function renderElement(el, state) {
    if (state.pending > 0 || !state.results.some(value => typeof value === 'string' && value.trim())) return;
    session.renderQueue.set(el, state);
    scheduleRenderCommit();
  }

  function writeElementTranslation(el, state) {
    const values = state.results.filter((value) => typeof value === 'string' && value.trim());
    if (!values.length) return;
    const node = state.translationEl && state.translationEl.isConnected
      ? state.translationEl
      : (ensureTranslationNode(el, state), state.translationEl);
    if (!node) return;
    node.textContent = values.join(' ');
    node.dataset.state = state.status === 'failed' ? 'error' : state.pending > 0 ? 'loading' : 'done';
    updateTranslationTitle(node, state);
  }

  function updateTranslationTitle(node, state) {
    const providers = Array.from(new Set(state.providers.filter(Boolean)));
    node.title = settings.showOriginal ? state.text
      : '机器翻译' + (providers.length ? ' · ' + providers.map(providerLabel).join(' / ') : '');
    if (providers.length) node.dataset.provider = providers.join(',');
  }

  function updateTranslationDisplay() {
    withMutationPaused(() => {
      for (const el of session.elements) {
        const state = elementStates.get(el);
        const node = state && state.translationEl;
        if (!el.isConnected || !node || !node.isConnected) continue;
        if (settings.translationOnly) node.__etSourceWrapper = wrapSourceContent(el);
        else if (node.__etSourceWrapper) {
          unwrapSourceWrapper(node.__etSourceWrapper);
          node.__etSourceWrapper = null;
        }
        node.dataset.mode = settings.translationOnly ? 'only' : 'bilingual';
        updateTranslationTitle(node, state);
      }
    });
  }

  function finalizeElementIfReady(el, state, deferRender = false) {
    if (state.pending > 0) return;
    const failed = state.failedParts.size > 0;
    state.status = failed ? 'failed' : 'done';
    if (failed) {
      session.failedElements.add(el);
    } else {
      session.failedElements.delete(el);
    }
    if (!deferRender) renderElement(el, state);
  }

  function enqueueElement(el) {
    if (!session.active || !el || !el.isConnected) return;
    if (el.closest('.et-translation,#' + HOST_ID)) return;
    const previous = elementStates.get(el);
    if (previous && ['queued', 'active', 'done', 'paused'].includes(previous.status)) {
      return;
    }

    const text = getSourceText(el);
    if (!isWorthTranslating(text, el)) return;
    const chunks = splitText(text, MAX_BLOCK_CHARS);
    if (!chunks.length) return;

    if (previous && previous.translationEl) removeTranslationNode(previous.translationEl);

    const state = {
      text,
      chunks,
      results: new Array(chunks.length),
      providers: new Array(chunks.length),
      targetLang: settings.targetLang,
      scope: cacheScope(),
      layout: null,
      failedParts: new Set(),
      status: 'queued',
      generation: session.generation,
      pending: 0,
      translationEl: null,
    };
    elementStates.set(el, state);
    session.elements.add(el);

    for (let index = 0; index < chunks.length; index += 1) {
      const cached = cacheGet(state.targetLang, chunks[index], state.scope);
      if (cached) {
        state.results[index] = cached.translation;
        state.providers[index] = cached.provider;
        lastProvider = cached.provider || lastProvider;
        session.stats.total += 1;
        session.stats.done += 1;
        continue;
      }
      state.pending += 1;
      session.stats.total += 1;
      session.queue.push({
        el,
        text: chunks[index],
        partIndex: index,
        generation: session.generation,
        state,
      });
    }

    if (state.pending === 0) {
      state.status = 'done';
      renderElement(el, state);
      pushStatusProgress();
      syncUi();
      return;
    }
    renderElement(el, state);
    pushStatusProgress();
    schedulePump();
  }

  function markJobFailed(job, err, deferRender = false) {
    const state = elementStates.get(job.el);
    if (!state || state !== job.state || state.generation !== job.generation) return;
    if (state.results[job.partIndex] !== undefined || state.failedParts.has(job.partIndex)) return;
    state.failedParts.add(job.partIndex);
    state.pending = Math.max(0, state.pending - 1);
    session.stats.failed += 1;
    session.failedElements.add(job.el);
    finalizeElementIfReady(job.el, state, deferRender);
    logWarn('段落翻译失败', err && err.kind, err && err.message);
  }

  function applyJobResult(job, translation, providerName, snapshot, deferRender = false) {
    if (!session.active || job.generation !== session.generation) return;
    if (!job.el.isConnected) return;
    const state = elementStates.get(job.el);
    if (!state || state !== job.state || state.generation !== job.generation) return;
    if (state.results[job.partIndex] !== undefined) return;

    const currentText = snapshot === undefined ? getSourceText(job.el) : snapshot;
    if (currentText !== state.text) {
      removeTranslationNode(state.translationEl);
      session.renderQueue.delete(job.el);
      elementStates.delete(job.el);
      session.elements.delete(job.el);
      observed.delete(job.el);
      if (bumpChangeGuard(job.el)) {
        enqueueElement(job.el);
      } else {
        state.status = 'paused';
        elementStates.set(job.el, state);
        session.failedElements.add(job.el);
        reportStatus({ kind: 'error', message: '页面内容频繁变化，已暂停自动重译此段' });
        syncUi();
      }
      return;
    }

    state.results[job.partIndex] = translation;
    state.providers[job.partIndex] = providerName;
    state.pending = Math.max(0, state.pending - 1);
    lastProvider = providerName || lastProvider;
    session.stats.done += 1;
    cacheSet(state.targetLang, job.text, translation, providerName, state.scope);
    finalizeElementIfReady(job.el, state, deferRender);
    pushStatusProgress();
  }

  function pruneQueue() {
    session.queue = session.queue.filter((job) => {
      if (!session.active || job.generation !== session.generation) return false;
      if (!job.el.isConnected) return false;
      const state = elementStates.get(job.el);
      if (!state || state !== job.state || state.generation !== job.generation) return false;
      if (state.results[job.partIndex] !== undefined) return false;
      if (state.failedParts.has(job.partIndex)) return false;
      return true;
    });
  }

  function pickBatch() {
    const order = getProviderOrder();
    const provider = order.find((name) => !isCooling(name));
    if (!provider) {
      const firstCooling = order[0];
      reportStatus({
        kind: 'error',
        message: firstCooling ? cooldownMessage(firstCooling) : '翻译接口暂不可用，稍后自动重试',
      });
      syncUi();
      scheduleRenderCommit(true);
      schedulePump(15000);
      return null;
    }

    const limits = providerBatchLimits(provider);
    const maxJobs = Math.max(256, limits.items);
    const selected = [];
    const selectedSet = new Set();
    const texts = new Set();
    let chars = 0;

    for (const job of session.queue) {
      if (selected.length >= maxJobs) break;
      const state = elementStates.get(job.el);
      if (!state || state.status === 'done') continue;
      const isNewText = !texts.has(job.text);
      if (isNewText && (texts.size >= limits.items || chars + job.text.length > limits.chars)) continue;
      selected.push(job);
      selectedSet.add(job);
      if (isNewText) {
        texts.add(job.text);
        chars += job.text.length;
      }
    }

    if (!selected.length) return null;
    session.queue = session.queue.filter((job) => !selectedSet.has(job));
    for (const job of selected) {
      const state = elementStates.get(job.el);
      if (state) state.status = 'active';
    }
    return { jobs: selected, provider, texts: Array.from(texts) };
  }

  async function processBatch(batch) {
    const generation = batch.jobs[0].generation;
    const targetLang = batch.jobs[0].state.targetLang;
    const scope = batch.jobs[0].state.scope;
    const signal = session.controller.signal;
    const pendingMap = session.pendingTexts;
    const owners = [];
    const promises = batch.texts.map(text => {
      const cached = cacheGet(targetLang, text, scope);
      if (cached) return Promise.resolve(cached);
      const key = cacheKey(targetLang, text, scope);
      let entry = pendingMap.get(key);
      if (!entry) {
        entry = { text, key };
        entry.promise = new Promise((resolve, reject) => { entry.resolve = resolve; entry.reject = reject; });
        pendingMap.set(key, entry);
        owners.push(entry);
      }
      return entry.promise;
    });
    if (owners.length) {
      translateTexts(owners.map(entry => entry.text), targetLang, 'page', { signal })
        .then(result => {
          owners.forEach((entry, index) => entry.resolve({
            translation: result.translations[index], provider: result.provider,
          }));
        }, error => owners.forEach(entry => entry.reject(error)))
        .finally(() => {
          for (const entry of owners) if (pendingMap.get(entry.key) === entry) pendingMap.delete(entry.key);
        });
    }
    const outcomes = await Promise.allSettled(promises);
    if (!session.active || signal.aborted || generation !== session.generation) return;
    const indexed = new Map(batch.texts.map((text, index) => [text, outcomes[index]]));
    const snapshots = new Map();
    const render = new Set();
    // Read each element's source once before applying this batch's results.
    for (const job of batch.jobs) {
      const state = elementStates.get(job.el);
      if (state !== job.state || !job.el.isConnected || snapshots.has(job.el)) continue;
      snapshots.set(job.el, getSourceText(job.el));
    }
    let cooling = false;
    withMutationPaused(() => {
      for (const job of batch.jobs) {
        const outcome = indexed.get(job.text);
        if (outcome.status === 'fulfilled') {
          const result = outcome.value;
          if (typeof result.translation === 'string' && result.translation.trim()) {
            applyJobResult(job, result.translation.trim(), result.provider, snapshots.get(job.el), true);
            render.add(job.el);
          } else {
            markJobFailed(job, new ProviderError('接口返回空译文', 'protocol'), true);
            render.add(job.el);
          }
        } else if (!isAbortError(outcome.reason)) {
          if (outcome.reason.kind === 'cooldown' && elementStates.get(job.el) === job.state) {
            job.state.status = 'queued';
            session.queue.push(job);
            cooling = true;
          } else {
            markJobFailed(job, outcome.reason, true);
            render.add(job.el);
          }
        }
      }
      for (const el of render) {
        const state = elementStates.get(el);
        if (state && state.pending === 0 && el.isConnected) renderElement(el, state);
      }
    });
    if (cooling) {
      scheduleRenderCommit(true);
      schedulePump(15000);
    }
    scheduleRenderCommit();
    pushStatusProgress();
  }

  function pump() {
    if (!session.active || document.hidden) return;
    pruneQueue();
    while (session.active && session.inFlight < PAGE_CONCURRENCY && session.queue.length) {
      const batch = pickBatch();
      if (!batch) break;
      const generation = session.generation;
      session.inFlight += 1;
      session.busy = true;
      processBatch(batch).catch(error => {
        if (generation !== session.generation || !session.active || isAbortError(error)) return;
        for (const job of batch.jobs) markJobFailed(job, error);
        reportStatus({ kind: 'error', message: '翻译失败：' + error.message });
      }).finally(() => {
        if (generation !== session.generation) return;
        session.inFlight = Math.max(0, session.inFlight - 1);
        session.busy = session.inFlight > 0;
        scheduleRenderCommit();
        pushStatusProgress();
        if (session.active && session.queue.length) schedulePump(0);
      });
    }
    scheduleRenderCommit();
    pushStatusProgress();
  }

  function retryFailed() {
    if (!session.active) return;
    const elements = Array.from(session.failedElements);
    session.failedElements.clear();
    session.stats.failed = 0;
    for (const el of elements) {
      if (!el.isConnected) continue;
      const state = elementStates.get(el);
      if (!state) continue;
      removeTranslationNode(state.translationEl);
      elementStates.delete(el);
      changeGuard.delete(el);
      enqueueElement(el);
    }
    reportStatus({ kind: 'working', message: '正在重试失败段落…' });
    syncUi();
    schedulePump(0);
  }

  // ---------------------------------------------------------------------------
  // 启停与生命周期
  // ---------------------------------------------------------------------------

  function startTranslation() {
    if (session.active) return;
    if (getSiteSettings().disabled) {
      reportStatus({ kind: 'error', message: '本网站已被禁用，请先在设置中启用' });
      syncUi();
      return;
    }
    session.active = true;
    session.generation += 1;
    session.controller = new AbortController();
    resetSessionState();
    session.queue = [];
    lastProvider = '';
    ensureIntersectionObserver();
    ensureMutationObserver();
    startUrlWatcher();
    reportStatus({
      kind: 'working',
      message: '正在识别页面段落…',
      provider: '',
      done: 0,
      failed: 0,
      pending: 0,
    });
    syncUi();
    observeCandidates(document);
    pushStatusProgress(settings.fullPage ? '正在翻译整页…' : '正在分析页面规模…');
    schedulePump(0);
  }

  function stopTranslation(reason) {
    if (!session.active) return;
    session.active = false;
    session.generation += 1;
    if (session.controller) session.controller.abort();
    session.controller = null;
    session.queue = [];
    abortPageRequests();
    stopUrlWatcher();
    if (session.io) {
      session.io.disconnect();
      session.io = null;
    }
    if (session.mo) {
      session.mo.disconnect();
      session.mo = null;
    }
    if (session.scanTimer) {
      clearTimeout(session.scanTimer);
      session.scanTimer = 0;
    }
    pendingScanRoots.clear();
    removeAllTranslations();
    resetSessionState();
    observed = new WeakSet();
    reportStatus({
      kind: 'idle',
      message: reason || '已恢复原文',
      provider: lastProvider,
      done: 0,
      failed: 0,
      pending: 0,
    });
    closeSelectionUi();
    syncUi();
  }

  function restartTranslation() {
    if (!session.active) return;
    session.generation += 1;
    if (session.controller) session.controller.abort();
    abortPageRequests();
    if (session.io) {
      session.io.disconnect();
      session.io = null;
    }
    if (session.mo) {
      session.mo.disconnect();
      session.mo = null;
    }
    if (session.scanTimer) clearTimeout(session.scanTimer);
    session.scanTimer = 0;
    removeAllTranslations();
    resetSessionState();
    session.controller = new AbortController();
    pendingScanRoots.clear();
    ensureIntersectionObserver();
    ensureMutationObserver();
    reportStatus({ kind: 'working', message: '页面已切换，正在重新翻译…', done: 0, failed: 0, pending: 0 });
    syncUi();
    observeCandidates(document);
    schedulePump(0);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flushPersistentCache();
    if (!document.hidden && session.active) {
      if (session.scanJobs.length && !session.scanHandle) {
        session.scanHandle = postScanTask(runScanSlice);
      }
      schedulePump(0);
      scheduleRenderCommit();
      for (const name of requestLanes.keys()) drainRequestLane(name);
    }
  });

  window.addEventListener('pagehide', () => {
    flushPersistentCache();
    abortPageRequests();
    if (session.io) session.io.disconnect();
  });

  window.addEventListener('pageshow', (event) => {
    if (!event.persisted || !session.active) return;
    restartTranslation();
  });

  // ---------------------------------------------------------------------------
  // 页面译文样式
  // ---------------------------------------------------------------------------

  function injectPageStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
.et-source-hidden { display: none !important; }
.et-translation {
  display: block !important;
  margin: .35em 0 .55em !important;
  padding: .05em 0 .05em .7em !important;
  border-left: 2px solid rgba(56,132,255,.55) !important;
  font: inherit !important;
  font-size: .95em !important;
  line-height: 1.65 !important;
  color: inherit !important;
  opacity: .94 !important;
  white-space: pre-wrap !important;
  overflow-wrap: anywhere !important;
  text-align: start !important;
}
.et-translation[data-state="error"] { border-left-color: rgba(220,80,80,.75) !important; }
h1 > .et-translation { font-size: .52em !important; font-weight: 500 !important; }
h2 > .et-translation { font-size: .6em !important; font-weight: 500 !important; }
h3 > .et-translation { font-size: .7em !important; font-weight: 500 !important; }
h4 > .et-translation, h5 > .et-translation, h6 > .et-translation { font-size: .82em !important; font-weight: 500 !important; }
.et-translation[data-mode="only"] {
  margin: 0 !important;
  padding: 0 !important;
  border-left: 0 !important;
  font-size: inherit !important;
  line-height: inherit !important;
  text-align: inherit !important;
  opacity: 1 !important;
}
h1 > .et-translation[data-mode="only"],
h2 > .et-translation[data-mode="only"],
h3 > .et-translation[data-mode="only"],
h4 > .et-translation[data-mode="only"],
h5 > .et-translation[data-mode="only"],
h6 > .et-translation[data-mode="only"] {
  font-size: inherit !important;
  font-weight: inherit !important;
  line-height: inherit !important;
}
@media (prefers-color-scheme: dark) {
  .et-translation { border-left-color: rgba(110,160,255,.7) !important; }
}
`;
    (document.head || document.documentElement).appendChild(style);
  }

  // ---------------------------------------------------------------------------
  // 快捷键
  // ---------------------------------------------------------------------------

  function parseShortcut(value) {
    const parts = String(value || '').split('+').map((part) => part.trim()).filter(Boolean);
    if (parts.length < 2) return null;
    const key = parts.pop();
    const mods = { ctrl: false, alt: false, shift: false, meta: false };
    for (const part of parts) {
      const lower = part.toLowerCase();
      if (lower === 'ctrl' || lower === 'control') mods.ctrl = true;
      else if (lower === 'alt' || lower === 'option') mods.alt = true;
      else if (lower === 'shift') mods.shift = true;
      else if (lower === 'meta' || lower === 'cmd' || lower === 'win') mods.meta = true;
      else return null;
    }
    if (!Object.values(mods).some(Boolean)) return null;
    if (!(key.length === 1 || /^f([1-9]|1[0-2])$/i.test(key))) return null;
    const canonicalKey = key.length === 1 ? key.toUpperCase() : key.toUpperCase();
    const labels = [];
    if (mods.ctrl) labels.push('Ctrl');
    if (mods.alt) labels.push('Alt');
    if (mods.shift) labels.push('Shift');
    if (mods.meta) labels.push('Meta');
    labels.push(canonicalKey);
    return {
      key: key.toLowerCase(),
      ctrl: mods.ctrl,
      alt: mods.alt,
      shift: mods.shift,
      meta: mods.meta,
      text: labels.join('+'),
    };
  }

  function matchShortcut(event, value) {
    const shortcut = parseShortcut(value);
    if (!shortcut) return false;
    return (
      event.key.toLowerCase() === shortcut.key &&
      event.ctrlKey === shortcut.ctrl &&
      event.altKey === shortcut.alt &&
      event.shiftKey === shortcut.shift &&
      event.metaKey === shortcut.meta
    );
  }

  function isEditableElement(el) {
    if (!el || !el.tagName) return false;
    const tag = el.tagName.toLowerCase();
    return (
      tag === 'input' ||
      tag === 'textarea' ||
      tag === 'select' ||
      el.isContentEditable === true ||
      el.getAttribute('role') === 'textbox'
    );
  }

  // ---------------------------------------------------------------------------
  // 界面
  // ---------------------------------------------------------------------------

  const UI_CSS = `
:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
.fab, .panel, .sel-btn, .sel-card {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  -webkit-font-smoothing: antialiased;
}
.fab {
  position: fixed; right: 22px; bottom: 96px; left: auto; top: auto;
  width: 48px; height: 48px; padding: 0; margin: 0; border: none; border-radius: 50%;
  background: linear-gradient(145deg, #3b82f6, #1d4ed8);
  color: #fff; cursor: grab; touch-action: none;
  box-shadow: 0 8px 22px rgba(15,23,42,.28), 0 2px 6px rgba(15,23,42,.18);
  display: flex; align-items: center; justify-content: center;
  user-select: none; -webkit-user-select: none; transition: transform .15s ease, box-shadow .15s ease;
  z-index: 3;
}
.fab:hover { transform: translateY(-1px); box-shadow: 0 10px 26px rgba(15,23,42,.32); }
.fab:active { cursor: grabbing; transform: scale(.96); }
.fab:focus-visible { outline: 2px solid #93c5fd; outline-offset: 3px; }
.fab .glyph { font-size: 21px; font-weight: 700; line-height: 1; letter-spacing: -.5px; }
.fab .dot {
  position: absolute; right: 5px; bottom: 5px; width: 9px; height: 9px; border-radius: 50%;
  background: #94a3b8; border: 2px solid #fff;
}
.fab[data-state="busy"] { background: linear-gradient(145deg, #2563eb, #1e3a8a); }
.fab[data-state="busy"]::after {
  content: ""; position: absolute; inset: -3px; border-radius: 50%;
  border: 2px solid rgba(147,197,253,.15); border-top-color: #bfdbfe;
  animation: et-spin .9s linear infinite;
}
.fab[data-state="busy"] .dot { background: #60a5fa; }
.fab[data-state="on"] .dot { background: #22c55e; }
.fab[data-state="error"] .dot { background: #ef4444; }
.fab[data-state="off"] .dot { background: #94a3b8; }
@keyframes et-spin { to { transform: rotate(360deg); } }
.panel {
  position: fixed; width: 330px; max-width: calc(100vw - 20px); max-height: min(76vh, 690px);
  overflow: auto; padding: 14px; border-radius: 16px; z-index: 2;
  color: #172033; background: #ffffff;
  border: 1px solid rgba(148,163,184,.28);
  box-shadow: 0 18px 50px rgba(15,23,42,.24), 0 3px 10px rgba(15,23,42,.12);
  font-size: 13px; line-height: 1.5;
}
.panel-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
.panel-title { font-size: 14px; font-weight: 700; letter-spacing: .1px; }
.panel-version { color: #94a3b8; font-size: 11px; font-weight: 400; margin-left: 4px; }
.icon-btn {
  width: 26px; height: 26px; padding: 0; border: none; border-radius: 8px; cursor: pointer;
  background: transparent; color: #64748b; font-size: 19px; line-height: 1; display: grid; place-items: center;
}
.icon-btn:hover { background: #f1f5f9; color: #0f172a; }
.primary {
  width: 100%; min-height: 38px; padding: 8px 12px; border: none; border-radius: 10px; cursor: pointer;
  background: linear-gradient(135deg, #2563eb, #1d4ed8); color: #fff;
  font-size: 13.5px; font-weight: 600; transition: filter .15s ease, transform .1s ease;
}
.primary:hover { filter: brightness(1.06); }
.primary:active { transform: translateY(1px); }
.primary[data-active="true"] { background: #f1f5f9; color: #334155; border: 1px solid #e2e8f0; }
.status {
  display: flex; align-items: center; gap: 6px; min-height: 28px; padding: 5px 2px 1px;
  color: #64748b; font-size: 12px;
}
.status-dot { width: 7px; height: 7px; border-radius: 50%; background: #94a3b8; flex: 0 0 auto; }
.status[data-kind="working"] .status-dot { background: #3b82f6; animation: et-pulse 1.4s ease-in-out infinite; }
.status[data-kind="done"] .status-dot { background: #22c55e; }
.status[data-kind="error"] .status-dot { background: #ef4444; }
@keyframes et-pulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
.status-text { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.provider-tag {
  flex: 0 0 auto; padding: 1px 6px; border-radius: 99px; font-size: 10.5px;
  color: #475569; background: #f1f5f9; border: 1px solid #e2e8f0;
}
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
.field { display: flex; flex-direction: column; gap: 4px; color: #475569; font-size: 11.5px; }
.field select, .field input {
  width: 100%; height: 31px; padding: 0 7px; border: 1px solid #dbe3ee; border-radius: 8px;
  background: #fff; color: #172033; font: inherit; font-size: 12px; outline: none;
}
.field select:focus, .field input:focus { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,.13); }
.checks { display: flex; flex-direction: column; gap: 7px; margin-top: 10px; padding-top: 10px; border-top: 1px solid #eef2f7; }
.check { display: flex; align-items: center; gap: 7px; color: #334155; font-size: 12.5px; cursor: pointer; }
.check input { width: 14px; height: 14px; margin: 0; accent-color: #2563eb; }
details.more { margin-top: 9px; border-top: 1px solid #eef2f7; padding-top: 8px; }
details.more summary { cursor: pointer; color: #64748b; font-size: 12px; user-select: none; }
details.more[open] summary { margin-bottom: 8px; }
.mini-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 9px; }
.mini-btn {
  min-height: 28px; padding: 4px 9px; border: 1px solid #dbe3ee; border-radius: 8px;
  background: #fff; color: #334155; cursor: pointer; font: inherit; font-size: 11.5px;
}
.mini-btn:hover { background: #f8fafc; border-color: #cbd5e1; }
.mini-btn:disabled { opacity: .45; cursor: default; }
.hint { margin: 10px 0 0; color: #94a3b8; font-size: 10.5px; line-height: 1.5; }
.sel-btn {
  position: fixed; width: 30px; height: 30px; padding: 0; border: none; border-radius: 9px;
  background: #2563eb; color: #fff; font-size: 14px; font-weight: 700;
  box-shadow: 0 5px 14px rgba(15,23,42,.28); cursor: pointer; z-index: 4;
  display: grid; place-items: center;
}
.sel-card {
  position: fixed; width: 330px; max-width: calc(100vw - 20px); max-height: min(50vh, 380px);
  overflow: auto; padding: 12px; border-radius: 14px; z-index: 4;
  color: #172033; background: #fff; border: 1px solid rgba(148,163,184,.3);
  box-shadow: 0 16px 40px rgba(15,23,42,.24), 0 3px 9px rgba(15,23,42,.1);
  font-size: 13px; line-height: 1.6;
}
.sel-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.sel-title { font-size: 12px; font-weight: 700; color: #475569; }
.sel-source { color: #94a3b8; font-size: 11px; line-height: 1.5; margin-bottom: 7px; word-break: break-word; }
.sel-result { color: #172033; white-space: pre-wrap; overflow-wrap: anywhere; }
.sel-result[data-state="error"] { color: #b91c1c; }
.sel-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 9px; padding-top: 8px; border-top: 1px solid #eef2f7; }
.sel-provider { color: #94a3b8; font-size: 10.5px; }
@media (prefers-color-scheme: dark) {
  .panel, .sel-card { color: #e5edf8; background: #151d2b; border-color: rgba(148,163,184,.22); }
  .panel-version, .hint, .sel-source, .sel-provider { color: #7f8ea3; }
  .icon-btn { color: #94a3b8; }
  .icon-btn:hover { background: #1d2838; color: #e2e8f0; }
  .primary[data-active="true"] { background: #1d2838; color: #dbe7f7; border-color: #2a3b50; }
  .status { color: #94a3b8; }
  .provider-tag { color: #a9b8cb; background: #1d2838; border-color: #2a3b50; }
  .field { color: #94a3b8; }
  .field select, .field input { background: #101826; color: #e5edf8; border-color: #2a3b50; }
  .checks, details.more, .sel-foot { border-top-color: #223044; }
  .check { color: #c7d4e4; }
  .mini-btn { color: #c7d4e4; background: #1a2433; border-color: #2a3b50; }
  .mini-btn:hover { background: #223044; }
  .sel-result { color: #e5edf8; }
  .sel-result[data-state="error"] { color: #fca5a5; }
}
`;

  let ui = null;
  let panelOpen = false;
  let selectionText = '';
  let selectionResult = '';
  let selectionAnchor = null;
  let selectionToken = 0;
  let dragState = null;

  function createUi() {
    if (ui) return;
    const host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = [
      'display: block !important',
      'position: fixed !important',
      'left: 0 !important',
      'top: 0 !important',
      'width: 0 !important',
      'height: 0 !important',
      'margin: 0 !important',
      'padding: 0 !important',
      'border: 0 !important',
      'z-index: 2147483646 !important',
    ].join(';');
    // Keep the settings UI isolated from page scripts. The returned reference
    // remains available to PageLingo, while `host.shadowRoot` stays inaccessible
    // to the page and cannot expose the user's DeepL key through DOM inspection.
    const shadow = host.attachShadow({ mode: 'closed' });
    const providerOptions = PROVIDER_OPTIONS.map(
      (item) => `<option value="${item.value}">${item.label}</option>`
    ).join('');
    const targetOptions = Object.entries(TARGETS)
      .map(([value, item]) => `<option value="${value}">${item.label}</option>`)
      .join('');

    shadow.innerHTML = `
<style>${UI_CSS}</style>
<button class="fab" type="button" data-state="off" aria-label="翻译或恢复原文，右键打开设置" aria-expanded="false">
  <span class="glyph">译</span><span class="dot"></span>
</button>
<section class="panel" role="dialog" aria-label="PageLingo 双语网页翻译设置" hidden>
  <div class="panel-head">
    <div class="panel-title">PageLingo<span class="panel-version">v${VERSION}</span></div>
    <button class="icon-btn" type="button" data-role="close" aria-label="关闭">×</button>
  </div>
  <button class="primary" type="button" data-role="toggle">翻译此页</button>
  <div class="status" data-kind="idle" aria-live="polite">
    <span class="status-dot"></span>
    <span class="status-text">就绪</span>
    <span class="provider-tag" hidden></span>
  </div>
  <div class="grid2">
    <label class="field">接口
      <select data-field="provider">${providerOptions}</select>
    </label>
    <label class="field">目标语言
      <select data-field="target">${targetOptions}</select>
    </label>
  </div>
  <div class="checks">
    <label class="check"><input type="checkbox" data-field="autoFallback">接口失败时自动回退</label>
    <label class="check"><input type="checkbox" data-field="allowLowQuality">允许 MyMemory 低质量兜底</label>
    <label class="check"><input type="checkbox" data-field="fullPage">强制整页（含导航/侧栏）</label>
    <label class="check"><input type="checkbox" data-field="translationOnly">仅显示译文（隐藏原文）</label>
    <label class="check"><input type="checkbox" data-field="showOriginal">悬停译文显示原文</label>
    <label class="check"><input type="checkbox" data-field="persistentCache">本地保存译文缓存（7 天）</label>
    <label class="check"><input type="checkbox" data-field="selection">划词翻译</label>
    <label class="check"><input type="checkbox" data-field="siteAuto">本网站自动翻译</label>
    <label class="check"><input type="checkbox" data-field="siteDisabled">禁用本网站</label>
  </div>
  <details class="more" data-role="deepl-box">
    <summary>DeepL 高质量接口（可选）</summary>
    <label class="field">DeepL API Key
      <input type="password" data-field="deeplKey" autocomplete="off" spellcheck="false" placeholder="输入新的 :fx 免费版 Key">
    </label>
    <div class="mini-actions">
      <button class="mini-btn" type="button" data-action="clear-deepl">清除已保存 Key</button>
    </div>
    <p class="hint" data-role="deepl-state">免费版每月约 50 万字符；Key 只保存在脚本管理器本地，不会发送到其他服务。</p>
  </details>
  <details class="more">
    <summary>快捷键与维护</summary>
    <div class="grid2">
      <label class="field">翻译 / 恢复
        <input data-field="shortcutToggle" spellcheck="false" autocomplete="off">
      </label>
      <label class="field">打开面板
        <input data-field="shortcutPanel" spellcheck="false" autocomplete="off">
      </label>
    </div>
    <div class="mini-actions">
      <button class="mini-btn" type="button" data-action="retry">重试失败段落</button>
      <button class="mini-btn" type="button" data-action="clear">清除缓存</button>
      <button class="mini-btn" type="button" data-action="reset-pos">重置按钮位置</button>
    </div>
  </details>
  <p class="hint">页面较小时自动整页翻译；页面过大时只翻译当前屏幕，滚动后继续。勾选“强制整页”可跳过此限制。</p>
  <p class="hint">单击“译”翻译或恢复，右键打开设置。自动模式在接口较慢时尝试另一条免费线路，采用先完成的结果；DeepL 仅在失败后兜底。只发送需要翻译的文本。</p>
</section>
<button class="sel-btn" type="button" hidden aria-label="翻译选中文字">译</button>
<div class="sel-card" role="dialog" aria-label="划词翻译" hidden>
  <div class="sel-head">
    <span class="sel-title">划词翻译</span>
    <button class="icon-btn" type="button" data-role="sel-close" aria-label="关闭">×</button>
  </div>
  <div class="sel-source"></div>
  <div class="sel-result" data-state="loading">翻译中…</div>
  <div class="sel-foot">
    <span class="sel-provider"></span>
    <button class="mini-btn" type="button" data-role="sel-copy" disabled>复制译文</button>
  </div>
</div>
`;

    document.documentElement.appendChild(host);

    ui = {
      host,
      shadow,
      fab: shadow.querySelector('.fab'),
      panel: shadow.querySelector('.panel'),
      toggle: shadow.querySelector('[data-role="toggle"]'),
      close: shadow.querySelector('[data-role="close"]'),
      status: shadow.querySelector('.status'),
      statusText: shadow.querySelector('.status-text'),
      providerTag: shadow.querySelector('.provider-tag'),
      provider: shadow.querySelector('[data-field="provider"]'),
      target: shadow.querySelector('[data-field="target"]'),
      autoFallback: shadow.querySelector('[data-field="autoFallback"]'),
      allowLowQuality: shadow.querySelector('[data-field="allowLowQuality"]'),
      fullPage: shadow.querySelector('[data-field="fullPage"]'),
      translationOnly: shadow.querySelector('[data-field="translationOnly"]'),
      showOriginal: shadow.querySelector('[data-field="showOriginal"]'),
      persistentCache: shadow.querySelector('[data-field="persistentCache"]'),
      deeplBox: shadow.querySelector('[data-role="deepl-box"]'),
      deeplKey: shadow.querySelector('[data-field="deeplKey"]'),
      clearDeepL: shadow.querySelector('[data-action="clear-deepl"]'),
      deeplState: shadow.querySelector('[data-role="deepl-state"]'),
      selection: shadow.querySelector('[data-field="selection"]'),
      siteAuto: shadow.querySelector('[data-field="siteAuto"]'),
      siteDisabled: shadow.querySelector('[data-field="siteDisabled"]'),
      shortcutToggle: shadow.querySelector('[data-field="shortcutToggle"]'),
      shortcutPanel: shadow.querySelector('[data-field="shortcutPanel"]'),
      retry: shadow.querySelector('[data-action="retry"]'),
      clear: shadow.querySelector('[data-action="clear"]'),
      resetPos: shadow.querySelector('[data-action="reset-pos"]'),
      selBtn: shadow.querySelector('.sel-btn'),
      selCard: shadow.querySelector('.sel-card'),
      selSource: shadow.querySelector('.sel-source'),
      selResult: shadow.querySelector('.sel-result'),
      selProvider: shadow.querySelector('.sel-provider'),
      selCopy: shadow.querySelector('[data-role="sel-copy"]'),
      selClose: shadow.querySelector('[data-role="sel-close"]'),
    };

    bindUiEvents();
    applySavedFabPosition();
    syncSettingsToUi();
    updateUi();
  }

  function bindUiEvents() {
    ui.toggle.addEventListener('click', () => toggleTranslation());
    ui.close.addEventListener('click', closePanel);
    ui.fab.addEventListener('pointerdown', onFabPointerDown);
    ui.fab.addEventListener('pointermove', onFabPointerMove);
    ui.fab.addEventListener('pointerup', onFabPointerUp);
    ui.fab.addEventListener('pointercancel', onFabPointerUp);
    ui.fab.addEventListener('click', (event) => {
      if (event.detail === 0) toggleTranslation();
    });
    ui.fab.addEventListener('contextmenu', event => { event.preventDefault(); openPanel(); });

    ui.provider.addEventListener('change', () => {
      const value = ui.provider.value;
      if (!['auto', 'microsoft', 'deepl', 'google', 'mymemory'].includes(value)) return;
      settings.provider = value;
      saveSettings();
      if (value === 'deepl' && !settings.deeplKey) {
        ui.deeplBox.open = true;
        reportStatus({ kind: 'error', message: '请先填写 DeepL API Key；未填写时会回退到其他允许的接口' });
      } else {
        reportStatus({
          kind: session.active ? 'working' : 'idle',
          message: value === 'auto' ? '已切换为自动选择接口' : `已切换接口：${providerLabel(value)}`,
        });
      }
      closeSelectionUi();
      if (session.active) restartTranslation();
      syncUi();
    });

    ui.target.addEventListener('change', () => {
      const value = ui.target.value;
      if (!TARGETS[value]) return;
      settings.targetLang = value;
      saveSettings();
      closeSelectionUi();
      if (session.active) {
        reportStatus({ kind: 'working', message: '目标语言已更改，正在重新翻译…' });
        restartTranslation();
      } else {
        reportStatus({ kind: 'idle', message: `目标语言：${TARGETS[value].label}` });
      }
      updateUi();
    });

    ui.autoFallback.addEventListener('change', () => {
      settings.autoFallback = ui.autoFallback.checked;
      saveSettings();
      reportStatus({
        kind: 'idle',
        message: settings.autoFallback ? '已开启接口自动回退' : '已关闭接口自动回退',
      });
      syncUi();
    });

    ui.allowLowQuality.addEventListener('change', () => {
      settings.allowLowQuality = ui.allowLowQuality.checked;
      saveSettings();
      reportStatus({
        kind: 'idle',
        message: settings.allowLowQuality
          ? '已允许 MyMemory 低质量兜底'
          : '已关闭 MyMemory 自动兜底，质量优先',
      });
      syncUi();
    });

    ui.fullPage.addEventListener('change', () => {
      settings.fullPage = ui.fullPage.checked;
      saveSettings();
      if (session.active) {
        reportStatus({ kind: 'working', message: '覆盖范围已更改，正在重新扫描页面…' });
        restartTranslation();
      } else {
        reportStatus({
          kind: 'idle',
          message: settings.fullPage ? '已开启强制整页模式' : '已恢复自适应范围模式',
        });
        syncUi();
      }
    });

    ui.translationOnly.addEventListener('change', () => {
      settings.translationOnly = ui.translationOnly.checked;
      saveSettings();
      if (session.active) {
        reportStatus({
          kind: 'working',
          message: settings.translationOnly
            ? '已切换为仅译文模式'
            : '已切换为双语模式',
        });
        updateTranslationDisplay();
        pushStatusProgress();
      } else {
        reportStatus({
          kind: 'idle',
          message: settings.translationOnly ? '已开启仅译文模式' : '已切换为双语模式',
        });
        syncUi();
      }
    });

    ui.showOriginal.addEventListener('change', () => {
      settings.showOriginal = ui.showOriginal.checked;
      saveSettings();
      updateTranslationDisplay();
    });

    ui.persistentCache.addEventListener('change', () => {
      settings.persistentCache = ui.persistentCache.checked;
      saveSettings();
      if (settings.persistentCache) scheduleCacheSave();
      else clearCache();
      reportStatus({ kind: session.active ? statusState.kind : 'idle',
        message: settings.persistentCache ? '已开启本地译文缓存，刷新页面可复用' : '已关闭并清除本地译文缓存' });
      syncUi();
    });

    ui.deeplKey.addEventListener('change', applyDeepLKey);
    ui.deeplKey.addEventListener('blur', applyDeepLKey);
    ui.clearDeepL.addEventListener('click', clearDeepLKey);

    ui.selection.addEventListener('change', () => {
      settings.selection = ui.selection.checked;
      saveSettings();
      if (!settings.selection) closeSelectionUi();
      updateUi();
    });

    ui.siteAuto.addEventListener('change', () => {
      patchSiteSettings({ auto: ui.siteAuto.checked });
      if (ui.siteAuto.checked && !getSiteSettings().disabled && !session.active) {
        startTranslation();
      } else {
        reportStatus({
          kind: 'idle',
          message: ui.siteAuto.checked ? '本网站将在打开时自动翻译' : '已关闭本网站自动翻译',
        });
        syncUi();
      }
    });

    ui.siteDisabled.addEventListener('change', () => {
      const disabled = ui.siteDisabled.checked;
      patchSiteSettings({ disabled });
      if (disabled) {
        stopTranslation('本网站已禁用');
      } else {
        reportStatus({ kind: 'idle', message: '已在本站启用翻译' });
        if (getSiteSettings().auto && !session.active) startTranslation();
      }
      updateUi();
    });

    ui.shortcutToggle.addEventListener('change', () => applyShortcutField('toggle'));
    ui.shortcutToggle.addEventListener('blur', () => applyShortcutField('toggle'));
    ui.shortcutPanel.addEventListener('change', () => applyShortcutField('panel'));
    ui.shortcutPanel.addEventListener('blur', () => applyShortcutField('panel'));
    for (const input of [ui.shortcutToggle, ui.shortcutPanel]) {
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          input.blur();
        }
      });
    }

    ui.retry.addEventListener('click', retryFailed);
    ui.clear.addEventListener('click', () => {
      clearCache();
      reportStatus({ kind: 'idle', message: '翻译缓存已清除，已显示的译文不受影响' });
      syncUi();
    });
    ui.resetPos.addEventListener('click', () => {
      settings.position = null;
      saveSettings();
      ui.fab.style.left = '';
      ui.fab.style.top = '';
      ui.fab.style.right = '';
      ui.fab.style.bottom = '';
      if (panelOpen) positionPanel();
    });

    ui.selBtn.addEventListener('pointerdown', (event) => event.preventDefault());
    ui.selBtn.addEventListener('click', openSelectionCard);
    ui.selClose.addEventListener('click', closeSelectionUi);
    ui.selCopy.addEventListener('click', async () => {
      if (!selectionResult) return;
      const ok = await gm.copy(selectionResult);
      ui.selCopy.textContent = ok ? '已复制' : '复制失败';
      window.setTimeout(() => {
        if (ui) ui.selCopy.textContent = '复制译文';
      }, 1400);
    });

    document.addEventListener('pointerdown', onOutsidePointerDown, true);
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('scroll', () => hideSelectionBubble(), true);
  }

  function onOutsidePointerDown(event) {
    if (!ui) return;
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    if (path.includes(ui.host)) return;
    if (panelOpen) closePanel();
    closeSelectionUi();
  }

  function onWindowResize() {
    if (!ui) return;
    clampFabIntoView();
    if (panelOpen) positionPanel();
    if (!ui.selCard.hidden) positionSelectionCard(selectionAnchor);
  }

  function syncSettingsToUi() {
    if (!ui) return;
    ui.provider.value = settings.provider;
    ui.target.value = settings.targetLang;
    ui.autoFallback.checked = settings.autoFallback;
    ui.allowLowQuality.checked = settings.allowLowQuality;
    ui.fullPage.checked = settings.fullPage;
    ui.translationOnly.checked = settings.translationOnly;
    ui.showOriginal.checked = settings.showOriginal;
    ui.persistentCache.checked = settings.persistentCache;
    ui.deeplKey.value = '';
    ui.deeplKey.placeholder = settings.deeplKey
      ? '已配置（输入新的 :fx Key 可替换）'
      : '输入新的 :fx 免费版 Key';
    ui.deeplState.textContent = settings.deeplKey
      ? 'DeepL Key 已配置；为保护安全，已保存 Key 不会回填到网页。'
      : '免费版每月约 50 万字符；Key 只保存在脚本管理器本地，不会发送到其他服务。';
    ui.selection.checked = settings.selection;
    const site = getSiteSettings();
    ui.siteAuto.checked = !!site.auto;
    ui.siteDisabled.checked = !!site.disabled;
    ui.shortcutToggle.value = settings.shortcuts.toggle;
    ui.shortcutPanel.value = settings.shortcuts.panel;
  }

  function updateUi() {
    if (!ui) return;
    const site = getSiteSettings();
    const active = session.active;
    ui.toggle.textContent = active ? '恢复原文' : '翻译此页';
    ui.toggle.dataset.active = String(active);
    ui.status.dataset.kind = statusState.kind || 'idle';
    ui.statusText.textContent = statusState.message || '就绪';
    ui.statusText.title = statusState.message || '';
    if (statusState.provider) {
      ui.providerTag.hidden = false;
      ui.providerTag.textContent = providerLabel(statusState.provider);
    } else {
      ui.providerTag.hidden = true;
      ui.providerTag.textContent = '';
    }

    let fabState = 'off';
    if (active) {
      if (statusState.kind === 'error') fabState = 'error';
      else if (statusState.kind === 'working' || session.queue.length) fabState = 'busy';
      else fabState = 'on';
    }
    ui.fab.dataset.state = fabState;
    ui.fab.hidden = !!site.disabled;
    ui.fab.setAttribute('aria-expanded', String(panelOpen));
    ui.fab.title = site.disabled
      ? '本网站已禁用，按 ' + settings.shortcuts.panel + ' 打开设置'
      : active
        ? `单击恢复原文（${settings.shortcuts.toggle}）；右键打开设置`
        : `单击翻译网页（${settings.shortcuts.toggle}）；右键打开设置`;
    ui.retry.disabled = !active || session.failedElements.size === 0;
    ui.siteAuto.checked = !!site.auto;
    ui.siteDisabled.checked = !!site.disabled;
  }

  function togglePanel() {
    if (!ui) return;
    if (panelOpen) closePanel();
    else openPanel();
  }

  function openPanel() {
    if (!ui) return;
    hideSelectionBubble();
    panelOpen = true;
    syncSettingsToUi();
    ui.panel.hidden = false;
    positionPanel();
    updateUi();
  }

  function closePanel() {
    if (!ui) return;
    panelOpen = false;
    ui.panel.hidden = true;
    updateUi();
  }

  function positionPanel() {
    if (!ui || ui.panel.hidden) return;
    const pad = 10;
    const width = Math.min(330, window.innerWidth - pad * 2);
    ui.panel.style.width = width + 'px';
    const height = ui.panel.offsetHeight;
    const fabRect = ui.fab.getBoundingClientRect();
    const hasFab = !ui.fab.hidden && fabRect.width > 0;
    let left = hasFab ? fabRect.left + fabRect.width / 2 - width / 2 : window.innerWidth - width - pad;
    left = clamp(left, pad, window.innerWidth - width - pad);
    let top;
    if (hasFab) {
      top = fabRect.bottom + 10;
      if (top + height > window.innerHeight - pad) top = fabRect.top - height - 10;
    } else {
      top = 64;
    }
    top = clamp(top, pad, Math.max(pad, window.innerHeight - height - pad));
    ui.panel.style.left = left + 'px';
    ui.panel.style.top = top + 'px';
  }

  function clampFabIntoView() {
    if (!ui || ui.fab.hidden || !settings.position) return;
    const rect = ui.fab.getBoundingClientRect();
    const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
    const maxTop = Math.max(8, window.innerHeight - rect.height - 8);
    const left = clamp(rect.left, 8, maxLeft);
    const top = clamp(rect.top, 8, maxTop);
    ui.fab.style.left = left + 'px';
    ui.fab.style.top = top + 'px';
    ui.fab.style.right = 'auto';
    ui.fab.style.bottom = 'auto';
  }

  function applySavedFabPosition() {
    if (!ui || !settings.position) return;
    const pos = settings.position;
    if (!Number.isFinite(pos.left) || !Number.isFinite(pos.top)) return;
    if (!ui.fab) return;
    const width = 48;
    const height = 48;
    const left = clamp(pos.left, 8, Math.max(8, window.innerWidth - width - 8));
    const top = clamp(pos.top, 8, Math.max(8, window.innerHeight - height - 8));
    ui.fab.style.left = left + 'px';
    ui.fab.style.top = top + 'px';
    ui.fab.style.right = 'auto';
    ui.fab.style.bottom = 'auto';
  }

  function onFabPointerDown(event) {
    if (event.button !== 0) return;
    const rect = ui.fab.getBoundingClientRect();
    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      moved: false,
    };
    try { ui.fab.setPointerCapture(event.pointerId); } catch (err) { /* ignore */ }
    event.preventDefault();
  }

  function onFabPointerMove(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const dx = event.clientX - dragState.startX;
    const dy = event.clientY - dragState.startY;
    if (!dragState.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
    if (!dragState.moved) {
      dragState.moved = true;
      closePanel();
      hideSelectionBubble();
    }
    const left = clamp(event.clientX - dragState.offsetX, 8, window.innerWidth - 56);
    const top = clamp(event.clientY - dragState.offsetY, 8, window.innerHeight - 56);
    ui.fab.style.left = left + 'px';
    ui.fab.style.top = top + 'px';
    ui.fab.style.right = 'auto';
    ui.fab.style.bottom = 'auto';
  }

  function onFabPointerUp(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const moved = dragState.moved;
    dragState = null;
    try { ui.fab.releasePointerCapture(event.pointerId); } catch (err) { /* ignore */ }
    if (event.type === 'pointercancel') return;
    if (moved) {
      const rect = ui.fab.getBoundingClientRect();
      settings.position = { left: rect.left, top: rect.top };
      saveSettings();
    } else {
      toggleTranslation();
    }
  }

  function applyDeepLKey() {
    if (!ui) return;
    const value = ui.deeplKey.value.trim();
    if (!value) return;
    if (!value.endsWith(':fx')) {
      ui.deeplKey.value = '';
      reportStatus({ kind: 'error', message: '只接受以 :fx 结尾的 DeepL 免费版 Key' });
      syncUi();
      return;
    }
    if (value === settings.deeplKey) return;
    settings.deeplKey = value;
    providerStates.deepl = createProviderState();
    saveSettings();
    reportStatus({
      kind: value ? 'idle' : 'error',
      message: value
        ? 'DeepL Key 已保存，切换到 DeepL 即可使用'
        : 'DeepL Key 已清除',
    });
    if (session.active) schedulePump(0);
    syncUi();
  }

  function clearDeepLKey() {
    if (!settings.deeplKey) return;
    settings.deeplKey = '';
    providerStates.deepl = createProviderState();
    saveSettings();
    if (ui) ui.deeplKey.value = '';
    reportStatus({ kind: 'idle', message: 'DeepL Key 已清除' });
    syncUi();
  }

  function applyShortcutField(name) {
    const isToggle = name === 'toggle';
    const input = isToggle ? ui.shortcutToggle : ui.shortcutPanel;
    if (!input) return;
    const parsed = parseShortcut(input.value);
    if (!parsed) {
      reportStatus({ kind: 'error', message: '快捷键格式无效，需包含 Ctrl/Alt 等修饰键，例如 Alt+T' });
      input.value = isToggle ? settings.shortcuts.toggle : settings.shortcuts.panel;
      syncUi();
      return;
    }
    const other = isToggle ? settings.shortcuts.panel : settings.shortcuts.toggle;
    if (parsed.text.toLowerCase() === String(other || '').toLowerCase()) {
      reportStatus({ kind: 'error', message: '两个快捷键不能重复' });
      input.value = isToggle ? settings.shortcuts.toggle : settings.shortcuts.panel;
      syncUi();
      return;
    }
    if (isToggle) settings.shortcuts.toggle = parsed.text;
    else settings.shortcuts.panel = parsed.text;
    saveSettings();
    input.value = parsed.text;
    reportStatus({ kind: 'idle', message: `快捷键已保存：${parsed.text}` });
    updateUi();
  }

  // ---------------------------------------------------------------------------
  // 划词翻译
  // ---------------------------------------------------------------------------

  function getSelectionRangeRect(range) {
    let rect = range.getBoundingClientRect();
    if ((!rect || rect.width === 0) && range.getClientRects && range.getClientRects().length) {
      rect = range.getClientRects()[0];
    }
    return rect && rect.width ? rect : null;
  }

  function handleSelectionEnd(event) {
    if (!ui || !settings.selection || panelOpen) return;
    if (event && typeof event.composedPath === 'function' && event.composedPath().includes(ui.host)) return;
    window.setTimeout(() => {
      if (!ui || !settings.selection || panelOpen || getSiteSettings().disabled) {
        hideSelectionBubble();
        return;
      }
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount) {
        hideSelectionBubble();
        return;
      }
      const text = normalizeText(selection.toString());
      if (!text || text.length > 2000) {
        hideSelectionBubble();
        return;
      }
      const range = selection.getRangeAt(0);
      const node = range.commonAncestorContainer.nodeType === 1
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement;
      if (
        !node ||
        node.closest(
          '#' + HOST_ID + ',.et-translation,input,textarea,select,[contenteditable=""],[contenteditable="true"],[role="textbox"]'
        )
      ) {
        hideSelectionBubble();
        return;
      }
      const rect = getSelectionRangeRect(range);
      if (!rect) {
        hideSelectionBubble();
        return;
      }
      selectionText = text;
      selectionAnchor = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
      showSelectionBubble(rect);
    }, 20);
  }

  function showSelectionBubble(rect) {
    if (!ui) return;
    ui.selCard.hidden = true;
    ui.selBtn.hidden = false;
    const size = 30;
    let left = rect.right + 6;
    let top = rect.top - size - 4;
    if (left + size > window.innerWidth - 8) left = rect.left - size - 6;
    if (top < 8) top = rect.bottom + 6;
    left = clamp(left, 8, window.innerWidth - size - 8);
    top = clamp(top, 8, window.innerHeight - size - 8);
    ui.selBtn.style.left = left + 'px';
    ui.selBtn.style.top = top + 'px';
  }

  function hideSelectionBubble() {
    if (!ui) return;
    ui.selBtn.hidden = true;
  }

  function openSelectionCard() {
    if (!ui || !selectionText) return;
    hideSelectionBubble();
    ui.selSource.textContent = selectionText.length > 160 ? selectionText.slice(0, 160) + '…' : selectionText;
    ui.selResult.textContent = '翻译中…';
    ui.selResult.dataset.state = 'loading';
    ui.selProvider.textContent = '';
    ui.selCopy.disabled = true;
    ui.selCopy.textContent = '复制译文';
    selectionResult = '';
    ui.selCard.hidden = false;
    positionSelectionCard(selectionAnchor);

    const token = ++selectionToken;
    const text = selectionText;
    const selectionScope = cacheScope();
    const cached = cacheGet(settings.targetLang, text, selectionScope);
    if (cached) {
      showSelectionResult(cached.translation, cached.provider ? providerLabel(cached.provider) : '缓存', token);
      return;
    }

    translateTexts([text], settings.targetLang, 'selection')
      .then((result) => {
        if (token !== selectionToken) return;
        const translation = result.translations[0];
        if (!translation) throw new Error('译文为空');
        cacheSet(settings.targetLang, text, translation, result.provider, selectionScope);
        showSelectionResult(translation, providerLabel(result.provider), token);
      })
      .catch((err) => {
        if (token !== selectionToken) return;
        ui.selResult.textContent = '翻译失败：' + (err && err.message ? err.message : '未知错误');
        ui.selResult.dataset.state = 'error';
        ui.selProvider.textContent = '';
        ui.selCopy.disabled = true;
      });
  }

  function showSelectionResult(translation, provider, token) {
    if (!ui || token !== selectionToken) return;
    selectionResult = translation;
    ui.selResult.textContent = translation;
    ui.selResult.dataset.state = 'done';
    ui.selProvider.textContent = provider ? '来自 ' + provider : '';
    ui.selCopy.disabled = false;
    positionSelectionCard(selectionAnchor);
  }

  function positionSelectionCard(anchor) {
    if (!ui || ui.selCard.hidden) return;
    const pad = 10;
    const width = Math.min(330, window.innerWidth - pad * 2);
    ui.selCard.style.width = width + 'px';
    const height = ui.selCard.offsetHeight;
    let left = anchor ? anchor.left : window.innerWidth - width - pad;
    let top = anchor ? anchor.bottom + 10 : 72;
    if (left + width > window.innerWidth - pad) left = window.innerWidth - width - pad;
    if (top + height > window.innerHeight - pad) {
      top = anchor ? anchor.top - height - 10 : window.innerHeight - height - pad;
    }
    left = clamp(left, pad, Math.max(pad, window.innerWidth - width - pad));
    top = clamp(top, pad, Math.max(pad, window.innerHeight - height - pad));
    ui.selCard.style.left = left + 'px';
    ui.selCard.style.top = top + 'px';
  }

  function closeSelectionUi() {
    selectionToken += 1;
    selectionText = '';
    selectionResult = '';
    if (!ui) return;
    ui.selBtn.hidden = true;
    ui.selCard.hidden = true;
  }

  // ---------------------------------------------------------------------------
  // 翻译开关与初始化
  // ---------------------------------------------------------------------------

  function toggleTranslation() {
    if (session.active) {
      stopTranslation('已恢复原文');
      return;
    }
    if (getSiteSettings().disabled) {
      reportStatus({ kind: 'error', message: '本网站已被禁用，请先取消“禁用本网站”' });
      syncUi();
      openPanel();
      return;
    }
    startTranslation();
  }

  function setupKeyboard() {
    document.addEventListener(
      'keydown',
      (event) => {
        if (event.isComposing || event.defaultPrevented) return;
        if (event.key === 'Escape') {
          if (panelOpen) closePanel();
          else if (ui && !ui.selCard.hidden) closeSelectionUi();
          else hideSelectionBubble();
          return;
        }
        if (isEditableElement(event.target) || isEditableElement(document.activeElement)) return;
        if (!ui) return;
        const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
        if (path.includes(ui.host)) return;

        if (matchShortcut(event, settings.shortcuts.toggle)) {
          event.preventDefault();
          toggleTranslation();
          return;
        }
        if (matchShortcut(event, settings.shortcuts.panel)) {
          event.preventDefault();
          togglePanel();
        }
      },
      true
    );
  }

  function setupSelection() {
    document.addEventListener('mouseup', handleSelectionEnd, true);
    document.addEventListener(
      'keyup',
      (event) => {
        if (event.key === 'Escape') return;
        if (!event.shiftKey) return;
        if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        if (isEditableElement(event.target)) return;
        handleSelectionEnd(event);
      },
      true
    );
  }

  function registerMenus() {
    gm.menu('翻译 / 恢复此页', () => toggleTranslation());
    gm.menu('打开翻译设置', () => openPanel());
    gm.menu('切换本网站启用状态', () => {
      const site = getSiteSettings();
      const disabled = !site.disabled;
      patchSiteSettings({ disabled });
      if (disabled) stopTranslation('本网站已禁用');
      else {
        reportStatus({ kind: 'idle', message: '已在本站启用翻译' });
        openPanel();
      }
      updateUi();
    });
    gm.menu('清除翻译缓存', () => {
      clearCache();
      reportStatus({ kind: 'idle', message: '翻译缓存已清除' });
      syncUi();
    });
  }

  function init() {
    loadPersistentCache();
    injectPageStyle();
    createUi();
    onStatus(() => updateUi());
    setupKeyboard();
    setupSelection();
    registerMenus();
    const site = getSiteSettings();
    if (!site.disabled && site.auto) {
      window.setTimeout(() => {
        if (!session.active && !document.hidden) startTranslation();
      }, 0);
    }
    if (document.hidden) {
      const startWhenVisible = () => {
        if (document.hidden) return;
        document.removeEventListener('visibilitychange', startWhenVisible);
        if (getSiteSettings().auto && !getSiteSettings().disabled && !session.active) startTranslation();
      };
      document.addEventListener('visibilitychange', startWhenVisible);
    }
  }

  init();
})();
