const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const { launchBrowser, fixture, paragraphs, idle, inspect } = require('./browser.cjs');

const baselineRef = process.argv[2] || '674b3a0';
const baseline = execFileSync('git', ['show', `${baselineRef}:edge-translator.user.js`], {
  cwd: path.join(__dirname, '..'), encoding: 'utf8',
});
const current = fs.readFileSync(path.join(__dirname, '..', 'edge-translator.user.js'), 'utf8');
const version = source => /@version\s+(\S+)/.exec(source)?.[1] || 'unknown';
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const scenarios = [
  { name: 'google-batch', count: 24, settings: { provider: 'google' }, mock: { latencyMs: 600 } },
  { name: 'auto-slow-primary', count: 120, settings: { provider: 'auto', autoFallback: true },
    mock: { providerLatencies: { microsoft: 2500, google: 150 } } },
  { name: 'microsoft-batch', count: 120, settings: { provider: 'microsoft' }, mock: { latencyMs: 600 } },
  { name: 'reload-cache', count: 120, settings: { provider: 'microsoft' }, mock: { latencyMs: 600 }, reload: true },
];

(async () => {
  const browser = await launchBrowser();
  try {
    const results = [];
    for (const scenario of scenarios) {
      for (let round = 0; round < 3; round++) {
        // Alternate order to avoid always giving one version a warm browser.
        const variants = [
          { label: 'baseline', source: baseline },
          { label: 'current', source: current },
        ];
        if (round % 2) variants.reverse();
        for (const variant of variants) {
          const { page, errors, reload } = await fixture(browser, paragraphs(scenario.count), {
            source: variant.source,
            // Both versions translate the same complete document in a normal viewport.
            settings: { fullPage: true, ...scenario.settings }, mock: scenario.mock,
          });
          try {
            if (scenario.reload) {
              await page.evaluate(() => window.__TEST.startTranslation());
              await idle(page, scenario.count, 20000);
              await reload();
            }
            await page.evaluate(() => { window.__started = performance.now(); window.__TEST.startTranslation(); });
            await idle(page, scenario.count, 20000);
            const result = await inspect(page);
            assert.equal(result.translated, scenario.count);
            assert.deepEqual(errors, []);
            const started = await page.evaluate(() => window.__started);
            const row = {
              scenario: scenario.name, label: variant.label, version: version(variant.source), round: round + 1,
              requestCount: result.calls.length,
              translated: result.translated,
              completeMs: result.renders.at(-1).at - started,
              firstRenderMs: result.renders[0].at - started,
              displayCounts: result.renders.map(render => render.count),
              maxConcurrent: Math.max(0, ...result.calls.map(call => result.calls.filter(other =>
                other.at <= call.at && (other.endedAt === null || other.endedAt > call.at)).length)),
              errors,
            };
            results.push(row);
            console.log(JSON.stringify(row));
          } finally {
            await page.close();
          }
        }
      }
    }
    const comparisons = scenarios.map(scenario => {
      const rows = results.filter(row => row.scenario === scenario.name);
      const baseline = rows.filter(row => row.label === 'baseline');
      const current = rows.filter(row => row.label === 'current');
      const baselineMedianMs = median(baseline.map(row => row.completeMs));
      const currentMedianMs = median(current.map(row => row.completeMs));
      return { scenario: scenario.name, paragraphs: scenario.count, mock: scenario.mock,
        baselineMedianMs, currentMedianMs,
        baselineRequests: median(baseline.map(row => row.requestCount)),
        currentRequests: median(current.map(row => row.requestCount)),
        timeReductionPercent: (1 - currentMedianMs / baselineMedianMs) * 100 };
    });
    const report = {
      date: new Date().toISOString(), browser: browser.version(), node: process.version,
      network: 'blocked', rounds: 3, baselineRef, comparisons, results,
    };
    fs.mkdirSync(path.join(__dirname, 'results'), { recursive: true });
    fs.writeFileSync(path.join(__dirname, 'results', 'benchmark.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(comparisons));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
