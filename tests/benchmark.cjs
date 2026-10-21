const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { launchBrowser, fixture, paragraphs, idle, inspect } = require('./browser.cjs');

const baselineRef = process.argv[2] || '4a1a552';
const baseline = execFileSync('git', ['show', `${baselineRef}:edge-translator.user.js`], {
  cwd: path.join(__dirname, '..'), encoding: 'utf8',
});
const current = fs.readFileSync(path.join(__dirname, '..', 'edge-translator.user.js'), 'utf8');
const version = source => /@version\s+(\S+)/.exec(source)?.[1] || 'unknown';
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

(async () => {
  const browser = await launchBrowser();
  try {
    const results = [];
    for (let round = 0; round < 3; round++) {
      // Alternate order to avoid always giving one version a warm browser.
      const variants = [
        { label: 'baseline', source: baseline },
        { label: 'current', source: current },
      ];
      if (round % 2) variants.reverse();
      for (const variant of variants) {
        const { page, errors } = await fixture(browser, paragraphs(120), {
          source: variant.source,
          // Full-page is enabled in both versions for an equal workload,
          // with a normal viewport and no synthetic all-visible browser trick.
          settings: { fullPage: true }, mock: { latencyMs: 600 },
        });
        try {
          await page.evaluate(() => { window.__started = performance.now(); window.__TEST.startTranslation(); });
          await idle(page, 120);
          const result = await inspect(page);
          const started = await page.evaluate(() => window.__started);
          const row = {
            label: variant.label, version: version(variant.source), round: round + 1,
            requestCount: result.calls.length,
            translated: result.translated,
            completeMs: result.renders.at(-1).at - started,
            firstRenderMs: result.renders[0].at - started,
            displayCounts: result.renders.map(render => render.count),
            maxConcurrent: Math.max(...result.calls.map(call => result.calls.filter(other =>
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
    const baselineMedianMs = median(results.filter(row => row.label === 'baseline').map(row => row.completeMs));
    const currentMedianMs = median(results.filter(row => row.label === 'current').map(row => row.completeMs));
    const report = {
      date: new Date().toISOString(), browser: browser.version(), node: process.version,
      mock: { paragraphs: 120, requestLatencyMs: 600, network: 'blocked', rounds: 3 },
      baselineRef, baselineMedianMs, currentMedianMs,
      timeReductionPercent: (1 - currentMedianMs / baselineMedianMs) * 100,
      results,
    };
    fs.mkdirSync(path.join(__dirname, 'results'), { recursive: true });
    fs.writeFileSync(path.join(__dirname, 'results', 'benchmark.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ baselineMedianMs, currentMedianMs, timeReductionPercent: report.timeReductionPercent }));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
