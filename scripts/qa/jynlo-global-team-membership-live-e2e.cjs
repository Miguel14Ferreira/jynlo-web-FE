#!/usr/bin/env node
'use strict';
// One-shot consent from QA workflow; deletion support must be proven first.
// Run uses only the two allowlisted QA accounts and deletes its own fixture.
// QA-only live test. No team is created unless the safe delete endpoint is
// already available. No chat messages, attachments or competition links are created.
const assert=require('node:assert/strict');
const {authenticate}=require('./jynlo-inbox-live-browser.cjs');
const USERS=['jynloteste01','jynloteste02'];
const API='https://api.d24sports.com';
const valid=id=>Number.isSafeInteger(id)&&id>0;

async function main(){
 assert.equal(process.env.JYNLO_QA_GLOBAL_TEAM_ONCE,'DISPOSABLE_QA_ONLY','CONSENT_GUARD');
 assert.deepEqual([process.env.JYNLO_QA_USERNAME_1,process.env.JYNLO_QA_USERNAME_2],USERS,'IDENTITY_ALLOWLIST');
 const passwords=[process.env.JYNLO_QA_PASSWORD_1,process.env.JYNLO_QA_PASSWORD_2];
 assert.ok(passwords.every(p=>typeof p==='string'&&p.length>0),'QA_PASSWORDS_MISSING');
 const tokens=await Promise.all(USERS.map((username,i)=>authenticate(username,passwords[i],fetch)));
 const runId=process.env.GITHUB_RUN_ID;
 assert.match(runId||'',/^[0-9]+$/,'RUN_ID_REQUIRED');
 let teamId=null,playerId=null,cleaned=false;
 const name='JYNLO QA - Equipa Temporaria '+runId;
 async function api(index,method,path,body){
  assert.ok(index===0||index===1,'ACCOUNT_SCOPE');
  assert.ok(['GET','POST','PATCH','DELETE'].includes(method),'METHOD_SCOPE');
  const team=valid(teamId)?'/api/teams/'+teamId:null;
  const allowed=(index===0&&(
   (method==='DELETE'&&path==='/api/teams/0')||
   (method==='GET'&&path==='/api/teams/players/search?q='+USERS[1])||
   (method==='POST'&&path==='/api/teams')||
   (team&&(
    (method==='PATCH'&&path===team+'/features')||
    (method==='POST'&&path===team+'/invitations')||
    (method==='DELETE'&&path===team)||
    (method==='DELETE'&&valid(playerId)&&path===team+'/members/'+playerId)
   ))))||(method==='GET'&&(
    path==='/api/teams/mine'||
    (team&&(path===team+'/members'||path===team+'/chat'))
   ))||(index===1&&team&&(
    (method==='POST'&&path===team+'/invitations/accept')||
    (method==='GET'&&path==='/api/teams/invitations/mine')
   ));
  assert.ok(allowed,'ENDPOINT_NOT_ALLOWLISTED');
  const response=await fetch(API+path,{method,redirect:'error',cache:'no-store',
   signal:AbortSignal.timeout(25000),
   headers:{Authorization:'Bearer '+tokens[index],Accept:'application/json',
    ...(body?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  const json=response.status===204?null:await response.json().catch(()=>null);
  return {status:response.status,body:json};
 }
 // Important: 404 on DELETE /api/teams/0 is interpreted as "not deployed".
 // An existing owner-only deletion handler returns 400 for invalid ids.
 const preflight=await api(0,'DELETE','/api/teams/0');
 assert.equal(preflight.status,400,'SAFE_DELETE_NOT_DEPLOYED');
 const initial=await Promise.all(tokens.map((_,i)=>api(i,'GET','/api/teams/mine')));
 assert.ok(initial.every(x=>x.status===200&&Array.isArray(x.body)),'OWNERSHIP_LIST_UNAVAILABLE');
 assert.ok(initial.every(x=>!x.body.some(t=>t.name===name)),'QA_NAME_COLLISION');
 const candidates=await api(0,'GET','/api/teams/players/search?q='+USERS[1]);
 assert.equal(candidates.status,200,'PLAYER_SEARCH_FAILED');
 const matches=(candidates.body||[]).filter(x=>x.username?.toLowerCase()===USERS[1]&&valid(x.profileId));
 assert.equal(matches.length,1,'QA_PLAYER_NOT_FOUND');
 playerId=matches[0].profileId;
 console.log('[PASS] Safe deletion handler and QA player identity verified before any creation.');
 try{
  const created=await api(0,'POST','/api/teams',{name,sport:'Futebol',description:'Temporary isolated QA membership test'});
  assert.equal(created.status,201,'TEAM_CREATE_FAILED');
  assert.ok(valid(created.body?.id)&&created.body.name===name,'TEAM_CREATE_INVALID');
  teamId=created.body.id;
  const feature=await api(0,'PATCH','/api/teams/'+teamId+'/features',{chatEnabled:true,feedEnabled:true});
  assert.equal(feature.status,200,'ENABLE_CHAT_FAILED');
  const invite=await api(0,'POST','/api/teams/'+teamId+'/invitations',{profileId:playerId});
  assert.equal(invite.status,202,'PLAYER_INVITE_FAILED');
  const before=await api(1,'GET','/api/teams/'+teamId+'/chat');
  assert.equal(before.status,403,'INVITE_LEAKS_PRIVATE_CHAT');
  const memberInvites=await api(1,'GET','/api/teams/invitations/mine');
  assert.equal(memberInvites.status,200,'INVITATION_READ_FAILED');
  assert.ok(memberInvites.body.some(i=>i.teamId===teamId),'INVITATION_NOT_LISTED');
  console.log('[PASS] Pending QA invitation does not grant access to private chat.');
  const accepted=await api(1,'POST','/api/teams/'+teamId+'/invitations/accept');
  assert.equal(accepted.status,204,'ACCEPT_INVITE_FAILED');
  const [roster,joinedChat]=await Promise.all([
   api(0,'GET','/api/teams/'+teamId+'/members'),
   api(1,'GET','/api/teams/'+teamId+'/chat')
  ]);
  assert.equal(roster.status,200,'ROSTER_UNAVAILABLE');
  assert.equal(roster.body.filter(m=>m.profileId===playerId&&m.role==='PLAYER').length,1,'MEMBERSHIP_INVALID');
  assert.equal(joinedChat.status,200,'ACTIVE_PLAYER_CHAT_DENIED');
  console.log('[PASS] Accepted QA invitation grants private chat read to exactly one player.');
  const removed=await api(0,'DELETE','/api/teams/'+teamId+'/members/'+playerId);
  assert.equal(removed.status,204,'REMOVE_PLAYER_FAILED');
  const revoked=await api(1,'GET','/api/teams/'+teamId+'/chat');
  assert.equal(revoked.status,403,'REVOKED_MEMBER_CAN_STILL_READ');
  const current=await api(0,'GET','/api/teams/'+teamId+'/members');
  assert.equal(current.status,200,'POST_REMOVE_ROSTER_FAILED');
  assert.ok(!current.body.some(m=>m.profileId===playerId),'REVOKED_MEMBER_STILL_IN_ROSTER');
  console.log('[PASS] Removed QA player loses private chat access immediately.');
 }finally{
  // Recover the exact run-scoped fixture if POST committed but its response
  // was lost. Never touch a team with a different name or another owner.
  if(!valid(teamId)){
   const inventory=await api(0,'GET','/api/teams/mine');
   assert.equal(inventory.status,200,'QA_RECOVERY_INVENTORY_FAILED');
   const found=inventory.body.filter(team=>team.name===name&&valid(team.id));
   assert.ok(found.length<=1,'QA_RECOVERY_AMBIGUOUS');
   if(found.length===1)teamId=found[0].id;
  }
  if(valid(teamId)){
   try{
    if(valid(playerId)){
     const roster=await api(0,'GET','/api/teams/'+teamId+'/members');
     if(roster.status===200&&roster.body.some(m=>m.profileId===playerId)){
      const removal=await api(0,'DELETE','/api/teams/'+teamId+'/members/'+playerId);
      assert.equal(removal.status,204,'QA_MEMBER_CLEANUP_FAILED');
     }
    }
    const removed=await api(0,'DELETE','/api/teams/'+teamId);
    assert.equal(removed.status,204,'QA_TEAM_DELETE_FAILED');
    const mine=await api(0,'GET','/api/teams/mine');
    assert.equal(mine.status,200,'QA_CLEANUP_INVENTORY_FAILED');
    assert.ok(!mine.body.some(team=>team.id===teamId),'QA_TEAM_STILL_OWNED');
    cleaned=true;
    console.log('[PASS] QA permanent team deleted and ownership inventory confirms cleanup.');
   }catch(e){
    console.error('[FAIL] QA_TEAM_CLEANUP_REQUIRES_ATTENTION');
    throw e;
   }
  }
 }
 assert.ok(cleaned,'QA_CLEANUP_NOT_CONFIRMED');
 console.log('[PASS] Two-account permanent-team access E2E completed without residual QA team.');
}
main().catch(e=>{
 console.error('[FAIL] '+String(e?.message||e).replace(/https?:[^ ]+/g,'[redacted]').slice(0,140));
 process.exitCode=1;
});
