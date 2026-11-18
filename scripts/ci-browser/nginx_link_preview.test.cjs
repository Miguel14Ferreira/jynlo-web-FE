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
