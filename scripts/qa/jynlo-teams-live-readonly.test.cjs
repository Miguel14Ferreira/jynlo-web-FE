'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {readPath,read,teamIds,privateTeamCandidates,safeError}=require('./jynlo-teams-live-readonly.cjs');

const file=fs.readFileSync(path.join(__dirname,'jynlo-teams-live-readonly.cjs'),'utf8');
test('dual-account QA never embeds passwords or sends gameplay writes',()=>{
 assert.match(file,/JYNLO_QA_PASSWORD_1/);
 assert.match(file,/JYNLO_QA_PASSWORD_2/);
 assert.match(file,/const USERS=\['jynloteste01','jynloteste02'\]/);
 assert.match(file,/method:'GET'/);
 assert.doesNotMatch(file,/console\.log\(tokens|console\.log\(passwords|storageState\(/);
 assert.doesNotMatch(file,/method:'(?:DELETE|PUT|PATCH)'/);
});
test('allowed read endpoints cannot be expanded to mutating endpoints',()=>{
 for(const allowed of ['/api/teams/mine','/api/teams/joined','/api/teams/invitations/mine',
  '/api/team-competition-applications/mine','/api/teams/4/chat','/api/teams/4/feed'])
  assert.equal(readPath(allowed),allowed);
 for(const rejected of ['/api/teams/4/members/5','/api/teams/04/chat','/api/teams/4/chat/2',
  '/api/teams/4/invitations/accept','https://example.com','/api/teams/4/chat?token=abc'])
  assert.throws(()=>readPath(rejected));
});
test('only real verified team identities are selected for cross-account probes',()=>{
 assert.deepEqual(teamIds([{id:4},{id:7},{id:4},{id:0}],[{id:12},{id:'17'}]),[4,7,12]);
 assert.deepEqual(privateTeamCandidates([4,7,12],[4,12]),[7]);
 assert.deepEqual(privateTeamCandidates([4,7],[4,7]),[]);
});
test('private read uses bearer token and never accepts 200 HTML or oversized results',async()=>{
 const seen=[];
 const fetchImpl=async(url,options)=>{
  seen.push({url,method:options.method,auth:options.headers.Authorization});
  return new Response(JSON.stringify([{id:2}]),{status:200,headers:{'content-type':'application/json'}});
 };
 const result=await read('/api/teams/4/chat','synthetic-token',fetchImpl);
 assert.equal(result.status,200);
 assert.deepEqual(result.items,[{id:2}]);
 assert.deepEqual(seen,[{url:'https://api.d24sports.com/api/teams/4/chat',
  method:'GET',auth:'Bearer synthetic-token'}]);
 await assert.rejects(()=>read('/api/teams/4/feed','synthetic-token',
  async()=>new Response('<html>not json</html>',{headers:{'content-type':'text/html'}})));
});
test('private denied reads return only status and never expose body',async()=>{
 for(const status of [403,404,409]){
  const value=await read('/api/teams/5/chat','synthetic-token',
   async()=>new Response('sensitive body',{status}));
  assert.deepEqual(value,{status,items:null});
 }
});
test('output never discloses network errors, accounts or credentials',()=>{
 assert.equal(safeError(Error('Bearer token secret')),'TEAM_QA_CHECK_FAILED');
 assert.equal(safeError(Error('CROSS_ACCOUNT_CONTENT_LEAK')),'CROSS_ACCOUNT_CONTENT_LEAK');
});
