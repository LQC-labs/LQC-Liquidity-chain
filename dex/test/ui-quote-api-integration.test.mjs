import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve(import.meta.dirname, '../app');

describe('UI quote API integration', function () {
  for (const file of ['index.html', 'trade-f.html']) {
    it('loads the standard quote API before the application in ' + file, function () {
      const html = fs.readFileSync(path.join(appRoot, file), 'utf8');
      const quoteIndex = html.indexOf('quote-api.js');
      const appIndex = html.indexOf('app.js');
      assert.ok(quoteIndex >= 0, 'quote-api.js must be loaded');
      assert.ok(appIndex > quoteIndex, 'app.js must load after quote-api.js');
    });
  }
});


describe('UI quote calculation binding', function () {
  it('uses the standard adapter when calculating the minimum output', function () {
    const app = fs.readFileSync(path.join(appRoot, 'app.js'), 'utf8');
    assert.ok(app.includes('window.LQCQuoteApi.normalizeQuote'));
    assert.ok(app.includes('BigInt(standardQuote.minimumOutputRaw)'));
  });
});
