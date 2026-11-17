import { SimpleChange } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { of, Subject, throwError } from 'rxjs';
import { SportsTeamContentComponent } from './sports-team-content.component';
import { SportsTeamsService, TeamContentEntry } from '../../services/sports-teams.service';
import { DirectChatRealtimeService } from '../../services/direct-chat-realtime.service';

describe('Team conversation synchronization', () => {
  let api: jasmine.SpyObj<SportsTeamsService>;
  let realtime: jasmine.SpyObj<DirectChatRealtimeService>;
  let component: SportsTeamContentComponent;
  const entry = (id:number, teamId:number, body='Olá'): TeamContentEntry => ({
    id, teamId, body, username:'tester', createdAt:'2026-11-16T00:00:00Z',
    replyToId:null, editedAt:null, deleted:false, canManage:true, canEdit:true,
    attachments:[]
  });

  beforeEach(() => {
    api=jasmine.createSpyObj<SportsTeamsService>('SportsTeamsService',
      ['content','searchContent','attachmentsAvailable','reactions','sendContent','downloadContentFile','uploadContentFiles','editContent','deleteContent','playerAvatarSrc','setReaction','removeReaction']);
    realtime=jasmine.createSpyObj<DirectChatRealtimeService>('DirectChatRealtimeService',['connect']);
    api.attachmentsAvailable.and.returnValue(of({available:false}));
    api.searchContent.and.returnValue(of([]));
    api.reactions.and.returnValue(of({}));
    component=new SportsTeamContentComponent(api,realtime);
    component.teamId=7;
    component.kind='chat';
  });

  it('uses the existing safe avatar URL helper and keeps a fallback for missing photos',()=>{
    api.playerAvatarSrc.and.callFake(url=>url?.startsWith('https://')?url:null);
    const withPhoto={...entry(2,7),profilePicUrl:'https://cdn.example.org/athlete.png'};
    const missingPhoto={...entry(3,7),profilePicUrl:null};
    const suspicious={...entry(4,7),profilePicUrl:'javascript:alert(1)'};
    expect(component.authorAvatarSrc(withPhoto)).toBe('https://cdn.example.org/athlete.png');
    expect(component.authorAvatarSrc(missingPhoto)).toBeNull();
    expect(component.authorAvatarSrc(suspicious)).toBeNull();
    component.brokenAuthorAvatars.add(2);
    api.content.and.returnValue(of([]));
    component.ngOnChanges({teamId:new SimpleChange(7,8,false)});
    expect(component.brokenAuthorAvatars.size).toBe(0);
  });

  it('shows team feed posts newest first without altering chronological chat history',()=>{
    component.items=[entry(1,7,'Primeiro'),entry(2,7,'Segundo'),entry(3,7,'Terceiro')];
    component.kind='feed';
    expect(component.visibleEntries().map(item=>item.id)).toEqual([3,2,1]);
    expect(component.items.map(item=>item.id)).toEqual([1,2,3]);
    component.searchResults=[entry(4,7),entry(8,7)];
    component.searchActive=true;
    expect(component.visibleEntries().map(item=>item.id)).toEqual([8,4]);
    component.kind='chat';
    expect(component.visibleEntries().map(item=>item.id)).toEqual([4,8]);
    component.searchActive=false;
    expect(component.visibleEntries().map(item=>item.id)).toEqual([1,2,3]);
  });

  it('keeps comments beneath the correct newest-first private team posts',()=>{
    component.kind='feed';
    component.items=[
      entry(1,7,'Primeira'),
      {...entry(2,7,'Resposta'),replyToId:1},
      entry(3,7,'Segunda'),
      {...entry(4,7,'Resposta da resposta'),replyToId:2},
      {...entry(5,7,'Resposta à segunda'),replyToId:3},
      {...entry(6,7,'Sem pai carregado'),replyToId:999}
    ];
    expect(component.visibleEntries().map(item=>item.id)).toEqual([6,3,5,1,2,4]);
    expect(component.isFeedComment(component.items[1])).toBeTrue();
    expect(component.isFeedComment(component.items[5])).toBeFalse();
    component.kind='chat';
    expect(component.visibleEntries().map(item=>item.id)).toEqual([1,2,3,4,5,6]);
  });

  it('shows the private feed editor above posts only when no visible comment is selected',()=>{
    component.kind='feed';
    component.items=[entry(10,7,'Publicação')];
    expect(component.showFeedComposerAtTop()).toBeTrue();
    component.reply(component.items[0]);
    expect(component.replyTargetId).toBe(10);
    expect(component.showFeedComposerAtTop()).toBeFalse();
    component.reply(component.items[0]);
    expect(component.replyTargetId).toBeNull();
    expect(component.showFeedComposerAtTop()).toBeTrue();
    component.replyTargetId=999;
    expect(component.showFeedComposerAtTop()).toBeTrue();
    component.searchActive=true;
    component.searchResults=[];
    component.replyTargetId=10;
    expect(component.showFeedComposerAtTop()).toBeTrue();
    component.kind='chat';
    expect(component.showFeedComposerAtTop()).toBeFalse();
  });

  it('sends a comment through the authenticated team feed endpoint without double posting',()=>{
    const comment=entry(12,7,'Boa partida!');
    comment.replyToId=10;
    component.kind='feed';
    component.items=[entry(10,7,'Treino de hoje')];
    component.reply(component.items[0]);
    component.draft='Boa partida!';
    api.sendContent.and.returnValue(of(comment));
    api.content.and.returnValue(of([component.items[0],comment]));
    component.send();
    expect(api.sendContent).toHaveBeenCalledOnceWith(7,'feed','Boa partida!',10);
    expect(component.replyTargetId).toBeNull();
    expect(component.draft).toBe('');
    expect(component.visibleEntries().map(item=>item.id)).toEqual([10,12]);
  });

  it('does not publish private comments when a send is already in progress',()=>{
    component.kind='feed';
    component.replyTargetId=10;
    component.draft='Uma resposta';
    const pending=new Subject<TeamContentEntry>();
    api.sendContent.and.returnValue(pending.asObservable());
    // The failure handler revalidates the authenticated history; the test must
    // supply that response rather than allowing a mock to return undefined.
    api.content.and.returnValue(of([]));
    component.send();
    component.send();
    expect(api.sendContent).toHaveBeenCalledTimes(1);
    pending.error(new HttpErrorResponse({status:500}));
    expect(component.draft).toBe('Uma resposta');
    expect(component.replyTargetId).toBe(10);
  });

  it('preserves independent post and comment drafts with their attachments',()=>{
    component.kind='feed';
    const original=entry(10,7,'Partida de hoje');
    const another=entry(20,7,'Treino de amanhã');
    component.items=[original,another];
    const image=new File(['photo'],'foto.png',{type:'image/png'});
    component.draft='Publicação em preparação';component.files=[image];
    component.reply(original);
    expect(component.draft).toBe('');expect(component.files).toEqual([]);
    component.draft='Comentário ainda não enviado';
    component.reply(another);
    expect(component.draft).toBe('');
    component.cancelReply();
    expect(component.replyTargetId).toBeNull();
    expect(component.draft).toBe('Publicação em preparação');
    expect(component.files).toEqual([image]);
    component.reply(original);
    expect(component.draft).toBe('Comentário ainda não enviado');
    expect(component.files).toEqual([]);
    component.cancelReply();
    expect(component.draft).toBe('Publicação em preparação');
  });

  it('restores the post draft after an accepted comment but keeps it after an uncertain send',()=>{
    component.kind='feed';component.items=[entry(10,7,'Partida')];
    component.draft='Meu post';
    component.reply(component.items[0]);
    component.draft='Comentário';
    api.sendContent.and.returnValue(of({...entry(12,7,'Comentário'),replyToId:10}));
    api.content.and.returnValue(of([component.items[0],{...entry(12,7,'Comentário'),replyToId:10}]));
    component.send();
    expect(component.replyTargetId).toBeNull();
    expect(component.draft).toBe('Meu post');
    component.reply(component.items[0]);
    component.draft='Outro comentário';
    const delayed=new Subject<TeamContentEntry>();
    api.sendContent.and.returnValue(delayed.asObservable());
    component.send();
    component.cancelReply();
    expect(component.replyTargetId).toBe(10);
    delayed.error(new HttpErrorResponse({status:500}));
    expect(component.replyTargetId).toBe(10);
    expect(component.draft).toBe('Outro comentário');
  });

  it('previews selected private media without uploading until publish and releases local URLs',()=>{
    const photo=new File(['photo'],'equipa.png',{type:'image/png'});
    const video=new File(['video'],'jogo.mp4',{type:'video/mp4'});
    const create=spyOn(URL,'createObjectURL').and.returnValues('blob:photo','blob:video');
    const revoke=spyOn(URL,'revokeObjectURL');
    component.files=[photo,video];
    expect(component.filePreviewUrl(photo)).toBe('blob:photo');
    expect(component.filePreviewUrl(photo)).toBe('blob:photo');
    expect(component.filePreviewUrl(video)).toBe('blob:video');
    expect(create).toHaveBeenCalledTimes(2);
    expect(api.uploadContentFiles).not.toHaveBeenCalled();
    component.removeSelectedFile(0);
    expect(component.files).toEqual([video]);
    expect(revoke).toHaveBeenCalledWith('blob:photo');
    component.clearFiles();
    expect(component.files).toEqual([]);
    expect(revoke).toHaveBeenCalledWith('blob:video');
  });

  it('does not let a pending private upload remove its selected files',()=>{
    component.sending=true;
    component.files=[new File(['p'],'imagem.png',{type:'image/png'})];
    component.removeSelectedFile(0);
    expect(component.files).toHaveSize(1);
  });

  it('collapses threaded comments without losing root posts, search hits, or active reply editor',()=>{
    component.kind='feed';
    component.items=[
      entry(1,7,'Post'),
      {...entry(2,7,'Comentário'),replyToId:1},
      {...entry(3,7,'Subcomentário'),replyToId:2},
      entry(4,7,'Outro post')
    ];
    expect(component.commentCount(1)).toBe(2);
    expect(component.visibleEntries().map(item=>item.id)).toEqual([4,1,2,3]);
    component.toggleComments(1);
    expect(component.visibleEntries().map(item=>item.id)).toEqual([4,1]);
    component.reply(component.items[1]);
    expect(component.visibleEntries().map(item=>item.id)).toEqual([4,1,2]);
    component.cancelReply();
    component.searchActive=true;
    component.searchResults=[component.items[0],component.items[1],component.items[2]];
    expect(component.visibleEntries().map(item=>item.id)).toEqual([1,2,3]);
    component.kind='chat';
    expect(component.visibleEntries().map(item=>item.id)).toEqual([1,2,3]);
  });

  it('recalculates cached thread totals after new comments and filtered searches',()=>{
    component.kind='feed';
    const root=entry(1,7,'Post');
    const child={...entry(2,7,'Comentário'),replyToId:1};
    component.items=[root,child];
    expect(component.commentCount(1)).toBe(1);
    expect(component.commentCount(1)).toBe(1);
    component.items=[...component.items,{...entry(3,7,'Resposta'),replyToId:2}];
    expect(component.commentCount(1)).toBe(2);
    component.searchActive=true;
    component.searchResults=[root];
    expect(component.commentCount(1)).toBe(0);
    component.searchResults=[root,child];
    expect(component.commentCount(1)).toBe(1);
    component.kind='chat';
    expect(component.commentCount(1)).toBe(0);
  });

  it('reuses sorted feed cards until history, collapsed comments, or reply selection changes',()=>{
    component.kind='feed';
    const a=entry(1,7,'Post'),b={...entry(2,7,'Comentário'),replyToId:1};
    component.items=[a,b];
    const first=component.visibleEntries();
    expect(first.map(item=>item.id)).toEqual([1,2]);
    expect(component.visibleEntries()).toBe(first);
    component.toggleComments(1);
    const folded=component.visibleEntries();
    expect(folded.map(item=>item.id)).toEqual([1]);
    expect(folded).not.toBe(first);
    expect(component.visibleEntries()).toBe(folded);
    component.reply(b);
    expect(component.visibleEntries().map(item=>item.id)).toEqual([1,2]);
    component.cancelReply();
    component.items=[...component.items,entry(3,7,'Outro post')];
    expect(component.visibleEntries().map(item=>item.id)).toEqual([3,1]);
  });

  it('sums reaction totals and hides the optional feed emoji picker after selection',()=>{
    component.kind='feed';
    component.reactionsById={12:{mine:'❤️',counts:{'❤️':3,'👍':2,'😂':1}}};
    expect(component.reactionCount(12)).toBe(6);
    expect(component.reactionCount(999)).toBe(0);
    component.toggleFeedReactionPicker(12);
    expect(component.feedReactionPickerId).toBe(12);
    component.toggleFeedReactionPicker(12);
    expect(component.feedReactionPickerId).toBeNull();
    component.toggleFeedReactionPicker(12);
    api.removeReaction.and.returnValue(of({}));
    component.react(entry(12,7,'Post'),'❤️');
    expect(component.feedReactionPickerId).toBeNull();
    expect(api.removeReaction).toHaveBeenCalled();
  });

  it('pastes images into the private composer without sending or bypassing authorization',()=>{
    const image=new File(['png-bytes'],'captura.png',{type:'image/png'});
    const event={
      clipboardData:{files:[image]},
      preventDefault:jasmine.createSpy('preventDefault')
    } as unknown as ClipboardEvent;
    component.attachmentsEnabled=true;
    component.onComposerPaste(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(component.files).toEqual([image]);
    expect(api.uploadContentFiles).not.toHaveBeenCalled();
    component.files=[];
    component.attachmentsEnabled=false;
    component.onComposerPaste(event);
    expect(component.files).toEqual([]);
    component.attachmentsEnabled=true;
    component.accessRevoked=true;
    component.onComposerPaste(event);
    expect(component.files).toEqual([]);
  });

  it('sends chat messages with Enter but keeps Shift+Enter for multiline drafts',()=>{
    api.sendContent.and.returnValue(of(entry(10,7,'Mensagem nova')));
    api.content.and.returnValue(of([entry(10,7,'Mensagem nova')]));
    component.draft='Mensagem nova';
    const plain={
      key:'Enter',shiftKey:false,altKey:false,ctrlKey:false,metaKey:false,
      isComposing:false,preventDefault:jasmine.createSpy('preventDefault')
    } as unknown as KeyboardEvent;
    component.onComposerKeydown(plain);
    expect(plain.preventDefault).toHaveBeenCalled();
    expect(api.sendContent).toHaveBeenCalledOnceWith(7,'chat','Mensagem nova',null);
    const shifted={
      ...plain,shiftKey:true,preventDefault:jasmine.createSpy('shiftPreventDefault')
    } as unknown as KeyboardEvent;
    component.draft='Outra linha';
    component.onComposerKeydown(shifted);
    expect(shifted.preventDefault).not.toHaveBeenCalled();
    expect(api.sendContent).toHaveBeenCalledTimes(1);
    component.kind='feed';
    component.onComposerKeydown(plain);
    expect(api.sendContent).toHaveBeenCalledTimes(1);
  });

  it('ignores old responses when changing team while an HTTP history load is pending',()=>{
    const oldRead=new Subject<TeamContentEntry[]>();
    const newRead=new Subject<TeamContentEntry[]>();
    api.content.and.returnValues(oldRead.asObservable(),newRead.asObservable());
    component.read(false);
    component.teamId=8;
    component.ngOnChanges({teamId:new SimpleChange(7,8,false)});
    expect(api.content).toHaveBeenCalledTimes(2);
    newRead.next([entry(9,8,'Nova equipa')]);
    newRead.complete();
    oldRead.next([entry(3,7,'Outra equipa')]);
    oldRead.complete();
    expect(component.items.map(item=>item.teamId)).toEqual([8]);
  });

  it('discards a read overtaken by sending instead of undoing a confirmed message',()=>{
    const oldRead=new Subject<TeamContentEntry[]>();
    const refreshedRead=new Subject<TeamContentEntry[]>();
    const sendResult=new Subject<TeamContentEntry>();
    api.content.and.returnValues(oldRead.asObservable(),refreshedRead.asObservable());
    api.sendContent.and.returnValue(sendResult.asObservable());
    component.read(false);
    component.draft='Mensagem nova';
    component.send();
    oldRead.next([entry(1,7,'Antiga')]);
    oldRead.complete();
    expect(component.items).toEqual([]);
    sendResult.next(entry(2,7,'Mensagem nova'));
    sendResult.complete();
    expect(component.items.map(item=>item.id)).toEqual([2]);
    refreshedRead.next([entry(1,7,'Antiga'),entry(2,7,'Mensagem nova')]);
    refreshedRead.complete();
    expect(component.items.map(item=>item.id)).toEqual([1,2]);
  });

  it('reconciles a second update signalled during an in-flight history request',()=>{
    const first=new Subject<TeamContentEntry[]>();
    const second=new Subject<TeamContentEntry[]>();
    api.content.and.returnValues(first.asObservable(),second.asObservable());
    component.read(false);
    component.read(true);
    expect(api.content).toHaveBeenCalledTimes(1);
    first.next([entry(1,7)]);
    first.complete();
    expect(api.content).toHaveBeenCalledTimes(2);
    second.next([entry(1,7),entry(2,7)]);
    second.complete();
    expect(component.items.map(item=>item.id)).toEqual([1,2]);
  });

  it('removes cached private history after membership is revoked',()=>{
    const denied=new Subject<TeamContentEntry[]>();
    api.content.and.returnValue(denied.asObservable());
    component.items=[entry(1,7,'Mensagem privada')];
    component.searchResults=[entry(1,7,'Pesquisa privada')];
    component.searchActive=true;
    component.draft='Rascunho privado';
    component.attachmentsEnabled=true;
    component.read(true);
    denied.error(new HttpErrorResponse({status:403,statusText:'Forbidden'}));
    expect(component.accessRevoked).toBeTrue();
    expect(component.items).toEqual([]);
    expect(component.searchResults).toEqual([]);
    expect(component.searchActive).toBeFalse();
    expect(component.draft).toBe('');
    expect(component.attachmentsEnabled).toBeFalse();
    component.read(true);
    expect(api.content).toHaveBeenCalledTimes(1);
  });

  it('sends an attachment without a caption as a valid team message',()=>{
    const uploadResult=new Subject<TeamContentEntry>();
    api.uploadContentFiles.and.returnValue(uploadResult.asObservable());
    api.content.and.returnValue(of([]));
    const attachment=new File(['%PDF-1.7'],'prova.pdf',{type:'application/pdf'});
    component.files=[attachment];
    component.draft='';
    component.send();
    expect(api.uploadContentFiles).toHaveBeenCalledOnceWith(7,'chat',[attachment],'',null);
    expect(component.sending).toBeTrue();
    uploadResult.next({...entry(20,7,'📎 prova.pdf'),attachments:[
      {index:0,filename:'prova.pdf',mimeType:'application/pdf',size:8}
    ]});
    uploadResult.complete();
    expect(component.sending).toBeFalse();
    expect(component.files).toEqual([]);
  });

  it('hides cached messages and drafts when the owner disables team chat (409)',()=>{
    api.content.and.returnValue(throwError(()=>new HttpErrorResponse({status:409,statusText:'Conflict'})));
    component.items=[entry(1,7,'Mensagem antiga')];
    component.draft='Rascunho';
    component.attachmentsEnabled=true;
    component.read(false);
    expect(component.accessRevoked).toBeTrue();
    expect(component.blockedReason).toContain('desativado');
    expect(component.items).toEqual([]);
    expect(component.draft).toBe('');
    expect(component.attachmentsEnabled).toBeFalse();
  });

  it('reopens a disabled chat only after an authenticated refresh succeeds',()=>{
    api.content.and.returnValues(
      throwError(()=>new HttpErrorResponse({status:409,statusText:'Conflict'})),
      of([entry(4,7,'Conversa reativada')])
    );
    component.read(false);
    expect(component.accessRevoked).toBeTrue();
    expect(component.items).toEqual([]);
    component.read(true);
    expect(api.content).toHaveBeenCalledTimes(1);
    component.read(true,true);
    expect(api.content).toHaveBeenCalledTimes(2);
    expect(component.accessRevoked).toBeFalse();
    expect(component.items.map(item=>item.id)).toEqual([4]);
    expect(component.blockedReason).toBe('Já não tens acesso a esta conversa.');
  });

  it('keeps removed players blocked when a revalidation is also denied',()=>{
    api.content.and.returnValue(
      throwError(()=>new HttpErrorResponse({status:403,statusText:'Forbidden'})));
    component.items=[entry(8,7,'Privada')];
    component.read(false);
    expect(component.accessRevoked).toBeTrue();
    component.read(true,true);
    expect(api.content).toHaveBeenCalledTimes(2);
    expect(component.accessRevoked).toBeTrue();
    expect(component.items).toEqual([]);
  });

  it('revokes cached chat when a reaction summary rejects a removed member',()=>{
    api.content.and.returnValue(of([entry(3,7,'Privada')]));
    api.reactions.and.returnValue(throwError(()=>new HttpErrorResponse({status:403,statusText:'Forbidden'})));
    component.read(false);
    expect(component.accessRevoked).toBeTrue();
    expect(component.items).toEqual([]);
    expect(component.reactionsById).toEqual({});
  });

  it('auto-renders only four recent private feed photos without duplicate downloads',()=>{
    component.kind='feed';
    const rows=Array.from({length:6},(_,i)=>({
      ...entry(i+1,7,'Post '+i),
      attachments:[{index:0,filename:'photo.png',mimeType:'image/png',size:128}]
    }));
    const image=new Blob(['png'],{type:'image/png'});
    api.content.and.returnValue(of(rows));
    api.downloadContentFile.and.returnValue(of(image));
    const create=spyOn(URL,'createObjectURL').and.returnValue('blob:private');
    const revoke=spyOn(URL,'revokeObjectURL');
    component.read(false);
    expect(api.downloadContentFile).toHaveBeenCalledTimes(4);
    expect(create).toHaveBeenCalledTimes(4);
    expect(Object.keys(component.previews)).toHaveSize(4);
    component.read(true);
    expect(api.downloadContentFile).toHaveBeenCalledTimes(4);
    component.ngOnDestroy();
    expect(revoke).toHaveBeenCalledTimes(4);
  });

  it('drops late auto-preview bytes when a private team feed loses authorization',()=>{
    component.kind='feed';
    const row={...entry(11,7,'Private'),attachments:[
      {index:0,filename:'photo.png',mimeType:'image/png',size:128}
    ]};
    const pending=new Subject<Blob>();
    api.downloadContentFile.and.returnValue(pending.asObservable());
    api.content.and.returnValues(of([row]),
      throwError(()=>new HttpErrorResponse({status:403,statusText:'Forbidden'})));
    component.read(false);
    expect(api.downloadContentFile).toHaveBeenCalledTimes(1);
    component.read(true);
    pending.next(new Blob(['private'],{type:'image/png'}));
    expect(component.accessRevoked).toBeTrue();
    expect(Object.keys(component.previews)).toEqual([]);
  });

  it('stops private feed media and reaction requests after an authorization denial',()=>{
    component.kind='feed';
    const items=Array.from({length:4},(_,index)=>({
      ...entry(index+1,7,'Private '+index),
      attachments:[{index:0,filename:'photo.png',mimeType:'image/png',size:100}]
    }));
    api.content.and.returnValue(of(items));
    api.downloadContentFile.and.returnValue(
      throwError(()=>new HttpErrorResponse({status:403,statusText:'Forbidden'})));
    component.read(false);
    expect(api.downloadContentFile).toHaveBeenCalledTimes(1);
    expect(api.reactions).not.toHaveBeenCalled();
    expect(component.accessRevoked).toBeTrue();
    expect(component.items).toEqual([]);
  });

  it('does not restore a preview that resolves after access was revoked',()=>{
    const file=new Subject<Blob>();
    api.downloadContentFile.and.returnValue(file.asObservable());
    const message=entry(4,7,'Com anexo');
    component.items=[message];
    component.preview(message,{index:0,mimeType:'image/png',filename:'foto.png'});
    api.content.and.returnValue(throwError(()=>new HttpErrorResponse({status:403,statusText:'Forbidden'})));
    component.read(false);
    file.next(new Blob(['image'],{type:'image/png'}));
    file.complete();
    expect(component.accessRevoked).toBeTrue();
    expect(Object.keys(component.previews)).toEqual([]);
  });

  it('does not restore private history from a pending read after an attachment is denied',()=>{
    const pendingHistory=new Subject<TeamContentEntry[]>();
    const pendingPreview=new Subject<Blob>();
    api.content.and.returnValue(pendingHistory.asObservable());
    api.downloadContentFile.and.returnValue(pendingPreview.asObservable());
    const message=entry(6,7,'Conteúdo reservado');
    component.items=[message];
    component.read(false);
    component.preview(message,{index:0,mimeType:'image/png',filename:'prova.png'});
    pendingPreview.error(new HttpErrorResponse({status:403,statusText:'Forbidden'}));
    expect(component.accessRevoked).toBeTrue();
    pendingHistory.next([message]);
    pendingHistory.complete();
    expect(component.items).toEqual([]);
    expect(Object.keys(component.previews)).toEqual([]);
  });

  it('unlocks a newly selected team without allowing a previous send to change it',()=>{
    const pendingSend=new Subject<TeamContentEntry>();
    api.sendContent.and.returnValue(pendingSend.asObservable());
    api.content.and.returnValue(of([entry(7,8,'Mensagem da equipa nova')]));
    component.draft='Mensagem da equipa antiga';
    component.send();
    expect(component.sending).toBeTrue();
    component.teamId=8;
    component.ngOnChanges({teamId:new SimpleChange(7,8,false)});
    expect(component.sending).toBeFalse();
    expect(component.items.map(item=>item.teamId)).toEqual([8]);
    pendingSend.next(entry(9,7,'Mensagem da equipa antiga'));
    pendingSend.complete();
    expect(component.items.map(item=>item.teamId)).toEqual([8]);
    expect(component.sending).toBeFalse();
  });

  it('resets revoked state after switching to another team',()=>{
    api.content.and.returnValue(of([]));
    component.accessRevoked=true;
    component.teamId=8;
    component.ngOnChanges({teamId:new SimpleChange(7,8,false)});
    expect(component.accessRevoked).toBeFalse();
    expect(api.content).toHaveBeenCalledTimes(1);
  });

  it('updates visible search hits when a live history refresh contains edits',()=>{
    const original=entry(11,7,'Antes');
    const revised={...original,body:'Depois',editedAt:'2026-11-17T12:00:00Z'};
    component.searchActive=true;
    component.searchResults=[original];
    api.content.and.returnValue(of([revised]));
    component.read(false);
    expect(component.searchActive).toBeTrue();
    expect(component.searchResults[0].body).toBe('Depois');
  });

  it('updates search results immediately when an edited team message is confirmed',()=>{
    const original=entry(12,7,'Antes');
    const revised={...original,body:'Depois'};
    component.items=[original];
    component.searchResults=[original];
    component.searchActive=true;
    api.editContent.and.returnValue(of(revised));
    api.content.and.returnValue(of([revised]));
    component.beginEdit(original);
    component.editingDraft='Depois';
    component.saveEdit(original);
    expect(component.searchResults[0].body).toBe('Depois');
    expect(component.editingId).toBeNull();
  });

  it('removes deleted search content and local attachment previews',()=>{
    const original=entry(13,7,'Privado');
    component.items=[original];
    component.searchResults=[original];
    component.searchActive=true;
    const url='blob:team-test-preview';
    component.previews['13:0']={url,type:'image'};
    const revoke=spyOn(URL,'revokeObjectURL');
    spyOn(window,'confirm').and.returnValue(true);
    api.deleteContent.and.returnValue(of(void 0));
    api.content.and.returnValue(of([{...original,deleted:true,body:'',attachments:[]}]));
    component.remove(original);
    expect(component.searchResults[0].deleted).toBeTrue();
    expect(component.searchResults[0].body).toBe('');
    expect(component.previews['13:0']).toBeUndefined();
    expect(revoke).toHaveBeenCalledWith(url);
  });

  it('keeps a reader on older messages and announces new chat messages',()=>{
    const pane={scrollTop:0,clientHeight:200,scrollHeight:700} as HTMLDivElement;
    component.historyPane={nativeElement:pane} as any;
    component.items=[entry(1,7,'Mensagem antiga')];
    component.onHistoryScroll();
    api.content.and.returnValue(of([entry(1,7,'Mensagem antiga'),entry(2,7,'Mensagem nova')]));
    component.read(true);
    expect(component.unseenBelow).toBeTrue();
    expect(pane.scrollTop).toBe(0);
    component.showLatest();
    expect(component.unseenBelow).toBeFalse();
    expect(pane.scrollTop).toBe(700);
  });

  it('does not clear a newly selected reply after an older send succeeds',()=>{
    const pending=new Subject<TeamContentEntry>();
    api.sendContent.and.returnValue(pending.asObservable());
    api.content.and.returnValue(of([]));
    component.replyTargetId=1;
    component.draft='Olá';
    component.send();
    expect(api.sendContent).toHaveBeenCalledOnceWith(7,'chat','Olá',1);
    component.replyTargetId=2;
    component.draft='Outra mensagem';
    pending.next(entry(3,7,'Olá'));
    pending.complete();
    expect(component.replyTargetId).toBe(2);
    expect(component.draft).toBe('Outra mensagem');
  });

  it('never recreates a private preview after an in-flight attachment was deleted',()=>{
    const message={...entry(31,7,'Imagem antiga'),attachments:[
      {index:0,mimeType:'image/png',filename:'foto.png',size:30}
    ]};
    const pending=new Subject<Blob>();
    api.downloadContentFile.and.returnValue(pending.asObservable());
    component.items=[message];
    const create=spyOn(URL,'createObjectURL').and.returnValue('blob:should-not-appear');
    component.preview(message,{index:0,mimeType:'image/png',filename:'foto.png'});
    component.items=[{...message,deleted:true,body:'',attachments:[]}];
    pending.next(new Blob(['private'],{type:'image/png'}));
    pending.complete();
    expect(create).not.toHaveBeenCalled();
    expect(component.previews['31:0']).toBeUndefined();
  });

  it('rejects a late attachment preview after a realtime refresh removes that file',()=>{
    const message={...entry(32,7,'Ficheiro'),attachments:[
      {index:0,mimeType:'image/png',filename:'foto.png',size:30}
    ]};
    const pending=new Subject<Blob>();
    api.downloadContentFile.and.returnValue(pending.asObservable());
    component.items=[message];
    const create=spyOn(URL,'createObjectURL').and.returnValue('blob:should-not-appear');
    component.preview(message,{index:0,mimeType:'image/png',filename:'foto.png'});
    component.items=[{...message,attachments:[]}];
    pending.next(new Blob(['private'],{type:'image/png'}));
    pending.complete();
    expect(create).not.toHaveBeenCalled();
    expect(component.previews['32:0']).toBeUndefined();
  });

  it('revokes an already visible private preview after remote deletion is reconciled',()=>{
    const original={...entry(41,7,'Imagem'),attachments:[
      {index:0,mimeType:'image/png',filename:'foto.png',size:60}
    ]};
    component.items=[original];
    component.previews['41:0']={url:'blob:remote-deleted',type:'image'};
    const revoke=spyOn(URL,'revokeObjectURL');
    api.content.and.returnValue(of([{...original,deleted:true,body:'',attachments:[]}]));
    component.read(true);
    expect(component.previews['41:0']).toBeUndefined();
    expect(revoke).toHaveBeenCalledWith('blob:remote-deleted');
  });

  it('preserves a search-only old attachment until authoritative history updates it',()=>{
    const old={...entry(42,7,'Arquivo'),attachments:[
      {index:0,mimeType:'image/png',filename:'arquivo.png',size:40}
    ]};
    component.items=[];
    component.searchActive=true;
    component.searchResults=[old];
    component.previews['42:0']={url:'blob:old-search',type:'image'};
    const revoke=spyOn(URL,'revokeObjectURL');
    api.content.and.returnValue(of([]));
    component.read(true);
    expect(component.previews['42:0']).toBeDefined();
    expect(revoke).not.toHaveBeenCalled();
    api.content.and.returnValue(of([{...old,deleted:true,body:'',attachments:[]}]));
    component.read(true);
    expect(component.previews['42:0']).toBeUndefined();
    expect(revoke).toHaveBeenCalledWith('blob:old-search');
  });

  it('keeps a private chat open when editing a concurrently deleted message returns 409',()=>{
    const original=entry(50,7,'Antes');
    component.items=[original];
    api.editContent.and.returnValue(throwError(()=>new HttpErrorResponse({status:409})));
    api.content.and.returnValue(of([{...original,deleted:true,body:'',attachments:[]}]));
    component.beginEdit(original);
    component.editingDraft='Depois';
    component.saveEdit(original);
    expect(component.accessRevoked).toBeFalse();
    expect(component.items[0].deleted).toBeTrue();
  });

  it('does not revoke the team on a duplicate delete conflict',()=>{
    const original=entry(51,7,'Já eliminada noutro dispositivo');
    component.items=[original];
    spyOn(window,'confirm').and.returnValue(true);
    api.deleteContent.and.returnValue(throwError(()=>new HttpErrorResponse({status:409})));
    api.content.and.returnValue(of([{...original,deleted:true,body:'',attachments:[]}]));
    component.remove(original);
    expect(component.accessRevoked).toBeFalse();
    expect(component.items[0].deleted).toBeTrue();
  });

  it('still revokes a team if a conflicting mutation is followed by a disabled-history 409',()=>{
    const original=entry(52,7,'Chat desativado');
    component.items=[original];
    api.editContent.and.returnValue(throwError(()=>new HttpErrorResponse({status:409})));
    api.content.and.returnValue(throwError(()=>new HttpErrorResponse({status:409})));
    component.beginEdit(original);
    component.editingDraft='Tentativa';
    component.saveEdit(original);
    expect(component.accessRevoked).toBeTrue();
    expect(component.items).toEqual([]);
  });

  it('refreshes old search hits outside the recent history and removes stale private previews',()=>{
    const old={...entry(4,7,'Texto antigo'),attachments:[
      {index:0,mimeType:'image/png',filename:'antigo.png',size:10}
    ]};
    component.searchTerm='antigo';component.searchActive=true;component.searchResults=[old];
    component.previews['4:0']={url:'blob:old-hit',type:'image'};
    const revoke=spyOn(URL,'revokeObjectURL');
    api.content.and.returnValue(of([]));
    api.searchContent.and.returnValue(of([]));
    component.read(true);
    expect(api.searchContent).toHaveBeenCalledOnceWith(7,'chat','antigo');
    expect(component.searchActive).toBeTrue();
    expect(component.searchResults).toEqual([]);
    expect(revoke).toHaveBeenCalledWith('blob:old-hit');
  });

  it('never revokes unrelated search results when a background search arrives after being cleared',()=>{
    const delayed=new Subject<TeamContentEntry[]>();
    const old=entry(7,7,'Antes');
    component.searchTerm='antes';component.searchActive=true;component.searchResults=[old];
    api.content.and.returnValue(of([]));
    api.searchContent.and.returnValue(delayed.asObservable());
    component.read(true);
    component.clearSearch();
    delayed.next([old]);delayed.complete();
    expect(component.searchActive).toBeFalse();
    expect(component.searchResults).toEqual([]);
  });
});
