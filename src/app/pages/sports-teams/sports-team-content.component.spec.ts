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
      ['content','attachmentsAvailable','reactions','sendContent','downloadContentFile','uploadContentFiles']);
    realtime=jasmine.createSpyObj<DirectChatRealtimeService>('DirectChatRealtimeService',['connect']);
    api.attachmentsAvailable.and.returnValue(of({available:false}));
    api.reactions.and.returnValue(of({}));
    component=new SportsTeamContentComponent(api,realtime);
    component.teamId=7;
    component.kind='chat';
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
});
