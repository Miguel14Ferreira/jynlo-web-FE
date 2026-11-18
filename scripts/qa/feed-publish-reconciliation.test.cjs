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

test('sports week never creates an empty third column for its two real cards', () => {
  const template = read('src/app/pages/social-feed/social-feed.component.html');
  const css = read('src/app/pages/social-feed/social-feed-neon-glass.css');
  const week = template.slice(template.indexOf('<div class="week-hub-grid">'), template.indexOf('</section>', template.indexOf('<div class="week-hub-grid">')));
  assert.equal((week.match(/<article class="week-hub-card"/g)||[]).length, 2);
  assert.match(css, /:host \.feed-v3-shell \.week-hub-grid \{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.doesNotMatch(css, /week-hub-grid \{display:grid;grid-template-columns:repeat\(3,/);
  assert.doesNotMatch(css, /week-hub-card:last-child \{grid-column:1\/-1;\}/);
  assert.match(css, /@container \(max-width:510px\) \{/);
  assert.match(css, /week-hub-grid \{grid-template-columns:minmax\(0,1fr\);\}/);
});

test('weekly sports dashboard has readable text and touch-sized navigation',()=>{
 const css=read('src/app/pages/social-feed/social-feed-neon-glass.css');
 const selectors=[
  /week-card-heading h3 \{font-size:\.91rem;line-height:1\.4;color:#d0fff2;/,
  /week-item>span \{font-size:\.8125rem;line-height:1\.4;/,
  /week-item small \{font-size:\.8125rem;/,
  /week-card-link \{font-size:\.875rem;padding-top:9px;min-height:44px;/,
  /week-muted \{font-size:\.875rem;line-height:1\.5;color:#c9e3e9;/,
  /week-hub-create \{min-height:44px;/
 ];
 for(const regex of selectors)assert.match(css,regex);
 assert.match(css,/week-hub-grid \{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.doesNotMatch(css,/week-hub-grid \{display:grid;grid-template-columns:repeat\(3,/);
});
