const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const { launchBrowser, fixture, paragraphs, start, idle, change, inspect } = require('./browser.cjs');

let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { if (browser) await browser.close(); });

function check(name, html, config, callback) {
  test(name, { timeout: 15000 }, async () => {
    const { page, errors } = await fixture(browser, html, config);
    try {
      await callback(page);
      assert.deepEqual(errors, [], 'Browser errors');
    } finally {
      await page.close();
    }
  });
}

check('bilingual restore preserves links and excludes code, forms and editors',
  '<main><p>Hello <a href="/details">linked world</a>.</p><p>Another readable paragraph.</p>' +
  '<pre>SECRET_CODE</pre><input value="SECRET_INPUT"><div contenteditable="true">SECRET_EDITOR</div></main>',
  {}, async page => {
    const before = await page.locator('main').innerHTML();
    await start(page, 2);
    const result = await inspect(page);
    assert.equal(result.translated, 2);
    assert.ok(!result.calls.flatMap(call => call.texts).some(text => text.includes('SECRET_')));
    await page.evaluate(() => window.__TEST.stopTranslation());
    assert.equal(await page.locator('main').innerHTML(), before);
  });

check('120 offscreen paragraphs are sent in one Microsoft request and shown together',
  paragraphs(120), {}, async page => {
    await start(page, 120);
    const result = await inspect(page);
    assert.equal(result.mode, 'all');
    assert.equal(result.calls.length, 1);
    assert.equal(result.calls[0].texts.length, 120);
    assert.equal(result.translated, 120);
    assert.deepEqual(result.renders.map(render => render.count), [120]);
    assert.ok(await page.locator('#p119 .et-translation').count());
  });

check('multiple responses are held until the whole page can appear in one DOM update',
  paragraphs(150), { mock: { delays: [30, 650] } }, async page => {
    await page.evaluate(() => window.__TEST.startTranslation());
    await page.waitForFunction(() => window.__TEST.session.stats.done >= 128);
    assert.equal(await page.locator('.et-translation').count(), 0);
    await idle(page, 150);
    const result = await inspect(page);
    assert.equal(result.calls.length, 2);
    assert.deepEqual(result.renders.map(render => render.count), [150]);
  });

check('only the current screen of a large document is requested, then scrolling continues',
  paragraphs(400), {}, async page => {
    const visible = await page.evaluate(() => Array.from(document.querySelectorAll('main p')).filter(el => {
      const rect = el.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < innerHeight;
    }).map(el => el.textContent.trim()));
    await start(page, visible.length);
    const first = await inspect(page);
    assert.equal(first.mode, 'viewport');
    const sent = first.calls.flatMap(call => call.texts);
    assert.deepEqual(new Set(sent), new Set(visible));
    assert.equal(await page.locator('#p399 .et-translation').count(), 0);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForFunction(() => !!document.querySelector('#p399 .et-translation'));
    const next = await inspect(page);
    assert.ok(next.translated > first.translated);
    assert.ok(next.translated < 400);
  });

check('opening translation while already near the bottom does not request the top',
  paragraphs(400), {}, async page => {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await start(page);
    const result = await inspect(page);
    assert.equal(result.mode, 'viewport');
    assert.ok(result.calls.flatMap(call => call.texts).some(text => text.startsWith('Paragraph 399:')));
    assert.ok(!result.calls.flatMap(call => call.texts).some(text => text.startsWith('Paragraph 0:')));
  });

check('a large character count selects viewport scope even with few paragraphs',
  paragraphs(30, 'A longer sentence with useful context. '.repeat(60)), {}, async page => {
    await start(page);
    const result = await inspect(page);
    assert.equal(result.mode, 'viewport');
    assert.ok(result.translated > 0 && result.translated < 30);
  });

check('forced whole-page mode remains available for large documents',
  paragraphs(200), { settings: { fullPage: true } }, async page => {
    await start(page, 200);
    const result = await inspect(page);
    assert.equal(result.translated, 200);
    assert.deepEqual(result.renders.map(render => render.count), [200]);
  });

