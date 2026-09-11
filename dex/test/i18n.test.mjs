import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

describe('LQC DEX UI internationalization', function () {
  function load(language = 'ko-KR') {
    const storage = new Map();
    const nodes = [];
    const document = {
      documentElement: { lang: '' },
      querySelectorAll: () => nodes
    };
    const window = { dispatchEvent() {} };
    const context = {
      window, document, navigator: { language }, CustomEvent: class {},
      localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) }
    };
    vm.runInNewContext(fs.readFileSync(new URL('../app/i18n.js', import.meta.url), 'utf8'), context);
    return { api: window.LQCI18N, document, storage };
  }

  it('defaults every first visit to Korean', function () {
    const { api, document } = load('en-US');
    api.apply();
    assert.equal(api.getLocale(), 'ko');
    assert.equal(api.t('connectWallet'), '지갑 연결');
    assert.equal(document.documentElement.lang, 'ko');
  });

  it('switches to English and persists the choice', function () {
    const { api, storage } = load();
    api.setLocale('en-US');
    assert.equal(api.getLocale(), 'en');
    assert.equal(api.t('buyLqc'), 'Buy LQC');
    assert.equal(storage.get('lqc-flow-locale'), 'en');
    assert.equal(api.t('approveToken', { token: 'LQC' }), 'Confirm LQC spending approval.');
    assert.match(api.t('error_RISK_BLOCKED'), /risk controls/);
  });

  it('loads i18n before the trading application and exposes a language selector', function () {
    const html = fs.readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
    assert.match(html, /id="languageSelect"/);
    assert.ok(html.indexOf('i18n.js') < html.indexOf('app.js'));
    assert.match(html, /data-i18n="testnetWarning"/);
  });
});
