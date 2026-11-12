import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';

import { DirectChatComponent } from './direct-chat.component';
import { DirectChatService } from '../../services/direct-chat.service';
import { DirectChatRealtimeService } from '../../services/direct-chat-realtime.service';
import { CommunityService } from '../../services/community.service';
import { ChatReadSyncService } from '../../services/chat-read-sync.service';
import { TEST_IMPORTS, TEST_PROVIDERS } from '../../testing/test-providers';
import { ChatReactionsStubComponent } from '../../testing/chat-reactions-stub.component';

describe('DirectChatComponent', () => {
  let component: DirectChatComponent;
  let fixture: ComponentFixture<DirectChatComponent>;
  let service: jasmine.SpyObj<DirectChatService>;
  let communityService: jasmine.SpyObj<CommunityService>;
  let messages: Subject<import('../model/direct-chat').DirectChatMessage>;
  let connection: Subject<boolean>;
  let readSync: jasmine.SpyObj<ChatReadSyncService>;

  beforeEach(async () => {
    readSync = jasmine.createSpyObj<ChatReadSyncService>('ChatReadSyncService', ['markVisible']);
    messages = new Subject();
    connection = new Subject();
    service = jasmine.createSpyObj<DirectChatService>(
      'DirectChatService',
      ['recentHistory', 'send', 'sendAttachments', 'downloadAttachmentAt', 'info']
    );
    service.recentHistory.and.returnValue(of({ content: [], last: true }));
    service.info.and.returnValue(of({
      chatBlocked: false,
      whoBlocked: null
    }));
    service.send.and.returnValue(of({
      id: 1,
      username1: 'fixture-user',
      username2: 'ana',
      text: 'Olá!',
      dataDisplay: null,
      date: '2026-09-26T00:00:00Z'
    }));

    communityService = jasmine.createSpyObj<CommunityService>(
      'CommunityService',
      ['blockFriend', 'unblockFriend']
    );
    communityService.blockFriend.and.returnValue(of({}));
    communityService.unblockFriend.and.returnValue(of({}));

    await TestBed.configureTestingModule({
      declarations: [DirectChatComponent],
      imports: [...TEST_IMPORTS, ChatReactionsStubComponent],
      providers: [
        ...TEST_PROVIDERS,
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ username: 'ana' })
            }
          }
        },
        { provide: DirectChatService, useValue: service },
        {
          provide: DirectChatRealtimeService,
          useValue: {
            connect: jasmine.createSpy('connect'),
            messages$: messages.asObservable(),
            connected$: connection.asObservable()
          }
        },
        { provide: CommunityService, useValue: communityService },
        { provide: ChatReadSyncService, useValue: readSync }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(DirectChatComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('signals incoming messages when scrolled up and clears the count after jumping to latest', () => {
    component.currentUsername = 'fixture-user';
    const log = { scrollHeight: 900, scrollTop: 25, clientHeight: 250 };
    component.messageList = { nativeElement: log } as any;
    const incoming = (id: number) => ({
      id, username1: 'ana', username2: 'fixture-user', text: 'Olá',
      date: '2026-10-23T09:00:00Z', dataDisplay: null
    });
    messages.next(incoming(41));
    messages.next(incoming(41));
    messages.next(incoming(42));
    expect(component.newMessagesPending).toBe(2);
    expect(log.scrollTop).toBe(25);
    component.jumpToLatestMessages();
    expect(log.scrollTop).toBe(900);
    expect(component.newMessagesPending).toBe(0);
  });

  it('marks the latest direct message from the authorized, opened conversation', () => {
    component.currentUsername = 'fixture-user';
    component.messages = [{
      id: 15, username1: 'ana', username2: 'fixture-user',
      text: 'Olá', date: '2026-10-23T09:00:00Z', dataDisplay: null
    }];
    component.onMessageLogScroll();
    expect(readSync.markVisible).toHaveBeenCalledOnceWith(
      'direct', 'ana', 15, jasmine.anything());
  });

  it('does not mark an inaccessible or failed direct chat as read', () => {
    component.messages = [{ id: 10, username1: 'ana', username2: 'fixture-user',
      text: 'Olá', date: null, dataDisplay: null }];
    component.currentUsername = 'fixture-user';
    component.errorMessage = 'Erro';
    component.onMessageLogScroll();
    expect(readSync.markVisible).not.toHaveBeenCalled();
  });

  it('should create and load chat history', () => {
    expect(component).toBeTruthy();
    expect(component.recipientUsername).toBe('ana');
    expect(service.recentHistory).toHaveBeenCalledWith('ana');
    expect(service.info).toHaveBeenCalledWith('ana');
  });

  it('sends several photos in one direct message and clears the batch on success', () => {
    const files = [
      new File(['first'], 'primeiro.png', {type: 'image/png'}),
      new File(['second'], 'segundo.png', {type: 'image/png'})
    ];
    component.stageAttachments(files);
    expect(component.selectedFiles).toEqual(files);
    const sent = { id: 98, username1:'fixture-user', username2:'ana',
      text:'Duas fotografias', date:'2026-11-12T18:00:00Z', dataDisplay:null,
      attachmentName:'primeiro.png', attachments:[
        {index:0,filename:'primeiro.png',mimeType:'image/png',size:5},
        {index:1,filename:'segundo.png',mimeType:'image/png',size:6}
      ]};
    service.sendAttachments.and.returnValue(of(sent));
    component.messageBody = 'Duas fotografias';
    component.sendMessage();
    expect(service.sendAttachments).toHaveBeenCalledOnceWith(
      'ana', files, 'Duas fotografias', undefined);
    expect(service.send).not.toHaveBeenCalled();
    expect(component.selectedFiles.length).toBe(0);
    expect(component.messages[0].attachments?.length).toBe(2);
  });

  it('removes one staged file without deleting the remaining attachment', () => {
    const files = [new File(['first'], 'primeiro.png', {type:'image/png'}),
      new File(['second'], 'segundo.png', {type:'image/png'})];
    component.stageAttachments(files);
    component.removeAttachment(0);
    expect(component.selectedFiles).toEqual([files[1]]);
  });

  it('blocks five attachments before uploading any of them', () => {
    const files = Array.from({length:5}, (_, i) => new File(['image'], 'foto' + i + '.png',
      {type:'image/png'}));
    component.stageAttachments(files);
    expect(component.selectedFiles.length).toBe(0);
    expect(component.actionError).toContain('4 ficheiros');
    expect(service.sendAttachments).not.toHaveBeenCalled();
  });

  it('should send a direct message and append it locally', () => {
    component.messageBody = '  Olá!  ';

    component.sendMessage();

    expect(service.send).toHaveBeenCalledWith('ana', 'Olá!');
    expect(component.messages.length).toBe(1);
    expect(component.messageBody).toBe('');
  });

  it('keeps the compose textarea focused and enabled while a send is pending and after success', () => {
    const pending = new Subject<import('../model/direct-chat').DirectChatMessage>();
    service.send.and.returnValue(pending.asObservable());
    component.messageBody = 'Outra mensagem';
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const editor = root.querySelector<HTMLTextAreaElement>('textarea[name="messageBody"]')!;
    const sendButton = root.querySelector<HTMLButtonElement>('.composer button[type="submit"]')!;
    expect(editor).not.toBeNull();
    editor.blur();
    sendButton.click();
    fixture.detectChanges();

    expect(service.send).toHaveBeenCalledOnceWith('ana', 'Outra mensagem');
    expect(component.sending).toBeTrue();
    expect(editor.disabled).toBeFalse();
    expect(editor.readOnly).toBeTrue();
    expect(document.activeElement).toBe(editor);

    pending.next({ id: 65, username1: 'fixture-user', username2: 'ana',
      text: 'Outra mensagem', date: new Date().toISOString(), dataDisplay: null });
    pending.complete();
    fixture.detectChanges();

    expect(component.sending).toBeFalse();
    expect(component.messageBody).toBe('');
    expect(editor.disabled).toBeFalse();
    expect(editor.readOnly).toBeFalse();
    expect(document.activeElement).toBe(editor);
  });

  it('does not steal focus back after a slow send if the user moved elsewhere', () => {
    const pending = new Subject<import('../model/direct-chat').DirectChatMessage>();
    service.send.and.returnValue(pending.asObservable());
    component.messageBody = 'Mensagem';
    fixture.detectChanges();
    component.sendMessage();
    fixture.detectChanges();

    const another = document.createElement('button');
    (fixture.nativeElement as HTMLElement).appendChild(another);
    another.focus();
    expect(document.activeElement).toBe(another);

    pending.next({ id: 66, username1: 'fixture-user', username2: 'ana',
      text: 'Mensagem', date: new Date().toISOString(), dataDisplay: null });
    pending.complete();
    fixture.detectChanges();
    expect(document.activeElement).toBe(another);
  });

  it('quotes a real earlier direct message and clears the quote only after delivery', () => {
    const original = { id: 15, username1: 'ana', username2: 'fixture-user',
      text: 'Vamos jogar?', date: '2026-10-23T09:00:00Z', dataDisplay: null };
    component.currentUsername = 'fixture-user';
    component.messages = [original];
    component.replyTo(original);
    expect(component.replyingTo?.id).toBe(15);
    const reply = { id: 16, username1: 'fixture-user', username2: 'ana',
      text: 'Sim!', date: '2026-10-23T09:02:00Z', dataDisplay: null,
      replyToMessageId: 15, replyToSender: 'ana', replyToText: 'Vamos jogar?' };
    service.send.and.returnValue(of(reply));
    component.messageBody = '  Sim!  ';
    component.sendMessage();
    expect(service.send).toHaveBeenCalledOnceWith('ana', 'Sim!', 15);
    expect(component.replyingTo).toBeNull();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Vamos jogar?');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Sim!');
  });

  it('keeps the selected quote and draft on a failed reply POST', () => {
    const original = { id: 25, username1: 'ana', username2: 'fixture-user',
      text: 'Treino amanhã?', date: '2026-10-23T09:00:00Z', dataDisplay: null };
    component.replyTo(original);
    component.messageBody = 'Talvez';
    service.send.and.returnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    service.recentHistory.and.returnValue(of({ content: [], last: true }));
    component.sendMessage();
    expect(service.send).toHaveBeenCalledOnceWith('ana', 'Talvez', 25);
    expect(component.replyingTo?.id).toBe(25);
    expect(component.messageBody).toBe('Talvez');
    expect(component.deliveryUncertain).toBeTrue();
  });

  it('shows the live connection and reconnecting state without claiming read receipts', () => {
    expect(component.realtimeConnected).toBeFalse();
    connection.next(true);
    expect(component.realtimeConnected).toBeTrue();
    expect(component.realtimeEverConnected).toBeTrue();
    connection.next(false);
    fixture.detectChanges();
    expect(component.realtimeConnected).toBeFalse();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('A restabelecer ligação');
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Lida');
  });

  it('does not overwrite a newly received WebSocket message on refresh', () => {
    component.currentUsername = 'fixture-user';
    const incoming = {
      id: 47, username1: 'ana', username2: 'fixture-user',
      text: 'Mensagem em tempo real', date: new Date().toISOString(), dataDisplay: null
    };
    messages.next(incoming);
    service.recentHistory.and.returnValue(of({ content: [], last: true }));
    component.load();
    expect(component.messages.map(m => m.id)).toEqual([47]);
    messages.next(incoming);
    expect(component.messages.length).toBe(1);
  });

  it('keeps a new persisted live message after older messages even when the timestamp is missing', () => {
    component.currentUsername = 'fixture-user';
    component.messages = [{
      id: 20, username1: 'ana', username2: 'fixture-user',
      text: 'Antes', date: '2026-10-23T09:00:00Z', dataDisplay: null
    }];
    messages.next({
      id: 21, username1: 'ana', username2: 'fixture-user',
      text: 'Agora', date: null, dataDisplay: null
    });
    expect(component.messages.map(item => item.id)).toEqual([20, 21]);
  });

  it('blocks accidental duplicate POST on uncertain delivery, preserving unsent text', () => {
    component.currentUsername = 'fixture-user';
    component.messageBody = 'Teste de rede';
    service.send.and.returnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    service.recentHistory.and.returnValue(of({ content: [], last: true }));
    component.sendMessage();

    expect(service.send).toHaveBeenCalledTimes(1);
    expect(component.deliveryUncertain).toBeTrue();
    expect(component.messageBody).toBe('Teste de rede');
    component.sendMessage();
    expect(service.send).toHaveBeenCalledTimes(1);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.delivery-warning')).not.toBeNull();
    component.resumeAfterUncertainSend();
    expect(component.deliveryUncertain).toBeFalse();
    expect(component.messageBody).toBe('Teste de rede');
  });

  it('confirms a timed-out message from server history without sending again', () => {
    component.currentUsername = 'fixture-user';
    component.messageBody = 'Já está confirmado';
    const delivered = {
      id: 55, username1: 'fixture-user', username2: 'ana',
      text: 'Já está confirmado', date: new Date().toISOString(), dataDisplay: null
    };
    service.send.and.returnValue(throwError(() => new HttpErrorResponse({ status: 503 })));
    service.recentHistory.and.returnValue(of({ content: [delivered], last: true }));
    component.sendMessage();

    expect(component.deliveryUncertain).toBeFalse();
    expect(component.messageBody).toBe('');
    expect(component.messages.map(message => message.id)).toContain(55);
    expect(service.send).toHaveBeenCalledTimes(1);
    expect(component.actionSuccess).toContain('confirmada');
  });

  it('ignores an old identical message when verifying an uncertain send', () => {
    component.currentUsername = 'fixture-user';
    const old = {
      id: 12, username1: 'fixture-user', username2: 'ana',
      text: 'Mesmo texto', date: new Date().toISOString(), dataDisplay: null
    };
    component.messages = [old];
    component.messageBody = 'Mesmo texto';
    service.send.and.returnValue(throwError(() => new HttpErrorResponse({ status: 408 })));
    service.recentHistory.and.returnValue(of({ content: [old], last: true }));
    component.sendMessage();
    expect(component.deliveryUncertain).toBeTrue();
    expect(component.messageBody).toBe('Mesmo texto');
    expect(service.send).toHaveBeenCalledTimes(1);
  });

  it('does not send Enter while an IME composition is in progress', () => {
    component.messageBody = 'texto';
    const event = new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, cancelable: true });
    component.onEnter(event);
    expect(service.send).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBeFalse();
  });

  it('should not send when chat is blocked', () => {
    component.chatInfo = {
      chatBlocked: true,
      whoBlocked: 'ana'
    };
    component.messageBody = 'Olá';

    component.sendMessage();

    expect(service.send).not.toHaveBeenCalled();
  });

  it('should block the direct chat', () => {
    component.currentUsername = 'fixture-user';
    component.chatInfo = { chatBlocked: false, whoBlocked: null };

    component.toggleChatBlock();

    expect(communityService.blockFriend).toHaveBeenCalledWith('ana');
    expect(component.chatInfo?.chatBlocked).toBeTrue();
  });

  it('should unblock a chat blocked by the current user', () => {
    component.currentUsername = 'fixture-user';
    component.chatInfo = {
      chatBlocked: true,
      whoBlocked: 'fixture-user'
    };

    component.toggleChatBlock();

    expect(communityService.unblockFriend).toHaveBeenCalledWith('ana');
    expect(component.chatInfo?.chatBlocked).toBeFalse();
  });
});
