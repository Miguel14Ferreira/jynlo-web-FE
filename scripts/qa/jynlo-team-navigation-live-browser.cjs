#!/usr/bin/env node
'use strict';
// Strictly read-only, authenticated QA of the Render preview team journeys.
// Never log passwords, bearer tokens, account data or team names. Never POST from browser.
const assert=require('node:assert/strict');
const {authenticate}=require('./jynlo-inbox-live-browser.cjs');
const SITE='https://desporto24-full-preview.onrender.com';
const USERS=['jynloteste01','jynloteste02'];
const TIMEOUT=24000;
async function exercise(username,token){
 const {chromium}=require('playwright');
 const browser=await chromium.launch({headless:true,timeout:30000,
  args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const context=await browser.newContext({locale:'pt-PT',viewport:{width:1280,height:900},
   serviceWorkers:'block'});
  try{
   await context.addInitScript(token=>{
    localStorage.setItem('t',token);
    localStorage.setItem('d24-language','pt');
   },token);
   const page=await context.newPage();
   const prefix=SITE+'/menu/teams';
   await page.goto(prefix,{waitUntil:'domcontentloaded',timeout:45000});
   await page.getByRole('heading',{name:'As minhas equipas'}).waitFor({timeout:TIMEOUT});
   const mine=page.locator('section[aria-label="As minhas equipas"]');
   const discover=page.locator('section[aria-label="Explorar equipas"]');
   await mine.locator('.loading-message').waitFor({state:'hidden',timeout:TIMEOUT});
   await discover.locator('.loading-message').waitFor({state:'hidden',timeout:TIMEOUT});
   assert.equal(await mine.locator('.teams-error').count(),0,'OWNER_REQUEST_FAILED');
   assert.equal(await page.locator('.teams-page .teams-error').count(),0,'TEAM_DIRECTORY_ERROR');
   console.log('[PASS] '+username+' team directory: account and public lists settled without manual refresh.');
   const first=discover.locator('.team-card').first();
   if(await first.count()){
    await first.click();
    await page.locator('.team-detail h1').waitFor({state:'visible',timeout:TIMEOUT});
    const teamError=page.locator('.team-detail .team-error');
    assert.equal(await teamError.count(),0,'TEAM_DETAIL_ERROR');
    console.log('[PASS] '+username+' team card opened in detail route.');
   }else{
    console.log('[SKIP] '+username+' no public teams available for a detail click.');
   }
   await page.goto(prefix+'/competitions',{waitUntil:'domcontentloaded',timeout:45000});
   await page.getByRole('heading',{name:'Encontrar torneios e campeonatos'}).waitFor({timeout:TIMEOUT});
   await page.locator('.team-discover .refresh-state').waitFor({state:'hidden',timeout:TIMEOUT});
   await page.getByText('A procurar competições…',{exact:true}).waitFor({state:'hidden',timeout:TIMEOUT});
   assert.equal(await page.locator('.team-discover .error').count(),0,'COMPETITION_REQUEST_ERROR');
   const card=page.locator('.team-discover .team-picker');
   await card.waitFor({state:'visible',timeout:TIMEOUT});
   const color=await card.evaluate(el=>getComputedStyle(el).backgroundColor);
   const values=(color.match(/[0-9.]+/g)||[]).map(Number);
   assert.ok(values.length>=3&&values.slice(0,3).every(v=>v<100),
    'COMPETITION_CARD_LIGHT_CONTRAST');
   console.log('[PASS] '+username+' competition discovery verified and dark selectable team panel rendered.');
   await page.getByRole('link',{name:'Criar equipa'}).click();
   await page.locator('#team-create-panel').waitFor({state:'visible',timeout:TIMEOUT});
   assert.ok(new URL(page.url()).pathname==='/menu/teams','CREATE_TEAM_NAVIGATION');
   await page.getByRole('link',{name:'Explorar equipas'}).click();
   assert.ok(new URL(page.url()).pathname==='/menu/teams','EXPLORE_TEAM_NAVIGATION');
   assert.ok(page.url().includes('explorar-equipas'),'EXPLORE_TEAM_FRAGMENT');
   console.log('[PASS] '+username+' create and explore links stay in the team area, not the home page.');
  }finally{await context.close();}
 }finally{await browser.close();}
}
async function main(){
 assert.equal(process.env.JYNLO_QA_TEAMS_BROWSER,'READ_ONLY','READ_ONLY_GUARD');
 assert.deepEqual([process.env.JYNLO_QA_USERNAME_1,process.env.JYNLO_QA_USERNAME_2],USERS,'QA_ACCOUNT_ALLOWLIST');
 const passwords=[process.env.JYNLO_QA_PASSWORD_1,process.env.JYNLO_QA_PASSWORD_2];
 assert.ok(passwords.every(p=>typeof p==='string'&&p.length>0),'QA_CREDENTIALS_MISSING');
 for(let i=0;i<USERS.length;i++){
  const token=await authenticate(USERS[i],passwords[i],fetch);
  await exercise(USERS[i],token);
 }
 console.log('[PASS] Read-only authenticated team page smoke passed for both QA accounts.');
}
main().catch(e=>{
 const msg=String(e?.message||e);
 const code=/OWNER_REQUEST_FAILED|TEAM_DIRECTORY_ERROR|TEAM_DETAIL_ERROR|COMPETITION_REQUEST_ERROR|COMPETITION_CARD_LIGHT_CONTRAST|CREATE_TEAM_NAVIGATION|EXPLORE_TEAM_NAVIGATION|EXPLORE_TEAM_FRAGMENT|READ_ONLY_GUARD|QA_ACCOUNT_ALLOWLIST|QA_CREDENTIALS_MISSING/.exec(msg);
 console.error('[FAIL] '+(code?.[0]||'BROWSER_QA_FAILED'));
 process.exitCode=1;
});
