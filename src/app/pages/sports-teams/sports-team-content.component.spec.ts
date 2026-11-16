import { SimpleChange } from '@angular/core';
import { of, Subject } from 'rxjs';
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
      ['content','attachmentsAvailable','reactions','sendContent']);
    realtime=jasmine.createSpyObj<DirectChatRealtimeService>('DirectChatRealtimeService',['connect']);
    api.attachmentsAvailable.and.returnValue(of({available:false}));
    api.reactions.and.returnValue(of({}));
    component=new SportsTeamContentComponent(api,realtime);
    component.teamId=7;
    component.kind='chat';
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
});
