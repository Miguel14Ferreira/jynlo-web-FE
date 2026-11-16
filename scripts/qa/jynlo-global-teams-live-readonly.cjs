#!/usr/bin/env node
'use strict';
// READ-ONLY live QA inventory for the two explicitly allowlisted Jynlo accounts.
// Audit the current permanent-team and competition API state without writes.
const assert=require('node:assert/strict');
const {authenticate}=require('./jynlo-inbox-live-browser.cjs');
const USERS=['jynloteste01','jynloteste02'];
const API='https://api.d24sports.com';
async function main(){
 assert.deepEqual([process.env.JYNLO_QA_USERNAME_1,process.env.JYNLO_QA_USERNAME_2],USERS,'IDENTITY_ALLOWLIST');
 assert.equal(process.env.JYNLO_QA_TEAM_INVENTORY,'READ_ONLY','READ_ONLY_GUARD');
 const passwords=[process.env.JYNLO_QA_PASSWORD_1,process.env.JYNLO_QA_PASSWORD_2];
 assert.ok(passwords.every(x=>typeof x==='string'&&x.length>0),'PASSWORDS_MISSING');
 const tokens=await Promise.all(USERS.map((name,i)=>authenticate(name,passwords[i],fetch)));
 const paths=['/api/teams/mine','/api/communities/mine',
   '/api/team-competition-invitations/mine','/api/team-competition-applications/mine',
   '/api/teams?q=jynloteste','/api/team-competition-applications/discover?q=jynloteste&sport='];
 async function get(path,token){
   assert.ok(tokens.includes(token)&&paths.includes(path),'GET_ALLOWLIST');
   const r=await fetch(API+path,{method:'GET',redirect:'error',cache:'no-store',
    signal:AbortSignal.timeout(25000),headers:{Authorization:'Bearer '+token,Accept:'application/json'}});
   if(r.status!==200){
     // Only emit a machine-readable error code; never log live response bodies or account data.
     let code='UNAVAILABLE';
     try{
       const body=await r.json();
       const candidate=body?.code??body?.errorCode;
       if(typeof candidate==='string'&&/^[A-Z][A-Z0-9_]{0,63}$/.test(candidate))code=candidate;
     }catch{}
     assert.fail('HTTP_'+r.status+'_'+path+'_ERROR_CODE_'+code);
   }
   const data=await r.json();
   assert.ok(Array.isArray(data),'EXPECTED_ARRAY_'+path);
   return data;
 }
 let failures=0;
 for(let i=0;i<2;i++){
   const outcomes=await Promise.allSettled(paths.map(p=>get(p,tokens[i])));
   outcomes.forEach((outcome,index)=>{
     const label='QA'+(i+1)+' '+paths[index].split('?')[0];
     if(outcome.status==='rejected'){
       failures++;
       console.log('[FAIL] '+label+': '+String(outcome.reason?.message||outcome.reason).replace(/https?:\/\/\S+/g,'[redacted]').slice(0,100));
     }else{
       console.log('[PASS] '+label+': '+outcome.value.length+' records');
     }
   });
   if(outcomes[0].status==='fulfilled')
     assert.ok(outcomes[0].value.every(t=>Number.isSafeInteger(t.id)&&t.id>0&&typeof t.name==='string'),'TEAMS_SCHEMA');
   if(outcomes[1].status==='fulfilled')
     assert.ok(outcomes[1].value.every(c=>Number.isSafeInteger(c.id)&&c.id>0),'COMMUNITIES_SCHEMA');
   if(outcomes[2].status==='fulfilled')
     assert.ok(outcomes[2].value.every(inv=>Number.isSafeInteger(inv.id)&&inv.id>0),'INVITATIONS_SCHEMA');
   if(outcomes[3].status==='fulfilled')
     assert.ok(outcomes[3].value.every(inv=>Number.isSafeInteger(inv.id)&&inv.id>0),'APPLICATIONS_SCHEMA');
 }
 assert.equal(failures,0,'LIVE_READ_ONLY_ENDPOINT_FAILURES_'+failures);
 console.log('[PASS] Read-only global-team inventory finished for two QA accounts');
}
main().catch(e=>{console.error('[FAIL] '+String(e?.message||e).replace(/https?:\/\/\S+/g,'[redacted]').slice(0,120));process.exitCode=1;});
