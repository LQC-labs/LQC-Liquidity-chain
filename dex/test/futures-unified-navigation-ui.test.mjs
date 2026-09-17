import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';

const htmlUrl = new URL('../app/futures/index.html', import.meta.url);
const cssUrl = new URL('../app/futures/style.css', import.meta.url);

async function fixtures() {
  const [html, css] = await Promise.all([
    readFile(htmlUrl, 'utf8'),
    readFile(cssUrl, 'utf8')
  ]);
  return { html, css };
}

describe('LQC Flow unified product navigation UI', () => {
  it('exposes sibling product entry points with Futures active', async () => {
    const { html } = await fixtures();
    assert.match(html, /class="flow-nav"/);
    assert.match(html, /href="\/spot">Spot<\/a>/);
    assert.match(html, /href="\/swap">Swap<\/a>/);
    assert.match(html, /href="\/liquidity">Liquidity<\/a>/);
    assert.match(html, /href="\/futures" class="active" aria-current="page">Futures<\/a>/);
  });

  it('keeps product navigation presentation-only without engine coupling', async () => {
    const { html } = await fixtures();
    assert.doesNotMatch(html, /dexRouter|futuresEngine|placeOrder|\.quote\(/);
  });

  it('styles active navigation with the LQC mint/cyan theme', async () => {
    const { css } = await fixtures();
    assert.match(css, /\.flow-nav a\.active\{[^}]*linear-gradient\(135deg,var\(--mint\),var\(--cyan\)\)/);
  });

  it('provides tablet and mobile responsive navigation rules', async () => {
    const { css } = await fixtures();
    assert.match(css, /@media\(max-width:900px\)[\s\S]*?\.flow-nav\{order:3;width:100%;justify-content:center\}/);
    assert.match(css, /@media\(max-width:600px\)[\s\S]*?\.flow-nav\{order:3;gap:2px;padding:3px;border-radius:12px;overflow-x:auto;justify-content:flex-start;scrollbar-width:none\}/);
  });
});
