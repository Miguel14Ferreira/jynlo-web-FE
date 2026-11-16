#!/usr/bin/env node
'use strict';
// Strictly read-only, authenticated QA of the Render preview team journeys.
// One-time run against the already deployed preview, without database writes.
// Never log passwords, bearer tokens, account data or team names. Never POST from browser.
const assert=require('node:assert/strict');
const {authenticate}=require('./jynlo-inbox-live-browser.cjs');
const SITE='https://desporto24-full-preview.onrender.com';
const USERS=['jynloteste01','jynloteste02'];
const TIMEOUT=24000;
let stage='START';
async function exercise(username,token){
 const {chromium}=require('playwright');
 const browser=await chromium.launch({headless:true,timeout:30000,
  args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  stage='OPEN_CONTEXT';
  const context=await browser.newContext({locale:'pt-PT',viewport:{width:1280,height:900},
   serviceWorkers:'block'});
  try{
   await context.addInitScript(token=>{
    localStorage.setItem('t',token);
    localStorage.setItem('d24-language','pt');
   },token);
   const page=await context.newPage();
   const apiTrace=[];
   page.on('request',request=>{
    try{
     const u=new URL(request.url());
     if(u.host==='api.d24sports.com'&&
       (u.pathname.startsWith('/api/teams')||u.pathname==='/api/auth/refresh')){
      apiTrace.push('REQ_'+u.pathname);
     }
    }catch{}
   });
   page.on('requestfailed',request=>{
    try{
     const u=new URL(request.url());
     if(u.host==='api.d24sports.com'&&
       (u.pathname.startsWith('/api/teams')||u.pathname==='/api/auth/refresh')){
      apiTrace.push('FAILED_'+u.pathname);
     }
    }catch{}
   });
   page.on('response',response=>{
    try{
     const u=new URL(response.url());
     if(u.origin==='https://api.d24sports.com'&&
       ['/api/teams/mine','/api/teams/joined','/api/teams'].includes(u.pathname)){
      apiTrace.push(u.pathname+'_'+response.status());
     }
    }catch{}
   });
   const prefix=SITE+'/menu/teams';
   stage='OPEN_TEAM_DIRECTORY';
   await page.goto(prefix,{waitUntil:'domcontentloaded',timeout:45000});
   stage='TEAM_HEADING';
   await page.getByRole('heading',{name:'As minhas equipas'}).waitFor({timeout:TIMEOUT});
   const mine=page.locator('section[aria-label="As minhas equipas"]');
   const discover=page.locator('section[aria-label="Explorar equipas"]');
   stage='TEAM_LOADING';
   try{
    await mine.locator('.loading-message').waitFor({state:'hidden',timeout:TIMEOUT});
   }catch(e){
    console.log('[DIAG] team loading: '+(apiTrace.join(',')||'NO_TEAM_API_RESPONSE'));
    console.log('[DIAG] team route: '+new URL(page.url()).pathname);
    console.log('[DIAG] mine loading visible: '+await mine.locator('.loading-message').isVisible());
    throw e;
   }
   stage='DISCOVER_LOADING';
   await discover.locator('.loading-message').waitFor({state:'hidden',timeout:TIMEOUT});
   assert.equal(await mine.locator('.teams-error').count(),0,'OWNER_REQUEST_FAILED');
   assert.equal(await page.locator('.teams-page .teams-error').count(),0,'TEAM_DIRECTORY_ERROR');
   console.log('[PASS] '+username+' team directory: account and public lists settled without manual refresh.');
   stage='DISCOVER_CARDS';
   const first=discover.locator('.team-card').first();
   if(await first.count()){
    stage='TEAM_DETAIL_CLICK';
    await first.click();
    stage='TEAM_DETAIL_HEADING';
    await page.locator('.team-detail h1').waitFor({state:'visible',timeout:TIMEOUT});
    const teamError=page.locator('.team-detail .team-error');
    assert.equal(await teamError.count(),0,'TEAM_DETAIL_ERROR');
    console.log('[PASS] '+username+' team card opened in detail route.');
   }else{
    console.log('[SKIP] '+username+' no public teams available for a detail click.');
   }
   stage='COMPETITION_NAV';
   await page.goto(prefix+'/competitions',{waitUntil:'domcontentloaded',timeout:45000});
   stage='COMPETITION_HEADING';
   await page.getByRole('heading',{name:'Encontrar torneios e campeonatos'}).waitFor({timeout:TIMEOUT});
   stage='COMPETITION_VERIFY';
   await page.locator('.team-discover .refresh-state').waitFor({state:'hidden',timeout:TIMEOUT});
   stage='COMPETITION_DISCOVERY';
   await page.getByText('A procurar competições…',{exact:true}).waitFor({state:'hidden',timeout:TIMEOUT});
   assert.equal(await page.locator('.team-discover .error').count(),0,'COMPETITION_REQUEST_ERROR');
   stage='TEAM_PICKER';
   const card=page.locator('.team-discover .team-picker');
   await card.waitFor({state:'visible',timeout:TIMEOUT});
   const color=await card.evaluate(el=>getComputedStyle(el).backgroundColor);
   const values=(color.match(/[0-9.]+/g)||[]).map(Number);
   assert.ok(values.length>=3&&values.slice(0,3).every(v=>v<100),
    'COMPETITION_CARD_LIGHT_CONTRAST');
   console.log('[PASS] '+username+' competition discovery verified and dark selectable team panel rendered.');
   stage='CREATE_LINK';
   await page.getByRole('link',{name:'Criar equipa'}).click();
   stage='CREATE_PANEL';
   await page.locator('#team-create-panel').waitFor({state:'visible',timeout:TIMEOUT});
   assert.ok(new URL(page.url()).pathname==='/menu/teams','CREATE_TEAM_NAVIGATION');
   stage='EXPLORE_LINK';
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
  stage='AUTH_'+(i+1);
  const token=await authenticate(USERS[i],passwords[i],fetch);
  await exercise(USERS[i],token);
 }
 console.log('[PASS] Read-only authenticated team page smoke passed for both QA accounts.');
}
main().catch(e=>{
 const msg=String(e?.message||e);
 const code=/OWNER_REQUEST_FAILED|TEAM_DIRECTORY_ERROR|TEAM_DETAIL_ERROR|COMPETITION_REQUEST_ERROR|COMPETITION_CARD_LIGHT_CONTRAST|CREATE_TEAM_NAVIGATION|EXPLORE_TEAM_NAVIGATION|EXPLORE_TEAM_FRAGMENT|READ_ONLY_GUARD|QA_ACCOUNT_ALLOWLIST|QA_CREDENTIALS_MISSING/.exec(msg);
 console.error('[FAIL] '+stage+'_'+(code?.[0]||'BROWSER_QA_FAILED'));
 process.exitCode=1;
});
