#!/usr/bin/env node
'use strict';
// READ-ONLY live QA inventory for the two explicitly allowlisted Jynlo accounts.
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
   '/api/team-competition-invitations/mine','/api/team-competition-applications/mine'];
 async function get(path,token){
   assert.ok(tokens.includes(token)&&paths.includes(path),'GET_ALLOWLIST');
   const r=await fetch(API+path,{method:'GET',redirect:'error',cache:'no-store',
    signal:AbortSignal.timeout(25000),headers:{Authorization:'Bearer '+token,Accept:'application/json'}});
   assert.equal(r.status,200,'HTTP_'+r.status+'_'+path);
   const data=await r.json();
   assert.ok(Array.isArray(data),'EXPECTED_ARRAY_'+path);
   return data;
 }
 for(let i=0;i<2;i++){
   const [teams,communities,invitations,applications]=await Promise.all(paths.map(p=>get(p,tokens[i])));
   assert.ok(teams.every(t=>Number.isSafeInteger(t.id)&&t.id>0&&typeof t.name==='string'),'TEAMS_SCHEMA');
   assert.ok(communities.every(c=>Number.isSafeInteger(c.id)&&c.id>0),'COMMUNITIES_SCHEMA');
   assert.ok(invitations.every(inv=>Number.isSafeInteger(inv.id)&&inv.id>0),'INVITATIONS_SCHEMA');
   assert.ok(applications.every(inv=>Number.isSafeInteger(inv.id)&&inv.id>0),'APPLICATIONS_SCHEMA');
   console.log('[PASS] QA account '+(i+1)+': owned teams '+teams.length+
     ', communities '+communities.length+', competition invitations '+invitations.length+
     ', applications '+applications.length+'; no mutations');
 }
 console.log('[PASS] Read-only global-team inventory finished for two QA accounts');
}
main().catch(e=>{console.error('[FAIL] '+String(e?.message||e).replace(/https?:\/\/\S+/g,'[redacted]').slice(0,120));process.exitCode=1;});