check('a growing page switches to viewport scope before sending new distant content',
  paragraphs(8), {}, async page => {
    await start(page, 8);
    await page.evaluate(() => {
      const container = document.createElement('section');
      container.innerHTML = Array.from({ length: 300 }, (_, index) =>
        `<p id="dynamic${index}">Dynamic paragraph ${index} with readable English.</p>`).join('');
      document.body.appendChild(container);
    });
    await page.waitForFunction(() => window.__TEST.session.scanMode === 'viewport');
    await page.waitForTimeout(500);
    assert.equal(await page.locator('#dynamic299 .et-translation').count(), 0);
  });

check('100 identical paragraphs are deduplicated and rendered in one update',
  '<main>' + '<p>Repeated text from the same document.</p>'.repeat(100) + '</main>', {}, async page => {
    await start(page, 100);
    const result = await inspect(page);
    assert.equal(result.calls.length, 1);
    assert.equal(result.calls[0].texts.length, 1);
    assert.equal(result.translated, 100);
    assert.deepEqual(result.renders.map(render => render.count), [100]);
  });

check('cached and new paragraphs still appear together', paragraphs(2), {}, async page => {
  await start(page, 2);
  await page.evaluate(() => {
    window.__TEST.stopTranslation();
    document.querySelector('main').insertAdjacentHTML('beforeend', '<p>One newly added English paragraph.</p>');
    window.__renders = [];
    window.__TEST.startTranslation();
  });
  await idle(page, 3);
  const result = await inspect(page);
  assert.equal(result.calls.length, 2);
  assert.equal(result.calls[1].texts.length, 1);
  assert.deepEqual(result.renders.map(render => render.count), [3]);
});

check('translation-only mode waits for the complete page before hiding originals',
  paragraphs(150), { settings: { translationOnly: true }, mock: { delays: [30, 550] } }, async page => {
    const before = await page.locator('main').innerHTML();
    await page.evaluate(() => window.__TEST.startTranslation());
    await page.waitForFunction(() => window.__TEST.session.stats.done >= 128);
    assert.equal(await page.locator('.et-source-hidden').count(), 0);
    await idle(page, 150);
    assert.equal(await page.locator('.et-source-hidden').count(), 150);
    await page.evaluate(() => window.__TEST.stopTranslation());
    assert.equal(await page.locator('main').innerHTML(), before);
  });

check('switching language during a request clears old batches and uses the new language',
  paragraphs(150), { mock: { delays: [30, 1500] } }, async page => {
    await page.evaluate(() => window.__TEST.startTranslation());
    await page.waitForFunction(() => window.__TEST.session.stats.done >= 128 && window.__calls.length === 2);
    await change(page, 'target', 'ja');
    await idle(page, 150);
    const result = await inspect(page);
    assert.equal(result.failed, 0);
    assert.equal(result.translated, 150);
    assert.ok(result.translations.every(text => text.startsWith('microsoft/ja::')));
    assert.ok(result.calls.some(call => call.aborted));
    assert.deepEqual(result.renders.map(render => render.count), [150]);
  });

check('stopping with staged results cancels requests and prevents late DOM writes',
  paragraphs(150), { mock: { delays: [30, 1500] } }, async page => {
    const before = await page.locator('main').innerHTML();
    await page.evaluate(() => window.__TEST.startTranslation());
    await page.waitForFunction(() => window.__calls.length === 2);
    await page.evaluate(() => window.__TEST.stopTranslation());
    await page.waitForTimeout(450);
    const result = await inspect(page);
    assert.equal(result.translated, 0);
    assert.equal(result.calls.length, 2);
    assert.ok(result.calls[1].aborted);
    assert.equal(await page.locator('main').innerHTML(), before);
  });

check('stopping during retry backoff prevents another request', paragraphs(1),
  { mock: { networkErrorFirst: true } }, async page => {
    await page.evaluate(() => window.__TEST.startTranslation());
    await page.waitForFunction(() => window.__calls[0]?.endedAt !== null);
    await page.evaluate(() => window.__TEST.stopTranslation());
    await page.waitForTimeout(950);
    assert.equal((await inspect(page)).calls.length, 1);
  });

check('a rejected large payload falls back to smaller requests without losing paragraphs',
  paragraphs(120), { mock: { rejectLarge: true } }, async page => {
    await start(page, 120);
    const result = await inspect(page);
    assert.equal(result.calls[0].texts.length, 120);
    assert.ok(result.calls.slice(1).every(call => call.texts.length <= 32));
    assert.equal(result.translated, 120);
    assert.deepEqual(result.renders.map(render => render.count), [120]);
  });

