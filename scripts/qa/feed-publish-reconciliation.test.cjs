'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = relative => fs.readFileSync(path.join(__dirname, '../..', relative), 'utf8');

test('confirmed posts survive stale and failed feed reads', () => {
  const source = read('src/app/pages/social-feed/social-feed.component.ts');
  assert.match(source, /private feedLoadGeneration = 0/);
  assert.match(source, /const generation = \+\+this\.feedLoadGeneration/);
  assert.match(source, /if \(generation !== this\.feedLoadGeneration\) return/);
  assert.match(source, /this\.items = this\.preserveConfirmedPosts\(visible\)/);
  assert.match(source, /this\.confirmedPosts\.set\(item\.postId!/);
  assert.doesNotMatch(source, /error: \(\) => \{\s*this\.items = \[\];\s*this\.errorMessage/);
});

test('post draft stays intact when a returned item is not a confirmed post', () => {
  const source = read('src/app/pages/social-feed/social-feed.component.ts');
  assert.match(source, /item\?\.type !== 'POST'/);
  assert.match(source, /O servidor não confirmou a publicação/);
});

test('confirmed Stories survive stale feed and mine responses', () => {
  const source = read('src/app/pages/social-feed/social-stories.component.ts');
  assert.match(source, /private feedRequestVersion = 0/);
  assert.match(source, /private mineRequestVersion = 0/);
  assert.match(source, /this\.entries = this\.retainConfirmedStories\(stories\)/);
  assert.match(source, /this\.mineEntries = this\.retainConfirmedStories\(stories\)/);
  assert.match(source, /this\.confirmedStories\.set\(story\.id/);
});
