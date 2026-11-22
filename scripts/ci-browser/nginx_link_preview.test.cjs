const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const config = fs.readFileSync(path.join(__dirname, '../../default.conf.template'), 'utf8');

// nginx uses PCRE with `~*` (case-insensitive); the same pattern works in JavaScript.
const botPattern = (() => {
  const match = config.match(/"~\*\(([^"]+)\)"\s+1;/);
  assert.ok(match, 'link-preview map entry not found');
  return new RegExp(match[1], 'i');
})();

test('link-preview crawlers are recognised', () => {
  for (const agent of [
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'WhatsApp/2.23.20.0 A',
    'Twitterbot/1.0',
    'TelegramBot (like TwitterBot)',
    'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
    'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
    'meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)',
  ]) {
    assert.ok(botPattern.test(agent), agent + ' should get the share page');
  }
});

test('people and search engines get the normal app', () => {
  for (const agent of [
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile Safari/604.1',
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  ]) {
    assert.ok(!botPattern.test(agent), agent + ' must not be treated as a link-preview bot');
  }
});

test('session links are routed to the share page without a second backend proxy', () => {
  assert.ok(config.includes('map $http_user_agent $link_preview_bot {'));
  assert.ok(config.includes('location ~ ^/sessions/[0-9]+/?$ {'));
  assert.ok(config.includes('rewrite ^/sessions/([0-9]+)/?$ /api/share/sessions/$1 last;'));
  assert.ok(config.includes('try_files /index.html =404;'));
  // The share page reuses the existing /api/ proxy, so no extra upstream line is needed.
  const upstream = 'proxy_pass ' + '$' + '{BACKEND_UPSTREAM};';
  assert.equal(config.split(upstream).length, 3);
});

test('community and profile links get their own share pages', () => {
  assert.ok(config.includes('rewrite ^/menu/communities/([0-9]+)/?$ /api/share/communities/$1 last;'));
  assert.ok(config.includes('rewrite ^/menu/perfis/([A-Za-z0-9._-]+)/?$ /api/share/profiles/$1 last;'));
  // Only crawlers are rewritten; people keep getting the app.
  assert.equal(config.split('try_files /index.html =404;').length, 4);
});

test('the sitemap comes from the backend', () => {
  assert.ok(config.includes('location = /sitemap.xml {'));
  assert.ok(config.includes('rewrite ^ /api/public/sitemap.xml last;'));
});

test('Vercel sends the same crawlers to the same share pages, before the app fallback', () => {
  const vercel = JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname, '../../vercel.json'), 'utf8'));
  const rules = vercel.rewrites;
  const nginxBots = config.match(/"~\*\((.*?)\)"/)[1];
  for (const [source, target] of [['/sessions/:id(\\d+)', '/api/share/sessions/:id'],
    ['/menu/communities/:id(\\d+)', '/api/share/communities/:id'],
    ['/menu/perfis/:username([A-Za-z0-9._-]+)', '/api/share/profiles/:username']]) {
    const rule = rules.find(r => r.source === source);
    assert.ok(rule, source);
    assert.ok(rule.destination.endsWith(target), source);
    assert.ok(rule.has[0].value.includes(nginxBots), 'same crawler list as nginx');
    assert.ok(rules.indexOf(rule) < rules.findIndex(r => r.source === '/(.*)'));
  }
  const robots = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/robots.txt'), 'utf8');
  assert.match(robots, /Sitemap: https:\/\/api\.d24sports\.com\/api\/public\/sitemap\.xml/);
});

test('Vercel publishes develop and master, never work branches (daily build limit)', () => {
  const vercel = JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname, '../../vercel.json'), 'utf8'));
  const off = vercel.git.deploymentEnabled;
  for (const branch of ['develop', 'master', 'main']) assert.notEqual(off[branch], false, branch);
  assert.ok(!Object.keys(off).some(glob => glob === '*' || glob === '**'), 'a catch-all would also stop develop');
  for (const glob of ['feat/**', 'fix/**', 'perf/**', 'chore/**']) assert.equal(off[glob], false, glob);
});
