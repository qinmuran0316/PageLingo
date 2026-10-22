const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const { launchBrowser, fixture, paragraphs, start, idle, change, inspect } = require('./browser.cjs');

let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { if (browser) await browser.close(); });

function check(name, html, config, callback) {
  test(name, { timeout: 15000 }, async () => {
    const context = await fixture(browser, html, config);
    const { page, errors } = context;
    try {
      await callback(page, context);
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

check('visible navigation and interactive controls are translated',
  '<header><nav><a href="/home">Home</a><button type="button">Settings</button>' +
  '<span role="tab">Overview</span></nav></header>' +
  '<aside><details open><summary>More options</summary><p>Account preferences</p></details></aside>' +
  '<main><h1>Page title</h1></main>', {}, async page => {
    await start(page, 6);
    const result = await inspect(page);
    const sent = result.calls.flatMap(call => call.texts);
    for (const text of ['Home', 'Settings', 'Overview', 'More options', 'Account preferences', 'Page title']) {
      assert.ok(sent.some(value => value.includes(text)), `missing ${text}`);
    }
    assert.equal(result.translated, 6);
  });

check('inline labels, single letters and loose text around large blocks are all collected',
  'Loose body text.<section id="mixed">Surrounding introduction. ' +
  '<span>Inline sibling label</span><p>' + 'Long English paragraph. '.repeat(20) + '</p>' +
  '<p>Second paragraph.</p><p>Third paragraph.</p>Trailing explanation.</section>' +
  '<nav><span>I</span><span>A</span><span>Docs</span></nav>', {}, async page => {
    const before = await page.locator('body').innerHTML();
    await start(page);
    const sent = (await inspect(page)).calls.flatMap(call => call.texts);
    for (const text of ['Loose body text.', 'Surrounding introduction.', 'Inline sibling label',
      'Trailing explanation.', 'I', 'A', 'Docs']) {
      assert.ok(sent.some(value => value.includes(text)), `missing ${text}`);
    }
    assert.equal((await inspect(page)).calls.length, 1);
    await page.evaluate(() => window.__TEST.stopTranslation());
    assert.equal(await page.locator('body').innerHTML(), before);
  });

check('Chinese page metadata does not suppress foreign or mixed-language text',
  '<main lang="zh-CN"><p>Settings</p><p>高级 Advanced settings</p>' +
  '<p>アカウント設定</p><p>계정 설정</p><p>已经是中文</p></main>', {}, async page => {
    await start(page, 4);
    assert.deepEqual((await inspect(page)).calls[0].texts,
      ['Settings', '高级 Advanced settings', 'アカウント設定', '계정 설정']);
  });

check('English page metadata does not suppress French content when targeting English',
  '<main lang="en"><p>Bonjour tout le monde.</p></main>',
  { settings: { targetLang: 'en' } }, async page => {
    await start(page);
    assert.deepEqual((await inspect(page)).calls[0].texts, ['Bonjour tout le monde.']);
  });

check('tooltips, placeholders, accessible labels and option captions share one text batch',
  '<main><p>Page introduction.</p>' +
  '<input id="search" placeholder="Search repositories" aria-label="Site search" value="PRIVATE_INPUT">' +
  '<input type="password" placeholder="PRIVATE_PASSWORD"><input hidden placeholder="PRIVATE_HIDDEN">' +
  '<input id="submit" type="submit" value="Save changes">' +
  '<textarea id="comment" placeholder="Write a comment">PRIVATE_COMMENT</textarea>' +
  '<img id="photo" alt="Profile picture">' +
  '<a id="help" href="/help" title="Read documentation">Help</a>' +
  '<button id="menu" aria-label="Open menu"><svg width="16" height="16"></svg></button>' +
  '<select id="visibility"><option value="public">Public</option><option>Private</option></select>' +
  '<div contenteditable="true" title="PRIVATE_EDITOR">PRIVATE_EDITOR</div></main>',
  { settings: { translationOnly: true } }, async page => {
    const before = await page.locator('main').innerHTML();
    await start(page);
    const result = await inspect(page);
    assert.equal(result.calls.length, 1);
    assert.ok(!result.calls[0].texts.some(text => text.includes('PRIVATE_')));
    for (const [selector, name, text] of [
      ['#search', 'placeholder', 'Search repositories'], ['#search', 'aria-label', 'Site search'],
      ['#submit', 'value', 'Save changes'], ['#comment', 'placeholder', 'Write a comment'],
      ['#photo', 'alt', 'Profile picture'], ['#help', 'title', 'Read documentation'],
      ['#menu', 'aria-label', 'Open menu'],
    ]) assert.equal(await page.locator(selector).getAttribute(name), `microsoft/zh-Hans::${text}`);
    assert.equal(await page.locator('#search').inputValue(), 'PRIVATE_INPUT');
    assert.equal(await page.locator('#comment').inputValue(), 'PRIVATE_COMMENT');
    assert.deepEqual(await page.locator('option').evaluateAll(options => options.map(option =>
      ({ label: option.label, value: option.value }))), [
      { label: 'microsoft/zh-Hans::Public', value: 'public' },
      { label: 'microsoft/zh-Hans::Private', value: 'Private' },
    ]);
    await page.evaluate(() => window.__TEST.stopTranslation());
    assert.equal(await page.locator('main').innerHTML(), before);
  });

check('repeated attribute and visible text are deduplicated together',
  '<main><button title="Settings" aria-label="Settings">Settings</button>' +
  '<input placeholder="Settings"><input type="submit" value="Settings"></main>', {}, async page => {
    await start(page);
    assert.deepEqual((await inspect(page)).calls[0].texts, ['Settings']);
    assert.equal(await page.locator('input[type="submit"]').inputValue(), 'microsoft/zh-Hans::Settings');
  });

check('dynamic placeholders and newly added tooltips are translated without overwriting site changes',
  '<main><p id="intro">Page introduction.</p><input id="search" placeholder="Search repositories"></main>',
  {}, async page => {
    await start(page);
    await page.evaluate(() => {
      document.getElementById('search').placeholder = 'Search issues';
      document.getElementById('intro').title = 'Updated help';
    });
    await page.waitForFunction(() => document.getElementById('search').placeholder ===
      'microsoft/zh-Hans::Search issues' && document.getElementById('intro').title ===
      'microsoft/zh-Hans::Updated help');
    await page.evaluate(() => window.__TEST.stopTranslation());
    assert.equal(await page.locator('#search').getAttribute('placeholder'), 'Search issues');
    assert.equal(await page.locator('#intro').getAttribute('title'), 'Updated help');
  });

check('attribute results buffered before a site edit never overwrite the newer source',
  '<main><p>Page introduction.</p><input id="search" placeholder="Old search prompt"></main>',
  { mock: { latencyMs: 400 } }, async page => {
    await page.evaluate(() => window.__TEST.startTranslation());
    await page.waitForFunction(() => window.__calls.length === 1);
    await page.evaluate(() => { document.getElementById('search').placeholder = 'New search prompt'; });
    await page.waitForFunction(() => document.getElementById('search').placeholder ===
      'microsoft/zh-Hans::New search prompt');
    await page.evaluate(() => window.__TEST.stopTranslation());
    assert.equal(await page.locator('#search').getAttribute('placeholder'), 'New search prompt');
  });

check('removed and untranslated attributes keep site edits when restoring',
  '<main><p>Page introduction.</p><input id="search" placeholder="Search repositories" title="Search help"></main>',
  {}, async page => {
    await start(page);
    await page.evaluate(() => {
      document.getElementById('search').removeAttribute('placeholder');
      document.getElementById('search').title = 'Latest site help';
      window.__TEST.stopTranslation();
    });
    assert.equal(await page.locator('#search').getAttribute('placeholder'), null);
    assert.equal(await page.locator('#search').getAttribute('title'), 'Latest site help');
  });

check('display and language changes preserve attribute sources and restore correctly',
  '<main><p>Page introduction.</p><input id="search" placeholder="Search repositories"></main>',
  {}, async page => {
    await start(page);
    const calls = (await inspect(page)).calls.length;
    await change(page, 'translationOnly', true);
    await change(page, 'translationOnly', false);
    assert.equal((await inspect(page)).calls.length, calls);
    await change(page, 'target', 'ja');
    await page.waitForFunction(() => document.getElementById('search').placeholder ===
      'microsoft/ja::Search repositories');
    assert.ok(!(await inspect(page)).calls.flatMap(call => call.texts).some(text => text.includes('::')));
    await page.evaluate(() => window.__TEST.stopTranslation());
    assert.equal(await page.locator('#search').getAttribute('placeholder'), 'Search repositories');
  });

check('translation-only navigation preserves icons, click handlers and link destinations',
  '<nav style="display:flex;gap:12px"><a id="docs" href="/docs">Documentation</a>' +
  '<button id="settings" style="display:flex"><svg id="icon" width="16" height="16"></svg>' +
  '<span>Settings</span></button><span role="tab">Overview</span></nav>',
  { settings: { translationOnly: true } }, async page => {
    const before = await page.locator('nav').innerHTML();
    await page.evaluate(() => {
      window.__clicks = 0;
      document.getElementById('settings').addEventListener('click', () => { window.__clicks++; });
    });
    await start(page, 3);
    assert.equal(await page.locator('#icon').isVisible(), true);
    assert.equal(await page.locator('#docs').getAttribute('href'), '/docs');
    assert.equal(await page.locator('#docs > .et-translation').evaluate(el => getComputedStyle(el).display), 'inline');
    await page.locator('#settings').click();
    assert.equal(await page.evaluate(() => window.__clicks), 1);
    await page.evaluate(() => window.__TEST.stopTranslation());
    assert.equal(await page.locator('nav').innerHTML(), before);
  });

check('code and icons inside translated blocks stay visible and restore in order',
  '<main><p id="source">Run <code>npm install</code> before reading this guide.</p>' +
  '<button>Open <svg width="16" height="16"></svg> menu</button></main>',
  { settings: { translationOnly: true } }, async page => {
    const before = await page.locator('main').innerHTML();
    await start(page, 2);
    assert.equal(await page.locator('code').isVisible(), true);
    assert.equal(await page.locator('svg').isVisible(), true);
    assert.ok(!(await inspect(page)).calls.flatMap(call => call.texts).some(text => text.includes('npm install')));
    await page.evaluate(() => window.__TEST.stopTranslation());
    assert.equal(await page.locator('main').innerHTML(), before);
  });

check('opening a closed details menu translates its content once it is visible',
  '<main><p>Page introduction.</p><details id="more"><summary>More options</summary>' +
  '<p id="account">Account preferences</p></details></main>', {}, async page => {
    await start(page, 2);
    assert.ok(!(await inspect(page)).calls.flatMap(call => call.texts).includes('Account preferences'));
    await page.evaluate(() => { document.getElementById('more').open = true; });
    await page.waitForFunction(() => !!document.querySelector('#account .et-translation'));
    assert.equal((await inspect(page)).calls.flatMap(call => call.texts).filter(text =>
      text === 'Account preferences').length, 1);
  });

check('an attribute-only page translates and restores without adding visible text nodes',
  '<input id="search" placeholder="Search repositories"><select><option>Public</option></select>',
  {}, async page => {
    await page.evaluate(() => window.__TEST.startTranslation());
    await page.waitForFunction(() => document.getElementById('search').placeholder ===
      'microsoft/zh-Hans::Search repositories' && document.querySelector('option').label ===
      'microsoft/zh-Hans::Public');
    assert.equal((await inspect(page)).translated, 0);
    assert.equal((await inspect(page)).calls.length, 1);
    await page.evaluate(() => window.__TEST.stopTranslation());
    assert.equal(await page.locator('#search').getAttribute('placeholder'), 'Search repositories');
    assert.equal(await page.locator('option').getAttribute('label'), null);
  });

check('nested hidden or protected attributes never enter a merged text request',
  '<main><p>Read <span style="display:none"><span title="SECRET_TOOLTIP">SECRET_TEXT</span></span>' +
  '<span translate="no" title="SECRET_PROTECTED">PIN</span> this guide.</p>' +
  '<p>Run <span><code>npm install</code></span> before continuing.</p></main>',
  { settings: { translationOnly: true } }, async page => {
    const before = await page.locator('main').innerHTML();
    await start(page, 2);
    assert.ok(!(await inspect(page)).calls.flatMap(call => call.texts).some(text =>
      text.includes('SECRET_') || text.includes('npm install')));
    assert.equal(await page.locator('code').isVisible(), true);
    assert.equal(await page.locator('[translate="no"]').isVisible(), true);
    await page.evaluate(() => window.__TEST.stopTranslation());
    assert.equal(await page.locator('main').innerHTML(), before);
  });

check('updating an option caption translates its label while preserving its new implicit value',
  '<main><p>Page introduction.</p><select><option id="caption">Public</option></select></main>',
  {}, async page => {
    await start(page);
    await page.evaluate(() => { document.getElementById('caption').textContent = 'Private'; });
    await page.waitForFunction(() => document.getElementById('caption').label === 'microsoft/zh-Hans::Private');
    assert.equal(await page.locator('#caption').evaluate(el => el.value), 'Private');
    await page.evaluate(() => window.__TEST.stopTranslation());
    assert.equal(await page.locator('#caption').getAttribute('label'), null);
    assert.equal(await page.locator('#caption').textContent(), 'Private');
  });

check('content added under a CSS-hidden ancestor waits until the ancestor becomes visible',
  '<main><p>Page introduction.</p><div id="hidden" style="display:none"><span id="later"></span></div></main>',
  {}, async page => {
    await start(page);
    await page.evaluate(() => {
      document.getElementById('later').textContent = 'New menu item';
      document.getElementById('later').title = 'New menu tooltip';
    });
    await page.waitForTimeout(400);
    assert.equal((await inspect(page)).calls.length, 1);
    await page.evaluate(() => { document.getElementById('hidden').style.display = 'block'; });
    await page.waitForFunction(() => document.getElementById('later').title ===
      'microsoft/zh-Hans::New menu tooltip' && !!document.querySelector('#hidden .et-translation'));
  });

check('large-page attribute translation follows the same viewport limit as ordinary text',
  paragraphs(170) + '<input id="distant" placeholder="Search distant content">', {}, async page => {
    await start(page);
    assert.equal((await inspect(page)).mode, 'viewport');
    assert.ok(!(await inspect(page)).calls.flatMap(call => call.texts).includes('Search distant content'));
    await page.locator('#distant').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.getElementById('distant').placeholder ===
      'microsoft/zh-Hans::Search distant content');
  });

check('stopping before a delayed attribute response preserves the original prompt',
  '<main><p>Page introduction.</p><input id="search" placeholder="Search repositories"></main>',
  { mock: { latencyMs: 600 } }, async page => {
    await page.evaluate(() => window.__TEST.startTranslation());
    await page.waitForFunction(() => window.__calls.length === 1);
    await page.evaluate(() => window.__TEST.stopTranslation());
    await page.waitForTimeout(700);
    assert.equal(await page.locator('#search').getAttribute('placeholder'), 'Search repositories');
    assert.equal((await inspect(page)).translated, 0);
    assert.equal((await inspect(page)).calls[0].aborted, true);
  });

check('detaching translated controls releases attribute targets and source-run references',
  '<main><p>Page introduction.</p><nav>Menu heading <button title="Settings">Settings</button>' +
  '<input placeholder="Search repositories"></nav></main>', {}, async page => {
    await start(page);
    await page.evaluate(() => document.querySelector('nav').remove());
    await page.waitForFunction(() => window.__TEST.session.attributeTargets.size === 0 &&
      window.__TEST.session.textRuns.size === 0);
    assert.equal(await page.evaluate(() => Array.from(window.__TEST.session.elements).every(el => el.isConnected)), true);
  });

check('changing a submit control into a text field during a request preserves user input',
  '<main><p>Page introduction.</p><input id="control" type="submit" value="Save changes"></main>',
  { mock: { latencyMs: 500 } }, async page => {
    await page.evaluate(() => window.__TEST.startTranslation());
    await page.waitForFunction(() => window.__calls.length === 1);
    await page.evaluate(() => {
      const input = document.getElementById('control');
      input.type = 'text';
      input.value = 'PRIVATE_USER_INPUT';
    });
    await idle(page, 1);
    assert.equal(await page.locator('#control').inputValue(), 'PRIVATE_USER_INPUT');
    assert.equal(await page.locator('#control').getAttribute('value'), 'Save changes');
    assert.ok(!(await inspect(page)).calls.flatMap(call => call.texts).includes('PRIVATE_USER_INPUT'));
  });

check('new translation opt-outs restore attribute hints and can be removed later',
  '<main><p>Page introduction.</p><input id="search" placeholder="Search repositories"></main>',
  {}, async page => {
    await start(page);
    await page.evaluate(() => document.getElementById('search').setAttribute('translate', 'no'));
    await page.waitForFunction(() => document.getElementById('search').placeholder === 'Search repositories');
    const calls = (await inspect(page)).calls.length;
    await page.evaluate(() => {
      document.getElementById('search').placeholder = 'Search issues';
      document.getElementById('search').removeAttribute('translate');
    });
    await page.waitForFunction(() => document.getElementById('search').placeholder ===
      'microsoft/zh-Hans::Search issues');
    assert.equal((await inspect(page)).calls.length, calls + 1);
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

check('Google sends 120 paragraphs in a single POST and displays them together',
  paragraphs(120), { settings: { provider: 'google' } }, async page => {
    await start(page, 120);
    const result = await inspect(page);
    assert.equal(result.calls.length, 1);
    assert.equal(result.calls[0].method, 'POST');
    assert.equal(result.calls[0].texts.length, 120);
    assert.ok(result.translations.every(text => text.startsWith('google/zh-CN::')));
    assert.deepEqual(result.renders.map(render => render.count), [120]);
  });

check('Google batches keep long text and reserved characters intact',
  '<p id="source">' + 'Symbols &amp; plus+equals= hash#question? 中文. '.repeat(30) + '</p>',
  { settings: { provider: 'google' } }, async page => {
    const original = await page.locator('#source').textContent();
    await start(page);
    const result = await inspect(page);
    assert.equal(result.calls.length, 1);
    assert.deepEqual(result.calls[0].texts, [original.trim()]);
  });

check('Google string-array responses are mapped in the original paragraph order',
  paragraphs(4), { settings: { provider: 'google' }, mock: { googleStringArray: true } }, async page => {
    await start(page, 4);
    const result = await inspect(page);
    assert.equal(result.calls.length, 1);
    for (let index = 0; index < 4; index++) assert.ok(result.translations[index].includes(`Paragraph ${index}:`));
  });

check('Google responses across two batches still display as a whole page',
  paragraphs(150), { settings: { provider: 'google' }, mock: { delays: [30, 550] } }, async page => {
    await page.evaluate(() => window.__TEST.startTranslation());
    await page.waitForFunction(() => window.__TEST.session.stats.done >= 128);
    assert.equal(await page.locator('.et-translation').count(), 0);
    await idle(page, 150);
    const result = await inspect(page);
    assert.equal(result.calls.length, 2);
    assert.deepEqual(result.renders.map(render => render.count), [150]);
  });

check('a mismatched Google response falls back without shifting translations',
  paragraphs(120), { settings: { provider: 'google', autoFallback: true }, mock: { googleBadCount: true } }, async page => {
    await start(page, 120);
    const result = await inspect(page);
    assert.deepEqual(result.calls.map(call => call.provider), ['google', 'microsoft']);
    assert.ok(result.translations.every(text => text.startsWith('microsoft/')));
    assert.deepEqual(result.renders.map(render => render.count), [120]);
  });

check('empty Google translations leave the original content visible', paragraphs(3),
  { settings: { provider: 'google', translationOnly: true }, mock: { googleEmptyItem: true } }, async page => {
    await page.evaluate(() => window.__TEST.startTranslation());
    await page.waitForFunction(() => window.__TEST.session.stats.failed === 3);
    assert.equal(await page.locator('.et-translation').count(), 0);
    assert.equal(await page.locator('.et-source-hidden').count(), 0);
  });

check('HTML-looking Google results remain literal text', paragraphs(1),
  { settings: { provider: 'google' }, mock: { googleLiteralHtml: true } }, async page => {
    await start(page);
    assert.equal(await page.locator('.et-translation img').count(), 0);
    assert.equal(await page.locator('.et-translation').textContent(), '<img src=x onerror="alert(1)">');
  });

check('a fast automatic primary does not start a backup request', paragraphs(120),
  { settings: { provider: 'auto', autoFallback: true } }, async page => {
    await start(page, 120);
    await page.waitForTimeout(500);
    assert.deepEqual((await inspect(page)).calls.map(call => call.provider), ['microsoft']);
  });

check('a slow automatic primary is overtaken by one batched backup and canceled', paragraphs(120),
  { settings: { provider: 'auto', autoFallback: true }, mock: { providerLatencies: { microsoft: 1800, google: 40 } } }, async page => {
    await start(page, 120);
    const result = await inspect(page);
    assert.deepEqual(result.calls.map(call => call.provider), ['microsoft', 'google']);
    assert.equal(result.calls[1].texts.length, 120);
    assert.ok(result.calls[0].aborted);
    assert.ok(result.calls[1].at - result.calls[0].at >= 400);
    assert.ok(result.calls[1].at - result.calls[0].at < 1300);
    assert.ok(result.translations.every(text => text.startsWith('google/')));
    assert.deepEqual(result.renders.map(render => render.count), [120]);
  });

check('automatic network failure changes route immediately without retrying the failed primary', paragraphs(2),
  { settings: { provider: 'auto', autoFallback: true }, mock: { microsoftNetworkError: true } }, async page => {
    await start(page, 2);
    const result = await inspect(page);
    assert.deepEqual(result.calls.map(call => call.provider), ['microsoft', 'google']);
    assert.ok(result.calls[1].at - result.calls[0].at < 400);
  });

check('automatic racing never probes DeepL and uses it only after both free routes fail', paragraphs(120),
  { settings: { provider: 'auto', autoFallback: true, deeplKey: 'TEST_ONLY_FAKE_KEY:fx' },
    mock: { microsoftDenied: true, googleBadCount: true } }, async page => {
    await start(page, 120);
    const result = await inspect(page);
    assert.deepEqual(result.calls.map(call => call.provider), ['microsoft', 'google', 'deepl', 'deepl', 'deepl']);
    assert.ok(result.calls[2].at >= result.calls[1].endedAt);
    assert.ok(result.translations.every(text => text.startsWith('deepl/')));
  });

check('the selected manual provider does not start speculative requests', paragraphs(1),
  { settings: { provider: 'microsoft', autoFallback: true }, mock: { latencyMs: 550 } }, async page => {
    await start(page);
    assert.deepEqual((await inspect(page)).calls.map(call => call.provider), ['microsoft']);
  });

check('automatic routing can still shrink a rejected large request', paragraphs(120),
  { settings: { provider: 'auto', autoFallback: true }, mock: { rejectLarge: true } }, async page => {
    await start(page, 120);
    const result = await inspect(page);
    assert.equal(result.failed, 0);
    assert.equal(result.translated, 120);
    assert.ok(result.calls.some(call => call.texts.length <= 32));
    assert.deepEqual(result.renders.map(render => render.count), [120]);
  });

check('the next automatic round starts with the route that just won', paragraphs(2),
  { settings: { provider: 'auto', autoFallback: true }, mock: { providerLatencies: { microsoft: 1600, google: 30 } } }, async page => {
    await start(page, 2);
    await page.evaluate(() => document.querySelector('main').insertAdjacentHTML('beforeend',
      '<p>New readable content after the faster route was selected.</p>'));
    await idle(page, 3);
    assert.deepEqual((await inspect(page)).calls.map(call => call.provider), ['microsoft', 'google', 'google']);
  });

check('stopping automatic work cancels both routes and staged display', paragraphs(120),
  { settings: { provider: 'auto', autoFallback: true }, mock: { providerLatencies: { microsoft: 1800, google: 1000 } } }, async page => {
    await page.evaluate(() => window.__TEST.startTranslation());
    await page.waitForFunction(() => window.__calls.length === 2);
    await page.evaluate(() => window.__TEST.stopTranslation());
    await page.waitForTimeout(150);
    const result = await inspect(page);
    assert.ok(result.calls.every(call => call.aborted));
    assert.equal(result.translated, 0);
  });

check('stopping before the backup timer prevents its request', paragraphs(1),
  { settings: { provider: 'auto', autoFallback: true }, mock: { latencyMs: 1800 } }, async page => {
    await page.evaluate(() => window.__TEST.startTranslation());
    await page.waitForFunction(() => window.__calls.length === 1);
    await page.evaluate(() => window.__TEST.stopTranslation());
    await page.waitForTimeout(600);
    const result = await inspect(page);
    assert.equal(result.calls.length, 1);
    assert.ok(result.calls[0].aborted);
  });

check('reloading a translated page reuses persisted cache with zero requests', paragraphs(120),
  {}, async (page, { reload }) => {
    await start(page, 120);
    await reload();
    await start(page, 120);
    const result = await inspect(page);
    assert.equal(result.calls.length, 0);
    assert.deepEqual(result.renders.map(render => render.count), [120]);
  });

check('disabling persistence leaves no saved translations for reload', paragraphs(2),
  {}, async (page, { reload }) => {
    await start(page, 2);
    await change(page, 'persistentCache', false);
    await reload();
    await start(page, 2);
    assert.equal((await inspect(page)).calls.length, 1);
    assert.equal(await page.evaluate(() => window.__store['et:cache:v1']), undefined);
  });

check('clearing cache also removes saved translations before reload', paragraphs(2),
  {}, async (page, { reload }) => {
    await start(page, 2);
    await page.evaluate(() => window.__TEST.getUi().clear.click());
    await reload();
    await start(page, 2);
    assert.equal((await inspect(page)).calls.length, 1);
  });

check('expired persisted translations are fetched again', paragraphs(2),
  {}, async (page, { reload }) => {
    await start(page, 2);
    await reload(stored => {
      const cache = JSON.parse(stored['et:cache:v1']);
      for (const entry of cache.entries) entry[3] = Date.now() - 1000;
      stored['et:cache:v1'] = JSON.stringify(cache);
      return stored;
    });
    await start(page, 2);
    assert.equal((await inspect(page)).calls.length, 1);
  });

check('corrupt persisted cache does not prevent translation', paragraphs(2),
  { storage: { 'et:cache:v1': '{bad json' } }, async page => {
    await start(page, 2);
    assert.equal((await inspect(page)).calls.length, 1);
  });

check('translation cache never falls back to page localStorage without GM storage', paragraphs(2),
  { mock: { noGMStorage: true } }, async page => {
    await start(page, 2);
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
    assert.equal(await page.evaluate(() => localStorage.getItem('et:cache:v1')), null);
  });

check('display switches reuse existing nodes without scans, requests or generation changes', paragraphs(4),
  {}, async page => {
    await start(page, 4);
    const generation = await page.evaluate(() => window.__TEST.session.generation);
    await change(page, 'translationOnly', true);
    assert.equal(await page.locator('.et-source-hidden').count(), 4);
    await change(page, 'translationOnly', false);
    assert.equal(await page.locator('.et-source-hidden').count(), 0);
    assert.equal((await inspect(page)).calls.length, 1);
    assert.equal(await page.evaluate(() => window.__TEST.session.generation), generation);
    assert.deepEqual((await inspect(page)).renders.map(render => render.count), [4]);
  });

check('switching display during requests preserves work and commits the chosen mode together', paragraphs(150),
  { mock: { latencyMs: 550 } }, async page => {
    await page.evaluate(() => window.__TEST.startTranslation());
    await page.waitForFunction(() => window.__calls.length === 1);
    await change(page, 'translationOnly', true);
    await idle(page, 150);
    const result = await inspect(page);
    assert.equal(result.calls.length, 2);
    assert.ok(result.calls.every(call => !call.aborted));
    assert.equal(await page.locator('.et-source-hidden').count(), 150);
    assert.deepEqual(result.renders.map(render => render.count), [150]);
  });

check('one mouse click translates, right click opens settings, and another click restores', paragraphs(2),
  {}, async page => {
    const rect = await page.evaluate(() => {
      const rect = window.__TEST.getUi().fab.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
    await page.mouse.click(rect.x, rect.y);
    await idle(page, 2);
    await page.mouse.click(rect.x, rect.y, { button: 'right' });
    assert.equal(await page.evaluate(() => window.__TEST.getUi().panel.hidden), false);
    assert.equal((await inspect(page)).calls.length, 1);
    await page.evaluate(() => window.__TEST.getUi().close.click());
    await page.mouse.click(rect.x, rect.y);
    assert.equal(await page.locator('.et-translation').count(), 0);
  });
