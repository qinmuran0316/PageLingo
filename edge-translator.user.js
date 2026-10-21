// ==UserScript==
// @name         PageLingo — 双语网页翻译
// @namespace    https://github.com/qinmuran0316/PageLingo
// @version      0.2.0
// @description  PageLingo：用微软 / DeepL / Google / MyMemory 翻译网页，通用文本块识别、双语对照、划词翻译、快捷键
// @author       qinmuran0316
// @license      MIT
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
// @connect      api.deepl.com
// @run-at       document-idle
// @noframes
// ==/UserScript==

(() => {
  'use strict';

  if (window.__EDGE_TRANSLATOR_LOADED__) return;
  window.__EDGE_TRANSLATOR_LOADED__ = true;

  const VERSION = '0.2.0';
  const HOST_ID = 'et-translator-host';
  const STYLE_ID = 'et-page-style';
  const SETTINGS_KEY = 'et:settings:v1';
  const REQUEST_TIMEOUT = 8000;
  const PROVIDER_GAP = 800;
  const MAX_BLOCK_CHARS = 1800;
  const MAX_BATCH_ITEMS = 8;
  const MAX_BATCH_CHARS = 3000;
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
    { value: 'auto', label: '自动选择' },
    { value: 'microsoft', label: '微软（免费推荐）' },
    { value: 'deepl', label: 'DeepL（需 Key）' },
    { value: 'google', label: 'Google' },
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
    schemaVersion: 2,
    provider: 'auto',
    targetLang: 'zh-CN',
    autoFallback: true,
    allowLowQuality: false,
    selection: true,
    fullPage: false,
    deeplKey: '',
    shortcuts: { toggle: 'Alt+T', panel: 'Alt+O' },
    position: null,
    sites: {},
  };

  // ---------------------------------------------------------------------------
  // 基础工具
  // ---------------------------------------------------------------------------

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
      result.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) result.push(rest);
    return result.filter(Boolean);
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
        localStorage.setItem(key, value);
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
    const match = /(?:^|\n)retry-after\s*:\s*(\d+)/i.exec(String(headers || ''));
    if (!match) return 0;
    return clamp(Number(match[1]) * 1000, 0, 5 * 60 * 1000);
  }

  const activeRequests = new Set();
  let activeRequestPurpose = 'page';

  function abortPageRequests() {
    for (const request of Array.from(activeRequests)) {
      if (request.__etPurpose === 'page' && typeof request.abort === 'function') {
        try { request.abort(); } catch (err) { /* ignore */ }
      }
    }
  }

  function gmRequest(options) {
    let handle = null;
    let aborted = false;
    let settled = false;

    const promise = new Promise((resolve, reject) => {
      const api = getRequestApi();
      if (!api) {
        reject(new ProviderError('脚本管理器没有提供跨域请求能力', 'environment'));
        return;
      }

      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        fn(value);
      };

      const failHttp = (response) => {
        const status = Number(response.status) || 0;
        const retryAfter = parseRetryAfter(response.responseHeaders);
        const body = String(response.responseText || '').slice(0, 200);
        finish(
          reject,
          new ProviderError(
            status === 429
              ? '接口限流'
              : status === 456
                ? '接口免费额度已用完'
                : status === 401 || status === 403
                  ? '接口拒绝访问'
                  : `接口请求失败（HTTP ${status || '未知'}）${body ? '：' + body : ''}`,
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
            if (aborted) return;
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
            if (aborted) return;
            finish(reject, new ProviderError('网络请求失败', 'network', 0, 0));
          },
          ontimeout: () => {
            if (aborted) return;
            finish(reject, new ProviderError('请求超时', 'timeout', 0, 0));
          },
          onabort: () => {
            aborted = true;
            const err = new ProviderError('请求已取消', 'abort');
            err.name = 'AbortError';
            finish(reject, err);
          },
        });
      } catch (err) {
        finish(reject, new ProviderError('无法发起跨域请求：' + (err && err.message ? err.message : err), 'environment'));
        return;
      }

      if (aborted && handle && typeof handle.abort === 'function') {
        try { handle.abort(); } catch (err) { /* ignore */ }
      }
    });

    promise.abort = () => {
      aborted = true;
      if (handle && typeof handle.abort === 'function') {
        try { handle.abort(); } catch (err) { /* ignore */ }
      }
    };
    promise.__etPurpose = activeRequestPurpose;
    activeRequests.add(promise);
    const cleanup = () => activeRequests.delete(promise);
    promise.then(cleanup, cleanup);
    return promise;
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
    merged.schemaVersion = 2;
    merged.autoFallback = merged.autoFallback !== false;
    merged.selection = merged.selection !== false;
    merged.allowLowQuality = merged.allowLowQuality === true;
    merged.fullPage = merged.fullPage === true;
    merged.deeplKey = typeof merged.deeplKey === 'string' ? merged.deeplKey.trim() : '';
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
  // 缓存：内存 LRU，键为目标语言 + 原文
  // ---------------------------------------------------------------------------

  const cache = new Map();
  let cacheBytes = 0;

  function cacheKey(targetLang, text) {
    return targetLang + '\u0000' + text;
  }

  function cacheGet(targetLang, text) {
    const key = cacheKey(targetLang, text);
    const value = cache.get(key);
    if (value === undefined) return null;
    cache.delete(key);
    cache.set(key, value);
    return value;
  }

  function cacheSet(targetLang, text, translation) {
    if (!translation) return;
    const key = cacheKey(targetLang, text);
    const size = (key.length + translation.length) * 2 + 48;
    if (cache.has(key)) {
      cacheBytes -= (key.length + (cache.get(key) || '').length) * 2 + 48;
      cache.delete(key);
    }
    cache.set(key, translation);
    cacheBytes += size;
    while (cache.size > CACHE_MAX_ITEMS || cacheBytes > CACHE_MAX_BYTES) {
      const oldest = cache.keys().next();
      if (oldest.done) break;
      const oldKey = oldest.value;
      const oldValue = cache.get(oldKey) || '';
      cache.delete(oldKey);
      cacheBytes -= (oldKey.length + oldValue.length) * 2 + 48;
    }
  }

  function clearCache() {
    cache.clear();
    cacheBytes = 0;
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

  function createProviderState() {
    return {
      lastStart: 0,
      coolingUntil: 0,
      failStreak: 0,
      lastFailAt: 0,
      lastError: '',
      lastOkAt: 0,
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
      const order = ['microsoft'];
      if (!settings.autoFallback) return order;
      if (settings.deeplKey) order.push('deepl');
      order.push('google');
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
    state.failStreak = 0;
    state.lastError = '';
    state.lastOkAt = Date.now();
    state.coolingUntil = 0;
  }

  async function waitProviderGap(name) {
    const state = providerStates[name];
    if (state.coolingUntil > Date.now()) {
      throw new ProviderError(cooldownMessage(name), 'cooldown');
    }
    const wait = state.lastStart + PROVIDER_GAP - Date.now();
    if (wait > 0) await sleep(wait);
    state.lastStart = Date.now();
  }

  async function microsoftTranslate(texts, targetLang) {
    const to = TARGETS[targetLang].microsoft;
    const url =
      'https://edge.microsoft.com/translate/translatetext?from=&to=' +
      encodeURIComponent(to) +
      '&isEnterpriseClient=false';
    const response = await gmRequest({
      method: 'POST',
      url,
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify(texts),
    });
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

  async function mymemoryTranslate(texts, targetLang) {
    const out = [];
    let firstChunk = true;
    for (const text of texts) {
      const chunks = splitText(text, 450);
      let joined = '';
      for (const chunk of chunks) {
        if (!firstChunk) await waitProviderGap('mymemory');
        firstChunk = false;
        const url =
          'https://api.mymemory.translated.net/get?q=' +
          encodeURIComponent(chunk) +
          '&langpair=' +
          encodeURIComponent('autodetect|' + TARGETS[targetLang].mymemory);
        const response = await gmRequest({ method: 'GET', url });
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

  async function googleTranslate(texts, targetLang) {
    const out = [];
    let firstChunk = true;
    for (const text of texts) {
      const chunks = splitText(text, 1200);
      let joined = '';
      for (const chunk of chunks) {
        if (!firstChunk) await waitProviderGap('google');
        firstChunk = false;
        const url =
          'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' +
          encodeURIComponent(TARGETS[targetLang].google) +
          '&dt=t&dj=1&ie=UTF-8&q=' +
          encodeURIComponent(chunk);
        if (url.length > 7800) {
          throw new ProviderError('Google 请求 URL 过长', 'protocol');
        }
        const response = await gmRequest({ method: 'GET', url });
        let data;
        try {
          data = JSON.parse(response.text);
        } catch (err) {
          throw new ProviderError('Google 接口返回了无法解析的数据', 'protocol');
        }
        if (!data || !Array.isArray(data.sentences)) {
          throw new ProviderError('Google 接口返回格式异常', 'protocol');
        }
        const translation = data.sentences
          .map((item) => (item && typeof item.trans === 'string' ? item.trans : ''))
          .join('')
          .trim();
        if (!translation) {
          throw new ProviderError('Google 返回了空译文', 'protocol');
        }
        joined += (joined ? ' ' : '') + translation;
      }
      out.push(joined);
    }
    return out;
  }

  async function deeplTranslate(texts, targetLang) {
    const key = String(settings.deeplKey || '').trim();
    if (!key) {
      throw new ProviderError('请先在设置中填写 DeepL API Key', 'environment');
    }
    const url = key.endsWith(':fx')
      ? 'https://api-free.deepl.com/v2/translate'
      : 'https://api.deepl.com/v2/translate';
    const response = await gmRequest({
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
    });
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

  let providerChain = Promise.resolve();

  function serializeProviderCall(task) {
    const run = providerChain.then(task, task);
    providerChain = run.catch(() => {});
    return run;
  }

  async function requestWithRetry(name, texts, targetLang, budget) {
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (budget.remaining <= 0) break;
      budget.remaining -= 1;
      await waitProviderGap(name);
      try {
        const result = await providerImpl[name](texts, targetLang);
        noteProviderSuccess(name);
        return result;
      } catch (err) {
        lastError = err;
        if (
          isAbortError(err) ||
          err.kind === 'rate' ||
          err.kind === 'denied' ||
          err.kind === 'protocol' ||
          err.kind === 'quota' ||
          err.kind === 'environment' ||
          attempt === 1 ||
          budget.remaining <= 0
        ) {
          throw err;
        }
        await sleep(700 + Math.random() * 500);
      }
    }
    throw lastError || new ProviderError('翻译请求尝试次数已用完', 'budget');
  }

  async function translateTexts(texts, targetLang, purpose) {
    const clean = texts.map((text) => String(text || '').trim());
    if (!clean.length || clean.some((text) => !text)) {
      throw new ProviderError('存在空文本，已取消请求', 'protocol');
    }

    return serializeProviderCall(async () => {
      activeRequestPurpose = purpose === 'selection' ? 'selection' : 'page';
      const order = getProviderOrder();
      const budget = { remaining: 3 };
      let lastError = null;

      for (const name of order) {
        if (budget.remaining <= 0) break;
        if (isCooling(name)) {
          lastError = new ProviderError(cooldownMessage(name), 'cooldown');
          continue;
        }
        try {
          const translations = await requestWithRetry(name, clean, targetLang, budget);
          reportStatus({
            provider: name,
            message: `正在使用 ${providerLabel(name)}`,
            kind: 'working',
          });
          return { translations, provider: name };
        } catch (err) {
          if (isAbortError(err)) throw err;
          lastError = err;
          noteProviderFailure(name, err);
          if (!settings.autoFallback) break;
        }
      }

      if (!lastError) lastError = new ProviderError('没有可用的翻译接口', 'unavailable');
      if (lastError.kind === 'cooldown') throw lastError;
      throw lastError;
    });
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
    io: null,
    mo: null,
    urlTimer: 0,
    retryTimer: 0,
    scanTimer: 0,
    lastRoute: '',
    failedElements: new Set(),
    translations: new Set(),
    stats: { total: 0, done: 0, failed: 0 },
  };

  let elementStates = new WeakMap();
  let observed = new WeakSet();
  let lastProvider = '';
  const pendingScanRoots = new Set();
  const recheckTimers = new WeakMap();
  let changeGuard = new WeakMap();

  function resetSessionState() {
    session.queue = [];
    session.failedElements = new Set();
    session.stats = { total: 0, done: 0, failed: 0 };
    elementStates = new WeakMap();
    observed = new WeakSet();
    changeGuard = new WeakMap();
    if (session.retryTimer) {
      clearTimeout(session.retryTimer);
      session.retryTimer = 0;
    }
  }

  function removeTranslationNode(node) {
    if (!node) return;
    try { node.remove(); } catch (err) { /* ignore */ }
    session.translations.delete(node);
  }

  function removeAllTranslations() {
    for (const node of session.translations) {
      try { node.remove(); } catch (err) { /* ignore */ }
    }
    session.translations.clear();
    for (const el of Array.from(session.failedElements)) {
      const state = elementStates.get(el);
      if (state && state.translationEl) removeTranslationNode(state.translationEl);
    }
  }

  // ---------------------------------------------------------------------------
  // 段落提取
  // ---------------------------------------------------------------------------

  const TEXT_SPACED_TAGS = new Set([
    'A', 'P', 'DIV', 'SECTION', 'ARTICLE', 'MAIN', 'HEADER', 'FOOTER', 'NAV', 'ASIDE',
    'UL', 'OL', 'LI', 'DL', 'DT', 'DD', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH',
    'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'FIGCAPTION', 'CAPTION', 'LABEL',
    'FORM', 'FIELDSET',
  ]);
  const TEXT_SKIP_SELECTOR = [
    '.et-translation',
    'script',
    'style',
    'noscript',
    'template',
    'pre',
    'code',
    'kbd',
    'samp',
    '[hidden]',
    '[aria-hidden="true"]',
    '[translate="no"]',
    '.notranslate',
    '[contenteditable]',
    'button',
    '[role="button"]',
    '[role="tab"]',
    '[role="menuitem"]',
    '[role="menu"]',
    '[role="menubar"]',
    'summary',
    'svg',
    'math',
    'canvas',
    'iframe',
    'object',
    'embed',
    'audio',
    'video',
    'textarea',
    'input',
    'select',
    'option',
  ].join(',');

  function extractNodeText(node) {
    if (node.nodeType === 3) return node.nodeValue || '';
    if (node.nodeType !== 1) return '';
    if (node.matches(TEXT_SKIP_SELECTOR)) return '';
    if (node.tagName === 'BR') return ' ';

    let text = '';
    for (const child of node.childNodes) {
      text += extractNodeText(child);
    }
    if (TEXT_SPACED_TAGS.has(node.tagName)) return ' ' + text + ' ';
    return text;
  }

  function getSourceText(el) {
    return normalizeText(extractNodeText(el));
  }

  function isChromeElement(el) {
    if (settings.fullPage) return false;
    const chrome = el.closest(CHROME_SELECTOR);
    if (!chrome) return false;
    return !chrome.closest('main,article,[role="main"]');
  }

  function isWorthTranslating(text) {
    const value = normalizeText(text);
    if (value.length < 2) return false;

    const letters = value.match(
      /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF\u0590-\u05FF\u0600-\u06FF\u0900-\u097F\u0E00-\u0E7F\u3040-\u30FF\uAC00-\uD7AF\u4E00-\u9FFF]/g
    );
    if (!letters || letters.length < 2) return false;

    const compact = value.replace(/\s+/g, '');
    if (!compact) return false;

    const target = settings.targetLang;
    const cjk = (value.match(/[\u3400-\u9FFF\uF900-\uFAFF]/g) || []).length;
    const kana = (value.match(/[\u3040-\u30FF]/g) || []).length;
    const hangul = (value.match(/[\uAC00-\uD7AF]/g) || []).length;
    const ascii = (value.match(/[A-Za-z]/g) || []).length;

    if (target === 'zh-CN' || target === 'zh-TW') {
      if (cjk >= 4 && cjk / compact.length > 0.55) return false;
    } else if (target === 'ja') {
      if (kana >= 3 && (kana + cjk) / compact.length > 0.6) return false;
    } else if (target === 'ko') {
      if (hangul >= 3 && hangul / compact.length > 0.5) return false;
    } else if (target === 'en') {
      if (ascii >= 4 && ascii / compact.length > 0.75) return false;
    }
    return true;
  }

  function isEligibleTextBlock(el) {
    if (!el || !el.isConnected || !el.tagName) return false;
    if (el === document.body || el === document.documentElement) return false;
    if (el.closest('#' + HOST_ID + ',.et-translation')) return false;
    if (el.closest(SKIP_CLOSEST_SELECTOR) || el.closest(SITE_SKIP_SELECTOR)) return false;
    if (isChromeElement(el)) return false;
    if (el.getAttribute('translate') === 'no') return false;

    const state = elementStates.get(el);
    if (state && (state.status === 'done' || state.status === 'queued' || state.status === 'active')) {
      return false;
    }
    const text = getSourceText(el);
    return isWorthTranslating(text);
  }

  function isBlockLikeDisplay(display) {
    return !!display && display !== 'none' && !INLINE_DISPLAYS.has(display);
  }

  function isInlineBoxDisplay(display) {
    return (
      display === 'inline-block' ||
      display === 'inline-flex' ||
      display === 'inline-grid' ||
      display === 'inline-table'
    );
  }

  function hasDirectText(el) {
    for (const node of el.childNodes) {
      if (node.nodeType === 3 && normalizeText(node.nodeValue)) return true;
    }
    return false;
  }

  function collectCandidates(root) {
    const found = new Set();
    const base = root && root.nodeType === 9 ? (root.body || root.documentElement) : root;
    if (!base || !base.isConnected || base.nodeType !== 1) return [];
    if (base.closest('#' + HOST_ID + ',.et-translation')) return [];

    const displayCache = new WeakMap();
    const getStyle = (el) => {
      let style = displayCache.get(el);
      if (!style) {
        try {
          style = getComputedStyle(el);
        } catch (err) {
          style = null;
        }
        displayCache.set(el, style);
      }
      return style;
    };
    const isHidden = (style) =>
      !style ||
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.visibility === 'collapse';
    const isSkippedNode = (el) =>
      el.matches(SKIP_CLOSEST_SELECTOR) || !!el.closest(SITE_SKIP_SELECTOR);

    const visit = (el) => {
      if (!el.isConnected || isSkippedNode(el)) return;
      const style = getStyle(el);
      if (isHidden(style)) return;

      if (INLINE_DISPLAYS.has(style.display)) {
        for (const child of el.children) visit(child);
        return;
      }

      const flowText = TEXT_FLOW_TAGS.has(el.tagName);
      const directText = hasDirectText(el);
      const blockChildren = [];
      for (const child of el.children) {
        if (isSkippedNode(child)) continue;
        const childStyle = getStyle(child);
        if (isHidden(childStyle)) continue;
        if (childStyle.display === 'contents') {
          if (normalizeText(child.textContent)) blockChildren.push(child);
          continue;
        }
        if (!isBlockLikeDisplay(childStyle.display)) continue;
        if (isInlineBoxDisplay(childStyle.display) && (flowText || directText)) continue;
        if (!normalizeText(child.textContent)) continue;
        blockChildren.push(child);
      }

      if (!blockChildren.length) {
        if (isEligibleTextBlock(el)) found.add(el);
        return;
      }

      if (
        directText &&
        (flowText || (blockChildren.length <= 2 && normalizeText(el.textContent).length <= 260))
      ) {
        if (isEligibleTextBlock(el)) found.add(el);
        return;
      }

      const blockSet = new Set(blockChildren);
      for (const child of blockChildren) visit(child);
      for (const child of el.children) {
        if (blockSet.has(child)) continue;
        const childStyle = getStyle(child);
        if (childStyle && childStyle.display === 'contents') visit(child);
      }
    };

    visit(base);
    return Array.from(found);
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
      { root: null, rootMargin: '700px 0px 700px 0px', threshold: 0.01 }
    );
  }

  function observeCandidates(root) {
    if (!session.active) return;
    ensureIntersectionObserver();
    const candidates = collectCandidates(root);
    for (const el of candidates) {
      if (!session.active) return;
      if (observed.has(el)) continue;
      const state = elementStates.get(el);
      if (state && (state.status === 'done' || state.status === 'queued' || state.status === 'active')) {
        continue;
      }
      observed.add(el);
      if (session.io) session.io.observe(el);
      else enqueueElement(el);
    }
  }

  // ---------------------------------------------------------------------------
  // 动态页面与 SPA
  // ---------------------------------------------------------------------------

  function isOwnNode(node) {
    if (!node) return false;
    if (node.nodeType !== 1) return false;
    if (node.id === HOST_ID) return true;
    if (node.classList && node.classList.contains('et-translation')) return true;
    if (node.closest && node.closest('#' + HOST_ID + ',.et-translation')) return true;
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
    }, 350);
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
    const timer = window.setTimeout(() => {
      recheckTimers.delete(el);
      if (!session.active || !el.isConnected) return;
      const state = elementStates.get(el);
      if (!state || state.status === 'queued' || state.status === 'active') return;
      const text = getSourceText(el);
      if (normalizeText(text) === state.text) return;

      if (!bumpChangeGuard(el)) {
        reportStatus({ kind: 'error', message: '页面内容频繁变化，已暂停自动重译此段' });
        syncUi();
        return;
      }

      removeTranslationNode(state.translationEl);
      elementStates.delete(el);
      enqueueElement(el);
    }, 800);
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

  function handleMutations(records) {
    if (!session.active) return;
    for (const record of records) {
      if (record.type === 'childList') {
        for (const node of record.addedNodes) {
          if (node.nodeType !== 1 || isOwnNode(node)) continue;
          pendingScanRoots.add(node);
          const parentCandidate = findStatefulAncestor(node.parentElement);
          if (parentCandidate) scheduleRecheck(parentCandidate);
        }
      } else if (record.type === 'characterData') {
        const parent = record.target && record.target.parentElement;
        if (!parent || parent.closest('.et-translation,#' + HOST_ID)) continue;
        const el = findStatefulAncestor(parent);
        if (el) scheduleRecheck(el);
      }
    }
    if (pendingScanRoots.size) scheduleScan();
  }

  function ensureMutationObserver() {
    if (session.mo || !document.body || typeof MutationObserver !== 'function') return;
    session.mo = new MutationObserver(handleMutations);
    session.mo.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
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

  function pushStatusProgress(extraMessage) {
    const pending = session.queue.length;
    const message =
      extraMessage ||
      (pending > 0
        ? `正在翻译… 已完成 ${session.stats.done} 段`
        : `已翻译 ${session.stats.done} 段${session.stats.failed ? `，失败 ${session.stats.failed} 段` : ''}`);
    reportStatus({
      message,
      provider: lastProvider,
      done: session.stats.done,
      failed: session.stats.failed,
      pending,
      kind: session.stats.failed ? 'error' : pending ? 'working' : 'done',
    });
    syncUi();
  }

  function schedulePump(delay) {
    if (!session.active) return;
    if (session.retryTimer) return;
    session.retryTimer = window.setTimeout(() => {
      session.retryTimer = 0;
      if (!session.active) return;
      pump();
    }, delay || 0);
  }

  function ensureTranslationNode(el, state) {
    if (state.translationEl && state.translationEl.isConnected) return;
    const node = document.createElement('span');
    node.className = 'et-translation';
    node.lang = settings.targetLang;
    node.dir = 'auto';
    node.dataset.et = 'translation';
    node.dataset.state = 'loading';

    const style = getComputedStyle(el);
    const parent = el.parentElement;
    const parentStyle = parent ? getComputedStyle(parent) : null;
    const isFlex = style.display.includes('flex');
    const isGrid = style.display.includes('grid');
    const parentIsLayout =
      parentStyle && (parentStyle.display.includes('flex') || parentStyle.display.includes('grid'));
    const keepInside = el.matches('td,th,li') || !parent || parentIsLayout;

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
          const direction = style.flexDirection || 'row';
          if (!direction.startsWith('column')) node.style.flexBasis = '100%';
        }
      }
    }

    state.translationEl = node;
    session.translations.add(node);
  }

  function renderElement(el, state) {
    const values = state.results.filter((value) => typeof value === 'string' && value.trim());
    if (!values.length) return;
    const node = state.translationEl && state.translationEl.isConnected
      ? state.translationEl
      : (ensureTranslationNode(el, state), state.translationEl);
    if (!node) return;
    node.textContent = values.join(' ');
    node.dataset.state = state.status === 'failed' ? 'error' : state.pending > 0 ? 'loading' : 'done';
    node.title = `机器翻译${lastProvider ? ' · ' + providerLabel(lastProvider) : ''}`;
    if (lastProvider) node.dataset.provider = lastProvider;
  }

  function finalizeElementIfReady(el, state) {
    if (state.pending > 0) return;
    const failed = state.failedParts.size > 0;
    state.status = failed ? 'failed' : 'done';
    if (failed) {
      session.failedElements.add(el);
    } else {
      session.failedElements.delete(el);
      changeGuard.delete(el);
    }
    renderElement(el, state);
  }

  function enqueueElement(el) {
    if (!session.active || !el || !el.isConnected) return;
    if (el.closest('.et-translation,#' + HOST_ID)) return;
    const previous = elementStates.get(el);
    if (previous && (previous.status === 'queued' || previous.status === 'active' || previous.status === 'done')) {
      return;
    }

    const text = getSourceText(el);
    if (!isWorthTranslating(text)) return;
    const chunks = splitText(text, MAX_BLOCK_CHARS);
    if (!chunks.length) return;

    if (previous && previous.translationEl) removeTranslationNode(previous.translationEl);

    const state = {
      text,
      chunks,
      results: new Array(chunks.length),
      failedParts: new Set(),
      status: 'queued',
      generation: session.generation,
      pending: 0,
      translationEl: null,
    };
    elementStates.set(el, state);

    for (let index = 0; index < chunks.length; index += 1) {
      const cached = cacheGet(settings.targetLang, chunks[index]);
      if (cached) {
        state.results[index] = cached;
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
    schedulePump(0);
  }

  function markJobFailed(job, err) {
    const state = elementStates.get(job.el);
    if (!state || state.generation !== job.generation) return;
    if (state.results[job.partIndex] !== undefined) return;
    state.failedParts.add(job.partIndex);
    state.pending = Math.max(0, state.pending - 1);
    session.stats.failed += 1;
    session.failedElements.add(job.el);
    finalizeElementIfReady(job.el, state);
    logWarn('段落翻译失败', err && err.kind, err && err.message);
  }

  function applyJobResult(job, translation, providerName) {
    if (!session.active || job.generation !== session.generation) return;
    if (!job.el.isConnected) return;
    const state = elementStates.get(job.el);
    if (!state || state.generation !== job.generation) return;
    if (state.results[job.partIndex] !== undefined) return;

    const currentText = getSourceText(job.el);
    if (currentText !== state.text) {
      removeTranslationNode(state.translationEl);
      elementStates.delete(job.el);
      if (bumpChangeGuard(job.el)) {
        enqueueElement(job.el);
      } else {
        reportStatus({ kind: 'error', message: '页面内容频繁变化，已暂停自动重译此段' });
        syncUi();
      }
      return;
    }

    state.results[job.partIndex] = translation;
    state.pending = Math.max(0, state.pending - 1);
    lastProvider = providerName || lastProvider;
    session.stats.done += 1;
    cacheSet(settings.targetLang, job.text, translation);
    finalizeElementIfReady(job.el, state);
    pushStatusProgress();
  }

  function pruneQueue() {
    session.queue = session.queue.filter((job) => {
      if (!session.active || job.generation !== session.generation) return false;
      if (!job.el.isConnected) return false;
      const state = elementStates.get(job.el);
      if (!state || state.generation !== job.generation) return false;
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
      schedulePump(15000);
      return null;
    }

    const supportsBatch = provider === 'microsoft' || provider === 'deepl';
    const maxTexts = supportsBatch ? MAX_BATCH_ITEMS : 1;
    const maxJobs = supportsBatch ? 24 : 1;
    const selected = [];
    const selectedSet = new Set();
    const texts = new Set();
    let chars = 0;

    for (const job of session.queue) {
      if (selected.length >= maxJobs) break;
      const state = elementStates.get(job.el);
      if (!state || state.status === 'done') continue;
      const isNewText = !texts.has(job.text);
      if (isNewText && (texts.size >= maxTexts || chars + job.text.length > MAX_BATCH_CHARS)) continue;
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
    const uniqueTexts = batch.texts;
    let result;
    try {
      result = await translateTexts(uniqueTexts, settings.targetLang);
    } catch (err) {
      if (!session.active) return;
      if (isAbortError(err)) return;
      if (err.kind === 'cooldown') {
        for (const job of batch.jobs) {
          const state = elementStates.get(job.el);
          if (state) state.status = 'queued';
        }
        session.queue.unshift(...batch.jobs);
        reportStatus({ kind: 'error', message: err.message || '接口冷却中，稍后重试' });
        syncUi();
        schedulePump(15000);
        return;
      }
      for (const job of batch.jobs) markJobFailed(job, err);
      reportStatus({
        kind: 'error',
        message: `翻译失败：${err && err.message ? err.message : '未知错误'}`,
      });
      pushStatusProgress();
      return;
    }

    if (!session.active) return;
    const map = new Map();
    uniqueTexts.forEach((text, index) => {
      map.set(text, result.translations[index]);
    });
    for (const job of batch.jobs) {
      const translation = map.get(job.text);
      if (typeof translation === 'string' && translation.trim()) {
        applyJobResult(job, translation.trim(), result.provider);
      } else {
        markJobFailed(job, new ProviderError('接口返回空译文', 'protocol'));
      }
    }
    lastProvider = result.provider || lastProvider;
    pushStatusProgress();
  }

  async function pump() {
    if (!session.active || session.busy) return;
    if (!document.hidden && !session.queue.length) {
      pushStatusProgress();
      return;
    }
    if (document.hidden) return;

    session.busy = true;
    try {
      while (session.active) {
        pruneQueue();
        if (!session.queue.length) break;
        if (document.hidden) break;
        const batch = pickBatch();
        if (!batch) break;
        await processBatch(batch);
      }
    } finally {
      session.busy = false;
      if (session.active) {
        pushStatusProgress();
        if (session.queue.length) schedulePump(0);
      }
    }
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
    pushStatusProgress('正在翻译可见区域…');
    schedulePump(0);
  }

  function stopTranslation(reason) {
    if (!session.active) return;
    session.active = false;
    session.generation += 1;
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
    session.queue = [];
    abortPageRequests();
    if (session.retryTimer) {
      clearTimeout(session.retryTimer);
      session.retryTimer = 0;
    }
    removeAllTranslations();
    session.failedElements.clear();
    session.stats = { total: 0, done: 0, failed: 0 };
    elementStates = new WeakMap();
    observed = new WeakSet();
    changeGuard = new WeakMap();
    pendingScanRoots.clear();
    ensureIntersectionObserver();
    ensureMutationObserver();
    reportStatus({ kind: 'working', message: '页面已切换，正在重新翻译…', done: 0, failed: 0, pending: 0 });
    syncUi();
    observeCandidates(document);
    schedulePump(0);
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && session.active) schedulePump(0);
  });

  window.addEventListener('pagehide', () => {
    abortPageRequests();
    if (session.io) session.io.disconnect();
  });

  window.addEventListener('pageshow', (event) => {
    if (!event.persisted || !session.active) return;
    observed = new WeakSet();
    ensureIntersectionObserver();
    ensureMutationObserver();
    observeCandidates(document);
    schedulePump(0);
  });

  // ---------------------------------------------------------------------------
  // 页面译文样式
  // ---------------------------------------------------------------------------

  function injectPageStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
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
    const shadow = host.attachShadow({ mode: 'open' });
    const providerOptions = PROVIDER_OPTIONS.map(
      (item) => `<option value="${item.value}">${item.label}</option>`
    ).join('');
    const targetOptions = Object.entries(TARGETS)
      .map(([value, item]) => `<option value="${value}">${item.label}</option>`)
      .join('');

    shadow.innerHTML = `
<style>${UI_CSS}</style>
<button class="fab" type="button" data-state="off" aria-label="PageLingo 网页翻译" aria-expanded="false">
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
    <label class="check"><input type="checkbox" data-field="fullPage">全页模式（含导航/侧栏，实验）</label>
    <label class="check"><input type="checkbox" data-field="selection">划词翻译</label>
    <label class="check"><input type="checkbox" data-field="siteAuto">本网站自动翻译</label>
    <label class="check"><input type="checkbox" data-field="siteDisabled">禁用本网站</label>
  </div>
  <details class="more" data-role="deepl-box">
    <summary>DeepL 高质量接口（可选）</summary>
    <label class="field">DeepL API Key
      <input type="password" data-field="deeplKey" autocomplete="off" spellcheck="false" placeholder="以 :fx 结尾的免费版 Key">
    </label>
    <p class="hint">免费版每月约 50 万字符；Key 只保存在脚本管理器本地，不会发送到其他服务。</p>
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
  <p class="hint">自动顺序：微软 → DeepL（配置 Key 后）→ Google。MyMemory 默认不参与自动兜底。仅发送需要翻译的文本，不上传整页内容。</p>
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
      deeplBox: shadow.querySelector('[data-role="deepl-box"]'),
      deeplKey: shadow.querySelector('[data-field="deeplKey"]'),
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
      if (event.detail === 0) togglePanel();
    });

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
          message: settings.fullPage ? '已开启全页模式' : '已恢复正文模式',
        });
        syncUi();
      }
    });

    ui.deeplKey.addEventListener('change', applyDeepLKey);
    ui.deeplKey.addEventListener('blur', applyDeepLKey);

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
    ui.deeplKey.value = settings.deeplKey;
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
        ? `恢复原文（${settings.shortcuts.toggle}）`
        : `翻译网页（${settings.shortcuts.toggle}）`;
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
    if (moved) {
      const rect = ui.fab.getBoundingClientRect();
      settings.position = { left: rect.left, top: rect.top };
      saveSettings();
    } else {
      togglePanel();
    }
  }

  function applyDeepLKey() {
    if (!ui) return;
    const value = ui.deeplKey.value.trim();
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
    const cached = cacheGet(settings.targetLang, text);
    if (cached) {
      showSelectionResult(cached, '缓存', token);
      return;
    }

    translateTexts([text], settings.targetLang, 'selection')
      .then((result) => {
        if (token !== selectionToken) return;
        const translation = result.translations[0];
        if (!translation) throw new Error('译文为空');
        cacheSet(settings.targetLang, text, translation);
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
      }, 600);
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