check('Microsoft to DeepL fallback respects the smaller DeepL batch size', paragraphs(120),
  { settings: { autoFallback: true, deeplKey: 'TEST_ONLY_FAKE_KEY:fx' }, mock: { microsoftDenied: true } },
  async page => {
    await start(page, 120);
    const result = await inspect(page);
    const deepl = result.calls.filter(call => call.provider === 'deepl');
    assert.equal(deepl.length, 3);
    assert.ok(deepl.every(call => call.texts.length <= 50));
    assert.ok(result.translations.every(text => text.startsWith('deepl/')));
    assert.deepEqual(result.renders.map(render => render.count), [120]);
  });

check('a fixed DeepL provider batches 120 paragraphs and displays them together', paragraphs(120),
  { settings: { provider: 'deepl', deeplKey: 'TEST_ONLY_FAKE_KEY:fx' } }, async page => {
    await start(page, 120);
    const result = await inspect(page);
    assert.equal(result.calls.length, 3);
    assert.deepEqual(result.calls.map(call => call.texts.length), [50, 50, 20]);
    assert.deepEqual(result.renders.map(render => render.count), [120]);
  });

check('source changes while results are buffered do not publish stale translations', paragraphs(150),
  { mock: { delays: [30, 850] } }, async page => {
    await page.evaluate(() => window.__TEST.startTranslation());
    await page.waitForFunction(() => window.__TEST.session.stats.done >= 128);
    await page.evaluate(() => { document.getElementById('p0').firstChild.nodeValue = 'Updated English source after the first response.'; });
    await idle(page, 150);
    assert.equal(await page.locator('#p0 .et-translation').textContent(),
      'microsoft/zh-Hans::Updated English source after the first response.');
    assert.deepEqual((await inspect(page)).renders.map(render => render.count), [150]);
  });

check('backgrounding pauses queued requests and foregrounding resumes the complete display', paragraphs(150),
  { mock: { latencyMs: 200 } }, async page => {
    await page.evaluate(() => window.__TEST.startTranslation());
    await page.waitForFunction(() => window.__calls.length === 1);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(500);
    assert.equal((await inspect(page)).calls.length, 1);
    assert.equal(await page.locator('.et-translation').count(), 0);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await idle(page, 150);
    assert.deepEqual((await inspect(page)).renders.map(render => render.count), [150]);
  });

check('permanent failure of one batch still reveals successful translations once',
  paragraphs(150), { mock: { statuses: [200, 400], delays: [30, 500] } }, async page => {
    await page.evaluate(() => window.__TEST.startTranslation());
    await page.waitForFunction(() => window.__TEST.session.stats.failed > 0 && !window.__TEST.session.busy &&
      document.querySelectorAll('.et-translation').length === 128);
    const result = await inspect(page);
    assert.equal(result.calls.length, 2);
    assert.equal(result.failed, 22);
    assert.deepEqual(result.renders.map(render => render.count), [128]);
  });

check('selection requests get priority over a queued page batch', paragraphs(150),
  { mock: { latencyMs: 600 } }, async page => {
    await page.evaluate(() => window.__TEST.startTranslation());
    await page.waitForFunction(() => window.__calls.length === 1);
    await page.evaluate(() => {
      window.__selectionTask = window.__TEST.translateTexts(['Translate my selected sentence.'], 'zh-CN', 'selection');
    });
    await idle(page, 150);
    const result = await inspect(page);
    assert.equal(result.calls[1].texts[0], 'Translate my selected sentence.');
    assert.equal(result.translated, 150);
  });

check('429 is honored without immediately retrying the same provider', paragraphs(1),
  { mock: { statuses: [429], headers: 'Retry-After: 3\r\n' } }, async page => {
    await page.evaluate(() => window.__TEST.startTranslation());
    await page.waitForFunction(() => window.__TEST.session.stats.failed === 1);
    await page.waitForTimeout(500);
    assert.equal((await inspect(page)).calls.length, 1);
    const parsed = await page.evaluate(() => ({
      seconds: window.__TEST.parseRetryAfter('Retry-After: 3\r\n'),
      date: window.__TEST.parseRetryAfter('Retry-After: ' + new Date(Date.now() + 6000).toUTCString()),
    }));
    assert.equal(parsed.seconds, 3000);
    assert.ok(parsed.date > 4000 && parsed.date <= 6000);
  });

