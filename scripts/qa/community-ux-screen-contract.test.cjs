'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=relative=>fs.readFileSync(path.join(__dirname,'../..',relative),'utf8');

test('community discovery fields and main actions remain touch-friendly',()=>{
 const css=read('src/app/pages/communities/communities-v3-finish.css');
 assert.match(css,/community-discovery-filters :is\(input\[type=search\],button\) \{/);
 assert.match(css,/min-height:46px/);
 assert.match(css,/\.page-header \.header-action \{/);
 assert.match(css,/min-height:44px/);
 assert.match(css,/focus-visible/);
});

test('community competition history expands with readable text and keyboard access',()=>{
 const css=read('src/app/pages/communities/communities-v3-finish.css');
 assert.match(css,/round-card-details-toggle \{/);
 assert.match(css,/min-height:44px;font-size:\.9rem;line-height:1\.45/);
 assert.match(css,/round-card-details-toggle small \{color:#d4eaef;font-size:\.85rem/);
 assert.match(css,/round-history-controls \.jynlo-action \{/);
 assert.match(css,/min-height:44px;min-width:116px/);
 assert.match(css,/round-card-details-toggle:focus-visible/);
});

test('community screens still include functional discovery and member entry',()=>{
 const template=read('src/app/pages/communities/communities.component.html');
 for(const marker of ['community-discovery','community-card','community-detail-page'])
  assert.ok(template.includes(marker),marker);
});
