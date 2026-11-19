import {HttpErrorResponse} from '@angular/common/http';
import {ComponentFixture,TestBed} from '@angular/core/testing';
import {of,Subject,throwError} from 'rxjs';
import {DirectChatService} from '../services/direct-chat.service';
import {DirectChatRealtimeService} from '../services/direct-chat-realtime.service';
import {DirectChatMessage} from '../pages/model/direct-chat';
import {DirectCallChatPanelComponent} from './direct-call-chat-panel.component';

describe('Teams-style chat beside a live call',()=>{
 let fixture:ComponentFixture<DirectCallChatPanelComponent>;
 let api:jasmine.SpyObj<DirectChatService>;
 const realtimeEvents=new Subject<DirectChatMessage>();
 const received:DirectChatMessage={
  id:10,username1:'beatriz',username2:'ana',text:'Olá',date:'2026-11-19T14:00:00Z',dataDisplay:null
 };
 beforeEach(async()=>{
  api=jasmine.createSpyObj<DirectChatService>('DirectChatService',['history','send']);
  api.history.and.returnValue(of([received]));
  api.send.and.returnValue(of({id:11,username1:'ana',username2:'beatriz',
   text:'Até já',date:'2026-11-19T14:01:00Z',dataDisplay:null}));
  await TestBed.configureTestingModule({
   imports:[DirectCallChatPanelComponent],
   providers:[
    {provide:DirectChatService,useValue:api},
    {provide:DirectChatRealtimeService,useValue:{messages$:realtimeEvents.asObservable()}}
   ]
  }).compileComponents();
  fixture=TestBed.createComponent(DirectCallChatPanelComponent);
  fixture.componentRef.setInput('peer','beatriz');
  fixture.detectChanges();
 });
 afterEach(()=>fixture.destroy());
 it('shows the existing authenticated DM history without routing away from the call',()=>{
  expect(api.history).toHaveBeenCalledWith('beatriz');
  expect(fixture.nativeElement.querySelector('.call-chat-history').textContent).toContain('Olá');
  expect(fixture.nativeElement.querySelector('textarea')).not.toBeNull();
 });
 it('shows a confirmed send immediately and retains the ordinary conversation history',()=>{
  fixture.componentInstance.draft='Até já';
  fixture.componentInstance.sendMessage();
  fixture.detectChanges();
  expect(api.send).toHaveBeenCalledOnceWith('beatriz','Até já');
  expect(fixture.componentInstance.messages.some(message=>message.id===11)).toBeTrue();
  expect(fixture.componentInstance.draft).toBe('');
 });
 it('revalidates through HTTP when the authenticated socket signals a message',()=>{
  api.history.calls.reset();
  realtimeEvents.next({...received,id:15,text:'Nova mensagem'});
  expect(api.history).toHaveBeenCalledWith('beatriz');
 });
 it('drops removed messages when the authenticated API history no longer includes them',()=>{
  expect(fixture.componentInstance.messages.some(message=>message.id===10)).toBeTrue();
  api.history.and.returnValue(of([]));
  fixture.componentInstance.refresh();
  expect(fixture.componentInstance.messages.some(message=>message.id===10)).toBeFalse();
 });
 it('keeps just-confirmed sends visible until the server history includes them',()=>{
  api.history.and.returnValue(of([]));
  fixture.componentInstance.draft='Até já';
  fixture.componentInstance.sendMessage();
  expect(fixture.componentInstance.messages.some(message=>message.id===11)).toBeTrue();
  fixture.componentInstance.refresh();
  expect(fixture.componentInstance.messages.some(message=>message.id===11)).toBeTrue();
  api.history.and.returnValue(of([{id:11,username1:'ana',username2:'beatriz',
   text:'Até já',date:'2026-11-19T14:01:00Z',dataDisplay:null}]));
  fixture.componentInstance.refresh();
  expect(fixture.componentInstance.messages.some(message=>message.id===11)).toBeTrue();
 });
 it('unlocks the composer on peer change and ignores the previous pending send',()=>{
  const pending=new Subject<DirectChatMessage>();
  api.send.and.returnValue(pending.asObservable());
  fixture.componentInstance.draft='Mensagem anterior';
  fixture.componentInstance.sendMessage();
  expect(fixture.componentInstance.sending).toBeTrue();
  fixture.componentRef.setInput('peer','catarina');
  fixture.detectChanges();
  expect(fixture.componentInstance.sending).toBeFalse();
  expect(fixture.componentInstance.draft).toBe('');
  api.send.and.returnValue(of({id:12,username1:'ana',username2:'catarina',
   text:'Nova conversa',date:'2026-11-19T14:02:00Z',dataDisplay:null}));
  fixture.componentInstance.draft='Nova conversa';
  fixture.componentInstance.sendMessage();
  expect(api.send).toHaveBeenCalledWith('catarina','Nova conversa');
  pending.next({id:13,username1:'ana',username2:'beatriz',
   text:'Mensagem anterior',date:'2026-11-19T14:03:00Z',dataDisplay:null});
  pending.complete();
  expect(fixture.componentInstance.messages.some(message=>message.id===13)).toBeFalse();
  expect(fixture.componentInstance.messages.some(message=>message.id===12)).toBeTrue();
 });
 it('clears private messages and prevents further sends if membership is revoked',()=>{
  api.history.and.returnValue(throwError(()=>new HttpErrorResponse({status:403})));
  fixture.componentInstance.refresh();
  fixture.detectChanges();
  expect(fixture.componentInstance.accessRevoked).toBeTrue();
  expect(fixture.componentInstance.messages.length).toBe(0);
  fixture.componentInstance.draft='Tentar enviar';
  fixture.componentInstance.sendMessage();
  expect(api.send).not.toHaveBeenCalled();
 });
});