check('saved keys are not exposed and only DeepL Free keys are accepted', paragraphs(1),
  { settings: { deeplKey: 'TEST_ONLY_FAKE_KEY:fx' } }, async page => {
    const result = await page.evaluate(() => ({
      shadow: document.getElementById('et-translator-host').shadowRoot,
      input: window.__TEST.getUi().deeplKey.value,
    }));
    assert.deepEqual(result, { shadow: null, input: '' });
    await change(page, 'deeplKey', 'PAID_KEY_SHOULD_NOT_BE_ACCEPTED');
    assert.equal(await page.evaluate(() => window.__TEST.settings.deeplKey), 'TEST_ONLY_FAKE_KEY:fx');
  });

check('switching providers obtains that provider instead of reusing another cache', paragraphs(1),
  {}, async page => {
    await start(page);
    await change(page, 'provider', 'google');
    await page.evaluate(() => { window.__TEST.stopTranslation(); window.__TEST.startTranslation(); });
    await idle(page, 1);
    const result = await inspect(page);
    assert.deepEqual(result.calls.map(call => call.provider), ['microsoft', 'google']);
    assert.ok(result.translations[0].startsWith('google/'));
  });

check('French is translated when English is the target',
  '<p lang="fr">Bonjour le monde, cette page parle de traduction.</p>',
  { settings: { targetLang: 'en' } }, async page => {
    await start(page);
    assert.equal((await inspect(page)).calls[0].target, 'en');
  });

check('Traditional Chinese can be translated into Simplified Chinese',
  '<p lang="zh-Hant">這是一段需要轉換的繁體中文內容。</p>', {}, async page => {
    await start(page);
    assert.equal((await inspect(page)).calls.length, 1);
  });

check('CSS-hidden and aria-hidden content stays out of requests',
  '<p>Hello <span style="display:none">SECRET_HIDDEN</span><span aria-hidden="true">SECRET_ARIA</span> world.</p>',
  {}, async page => {
    await start(page);
    assert.deepEqual((await inspect(page)).calls[0].texts, ['Hello world.']);
  });

check('inline markup dividing a word does not add spaces',
  '<p>A <span>trans</span><span>lator</span> helps readers.</p>', {}, async page => {
    await start(page);
    assert.deepEqual((await inspect(page)).calls[0].texts, ['A translator helps readers.']);
  });

check('text added to an existing empty node is translated',
  '<main><p>Hello world.</p><p id="later"></p></main>', {}, async page => {
    await start(page);
    await page.evaluate(() => { document.getElementById('later').textContent = 'New English content arrived.'; });
    await page.waitForFunction(() => !!document.querySelector('#later .et-translation'));
    assert.equal((await inspect(page)).translated, 2);
  });

check('removing a source child updates its translation',
  '<p id="source">Hello <span id="old">from the old content</span> world.</p>', {}, async page => {
    await start(page);
    await page.evaluate(() => document.getElementById('old').remove());
    await page.waitForFunction(() => window.__calls.length === 2 &&
      document.querySelector('.et-translation')?.textContent === 'microsoft/zh-Hans::Hello world.');
  });

check('removed feed items release translation references', paragraphs(3), {}, async page => {
  await start(page, 3);
  await page.evaluate(() => document.querySelector('main').remove());
  await page.waitForFunction(() => window.__TEST.session.translations.size === 0);
  assert.equal(await page.evaluate(() => window.__TEST.session.renderQueue.size), 0);
});

check('frequently changing content pauses and remains manually retryable', paragraphs(1),
  {}, async page => {
    await start(page);
    for (let index = 1; index <= 5; index++) {
      await page.evaluate(value => { document.getElementById('p0').firstChild.nodeValue = `Changing English content ${value}.`; }, index);
      await page.waitForFunction(value => {
        const state = window.__TEST.getState(document.getElementById('p0'));
        return state && (state.status === 'paused' || (state.text.includes(`content ${value}.`) && state.status === 'done'));
      }, index);
    }
    assert.equal(await page.evaluate(() => window.__TEST.getState(document.getElementById('p0')).status), 'paused');
    assert.ok((await inspect(page)).calls.length <= 4);
    await page.evaluate(() => window.__TEST.getUi().retry.click());
    await page.waitForFunction(() => document.querySelector('.et-translation')?.textContent.includes('content 5.'));
  });
