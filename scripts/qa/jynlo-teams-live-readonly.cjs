#!/usr/bin/env node
'use strict';
// Authenticated, strictly read-only QA for the two disposable Jynlo accounts.
// Secrets are supplied via GitHub Actions; do not print tokens, IDs, bodies or identities.
// Only login may POST. Every subsequent HTTP request must be GET.
const assert=require('node:assert/strict');
const {authenticate}=require('./jynlo-inbox-live-browser.cjs');
const API='https://api.d24sports.com';
const USERS=['jynloteste01','jynloteste02'];
const MAX_BYTES=2_000_000;
const MAX_TEAMS=6;
const ALLOWED=new Set([
 '/api/teams/mine','/api/teams/joined','/api/teams/invitations/mine',
 '/api/team-competition-applications/mine'
]);
const validId=value=>Number.isSafeInteger(value)&&value>0;
function readPath(path){
 assert.equal(typeof path,'string');
 if(ALLOWED.has(path))return path;
 assert.match(path,/^\/api\/teams\/[1-9]\d*\/(?:chat|feed)$/);
 return path;
}
async function read(path,token,fetchImpl=fetch){
 readPath(path);
 assert.equal(typeof token,'string');
 const response=await fetchImpl(API+path,{method:'GET',redirect:'error',
  headers:{Authorization:'Bearer '+token,Accept:'application/json'},
  signal:AbortSignal.timeout(15000)});
 // 409 means the captain turned this feature off; 403/404 mean inaccessible.
 if([403,404,409].includes(response.status))return {status:response.status,items:null};
 assert.equal(response.status,200,'TEAM_GET_STATUS');
 const mime=response.headers.get('content-type')||'';
 assert.match(mime,/application\/json/,'TEAM_JSON_EXPECTED');
 const declared=Number(response.headers.get('content-length')||0);
 assert.ok(declared<=MAX_BYTES,'TEAM_RESPONSE_TOO_LARGE');
 const buf=Buffer.from(await response.arrayBuffer());
 assert.ok(buf.length<=MAX_BYTES,'TEAM_RESPONSE_TOO_LARGE');
 return {status:200,items:JSON.parse(buf.toString('utf8'))};
}
function teamIds(owned,joined){
 assert.ok(Array.isArray(owned)&&Array.isArray(joined),'INVALID_TEAM_LIST');
 return [...new Set([...owned,...joined].filter(t=>validId(t?.id)).map(t=>t.id))].slice(0,MAX_TEAMS);
}
function privateTeamCandidates(ownIds,otherIds){
 const other=new Set(otherIds);
 return ownIds.filter(id=>!other.has(id)).slice(0,MAX_TEAMS);
}
function safeError(error){
 const value=error instanceof Error?error.message:'';
 return /^[A-Z][A-Z0-9_]{3,70}$/.test(value)?value:'TEAM_QA_CHECK_FAILED';
}
async function run({passwords=[process.env.JYNLO_QA_PASSWORD_1,process.env.JYNLO_QA_PASSWORD_2],
 fetchImpl=fetch,report=console.log}={}){
 assert.ok(Array.isArray(passwords)&&passwords.length===2&&
  passwords.every(v=>typeof v==='string'&&v.length>=8),'QA_SECRETS_NOT_CONFIGURED');
 const tokens=await Promise.all(USERS.map((u,i)=>authenticate(u,passwords[i],fetchImpl)));
 report('[PASS] Both disposable QA accounts authenticated.');
 const results=await Promise.all(tokens.map(async token=>{
  const endpoints=['/api/teams/mine','/api/teams/joined','/api/teams/invitations/mine',
   '/api/team-competition-applications/mine'];
  const values=await Promise.all(endpoints.map(p=>read(p,token,fetchImpl)));
  values.forEach(v=>assert.equal(v.status,200,'TEAM_PRIVATE_LIST_UNAVAILABLE'));
  values.forEach(v=>assert.ok(Array.isArray(v.items),'TEAM_LIST_FORMAT'));
  return {ids:teamIds(values[0].items,values[1].items),invitations:values[2].items,
    applications:values[3].items};
 }));
 report('[PASS] Both accounts read own teams, invitations and competition applications.');
 for(let i=0;i<2;i++){
  for(const id of results[i].ids){
   for(const kind of ['chat','feed']){
    const response=await read('/api/teams/'+id+'/'+kind,tokens[i],fetchImpl);
    // A member can read enabled content. When deliberately disabled, expect 409.
    assert.ok(response.status===200||response.status===409,'MEMBER_CONTENT_DENIED');
    if(response.status===200)assert.ok(Array.isArray(response.items),'TEAM_CONTENT_FORMAT');
   }
  }
 }
 report('[PASS] Member-scoped team conversations verified (or explicitly disabled).');
 let checked=0;
 for(let i=0;i<2;i++){
  for(const id of privateTeamCandidates(results[i].ids,results[1-i].ids)){
   for(const kind of ['chat','feed']){
    const response=await read('/api/teams/'+id+'/'+kind,tokens[1-i],fetchImpl);
    // A nonmember must never receive private message history.
    assert.ok([403,404].includes(response.status),'CROSS_ACCOUNT_CONTENT_LEAK');
    checked++;
   }
  }
 }
 if(checked)report('[PASS] Cross-account private team access denied.');
 else report('[SKIP] No exclusive team memberships to verify cross-account isolation.');
 return {checked,ownTeamCounts:results.map(r=>r.ids.length)};
}
if(require.main===module){
 run().catch(e=>{console.error('[FAIL] Jynlo dual-account team QA: '+safeError(e));process.exitCode=1;});
}
module.exports={readPath,read,teamIds,privateTeamCandidates,safeError,run};
