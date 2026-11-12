import { of, Subject, throwError, BehaviorSubject } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { MessagesCenterComponent, VOICE_NOTE_MAX_DURATION_MS } from './messages-center.component';
import {
  InboxConversation, InboxMessage, inboxKey, matchesInboxSearch,
  mergeInboxMessages, orderInbox
} from './inbox.model';
import { CommunityService } from '../../services/community.service';
import { CommunityGroupsService } from '../../services/community-groups.service';
import { SessionService } from '../../services/session.service';
import { DirectChatService } from '../../services/direct-chat.service';
import { CommunityTimelineService } from '../../services/community-timeline.service';
import { DirectChatRealtimeService } from '../../services/direct-chat-realtime.service';
import { InboxApiService } from '../../services/inbox-api.service';

const item = (kind: 'direct' | 'community' | 'session', id: string | number): InboxConversation => ({
  kind, id, key: inboxKey(kind, id), title: String(id), subtitle: '', newThisVisit: 0
});
const message = (key: string, id: number, sender = 'beta'): InboxMessage => ({
  key, id, sender, text: 'Mensagem ' + id, createdAt: '2026-10-23T09:00:00Z'
});

describe('Unified Jynlo message center', () => {
  let component: MessagesCenterComponent;
  let friends: jasmine.SpyObj<CommunityService>;
  let communities: jasmine.SpyObj<CommunityGroupsService>;
  let sessions: jasmine.SpyObj<SessionService>;
  let direct: jasmine.SpyObj<DirectChatService>;
  let timeline: jasmine.SpyObj<CommunityTimelineService>;
  let realtime: DirectChatRealtimeService;
  let inboxApi: jasmine.SpyObj<InboxApiService>;
  const directEvents = new Subject<any>();
  const receiptEvents = new Subject<{peerUsername: string;lastReadMessageId:number}>();
  const ownReadEvents = new Subject<any>();
  const communityEvents = new Subject<any>();
  const sessionEvents = new Subject<any>();
  const connected = new BehaviorSubject<boolean>(false);

  beforeEach(() => {
    // The default inbox tests exercise foreground user interactions. Hidden
    // document cases are explicitly covered in the receipt-specific suite.
    spyOn(document, 'hasFocus').and.returnValue(true);
    spyOnProperty(document, 'visibilityState', 'get').and.returnValue('visible');
    friends = jasmine.createSpyObj('CommunityService', ['friends']);
    communities = jasmine.createSpyObj('CommunityGroupsService', ['mine']);
    sessions = jasmine.createSpyObj('SessionService', ['mine', 'messages', 'detail', 'postMessage', 'attachmentsAvailable', 'sendAttachment', 'downloadAttachment', 'editMessage', 'deleteMessage']);
    direct = jasmine.createSpyObj('DirectChatService', ['recentHistory', 'info', 'send', 'attachmentsAvailable', 'sendAttachment', 'downloadAttachment', 'editMessage', 'deleteMessage']);
    timeline = jasmine.createSpyObj('CommunityTimelineService', ['list', 'send', 'chatAttachmentsAvailable', 'sendChatAttachment', 'downloadChatAttachment', 'editMessage', 'deleteMessage', 'editChatMessage', 'deleteChatForEveryone']);
    realtime = {
      messages$: directEvents.asObservable(),
      readReceipts$: receiptEvents.asObservable(),
      ownReads$: ownReadEvents.asObservable(),
      communityMessages$: communityEvents.asObservable(),
      sessionMessages$: sessionEvents.asObservable(),
      connected$: connected.asObservable(),
      connect: jasmine.createSpy('connect')
    } as unknown as DirectChatRealtimeService;
    inboxApi = jasmine.createSpyObj<InboxApiService>('InboxApiService', ['summaries', 'markRead', 'searchMessages', 'messageContext', 'directReadReceipt']);
    inboxApi.summaries.and.returnValue(of([]));
    inboxApi.directReadReceipt.and.callFake(peer => of({
      peerUsername: peer, lastReadMessageId: 0
    }));
    inboxApi.markRead.and.callFake(ref => of({ ...ref, latestMessageId: null,
      latestText: null, latestSender: null, latestAt: null, unreadCount: 0 }));
    friends.friends.and.returnValue(of([]));
    communities.mine.and.returnValue(of([]));
    sessions.mine.and.returnValue(of({ created: [], joined: [], waitlisted: [] }));
    sessions.attachmentsAvailable.and.returnValue(of({ available: false }));
    direct.info.and.returnValue(of({ chatBlocked: false, whoBlocked: null }));
    direct.attachmentsAvailable.and.returnValue(of({ available: false }));
    timeline.chatAttachmentsAvailable.and.returnValue(of({ available: false }));
    sessions.detail.and.returnValue(of({
      id: 41, sport: 'Futsal', city: 'Cacém', gameDate: '2026-11-01T10:00:00Z',
      joined: true, status: 'OPEN'
    } as any));
    component = new MessagesCenterComponent(friends, communities, sessions, direct, timeline, realtime, inboxApi);
    (component as any).currentUsername = 'ana';
    // Older isolated tests construct a session chat without calling loadInbox().
    (component as any).sessionKickoffs.set(41, Date.now() + 3600_000);
  });

  it('uses real profile and community photographs in conversation rows and the selected header', () => {
    const photo = 'https://cdn.example.test/maria.jpg';
    const groupPhoto = 'https://cdn.example.test/club.jpg';
    friends.friends.and.returnValue(of([{
      username:'maria',fullName:'Maria',nickname:null,profilePicUrl:photo,
      chatBlocked:false,blockedByMe:false
    }]));
    communities.mine.and.returnValue(of([{
      id:21,name:'ACM',sport:'Futebol',photoUrl:groupPhoto
    }] as any));
    sessions.mine.and.returnValue(of({created:[{
      id:44,sport:'Futebol',city:'Lisboa',communityId:21,
      gameDate:new Date(Date.now() + 86_400_000).toISOString(),status:'OPEN'
    }],joined:[],waitlisted:[]} as any));

    component.loadInbox();
    expect(component.conversations.find(x => x.key === 'direct:maria')?.avatarUrl).toBe(photo);
    expect(component.conversations.find(x => x.key === 'community:21')?.avatarUrl).toBe(groupPhoto);
    expect(component.conversations.find(x => x.key === 'session:44')?.avatarUrl).toBe(groupPhoto);
    component.selectedKey = 'community:21';
    expect(component.selected?.avatarUrl).toBe(groupPhoto);
    expect(component.filteredConversations.find(x => x.key === 'direct:maria')?.avatarUrl).toBe(photo);
  });

  it('persists the selected conversation mute without changing another chat', () => {
    const api = jasmine.createSpyObj('ConversationMuteService', ['list','set']);
    api.set.and.returnValue(of({kind:'direct',id:'bea'}));
    (component as any).conversationMutes = api;
    const peer=item('direct','bea'), other=item('community',12);
    component.toggleConversationMute(peer);
    expect(api.set).toHaveBeenCalledWith('direct','bea',true);
    expect(component.isMuted(peer)).toBeTrue();
    expect(component.isMuted(other)).toBeFalse();
    component.toggleConversationMute(peer);
    expect(api.set).toHaveBeenCalledWith('direct','bea',false);
    expect(component.isMuted(peer)).toBeFalse();
  });

  it('formats valid and malformed GIF envelopes without leaking metadata in any chat preview', () => {
    const envelope = '[JYNLO:GIPHY:1]' + JSON.stringify({
      id: 'XdUMQuuiaAEkOUtezd',
      p: 'https://giphy.com/gifs/animated-thumbs-up-XdUMQuuiaAEkOUtezd',
      a: 'creator', c: ''
    });
    expect(component.displayMessagePreview(envelope)).toBe('GIF 🎞️');
    expect(component.displayMessagePreview('[JYNLO:GIPHY:1]{bad-json}')).toBe('GIF 🎞️');
    expect(component.displayMessagePreview('Olá! 👋')).toBe('Olá! 👋');
    expect(component.displayMessagePreview('📎 foto.png')).toBe('📎 foto.png');
    const malformed = {...message('direct:bea', 4), text: '[JYNLO:GIPHY:1]{bad-json}'};
    expect(component.showMessageBody(malformed)).toBeTrue();
    expect(component.displayMessagePreview(malformed.text)).toBe('GIF 🎞️');
  });

  it('shares public Jynlo entities without leaking private sessions or groups', () => {
    const peer=item('direct','bea');
    component.conversations=[peer];
    component.selectedKey=peer.key;
    component.composerAllowed=true;
    component.attachmentReady=true;
    friends.friends.and.returnValue(of([{username:'maria',nickname:'Maria',
      fullName:'Maria',chatBlocked:false,blockedByMe:false,profilePicUrl:null}]));
    communities.mine.and.returnValue(of([
      {id:8,name:'Public Crew',sport:'Futsal',visibility:'PUBLIC'},
      {id:9,name:'Private Crew',sport:'Futsal',visibility:'PRIVATE'}
    ] as any));
    sessions.mine.and.returnValue(of({created:[
      {id:10,sport:'Futebol',city:'Lisboa',privateGame:false,
        gameDate:new Date(Date.now()+86400_000).toISOString(),status:'OPEN'},
      {id:11,sport:'Futebol',city:'Lisboa',privateGame:true,
        gameDate:new Date(Date.now()+86400_000).toISOString(),status:'OPEN'}
    ],joined:[],waitlisted:[]} as any));
    component.openSharePicker();
    expect(component.shareChoices.map(x=>x.id)).toEqual(['ana','maria','10','8']);
    const selected=component.shareChoices[2];
    component.draft='Junta-te!';
    component.selectShareChoice(selected);
    expect(component.selectedShare?.id).toBe('10');
    expect(component.draft).toBe('Junta-te!');
    expect(component.canSendMessage()).toBeTrue();
    expect(direct.send).not.toHaveBeenCalled();
    expect(component.selectedAttachment).toBeNull();
  });

  it('opens a quoted author with the existing private profile quick-view, never for blank names', () => {
    const quick = jasmine.createSpyObj('ProfileQuickViewService', ['open', 'close']);
    (component as any).profilePeek = quick;
    component.openContact('bea');
    expect(quick.open).toHaveBeenCalledOnceWith('bea');
    expect(component.contactPreviewOpen).toBeTrue();

    component.openContact('');
    component.openContact(null);
    expect(quick.open).toHaveBeenCalledTimes(1);
  });

  it('closes contact information when switching to another private conversation', () => {
    const first = item('direct', 'bea'), second = item('direct', 'carla');
    component.conversations = [first, second];
    component.selectedKey = first.key;
    component.contactPreviewOpen = true;
    direct.recentHistory.and.returnValue(of({content: [], last: true}));
    component.selectConversation(second);
    expect(component.contactPreviewOpen).toBeFalse();
    expect(component.selectedKey).toBe(second.key);
  });

  it('clears share previews after switching conversation', () => {
    const peer=item('direct','bea');
    component.conversations=[peer,item('direct','carlos')];
    component.selectedKey=peer.key;
    component.composerAllowed=true;
    component.attachmentReady=true;
    component.openSharePicker();
    component.selectedShare={kind:'profile',id:'maria',title:'Maria',subtitle:'@maria'};
    direct.recentHistory.and.returnValue(of({content:[],last:true}));
    component.selectConversation(component.conversations[1]);
    expect(component.selectedShare).toBeNull();
    expect(component.sharePickerOpen).toBeFalse();
  });

  it('edits only own recent text messages and preserves another conversation draft', () => {
    const peer = item('direct','bea');
    component.conversations = [peer];
    component.selectedKey = peer.key;
    (component as any).currentUsername = 'ana';
    component.composerAllowed = true;
    const sent: InboxMessage = {
      ...message(peer.key, 200, 'ana'), text:'Primeiro',
      createdAt:new Date(Date.now()-40_000).toISOString()
    };
    component.messages = [sent];
    expect(component.canEditSentMessage(sent)).toBeTrue();
    component.draft = 'O meu rascunho';
    component.beginEditMessage(sent);
    expect(component.editDraft).toBe('Primeiro');
    direct.editMessage.and.returnValue(of({
      id:200, username1:'ana',username2:'bea',text:'Corrigido',
      date: sent.createdAt, dataDisplay: null,
      editedAt:new Date().toISOString()
    }));
    component.editDraft = 'Corrigido';
    component.saveEditedMessage(sent);
    expect(direct.editMessage).toHaveBeenCalledOnceWith('bea', 200, 'Corrigido');
    expect(component.messages[0].text).toBe('Corrigido');
    expect(component.messages[0].editedAt).toBeTruthy();
    expect(component.draft).toBe('O meu rascunho');
    expect(direct.send).not.toHaveBeenCalled();
  });

  it('rejects editing other authors, attachments and messages older than 15 minutes', () => {
    const peer = item('direct','bea');
    component.conversations = [peer];
    component.selectedKey = peer.key;
    (component as any).currentUsername = 'ana';
    component.composerAllowed = true;
    const recent = new Date(Date.now()-60_000).toISOString();
    const old = new Date(Date.now()-16*60_000).toISOString();
    expect(component.canEditSentMessage({...message(peer.key,20,'bea'),createdAt:recent})).toBeFalse();
    expect(component.canEditSentMessage({...message(peer.key,21,'ana'),createdAt:old})).toBeFalse();
    expect(component.canEditSentMessage({...message(peer.key,22,'ana'),
      createdAt:recent,attachmentName:'a.pdf'})).toBeFalse();
    expect(component.canEditSentMessage({...message(peer.key,23,'ana'),
      createdAt:recent,deletedAt:recent})).toBeFalse();
  });

  it('only deletes after confirmation and shows a tombstone without creating a new unread', () => {
    const peer = item('direct','bea');
    peer.unreadCount=3;
    component.conversations=[peer];
    component.selectedKey=peer.key;
    (component as any).currentUsername ='ana';
    component.composerAllowed=true;
    const first={...message(peer.key,17,'ana'), createdAt:new Date().toISOString()};
    component.messages=[first];
    component.promptDeleteMessage(first);
    expect(direct.deleteMessage).not.toHaveBeenCalled();
    direct.deleteMessage.and.returnValue(of({
      id:17,username1:'ana',username2:'bea',text:'',
      date:first.createdAt,dataDisplay:null,deletedAt:new Date().toISOString()
    }));
    component.confirmDeleteMessage(first);
    expect(direct.deleteMessage).toHaveBeenCalledOnceWith('bea', 17);
    expect(component.messages[0].deletedAt).toBeTruthy();
    expect(component.messages).toHaveSize(1);
    expect(component.conversations[0].unreadCount).toBe(3);
  });

  it('inserts an emoji at the current caret and restores the editor focus', () => {
    const conversation = item('direct', 'bea');
    component.conversations = [conversation];
    component.selectedKey = conversation.key;
    component.composerAllowed = true;
    component.draft = 'Olá mundo';
    const focus = jasmine.createSpy('focus');
    const setSelectionRange = jasmine.createSpy('setSelectionRange');
    component.composerTextarea = { nativeElement: {
      selectionStart: 4, selectionEnd: 9, focus, setSelectionRange
    }} as any;

    component.toggleEmojiPicker();
    expect(component.emojiPickerOpen).toBeTrue();
    component.insertEmoji('⚽');
    expect(component.draft).toBe('Olá ⚽');
    expect(component.emojiPickerOpen).toBeFalse();
    expect(focus).toHaveBeenCalled();
    expect(setSelectionRange).toHaveBeenCalledWith(5, 5);
    expect(direct.send).not.toHaveBeenCalled();
  });

  it('opens a shared emoji/GIF picker while retaining drafts and local GIF upload', async () => {
    const peer = item('direct', 'bea');
    component.conversations = [peer];
    component.selectedKey = peer.key;
    component.composerAllowed = true;
    component.attachmentReady = true;
    component.draft = 'Olá';
    const network = spyOn(window, 'fetch').and.resolveTo(new Response(
      JSON.stringify({apiKey: ''}), {status: 200}
    ));
    component.openGifPicker();
    expect(component.emojiPickerOpen).toBeTrue();
    expect(component.pickerTab).toBe('gif');
    // Response.json() consumes an async browser stream; allow it to settle
    // instead of assuming one event-loop turn is enough on Chromium CI.
    for (let attempt = 0; attempt < 30 && component.gifAvailable === null; attempt++) {
      await new Promise<void>(resolve => setTimeout(resolve, 5));
    }
    expect(network).toHaveBeenCalledTimes(1);
    expect(component.gifAvailable).toBeFalse();
    const gif = new File(['GIF89a'], 'local.gif', {type:'image/gif'});
    component.onAttachmentPicked({target:{files:[gif],value:''}} as any);
    expect(component.selectedAttachment).toBe(gif);
    expect(component.draft).toBe('Olá');
    expect(component.emojiPickerOpen).toBeFalse();
    expect(direct.sendAttachment).not.toHaveBeenCalled();
  });

  it('switches back from GIF browsing to inserting emojis without a message POST', () => {
    const peer = item('direct', 'bea');
    component.conversations = [peer];
    component.selectedKey = peer.key;
    component.composerAllowed = true;
    component.attachmentReady = true;
    component.gifAvailable = false;
    component.openGifPicker();
    component.selectPickerTab('emoji');
    expect(component.pickerTab).toBe('emoji');
    component.draft = 'Olá';
    component.insertEmoji('🏆');
    expect(component.draft).toBe('Olá🏆');
    expect(component.emojiPickerOpen).toBeFalse();
    expect(direct.send).not.toHaveBeenCalled();
  });

  it('stages a remote GIPHY link without downloading, uploading or sending', () => {
    const peer = item('direct', 'bea');
    component.conversations = [peer];
    component.selectedKey = peer.key;
    component.composerAllowed = true;
    component.attachmentReady = true;
    component.gifAvailable = true;
    const card = {id:'test',title:'Celebration',size:100,creator:'gif_creator',
      pageUrl:'https://giphy.com/gifs/test',
      previewUrl:'https://media0.giphy.com/media/123/giphy.gif',
      downloadUrl:'https://media0.giphy.com/media/123/giphy.gif'};
    component.gifResults = [card];
    component.openGifPicker();
    const network = spyOn(window, 'fetch');
    component.chooseGif(card);
    expect(component.selectedGif).toEqual(card);
    expect(component.selectedAttachment).toBeNull();
    expect(component.canSendMessage()).toBeTrue();
    expect(component.emojiPickerOpen).toBeFalse();
    expect(network).not.toHaveBeenCalled();
    expect(direct.sendAttachment).not.toHaveBeenCalled();
    expect(direct.send).not.toHaveBeenCalled();
  });

  it('never sends remote GIF bytes through private R2 upload', () => {
    const peer = item('direct','bea');
    component.conversations = [peer];
    component.selectedKey = peer.key;
    component.composerAllowed = true;
    component.attachmentReady = true;
    component.gifAvailable = true;
    const card = {id:'party',title:'Party',size:100,creator:'creator',
      pageUrl:'https://giphy.com/gifs/party',
      previewUrl:'https://media.giphy.com/media/x/giphy.gif',
      downloadUrl:'https://media.giphy.com/media/x/giphy.gif'};
    component.gifResults = [card];
    component.openGifPicker();
    component.chooseGif(card);
    direct.send.and.returnValue(of({id:44, username1:'ana',username2:'bea',
      text:'',date:new Date().toISOString(),dataDisplay:null} as any));
    component.sendMessage();
    expect(direct.sendAttachment).not.toHaveBeenCalled();
    expect(direct.send).toHaveBeenCalledTimes(1);
    expect((direct.send.calls.mostRecent().args[1] as string).startsWith('[JYNLO:GIPHY:1]')).toBeTrue();
  });

  it('lets users click every GIF category and choose a reaction without a GIPHY key', () => {
    const peer = item('direct', 'bea');
    component.conversations = [peer];
    component.selectedKey = peer.key;
    component.composerAllowed = true;
    component.attachmentReady = true;
    component.gifAvailable = false;
    component.openGifPicker();
    expect(component.gifResults.length).toBeGreaterThan(0);
    for (const category of component.gifCategories) {
      component.searchGifCategory(category.phrase);
      expect(component.gifQuery).toBe(category.phrase);
      expect(component.gifResults.length).withContext(category.phrase).toBeGreaterThan(0);
    }
    component.searchGifCategory('love');
    const gif = component.gifResults[0];
    component.chooseGif(gif);
    expect(component.selectedGif).toEqual(gif);
    expect(component.canSendMessage()).toBeTrue();
    expect(component.emojiPickerOpen).toBeFalse();
    expect(direct.send).not.toHaveBeenCalled();
    expect(direct.sendAttachment).not.toHaveBeenCalled();
  });

  it('searches curated reactions locally when online GIF search is disabled', () => {
    const peer = item('direct','bea');
    component.conversations = [peer];
    component.selectedKey = peer.key;
    component.composerAllowed = true;
    component.attachmentReady = true;
    component.gifAvailable = false;
    component.openGifPicker();
    const network = spyOn(window,'fetch');
    component.onGifSearchInput('CAMPEÃO');
    expect(component.gifResults.length).toBeGreaterThan(0);
    component.onGifSearchInput('sem resultados xyz');
    expect(component.gifResults).toEqual([]);
    component.onGifSearchInput('');
    expect(component.gifResults.length).toBeGreaterThan(0);
    expect(network).not.toHaveBeenCalled();
  });

  it('toggles one shared media panel while preserving access to both tabs', () => {
    const peer = item('direct', 'bea');
    component.conversations = [peer];
    component.selectedKey = peer.key;
    component.composerAllowed = true;
    component.attachmentReady = true;
    component.gifAvailable = false;
    component.toggleEmojiPicker();
    expect(component.emojiPickerOpen).toBeTrue();
    expect(component.pickerTab).toBe('emoji');
    component.selectPickerTab('gif');
    expect(component.emojiPickerOpen).toBeTrue();
    expect(component.pickerTab).toBe('gif');
    component.selectPickerTab('emoji');
    expect(component.emojiPickerOpen).toBeTrue();
    expect(component.pickerTab).toBe('emoji');
    component.toggleEmojiPicker();
    expect(component.emojiPickerOpen).toBeFalse();
    expect(component.selectedAttachment).toBeNull();
    expect(direct.send).not.toHaveBeenCalled();
  });

  it('does not exceed the chat 2000-character limit with surrogate-pair emojis', () => {
    const conversation = item('community', 7);
    component.conversations = [conversation];
    component.selectedKey = conversation.key;
    component.composerAllowed = true;
    component.draft = 'a'.repeat(1999);
    component.composerTextarea = { nativeElement: {
      selectionStart: 1999, selectionEnd: 1999,
      focus: jasmine.createSpy('focus'), setSelectionRange: jasmine.createSpy('setSelectionRange')
    }} as any;

    component.toggleEmojiPicker();
    component.insertEmoji('😀');
    expect(component.draft).toBe('a'.repeat(1999));
    expect(component.emojiPickerOpen).toBeTrue();
    expect(direct.send).not.toHaveBeenCalled();
  });

  it('formats inbox timestamps compactly in PT and EN without changing full message dates', () => {
    const date = new Date();
    date.setHours(10, 24, 0, 0);
    localStorage.setItem('d24-language', 'pt');
    expect(component.formatInboxListTime(date.toISOString())).toMatch(/10:24/);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(component.formatInboxListTime(yesterday.toISOString())).toBe('Ontem');
    localStorage.setItem('d24-language', 'en');
    expect(component.formatInboxListTime(yesterday.toISOString())).toBe('Yesterday');
    expect(component.formatInboxListTime('invalid timestamp')).toBe('');
    localStorage.setItem('d24-language', 'pt');
  });

  it('keeps each unsent draft separate and closes the emoji panel on chat navigation', () => {
    const directChat = item('direct', 'bea');
    const community = item('community', 7);
    component.conversations = [directChat, community];
    component.selectedKey = directChat.key;
    component.composerAllowed = true;
    component.draft = 'Olá';
    component.toggleEmojiPicker();
    // This case tests draft continuity, not asynchronous HTTP history loading.
    spyOn<any>(component, 'loadHistory').and.stub();
    spyOn<any>(component, 'loadComposerAccess').and.stub();
    component.selectConversation(community);
    expect(component.emojiPickerOpen).toBeFalse();
    component.selectConversation(directChat);
    expect(component.draft).toBe('Olá');
  });

  it('does not expose attachment sending while private storage is unavailable', () => {
    const conversation = item('direct','bea');
    component.conversations = [conversation];
    direct.recentHistory.and.returnValue(of({content:[],last:true}));
    direct.attachmentsAvailable.and.returnValue(of({available:false}));
    component.selectConversation(conversation);
    expect(component.attachmentReady).toBeFalse();
    expect(component.selectedAttachment).toBeNull();
  });

  it('keeps private media available after an access token renews for the same account', () => {
    const encode = (value: unknown) => btoa(JSON.stringify(value));
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const jwt = (nonce: number) => [
      encode({alg:'none'}), encode({sub:'ana', exp, nonce}), 'signature'
    ].join('.');
    const firstToken = jwt(1);
    let currentToken = firstToken;
    spyOn(localStorage, 'getItem').and.callFake(key => key === 't' ? currentToken : null);
    (component as any).receiptSessionToken = firstToken;
    const pending = new Subject<{available:boolean}>();
    direct.attachmentsAvailable.and.returnValue(pending.asObservable());
    spyOn<any>(component, 'loadHistory').and.stub();
    const peer = item('direct', 'bea');
    component.conversations = [peer];
    component.selectConversation(peer);
    currentToken = jwt(2); // The interceptor refreshed the same principal.
    pending.next({available:true});
    pending.complete();
    expect(component.attachmentReady).toBeTrue();
    expect(component.attachmentControlsReady).toBeTrue();
  });

  it('retries read-only private storage availability only once for the selected chat', () => {
    jasmine.clock().install();
    try {
      const encode = (value: unknown) => btoa(JSON.stringify(value));
      const token = [
        encode({alg:'none'}),
        encode({sub:'ana', exp:Math.floor(Date.now() / 1000) + 3600}),
        'signature'
      ].join('.');
      spyOn(localStorage, 'getItem').and.callFake(key => key === 't' ? token : null);
      (component as any).receiptSessionToken = token;
      spyOn<any>(component, 'loadHistory').and.stub();
      spyOn<any>(component, 'loadComposerAccess').and.stub();
      direct.attachmentsAvailable.and.returnValues(of({available:false}), of({available:true}));
      const peer = item('direct', 'bea');
      component.conversations = [peer];
      component.selectConversation(peer);
      expect(component.attachmentControlsReady).toBeFalse();
      jasmine.clock().tick(6001);
      expect(direct.attachmentsAvailable).toHaveBeenCalledTimes(2);
      expect(component.attachmentControlsReady).toBeTrue();
      jasmine.clock().tick(20000);
      expect(direct.attachmentsAvailable).toHaveBeenCalledTimes(2);
    } finally {
      component.ngOnDestroy();
      jasmine.clock().uninstall();
    }
  });

  it('cancels the delayed private storage retry when changing chats', () => {
    jasmine.clock().install();
    try {
      const encode = (value: unknown) => btoa(JSON.stringify(value));
      const token = [
        encode({alg:'none'}),
        encode({sub:'ana', exp:Math.floor(Date.now() / 1000) + 3600}),
        'signature'
      ].join('.');
      spyOn(localStorage, 'getItem').and.callFake(key => key === 't' ? token : null);
      (component as any).receiptSessionToken = token;
      spyOn<any>(component, 'loadHistory').and.stub();
      spyOn<any>(component, 'loadComposerAccess').and.stub();
      direct.attachmentsAvailable.and.returnValue(of({available:false}));
      const first = item('direct', 'bea');
      const second = item('direct', 'carla');
      component.conversations = [first, second];
      component.selectConversation(first);
      component.selectConversation(second);
      jasmine.clock().tick(6001);
      expect(direct.attachmentsAvailable.calls.allArgs()).toEqual([
        ['bea'], ['carla'], ['carla']
      ]);
      expect(component.attachmentControlsReady).toBeFalse();
    } finally {
      component.ngOnDestroy();
      jasmine.clock().uninstall();
    }
  });

  it('ignores a delayed private-storage availability result after a login switch', () => {
    let browserToken = 'qa-ana';
    spyOn(localStorage, 'getItem').and.callFake(key => key === 't' ? browserToken : null);
    (component as any).receiptSessionToken = browserToken;
    const pending = new Subject<{ available: boolean }>();
    direct.attachmentsAvailable.and.returnValue(pending.asObservable());
    direct.recentHistory.and.returnValue(of({ content: [], last: true }));
    const peer = item('direct', 'bea');
    component.conversations = [peer];
    component.selectConversation(peer);

    browserToken = 'qa-different-account';
    pending.next({ available: true });
    pending.complete();
    expect(component.attachmentReady).toBeFalse();
    expect(component.attachmentControlsReady).toBeFalse();
    expect(component.selectedAttachment).toBeNull();
  });

  it('never previews a delayed private download after another account logs in', () => {
    let browserToken = 'qa-ana';
    spyOn(localStorage, 'getItem').and.callFake(key => key === 't' ? browserToken : null);
    (component as any).receiptSessionToken = browserToken;
    const peer = item('direct', 'bea');
    const image = { ...message(peer.key, 82, 'bea'),
      attachmentName: 'foto.jpg', attachmentMimeType: 'image/jpeg', attachmentSize: 512 };
    component.conversations = [peer];
    component.selectedKey = peer.key;
    const pending = new Subject<Blob>();
    direct.downloadAttachment.and.returnValue(pending.asObservable());
    const createUrl = spyOn(URL, 'createObjectURL').and.returnValue('blob:never-show');
    component.openAttachment(image);
    expect(direct.downloadAttachment).toHaveBeenCalledOnceWith('bea', 82);

    browserToken = 'qa-different-account';
    pending.next(new Blob(['private-image'], { type: 'image/jpeg' }));
    pending.complete();
    expect(createUrl).not.toHaveBeenCalled();
    expect(component.attachmentPreviews.size).toBe(0);
    expect(component.attachmentControlsReady).toBeFalse();
  });

  it('drops a delayed download after leaving and reopening the same chat', () => {
    const peer = item('direct', 'bea');
    const other = item('direct', 'carla');
    component.conversations = [peer, other];
    component.selectedKey = peer.key;
    const image = { ...message(peer.key, 83, 'bea'),
      attachmentName: 'golo.gif', attachmentMimeType: 'image/gif', attachmentSize: 512 };
    const pending = new Subject<Blob>();
    direct.downloadAttachment.and.returnValue(pending.asObservable());
    const createUrl = spyOn(URL, 'createObjectURL').and.returnValue('blob:old-chat');
    spyOn<any>(component, 'loadHistory').and.stub();
    spyOn<any>(component, 'loadComposerAccess').and.stub();
    component.openAttachment(image);
    component.selectConversation(other);
    component.selectConversation(peer);
    pending.next(new Blob(['private-gif'], { type: 'image/gif' }));
    pending.complete();
    expect(createUrl).not.toHaveBeenCalled();
    expect(component.attachmentPreviews.size).toBe(0);
  });

  it('blocks an attachment send selected under a previous login', () => {
    let browserToken = 'qa-ana';
    spyOn(localStorage, 'getItem').and.callFake(key => key === 't' ? browserToken : null);
    (component as any).receiptSessionToken = browserToken;
    const peer = item('direct', 'bea');
    component.conversations = [peer];
    component.selectedKey = peer.key;
    component.composerAllowed = true;
    component.attachmentReady = true;
    component.selectedAttachment = new File(['%PDF-1.4'], 'treino.pdf', { type: 'application/pdf' });
    component.draft = 'Mensagem anterior à troca de conta';
    browserToken = 'qa-different-account';
    component.sendMessage();
    expect(direct.sendAttachment).not.toHaveBeenCalled();
    expect(direct.send).not.toHaveBeenCalled();
  });

  it('clears private media when another tab changes login and unregisters the listener', () => {
    const encode = (value: unknown) => btoa(JSON.stringify(value));
    const originalToken = [encode({ alg: 'none' }),
      encode({ sub: 'ana', exp: Math.floor(Date.now() / 1000) + 3600 }), 'fixture'].join('.');
    let activeToken = originalToken;
    spyOn(localStorage, 'getItem').and.callFake(key => key === 't' ? activeToken : null);
    const revoked = spyOn(URL, 'revokeObjectURL');
    component.ngOnInit();
    try {
      component.attachmentReady = true;
      component.selectedAttachment = new File(['private-pdf'], 'private.pdf',
        { type: 'application/pdf' });
      component.attachmentPreviews.set(91, 'blob:private-old-session');
      activeToken = 'qa-different-account';
      window.dispatchEvent(new StorageEvent('storage',
        { key: 't', oldValue: originalToken, newValue: activeToken }));
      expect(component.attachmentReady).toBeFalse();
      expect(component.selectedAttachment).toBeNull();
      expect(component.attachmentPreviews.size).toBe(0);
      expect(revoked).toHaveBeenCalledWith('blob:private-old-session');
    } finally {
      component.ngOnDestroy();
    }
    component.attachmentReady = true;
    window.dispatchEvent(new StorageEvent('storage',
      { key: 't', oldValue: originalToken, newValue: activeToken }));
    expect(component.attachmentReady).toBeTrue();
  });

  it('gates community attachment controls on their own private backend availability', () => {
    const community = item('community', 7);
    const peer = item('direct', 'bea');
    component.conversations = [community, peer];
    spyOn<any>(component, 'loadHistory').and.stub();
    spyOn<any>(component, 'loadComposerAccess').and.stub();
    const pending = new Subject<{ available: boolean }>();
    timeline.chatAttachmentsAvailable.and.returnValue(pending.asObservable());
    component.selectConversation(community);
    expect(component.attachmentControlsReady).toBeFalse();
    expect(timeline.chatAttachmentsAvailable).toHaveBeenCalledOnceWith(7);
    component.selectConversation(peer);
    pending.next({ available: true });
    pending.complete();
    expect(component.attachmentControlsReady).toBeFalse();
    expect(component.selectedAttachment).toBeNull();
    expect(direct.attachmentsAvailable).toHaveBeenCalledOnceWith('bea');
  });

  it('sends a community PDF through membership-scoped multipart exactly once', () => {
    const community = item('community', 7);
    component.conversations = [community];
    component.selectedKey = community.key;
    component.attachmentReady = true;
    component.composerAllowed = true;
    const file = new File(['%PDF-1.4'], 'torneio.pdf', { type: 'application/pdf' });
    component.onAttachmentPicked({ target: { files: [file], value: '' }} as any);
    expect(component.selectedAttachment).toBe(file);
    timeline.sendChatAttachment.and.returnValue(of({
      id: 56, communityId: 7, kind: 'CHAT', username: 'ana',
      body: '📎 torneio.pdf', createdAt: new Date().toISOString(),
      attachmentName: 'torneio.pdf', attachmentMimeType: 'application/pdf',
      attachmentSize: 8
    }));
    component.sendMessage();
    expect(timeline.sendChatAttachment).toHaveBeenCalledOnceWith(7, file, '', undefined);
    expect(timeline.send).not.toHaveBeenCalled();
    expect(direct.sendAttachment).not.toHaveBeenCalled();
    expect(component.selectedAttachment).toBeNull();
    expect(component.messages.some(m => m.id === 56 && m.attachmentName === 'torneio.pdf')).toBeTrue();
  });


  it('automatically fetches an inline image once from the selected private conversation', () => {
    const peer=item('direct','bea'), photo={...message(peer.key,92,'bea'),
      attachmentName:'imagem-colada.png',attachmentMimeType:'image/png'};
    component.conversations=[peer];component.selectedKey=peer.key;
    direct.downloadAttachment.and.returnValue(of(new Blob(['x'],{type:'image/png'})));
    spyOn(URL,'createObjectURL').and.returnValue('blob:inline-private');
    const revoke=spyOn(URL,'revokeObjectURL');
    expect(component.isInlineImage(photo)).toBeTrue();
    expect(component.isInlineImage({...photo,attachmentMimeType:'application/pdf'})).toBeFalse();
    component.loadInlineImage(photo);
    component.loadInlineImage(photo);
    expect(direct.downloadAttachment).toHaveBeenCalledOnceWith('bea',92);
    expect(component.attachmentPreviews.get(92)).toBe('blob:inline-private');
    component.expandInlineImage(photo);
    expect(component.expandedImageId).toBe(92);
    component.closeImageViewer();
    expect(component.expandedImageId).toBeNull();
    expect(revoke).not.toHaveBeenCalled();
    component.ngOnDestroy();
    expect(revoke).toHaveBeenCalledWith('blob:inline-private');
  });

  it('uses existing protected community/session endpoints but never requests PDF previews', () => {
    const community=item('community',7), session=item('session',41);
    const photo={...message(community.key,93,'bea'),
      attachmentName:'praia.webp',attachmentMimeType:'image/webp'};
    component.conversations=[community,session];component.selectedKey=community.key;
    timeline.downloadChatAttachment.and.returnValue(of(new Blob(['x'],{type:'image/webp'})));
    spyOn(URL,'createObjectURL').and.returnValues('blob:community-photo','blob:session-photo');
    spyOn(URL,'revokeObjectURL');
    component.loadInlineImage(photo);
    expect(timeline.downloadChatAttachment).toHaveBeenCalledOnceWith(7,93);
    expect(direct.downloadAttachment).not.toHaveBeenCalled();
    (component as any).clearAttachmentPreviews();
    component.selectedKey=session.key;
    const sessionPhoto={...message(session.key,94,'ana'),
      attachmentName:'treino.jpg',attachmentMimeType:'image/jpeg'};
    sessions.downloadAttachment.and.returnValue(of(new Blob(['x'],{type:'image/jpeg'})));
    component.loadInlineImage(sessionPhoto);
    expect(sessions.downloadAttachment).toHaveBeenCalledOnceWith(41,94);
    expect(component.attachmentPreviews.get(94)).toBe('blob:session-photo');
    component.loadInlineImage({...sessionPhoto,id:95,attachmentMimeType:'application/pdf'});
    expect(sessions.downloadAttachment).toHaveBeenCalledTimes(1);
  });

  it('keeps a failed image as a manual retry without repeatedly downloading', () => {
    const peer=item('direct','bea'),photo={...message(peer.key,96,'ana'),
      attachmentName:'imagem.gif',attachmentMimeType:'image/gif'};
    component.conversations=[peer];component.selectedKey=peer.key;
    direct.downloadAttachment.and.returnValue(throwError(()=>new Error('HTTP blocked')));
    component.loadInlineImage(photo);
    component.loadInlineImage(photo);
    expect(direct.downloadAttachment).toHaveBeenCalledTimes(1);
    expect(component.inlineImageFailures.has(96)).toBeTrue();
    expect(component.composerError).toBe('');
    direct.downloadAttachment.and.returnValue(of(new Blob(['x'],{type:'image/gif'})));
    spyOn(URL,'createObjectURL').and.returnValue('blob:retry-success');
    component.retryInlineImage(photo);
    expect(direct.downloadAttachment).toHaveBeenCalledTimes(2);
    expect(component.inlineImageFailures.has(96)).toBeFalse();
    expect(component.attachmentPreviews.get(96)).toBe('blob:retry-success');
  });

  it('does not expose an inline image downloaded after the user changes account', () => {
    let browserToken='qa-ana';
    spyOn(localStorage,'getItem').and.callFake(key=>key==='t'?browserToken:null);
    (component as any).receiptSessionToken=browserToken;
    const peer=item('direct','bea'),photo={...message(peer.key,98,'bea'),
      attachmentName:'private.png',attachmentMimeType:'image/png'};
    component.conversations=[peer];component.selectedKey=peer.key;
    const pending=new Subject<Blob>();
    direct.downloadAttachment.and.returnValue(pending.asObservable());
    const create=spyOn(URL,'createObjectURL').and.returnValue('blob:forbidden');
    component.loadInlineImage(photo);
    browserToken='different-account';
    pending.next(new Blob(['x'],{type:'image/png'}));pending.complete();
    expect(create).not.toHaveBeenCalled();
    expect(component.attachmentPreviews.size).toBe(0);
    component.expandInlineImage(photo);
    expect(component.expandedImageId).toBeNull();
  });

  it('downloads community media only through its authorized community endpoint', () => {
    const community = item('community', 7);
    component.conversations = [community];
    component.selectedKey = community.key;
    const photo = { ...message(community.key, 72, 'owner'),
      attachmentName: 'foto.jpg', attachmentMimeType: 'image/jpeg', attachmentSize: 16 };
    const createUrl = spyOn(URL, 'createObjectURL').and.returnValue('blob:community-private');
    spyOn(URL, 'revokeObjectURL');
    timeline.downloadChatAttachment.and.returnValue(of(new Blob(['private-photo'], {type:'image/jpeg'})));
    component.openAttachment(photo);
    expect(timeline.downloadChatAttachment).toHaveBeenCalledOnceWith(7, 72);
    expect(direct.downloadAttachment).not.toHaveBeenCalled();
    expect(createUrl).toHaveBeenCalled();
    expect(component.attachmentPreviews.get(72)).toBe('blob:community-private');
  });

  it('keeps session media hidden when its protected backend reports unavailable', () => {
    const session = item('session', 41);
    component.conversations = [session];
    spyOn<any>(component, 'loadHistory').and.stub();
    spyOn<any>(component, 'loadComposerAccess').and.stub();
    component.selectConversation(session);
    expect(sessions.attachmentsAvailable).toHaveBeenCalledOnceWith(41);
    expect(component.attachmentControlsReady).toBeFalse();
    expect(direct.attachmentsAvailable).not.toHaveBeenCalled();
    expect(timeline.chatAttachmentsAvailable).not.toHaveBeenCalled();
    const file = new File(['x'], 'file.pdf', {type:'application/pdf'});
    component.onAttachmentPicked({ target: { files: [file], value: '' }} as any);
    expect(component.selectedAttachment).toBeNull();
    expect(sessions.sendAttachment).not.toHaveBeenCalled();
  });

  it('sends a file in an open session via its participant-scoped endpoint only', () => {
    const session = item('session', 41);
    component.conversations = [session];
    component.selectedKey = session.key;
    component.attachmentReady = true;
    component.composerAllowed = true;
    (component as any).sessionKickoffs.set(41, Date.now() + 3600_000);
    const file = new File(['%PDF-1.4'], 'treino.pdf', {type:'application/pdf'});
    component.onAttachmentPicked({target:{files:[file],value:''}} as any);
    expect(component.selectedAttachment).toBe(file);
    sessions.sendAttachment.and.returnValue(of({
      id:75,sessionId:41,senderUsername:'ana',body:'📎 treino.pdf',
      createdAt:new Date().toISOString(),attachmentName:'treino.pdf',
      attachmentMimeType:'application/pdf',attachmentSize:8
    }));
    component.sendMessage();
    expect(sessions.sendAttachment).toHaveBeenCalledOnceWith(41,file,'',undefined);
    expect(sessions.postMessage).not.toHaveBeenCalled();
    expect(direct.sendAttachment).not.toHaveBeenCalled();
    expect(timeline.sendChatAttachment).not.toHaveBeenCalled();
    expect(component.messages.some(x => x.id === 75 && x.attachmentName === 'treino.pdf'))
      .toBeTrue();
  });

  it('never opens a session attachment once kickoff has passed', () => {
    const session = item('session', 41);
    component.conversations = [session];
    component.selectedKey = session.key;
    component.attachmentReady = true;
    component.composerAllowed = true;
    (component as any).sessionKickoffs.set(41, Date.now() - 1000);
    const file = new File(['%PDF-1.4'], 'treino.pdf', {type:'application/pdf'});
    component.onAttachmentPicked({target:{files:[file],value:''}} as any);
    expect(component.selectedAttachment).toBeNull();
    expect(component.attachmentControlsReady).toBeFalse();
    component.openAttachment({...message(session.key,88,'ana'),
      attachmentName:'jogo.jpg',attachmentMimeType:'image/jpeg'});
    expect(sessions.downloadAttachment).not.toHaveBeenCalled();
    expect(sessions.sendAttachment).not.toHaveBeenCalled();
  });

  it('discards a session availability response that arrives after kickoff', () => {
    const session = item('session', 41);
    component.conversations = [session];
    const pending = new Subject<{ available: boolean }>();
    sessions.attachmentsAvailable.and.returnValue(pending.asObservable());
    spyOn<any>(component, 'loadHistory').and.stub();
    spyOn<any>(component, 'loadComposerAccess').and.stub();
    component.selectConversation(session);
    (component as any).sessionKickoffs.set(41, Date.now() - 1000);
    pending.next({ available: true });
    pending.complete();
    expect(component.attachmentReady).toBeFalse();
    expect(component.attachmentControlsReady).toBeFalse();
  });

  it('discards an in-flight session image download if the game starts', () => {
    const session = item('session', 41);
    component.conversations = [session];
    component.selectedKey = session.key;
    (component as any).sessionKickoffs.set(41, Date.now() + 3600_000);
    const pending = new Subject<Blob>();
    sessions.downloadAttachment.and.returnValue(pending.asObservable());
    const createUrl = spyOn(URL, 'createObjectURL').and.returnValue('blob:session-old');
    const image = {...message(session.key,89,'ana'),
      attachmentName:'bola.jpg',attachmentMimeType:'image/jpeg'};
    component.openAttachment(image);
    expect(sessions.downloadAttachment).toHaveBeenCalledOnceWith(41,89);
    (component as any).sessionKickoffs.set(41, Date.now() - 1000);
    pending.next(new Blob(['private'],{type:'image/jpeg'}));
    pending.complete();
    expect(createUrl).not.toHaveBeenCalled();
    expect(component.attachmentPreviews.size).toBe(0);
  });

  it('closes selected session and revokes displayed private files exactly at kickoff', () => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date());
    try {
      const session = item('session', 41);
      (component as any).sessionKickoffs.set(41, Date.now() + 100);
      component.conversations = [session];
      spyOn<any>(component, 'loadHistory').and.stub();
      spyOn<any>(component, 'loadComposerAccess').and.stub();
      const revoked = spyOn(URL, 'revokeObjectURL');
      const pending = new Subject<Blob>();
      sessions.downloadAttachment.and.returnValue(pending.asObservable());
      const createUrl = spyOn(URL, 'createObjectURL').and.returnValue('blob:late');
      component.selectConversation(session);
      component.attachmentPreviews.set(64, 'blob:old-session');
      component.selectedAttachment = new File(['test'], 'private.pdf',
        { type: 'application/pdf' });
      component.attachmentReady = true;
      component.messages = [message(session.key, 65)];
      component.openAttachment({ ...message(session.key, 66),
        attachmentName: 'photo.jpg', attachmentMimeType: 'image/jpeg' });
      expect(sessions.downloadAttachment).toHaveBeenCalledOnceWith(41, 66);

      jasmine.clock().tick(101);
      expect(component.selectedKey).toBeNull();
      expect(component.conversations.some(c => c.key === session.key)).toBeFalse();
      expect(component.messages).toEqual([]);
      expect(component.selectedAttachment).toBeNull();
      expect(component.attachmentPreviews.size).toBe(0);
      expect(revoked).toHaveBeenCalledWith('blob:old-session');
      pending.next(new Blob(['late'], { type: 'image/jpeg' }));
      pending.complete();
      expect(createUrl).not.toHaveBeenCalled();
    } finally {
      component.ngOnDestroy();
      jasmine.clock().uninstall();
    }
  });

  it('does not close a different chat when the previous session reaches kickoff', () => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date());
    try {
      const session = item('session', 41);
      const directChat = item('direct', 'bea');
      (component as any).sessionKickoffs.set(41, Date.now() + 100);
      component.conversations = [session, directChat];
      spyOn<any>(component, 'loadHistory').and.stub();
      spyOn<any>(component, 'loadComposerAccess').and.stub();
      component.selectConversation(session);
      component.selectConversation(directChat);
      jasmine.clock().tick(101);
      expect(component.selectedKey).toBe(directChat.key);
      expect(component.conversations.some(c => c.key === directChat.key)).toBeTrue();
    } finally {
      component.ngOnDestroy();
      jasmine.clock().uninstall();
    }
  });

  it('expires private session previews on focus after browser suspension', () => {
    const session = item('session', 41);
    component.conversations = [session];
    spyOn<any>(component, 'loadHistory').and.stub();
    spyOn<any>(component, 'loadComposerAccess').and.stub();
    component.selectConversation(session);
    const revoked = spyOn(URL, 'revokeObjectURL');
    component.attachmentPreviews.set(93, 'blob:suspended-session');
    // Simulate time passing while the browser suspends timer callbacks.
    (component as any).sessionKickoffs.set(41, Date.now() - 1000);
    (component as any).onPageActive();
    expect(component.selectedKey).toBeNull();
    expect(component.attachmentPreviews.size).toBe(0);
    expect(revoked).toHaveBeenCalledWith('blob:suspended-session');
    component.ngOnDestroy();
  });


  it('pastes an image into a direct chat as a staged private attachment without sending', () => {
    const peer = item('direct','bea');
    component.conversations = [peer];
    component.selectedKey = peer.key;
    component.composerAllowed = true;
    component.attachmentReady = true;
    component.draft = 'Legenda original';
    const create = spyOn(URL,'createObjectURL').and.returnValue('blob:staged-image');
    const revoke = spyOn(URL,'revokeObjectURL');
    const file = new File(['PNG'],'clipboard.png',{type:'image/png'});
    const preventDefault = jasmine.createSpy('preventDefault');
    component.onComposerPaste({clipboardData:{items:[{kind:'file',type:'image/png',
      getAsFile:()=>file}],files:[]},preventDefault} as unknown as ClipboardEvent);
    expect(preventDefault).toHaveBeenCalled();
    expect(component.selectedAttachment?.name).toMatch(/^imagem-colada-\d+\.png$/);
    expect(component.selectedAttachmentPreviewUrl).toBe('blob:staged-image');
    expect(component.draft).toBe('Legenda original');
    expect(create).toHaveBeenCalledTimes(1);
    expect(direct.sendAttachment).not.toHaveBeenCalled();
    expect(direct.send).not.toHaveBeenCalled();
    component.removeAttachment();
    expect(revoke).toHaveBeenCalledOnceWith('blob:staged-image');
    expect(component.selectedAttachment).toBeNull();
  });

  it('keeps ordinary text paste untouched and respects private storage restrictions', () => {
    const peer = item('direct','bea');
    component.conversations=[peer];
    component.selectedKey=peer.key;
    component.composerAllowed=true;
    component.draft='Hello';
    const normal = jasmine.createSpy('plain');
    component.onComposerPaste({clipboardData:{items:[{kind:'string',type:'text/plain',
      getAsFile:()=>null}],files:[]},preventDefault:normal} as unknown as ClipboardEvent);
    expect(normal).not.toHaveBeenCalled();
    expect(component.draft).toBe('Hello');
    const image = new File(['x'],'screen.png',{type:'image/png'});
    const blocked = jasmine.createSpy('blocked');
    component.onComposerPaste({clipboardData:{items:[{kind:'file',type:'image/png',
      getAsFile:()=>image}]},preventDefault:blocked} as unknown as ClipboardEvent);
    expect(blocked).toHaveBeenCalled();
    expect(component.selectedAttachment).toBeNull();
    expect(component.composerError).toBeTruthy();
    expect(direct.sendAttachment).not.toHaveBeenCalled();
  });

  it('rejects invalid and oversized pasted images without replacing a valid draft', () => {
    const peer=item('direct','bea');
    component.conversations=[peer];
    component.selectedKey=peer.key;
    component.composerAllowed=true;
    component.attachmentReady=true;
    const png=new File(['ok'],'original.png',{type:'image/png'});
    spyOn(URL,'createObjectURL').and.returnValue('blob:original');
    const revoke=spyOn(URL,'revokeObjectURL');
    component.onAttachmentPicked({target:{files:[png],value:''}} as any);
    const svg=new File(['<svg/>'],'svg.svg',{type:'image/svg+xml'});
    component.onComposerPaste({clipboardData:{items:[{kind:'file',type:'image/svg+xml',
      getAsFile:()=>svg}]},preventDefault:()=>{}} as unknown as ClipboardEvent);
    expect(component.selectedAttachment).toBe(png);
    expect(revoke).not.toHaveBeenCalled();
    expect(component.composerError).toBeTruthy();
    const big=new File([new Uint8Array(5*1024*1024+1)],'huge.png',{type:'image/png'});
    component.onComposerPaste({clipboardData:{items:[{kind:'file',type:'image/png',
      getAsFile:()=>big}]},preventDefault:()=>{}} as unknown as ClipboardEvent);
    expect(component.selectedAttachment).toBe(png);
  });

  it('uses authorized community and session multipart endpoints when pasted images are sent', () => {
    const getEvent=(file:File)=>({clipboardData:{items:[{kind:'file',type:file.type,
      getAsFile:()=>file}]},preventDefault:()=>{}} as unknown as ClipboardEvent);
    spyOn(URL,'createObjectURL').and.returnValue('blob:local-image');
    spyOn(URL,'revokeObjectURL');
    const community = item('community',7);
    component.conversations=[community];
    component.selectedKey=community.key;
    component.composerAllowed=true;
    component.attachmentReady=true;
    component.onComposerPaste(getEvent(new File(['x'],'shot.webp',{type:'image/webp'})));
    timeline.sendChatAttachment.and.returnValue(of({id:70,communityId:7,kind:'CHAT',
      username:'ana',body:'📎 imagem',createdAt:new Date().toISOString()}));
    component.sendMessage();
    expect(timeline.sendChatAttachment).toHaveBeenCalledTimes(1);
    expect(timeline.sendChatAttachment.calls.mostRecent().args[1].type).toBe('image/webp');
    expect(direct.sendAttachment).not.toHaveBeenCalled();
    expect(component.selectedAttachmentPreviewUrl).toBeNull();

    const session=item('session',41);
    component.conversations=[session];
    component.selectedKey=session.key;
    component.composerAllowed=true;
    component.attachmentReady=true;
    component.onComposerPaste(getEvent(new File(['x'],'shot.gif',{type:'image/gif'})));
    sessions.sendAttachment.and.returnValue(of({id:71,sessionId:41,senderUsername:'ana',
      body:'📎 imagem',createdAt:new Date().toISOString()}));
    component.sendMessage();
    expect(sessions.sendAttachment).toHaveBeenCalledTimes(1);
    expect(sessions.sendAttachment.calls.mostRecent().args[1].type).toBe('image/gif');
    expect(component.selectedAttachment).toBeNull();
  });

  it('revokes copied preview on changing conversation and on teardown', () => {
    const first=item('direct','bea'), second=item('direct','carlos');
    component.conversations=[first,second];
    component.selectedKey=first.key;
    component.attachmentReady=true;component.composerAllowed=true;
    spyOn(URL,'createObjectURL').and.returnValues('blob:one','blob:two');
    const revoked=spyOn(URL,'revokeObjectURL');
    const clip=(file:File)=>({clipboardData:{items:[{kind:'file',type:file.type,
      getAsFile:()=>file}]},preventDefault:()=>{}} as unknown as ClipboardEvent);
    component.onComposerPaste(clip(new File(['x'],'one.png',{type:'image/png'})));
    spyOn<any>(component,'loadHistory').and.stub();
    spyOn<any>(component,'loadComposerAccess').and.stub();
    component.selectConversation(second);
    expect(revoked).toHaveBeenCalledWith('blob:one');
    expect(component.selectedAttachment).toBeNull();
    component.attachmentReady=true;component.composerAllowed=true;
    component.previewLoading=false;component.previewError=false;
    component.composerAccessLoading=false;
    component.onComposerPaste(clip(new File(['x'],'two.png',{type:'image/png'})));
    expect(component.selectedAttachmentPreviewUrl).toBe('blob:two');
    component.ngOnDestroy();
    expect(revoked).toHaveBeenCalledWith('blob:two');
  });

  it('refuses unsupported or oversized attachments before HTTP upload', () => {
    const peer = item('direct','bea');
    component.conversations = [peer];
    component.selectedKey = peer.key;
    component.attachmentReady = true;
    component.composerAllowed = true;
    const fakeInput: any = { files:[new File(['<script>hello</script>'],'x.html',{type:'text/html'})], value:'anything' };
    component.onAttachmentPicked({target:fakeInput} as any);
    expect(fakeInput.value).toBe('');
    expect(component.selectedAttachment).toBeNull();
    expect(component.composerError).toBeTruthy();
    expect(direct.sendAttachment).not.toHaveBeenCalled();
    const huge = new File([new Uint8Array(5 * 1024 * 1024 + 1)],'x.pdf',{type:'application/pdf'});
    component.onAttachmentPicked({target:{files:[huge],value:''}} as any);
    expect(component.selectedAttachment).toBeNull();
  });

  it('renders voice attachments as an audio note instead of a duplicated raw filename', () => {
    const peer = item('direct', 'bea');
    const recording: InboxMessage = {
      ...message(peer.key, 77), text: '📎 voz-123.webm',
      attachmentName: 'voz-123.webm', attachmentMimeType: 'audio/webm'
    };
    expect(component.isVoiceNote(recording)).toBeTrue();
    expect(component.showMessageBody(recording)).toBeFalse();
    expect(component.showMessageBody({...recording, text:'Bom dia!'})).toBeTrue();
    expect(component.isVoiceNote({...recording, attachmentMimeType:'image/gif'})).toBeFalse();
  });

  it('accepts a GIF upload in a chat only after private storage is authorized', () => {
    const peer = item('direct', 'bea');
    component.conversations = [peer];
    component.selectedKey = peer.key;
    component.composerAllowed = true;
    const gif = new File(['GIF89a'], 'festa.gif', {type:'image/gif'});
    component.attachmentReady = false;
    component.onAttachmentPicked({target:{files:[gif],value:''}} as any);
    expect(component.selectedAttachment).toBeNull();
    component.attachmentReady = true;
    component.onAttachmentPicked({target:{files:[gif],value:''}} as any);
    expect(component.selectedAttachment).toBe(gif);
    expect(direct.sendAttachment).not.toHaveBeenCalled();
  });

  it('shows recent messages immediately when returning to a visited conversation', () => {
    const peer = item('direct', 'bea');
    const community = item('community', 7);
    component.conversations = [peer, community];
    const slow = new Subject<{content:any[];last:boolean}>();
    direct.recentHistory.and.returnValues(
      of({last:true,content:[{id:27,username1:'ana',username2:'bea',
        text:'Olá!',date:'2026-10-25T13:00:00Z',dataDisplay:null}]}),
      slow.asObservable()
    );
    timeline.list.and.returnValue(of([]));
    component.selectConversation(peer);
    expect(component.messages.map(m=>m.id)).toEqual([27]);
    component.selectConversation(community);
    component.selectConversation(peer);
    expect(component.previewLoading).toBeFalse();
    expect(component.messages.map(m=>m.id)).toEqual([27]);
    slow.next({last:true,content:[{id:27,username1:'ana',username2:'bea',
      text:'Atualizada',date:'2026-10-25T13:01:00Z',dataDisplay:null}]});
    slow.complete();
    expect(component.messages[0].text).toBe('Atualizada');
    component.ngOnDestroy();
    expect((component as any).recentThreadCache.size).toBe(0);
  });

  it('does not leave cached history visible after an authorization failure', () => {
    const peer = item('direct', 'bea');
    const community = item('community', 7);
    component.conversations = [peer, community];
    const refused = new Subject<any>();
    direct.recentHistory.and.returnValues(
      of({last:true,content:[{id:27,username1:'ana',username2:'bea',
        text:'Privado',date:'2026-10-25T13:00:00Z',dataDisplay:null}]}),
      refused.asObservable());
    timeline.list.and.returnValue(of([]));
    component.selectConversation(peer);
    component.selectConversation(community);
    component.selectConversation(peer);
    expect(component.messages.length).toBe(1);
    refused.error(new HttpErrorResponse({status:403}));
    expect(component.previewError).toBeTrue();
    expect(component.messages).toEqual([]);
    expect((component as any).recentThreadCache.has(peer.key)).toBeFalse();
  });

  it('distinguishes a temporary composer permission error from a real block', () => {
    const peer = item('direct', 'bea');
    component.conversations = [peer];
    direct.recentHistory.and.returnValue(of({content:[],last:true}));
    direct.info.and.returnValue(throwError(() => new HttpErrorResponse({status:503})));
    component.selectConversation(peer);
    expect(component.composerAccessError).toBeTrue();
    expect(component.composerAllowed).toBeFalse();

    direct.info.and.returnValue(of({chatBlocked:false, whoBlocked:null}));
    component.retryComposerAccess();
    expect(component.composerAccessError).toBeFalse();
    expect(component.composerAllowed).toBeTrue();

    direct.info.and.returnValue(of({chatBlocked:true, whoBlocked:'bea'}));
    component.retryComposerAccess();
    expect(component.composerAccessError).toBeFalse();
    expect(component.composerAllowed).toBeFalse();
  });

  it('sends a private PDF via multipart once with the existing successful-send flow', () => {
    const peer = item('direct','bea');
    component.conversations = [peer];
    component.selectedKey = peer.key;
    component.attachmentReady = true;
    component.composerAllowed = true;
    const file = new File(['%PDF-1.4'],'jogo.pdf',{type:'application/pdf'});
    component.onAttachmentPicked({target:{files:[file],value:''}} as any);
    expect(component.selectedAttachment).toBe(file);
    direct.sendAttachment.and.returnValue(of({
      id:42,username1:'ana',username2:'bea',text:'📎 jogo.pdf',
      attachmentName:'jogo.pdf',attachmentMimeType:'application/pdf',
      attachmentSize:8,date:new Date().toISOString(),dataDisplay:null
    }));
    component.sendMessage();
    expect(direct.sendAttachment).toHaveBeenCalledOnceWith('bea',file,'',undefined);
    expect(direct.send).not.toHaveBeenCalled();
    expect(component.selectedAttachment).toBeNull();
    expect(component.messages.some(message => message.id === 42
      && message.attachmentName === 'jogo.pdf')).toBeTrue();
  });

  it('extends the voice duration to five minutes and formats minutes correctly', () => {
    expect(VOICE_NOTE_MAX_DURATION_MS).toBe(300_000);
    expect(component.voiceMaxSeconds).toBe(300);
    component.voiceElapsedSeconds = 0;
    expect(component.voiceElapsedLabel).toBe('0:00');
    component.voiceElapsedSeconds = 61;
    expect(component.voiceElapsedLabel).toBe('1:01');
    component.voiceElapsedSeconds = 299;
    expect(component.voiceElapsedLabel).toBe('4:59');
  });

  it('records beyond 60 seconds and stops once at the five-minute boundary', async () => {
    class FakeMediaRecorder {
      static isTypeSupported(type: string) { return type === 'audio/webm;codecs=opus'; }
      state: RecordingState = 'inactive';
      ondataavailable: ((e: BlobEvent) => void) | null = null;
      onstop: ((e: Event) => void) | null = null;
      onerror: ((e: Event) => void) | null = null;
      start = jasmine.createSpy('start').and.callFake(() => { this.state = 'recording'; });
      stop = jasmine.createSpy('stop').and.callFake(() => {
        this.state = 'inactive';
        this.ondataavailable?.({data:new Blob(['sample Opus audio'],{type:'audio/webm'})} as BlobEvent);
        this.onstop?.(new Event('stop'));
      });
      constructor(_stream: MediaStream, readonly settings: MediaRecorderOptions) {
        lastRecorder = this;
      }
    }
    let lastRecorder: FakeMediaRecorder | null = null;
    const getRecorder = (): FakeMediaRecorder => {
      if (lastRecorder === null) throw new Error('Recorder was not constructed');
      return lastRecorder as FakeMediaRecorder;
    };
    const prevRecorder = Object.getOwnPropertyDescriptor(window, 'MediaRecorder');
    const prevDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
    const stopTracks = jasmine.createSpy('stopTracks');
    const fakeStream = {getTracks: () => [{stop:stopTracks}]} as unknown as MediaStream;
    const createUrl = spyOn(URL, 'createObjectURL').and.returnValue('blob:test-voice');
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date());
    Object.defineProperty(window, 'MediaRecorder',
      {configurable:true,value:FakeMediaRecorder});
    Object.defineProperty(navigator, 'mediaDevices', {configurable:true,
      value:{getUserMedia:async () => fakeStream}});
    try {
      const peer = item('direct', 'bea');
      component.conversations = [peer];
      component.selectedKey = peer.key;
      component.attachmentReady = true;
      component.composerAllowed = true;
      await component.startVoiceRecording();
      expect(component.voiceRecording).toBeTrue();
      expect(getRecorder().settings.audioBitsPerSecond).toBe(48000);
      jasmine.clock().tick(61_000);
      expect(component.voiceRecording).toBeTrue();
      expect(component.voiceElapsedLabel).toBe('1:01');
      expect(getRecorder().stop).not.toHaveBeenCalled();
      jasmine.clock().tick(VOICE_NOTE_MAX_DURATION_MS - 61_000);
      expect(component.voiceRecording).toBeFalse();
      expect(getRecorder().stop).toHaveBeenCalledTimes(1);
      expect(component.voiceElapsedSeconds).toBe(0);
      expect(component.selectedAttachment?.type).toBe('audio/webm');
      expect(createUrl).toHaveBeenCalledTimes(1);
      expect(direct.sendAttachment).not.toHaveBeenCalled();
      jasmine.clock().tick(60_000);
      expect(getRecorder().stop).toHaveBeenCalledTimes(1);
    } finally {
      component.ngOnDestroy();
      if (prevRecorder) Object.defineProperty(window, 'MediaRecorder', prevRecorder);
      else delete (window as any).MediaRecorder;
      if (prevDevices) Object.defineProperty(navigator, 'mediaDevices', prevDevices);
      else delete (navigator as any).mediaDevices;
      jasmine.clock().uninstall();
    }
  });

  it('stops recording on window blur and removes the listener on destroy', () => {
    component.ngOnInit();
    const cancel = spyOn(component, 'cancelVoiceRecording').and.callThrough();
    try {
      component.voiceRecording = true;
      window.dispatchEvent(new Event('blur'));
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(component.voiceRecording).toBeFalse();
    } finally {
      component.ngOnDestroy();
    }
    cancel.calls.reset();
    component.voiceRecording = true;
    window.dispatchEvent(new Event('blur'));
    expect(cancel).not.toHaveBeenCalled();
    component.voiceRecording = false;
  });

  it('keeps the microphone disabled without authorized private storage', async () => {
    const peer = item('direct', 'bea');
    component.conversations = [peer];
    component.selectedKey = peer.key;
    component.composerAllowed = true;
    component.attachmentReady = false;
    await component.startVoiceRecording();
    expect(component.voiceRecording).toBeFalse();
    expect(component.selectedAttachment).toBeNull();
    expect(direct.sendAttachment).not.toHaveBeenCalled();
  });

  it('does not permit a send while the microphone records or finalizes', () => {
    const peer = item('direct', 'bea');
    component.conversations = [peer];
    component.selectedKey = peer.key;
    component.composerAllowed = true;
    component.attachmentReady = true;
    component.draft = 'Olá';
    expect(component.canSendMessage()).toBeTrue();
    component.voiceRecording = true;
    expect(component.canSendMessage()).toBeFalse();
    component.sendMessage();
    expect(direct.send).not.toHaveBeenCalled();
    component.voiceRecording = false;
    component.voiceFinalizing = true;
    expect(component.canSendMessage()).toBeFalse();
    component.sendMessage();
    expect(direct.send).not.toHaveBeenCalled();
  });

  it('sends an Opus voice note once, only after the user confirms Send', () => {
    const peer = item('direct', 'bea');
    component.conversations = [peer];
    component.selectedKey = peer.key;
    component.composerAllowed = true;
    component.attachmentReady = true;
    const file = new File(['OggS OpusHead'], 'voz.ogg', {type:'audio/ogg'});
    component.selectedAttachment = file;
    expect(direct.sendAttachment).not.toHaveBeenCalled();
    direct.sendAttachment.and.returnValue(of({
      id:52,username1:'ana',username2:'bea',text:'📎 voz.ogg',
      attachmentName:'voz.ogg',attachmentMimeType:'audio/ogg',
      attachmentSize:14,date:new Date().toISOString(),dataDisplay:null
    }));
    component.sendMessage();
    expect(direct.sendAttachment).toHaveBeenCalledOnceWith('bea',file,'',undefined);
    expect(direct.send).not.toHaveBeenCalled();
    expect(component.selectedAttachment).toBeNull();
    expect(component.messages.some(message => message.id === 52
      && message.attachmentMimeType === 'audio/ogg')).toBeTrue();
  });

  it('shows one compact voice timeline with m:ss duration and accessible seeking', () => {
    const player = {
      duration: 92, currentTime: 0, paused: true, ended: false, muted: false,
      play: jasmine.createSpy('play').and.returnValue(Promise.resolve()),
      pause: jasmine.createSpy('pause'),
      removeAttribute: jasmine.createSpy('removeAttribute'),
      load: jasmine.createSpy('load')
    } as unknown as HTMLAudioElement;
    const note = {...message('direct:bea', 77), attachmentName: 'voice.webm',
      attachmentMimeType: 'audio/webm'};
    component.conversations = [item('direct', 'bea')];
    component.selectedKey = note.key;
    component.onVoiceReady(note, player);
    expect(component.voiceTimeLabel(77)).toBe('0:00 / 1:32');
    expect(component.voiceProgress(77)).toBe(0);
    player.currentTime = 45;
    component.onVoiceTimeUpdate(77, player);
    expect(component.voiceTimeLabel(77)).toBe('0:45 / 1:32');
    expect(component.voiceProgress(77)).toBe(49);
    component.seekVoice(77, player, {target: {value:'50'}} as unknown as Event);
    expect(player.currentTime).toBe(46);
    component.toggleVoiceMute(77, player);
    expect(player.muted).toBeTrue();
    expect(component.voiceMuted.has(77)).toBeTrue();
    component.toggleVoiceMute(77, player);
    expect(player.muted).toBeFalse();
  });

  it('uses chat-style controls for a voice draft and resets playback on removal', () => {
    component.selectedAttachment = new File(['audio'], 'voz.webm', {type: 'audio/webm'});
    component.voicePreviewUrl = 'blob:voice-draft';
    const revoke = spyOn(URL, 'revokeObjectURL').and.stub();
    const player = {
      paused: true, ended: false, muted: false, duration: 8, currentTime: 0,
      pause: jasmine.createSpy('pause'), play: jasmine.createSpy('play').and.returnValue(Promise.resolve()),
      removeAttribute: jasmine.createSpy('removeAttribute'),
      load: jasmine.createSpy('load')
    } as unknown as HTMLAudioElement;
    component.onVoicePreviewTimeUpdate(player);
    expect(component.voicePreviewTimeLabel()).toBe('0:00 / 0:08');
    component.seekVoicePreview(player, {target: {value: '50'}} as unknown as Event);
    expect(player.currentTime).toBe(4);
    expect(component.voicePreviewProgress()).toBe(50);
    component.toggleVoicePreviewMute(player);
    expect(player.muted).toBeTrue();
    component.toggleVoicePreview(player);
    expect(player.play).toHaveBeenCalled();
    component.removeAttachment();
    expect(player.pause).toHaveBeenCalled();
    expect(player.removeAttribute).toHaveBeenCalledWith('src');
    expect(component.voicePreviewUrl).toBeNull();
    expect(component.voicePreviewTimeLabel()).toBe('0:00 / 0:00');
    expect(component.voicePreviewMuted).toBeFalse();
    expect(revoke).toHaveBeenCalledOnceWith('blob:voice-draft');
  });

  it('pauses the preceding voice note when another begins playback', () => {
    const peer = item('direct', 'bea');
    component.conversations = [peer];
    component.selectedKey = peer.key;
    component.attachmentPreviews.set(81, 'blob:voice-one');
    component.attachmentPreviews.set(82, 'blob:voice-two');
    const first = {
      paused: false, ended: false, duration: 30, currentTime: 6,
      pause: jasmine.createSpy('firstPause')
    };
    first.pause.and.callFake(() => { first.paused = true; });
    const second = {
      paused: true, ended: false, duration: 45, currentTime: 2,
      pause: jasmine.createSpy('secondPause')
    };
    second.pause.and.callFake(() => { second.paused = true; });
    component.onVoiceReady({...message(peer.key, 81), attachmentName: '1.webm'}, first as unknown as HTMLAudioElement);
    component.onVoiceReady({...message(peer.key, 82), attachmentName: '2.webm'}, second as unknown as HTMLAudioElement);
    component.onVoicePlaybackEvent(81, first as unknown as HTMLAudioElement);
    expect(component.voicePlaying.has(81)).toBeTrue();
    second.paused = false; // The second HTMLAudioElement has just emitted "playing".
    component.onVoicePlaybackEvent(82, second as unknown as HTMLAudioElement);
    expect(first.pause).toHaveBeenCalledTimes(1);
    expect(second.pause).not.toHaveBeenCalled();
    expect(component.voicePlaying.has(81)).toBeFalse();
    expect(component.voicePlaying.has(82)).toBeTrue();
    // Position remains available for later resuming, without a second download.
    expect(component.voiceTimeLabel(81)).toBe('0:06 / 0:30');
    component.onVoicePlaybackEvent(81, first as unknown as HTMLAudioElement);
    expect(component.voicePlaying.has(82)).toBeTrue();
  });

  it('ignores delayed voice playback events after private previews were removed', () => {
    const peer = item('direct', 'bea');
    component.conversations = [peer];
    component.selectedKey = peer.key;
    const player = {
      paused: false, ended: false, duration: 10, currentTime: 0,
      pause: jasmine.createSpy('pause')
    };
    player.pause.and.callFake(() => { player.paused = true; });
    component.attachmentPreviews.set(83, 'blob:private');
    component.onVoiceReady({...message(peer.key, 83)}, player as unknown as HTMLAudioElement);
    component.attachmentPreviews.delete(83);
    component.onVoicePlaybackEvent(83, player as unknown as HTMLAudioElement);
    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(component.voicePlaying.has(83)).toBeFalse();
  });

  it('starts voice playback only after authorized download, then releases it on chat change', () => {
    const peer = item('direct','bea');
    const note = {...message(peer.key, 77), attachmentName:'voz.webm',
      attachmentMimeType:'audio/webm'};
    const player = {
      duration:91, currentTime:0, paused:true, ended:false, muted:false,
      play:jasmine.createSpy('play').and.returnValue(Promise.resolve()),
      pause:jasmine.createSpy('pause'),
      removeAttribute:jasmine.createSpy('removeAttribute'),
      load:jasmine.createSpy('load')
    } as unknown as HTMLAudioElement;
    component.conversations = [peer, item('community',7)];
    component.selectedKey = peer.key;
    timeline.list.and.returnValue(of([]));
    direct.recentHistory.and.returnValue(of({content:[],last:true}));
    direct.downloadAttachment.and.returnValue(of(new Blob(['voice'], {type:'audio/webm'})));
    const create = spyOn(URL, 'createObjectURL').and.returnValue('blob:private-voice');
    const revoke = spyOn(URL, 'revokeObjectURL');
    component.openVoiceNote(note);
    expect(direct.downloadAttachment).toHaveBeenCalledOnceWith('bea',77);
    expect(create).toHaveBeenCalledTimes(1);
    component.onVoiceCanPlay(note, player);
    expect(player.play).toHaveBeenCalledTimes(1);
    component.selectConversation(component.conversations[1]);
    expect(player.pause).toHaveBeenCalled();
    expect(player.removeAttribute).toHaveBeenCalledWith('src');
    expect(revoke).toHaveBeenCalledWith('blob:private-voice');
    expect(component.voicePlaying.size).toBe(0);
    expect((component as any).voiceAutoplayRequested.size).toBe(0);
  });

  it('does not autoplay a voice note after leaving its conversation', () => {
    const peer = item('direct','bea');
    const note = {...message(peer.key, 77), attachmentName:'voice.webm',
      attachmentMimeType:'audio/webm'};
    const player = {
      duration:30, currentTime:0, paused:true, ended:false,
      play:jasmine.createSpy('play').and.returnValue(Promise.resolve()),
      pause:jasmine.createSpy('pause'),
      removeAttribute:jasmine.createSpy('removeAttribute'),
      load:jasmine.createSpy('load')
    } as unknown as HTMLAudioElement;
    component.conversations = [peer, item('direct','carla')];
    component.selectedKey = peer.key;
    direct.recentHistory.and.returnValue(of({content:[],last:true}));
    const pending = new Subject<Blob>();
    direct.downloadAttachment.and.returnValue(pending.asObservable());
    component.openVoiceNote(note);
    component.selectConversation(component.conversations[1]);
    pending.next(new Blob(['secret'],{type:'audio/webm'}));
    pending.complete();
    component.onVoiceCanPlay(note, player);
    expect(player.play).not.toHaveBeenCalled();
    expect(component.attachmentPreviews.has(77)).toBeFalse();
  });

  it('downloads voice playback through the authenticated chat endpoint only', () => {
    const peer = item('direct', 'bea');
    const note = {
      ...message(peer.key, 77, 'bea'), attachmentName:'voz.webm',
      attachmentMimeType:'audio/webm', attachmentSize:100
    };
    component.conversations = [peer];
    component.selectedKey = peer.key;
    direct.downloadAttachment.and.returnValue(of(new Blob(['voice'], {type:'audio/webm'})));
    const created = spyOn(URL, 'createObjectURL').and.returnValue('blob:private-voice');
    const revoked = spyOn(URL, 'revokeObjectURL');
    component.openAttachment(note);
    expect(direct.downloadAttachment).toHaveBeenCalledOnceWith('bea',77);
    expect(created).toHaveBeenCalled();
    expect(component.attachmentPreviews.get(77)).toBe('blob:private-voice');
    component.openAttachment(note);
    expect(revoked).toHaveBeenCalledWith('blob:private-voice');
    expect(component.attachmentPreviews.size).toBe(0);
  });

  it('searches full chat history through an authorized scoped request without marking read', () => {
    const selected = item('direct', 'bea');
    component.conversations = [selected];
    component.selectedKey = selected.key;
    component.messageSearchOpen = true;
    component.messageSearchTerm = 'torneio';
    inboxApi.searchMessages.and.returnValue(of({
      page: 0, hasMore: false, results: [{ id: 7, sender: 'bea', text: 'Torneio antigo',
        createdAt: '2026-09-01T12:00:00Z', replyToMessageId: 3,
        replyToSender: 'ana', replyToText: 'Um torneio?' }]
    }));
    component.submitMessageSearch();
    expect(inboxApi.searchMessages).toHaveBeenCalledOnceWith(
      { kind: 'direct', id: 'bea' }, 'torneio', 0);
    expect(component.messageSearchResults[0]).toEqual(jasmine.objectContaining({
      id: 7, text: 'Torneio antigo', replyToMessageId: 3
    }));
    expect(inboxApi.markRead).not.toHaveBeenCalled();
  });

  it('keeps scroll position and unread state while an earlier message is being read', () => {
    const conversation = item('direct', 'bea');
    component.conversations = [conversation];
    component.selectedKey = conversation.key;
    component.messages = [message(conversation.key, 20), message(conversation.key, 21)];
    const log = { scrollHeight: 1000, scrollTop: 100, clientHeight: 280,
      querySelector: () => ({getBoundingClientRect: () => ({
        top: 150, bottom: 190, width: 200, height: 40
      })}),
      getBoundingClientRect: () => ({top: 100, bottom: 380, width: 400, height: 280})
    };
    component.previewLog = { nativeElement: log } as any;

    (component as any).acceptRealtime(conversation.key, message(conversation.key, 22, 'bea'));
    component.ngAfterViewChecked();
    expect(component.messages.map(x => x.id)).toEqual([20, 21, 22]);
    expect(log.scrollTop).toBe(100);
    expect(inboxApi.markRead).not.toHaveBeenCalled();

    // Returning manually to the bottom may now acknowledge the new message.
    log.scrollTop = 720;
    component.onPreviewLogScroll();
    expect(inboxApi.markRead).toHaveBeenCalledOnceWith(
      { kind: 'direct', id: 'bea' }, 22);
  });

  it('counts new remote arrivals while scrolled up and returns to the end only on request', () => {
    const conversation = item('direct', 'bea');
    component.conversations = [conversation];
    component.selectedKey = conversation.key;
    component.messages = [message(conversation.key, 1, 'ana')];
    const log = { scrollHeight: 1200, scrollTop: 100, clientHeight: 350,
      querySelector: () => ({getBoundingClientRect: () => ({
        top: 150, bottom: 190, width: 200, height: 40
      })}),
      getBoundingClientRect: () => ({top: 100, bottom: 450, width: 400, height: 350})
    };
    component.previewLog = { nativeElement: log } as any;

    (component as any).acceptRealtime(conversation.key, message(conversation.key, 2, 'bea'));
    (component as any).acceptRealtime(conversation.key, message(conversation.key, 2, 'bea'));
    (component as any).acceptRealtime(conversation.key, message(conversation.key, 3, 'bea'));
    expect(component.newMessagesPending).toBe(2);
    expect(log.scrollTop).toBe(100);
    expect(inboxApi.markRead).not.toHaveBeenCalled();

    component.jumpToLatestMessages();
    expect(log.scrollTop).toBe(1200);
    expect(component.newMessagesPending).toBe(0);
    expect(inboxApi.markRead).toHaveBeenCalledOnceWith(
      { kind: 'direct', id: 'bea' }, 3);
  });

  it('keeps unread badges for a selected chat when the reader is scrolled up', () => {
    const conversation = {...item('direct', 'bea'), unreadCount: 0};
    component.conversations = [conversation];
    component.selectedKey = conversation.key;
    component.messages = [message(conversation.key, 12, 'ana')];
    const log = {
      scrollHeight: 900, scrollTop: 100, clientHeight: 300,
      querySelector: () => ({getBoundingClientRect: () => ({
        top: 200, bottom: 240, width: 220, height: 40
      })}),
      getBoundingClientRect: () => ({
        top: 100, bottom: 400, width: 440, height: 300
      })
    };
    component.previewLog = {nativeElement: log} as any;
    (component as any).acceptRealtime(conversation.key, message(conversation.key, 13, 'bea'));
    (component as any).acceptRealtime(conversation.key, message(conversation.key, 13, 'bea'));
    expect(component.conversations.find(x => x.key === conversation.key)?.unreadCount).toBe(1);
    expect(component.recentCount).toBe(1);
    expect(component.newMessagesPending).toBe(1);
    expect(inboxApi.markRead).not.toHaveBeenCalled();

    log.scrollTop = 600;
    component.onPreviewLogScroll();
    expect(inboxApi.markRead).toHaveBeenCalledOnceWith({kind:'direct',id:'bea'}, 13);
    expect(component.recentCount).toBe(0);
  });

  it('retains unread messages received while selected but unfocused until returning', () => {
    const conversation = {...item('direct', 'bea'), unreadCount: 0};
    component.conversations = [conversation];
    component.selectedKey = conversation.key;
    component.messages = [message(conversation.key, 20, 'ana')];
    component.previewLog = {nativeElement: {
      scrollHeight: 600, scrollTop: 400, clientHeight: 200,
      querySelector: () => ({getBoundingClientRect: () => ({
        top: 150, bottom: 185, width: 220, height: 35
      })}),
      getBoundingClientRect: () => ({
        top: 100, bottom: 300, width: 430, height: 200
      })
    }} as any;
    const focus = document.hasFocus as jasmine.Spy;
    focus.and.returnValue(false);
    (component as any).acceptRealtime(conversation.key, message(conversation.key, 21, 'bea'));
    (component as any).acceptRealtime(conversation.key, message(conversation.key, 21, 'bea'));
    component.ngAfterViewChecked();
    expect(component.recentCount).toBe(1);
    expect(component.conversations[0].unreadCount).toBe(1);
    expect(inboxApi.markRead).not.toHaveBeenCalled();

    focus.and.returnValue(true);
    (component as any).onPageActive();
    expect(inboxApi.markRead).toHaveBeenCalledOnceWith({kind:'direct',id:'bea'}, 21);
    expect(component.recentCount).toBe(0);
  });

  it('does not count own messages or viewed incoming messages as unread', () => {
    const conversation = {...item('direct', 'bea'), unreadCount: 0};
    component.conversations = [conversation];
    component.selectedKey = conversation.key;
    component.messages = [message(conversation.key, 30, 'ana')];
    component.previewLog = {nativeElement: {
      scrollHeight: 400, scrollTop: 200, clientHeight: 200
    }} as any;
    (component as any).acceptRealtime(conversation.key, message(conversation.key, 31, 'ana'));
    (component as any).acceptRealtime(conversation.key, message(conversation.key, 32, 'bea'));
    expect(component.recentCount).toBe(0);
    expect(component.conversations[0].unreadCount).toBe(0);
  });

  it('does not confirm a newly loaded history until its latest bubble is rendered and visible', () => {
    const conversation = item('community', 7);
    component.conversations = [conversation];
    timeline.list.and.returnValue(of([{id:75,communityId:7,kind:'CHAT',
      username:'bea',body:'No histórico',createdAt:'2026-10-23T09:00:00Z'}]));
    component.selectConversation(conversation);
    // The HTTP response arrived but no Angular view or message bubble exists.
    expect(inboxApi.markRead).not.toHaveBeenCalled();

    let latestRendered = false;
    let bubbleInView = false;
    component.previewLog = {nativeElement: {
      scrollHeight:900,scrollTop:0,clientHeight:300,
      querySelector: (selector:string) => selector === '[data-message-id="75"]' && latestRendered
        ? {getBoundingClientRect:()=>bubbleInView
          ? {top:200,bottom:250,width:260,height:50}
          : {top:700,bottom:750,width:260,height:50}}
        : null,
      getBoundingClientRect:()=>({top:100,bottom:400,width:400,height:300})
    }} as any;
    component.ngAfterViewChecked();
    expect(inboxApi.markRead).not.toHaveBeenCalled();

    latestRendered = true;
    bubbleInView = true;
    component.ngAfterViewChecked();
    // The initial post-render pass already consumed its one-time scroll
    // request while there was no bubble, so the user must visibly scroll.
    expect(inboxApi.markRead).not.toHaveBeenCalled();
    component.onPreviewLogScroll();
    expect(inboxApi.markRead).toHaveBeenCalledOnceWith(
      {kind:'community',id:'7'},75);
  });

  it('does not confirm a live message before its bubble appears in the active viewport', () => {
    const conversation=item('direct','bea');
    component.conversations=[conversation];
    component.selectedKey=conversation.key;
    component.messages=[message(conversation.key, 10, 'ana')];
    let rendered=false;
    let visible=false;
    component.previewLog={nativeElement:{
      scrollHeight:1000,scrollTop:800,clientHeight:200,
      querySelector:(selector:string)=>selector==='[data-message-id="11"]' && rendered
        ? {getBoundingClientRect:()=> visible
          ? {top:160,bottom:190,width:200,height:30}
          : {top:560,bottom:590,width:200,height:30}}
        : null,
      getBoundingClientRect:()=>({top:100,bottom:300,width:400,height:200})
    }} as any;

    (component as any).acceptRealtime(conversation.key,message(conversation.key,11,'bea'));
    expect(inboxApi.markRead).not.toHaveBeenCalled();
    component.ngAfterViewChecked();
    expect(inboxApi.markRead).not.toHaveBeenCalled();
    rendered=true;
    component.onPreviewLogScroll();
    expect(inboxApi.markRead).not.toHaveBeenCalled();
    visible=true;
    component.onPreviewLogScroll();
    expect(inboxApi.markRead).toHaveBeenCalledOnceWith(
      {kind:'direct',id:'bea'},11);
  });

  it('does not display a new-arrival jump within a detached historical search window', () => {
    const selected = item('community', 7);
    component.conversations = [selected];
    component.selectedKey = selected.key;
    component.historicalPreview = true;
    component.newMessagesPending = 0;
    component.messages = [message(selected.key, 2, 'ana')];
    (component as any).acceptRealtime(selected.key, message(selected.key, 30, 'bea'));
    expect(component.newMessagesPending).toBe(0);
    expect(component.messages.map(item => item.id)).toEqual([2]);
    component.jumpToLatestMessages();
    expect(inboxApi.markRead).not.toHaveBeenCalled();
  });

  it('locates an already loaded search result without rewriting or marking chat history as read', () => {
    const selected = item('direct', 'bea');
    component.conversations = [selected];
    component.selectedKey = selected.key;
    component.messages = [message(selected.key, 4), message(selected.key, 9)];
    component.messageSearchResults = [message(selected.key, 4)];
    const focus = jasmine.createSpy('focus');
    const scrollIntoView = jasmine.createSpy('scrollIntoView');
    component.previewLog = { nativeElement: {
      querySelector: (_: string) => ({ focus, scrollIntoView })
    }} as any;
    component.viewMessageSearchResult(component.messageSearchResults[0]);
    expect(component.selectedSearchResultId).toBe(4);
    expect(component.searchResultNotInPreview).toBeFalse();
    expect(scrollIntoView).toHaveBeenCalled();
    expect(focus).toHaveBeenCalled();
    expect(component.messages.map(x => x.id)).toEqual([4, 9]);
    expect(inboxApi.markRead).not.toHaveBeenCalled();
  });

  it('keeps an older hit in search results rather than inserting it into recent history', () => {
    const selected = item('community', 7);
    component.conversations = [selected];
    component.selectedKey = selected.key;
    component.messages = [message(selected.key, 70), message(selected.key, 71)];
    component.messageSearchResults = [message(selected.key, 5)];
    const delayed = new Subject<any[]>();
    inboxApi.messageContext.and.returnValue(delayed.asObservable());
    component.viewMessageSearchResult(component.messageSearchResults[0]);
    expect(inboxApi.messageContext).toHaveBeenCalledOnceWith({ kind: 'community', id: '7' }, 5);
    expect(component.selectedSearchResultId).toBe(5);
    expect(component.searchResultNotInPreview).toBeTrue();
    expect(component.messages.map(x => x.id)).toEqual([70, 71]);
    delayed.next([{ id: 4, sender: 'ana', text: 'Antes', createdAt: null },
      { id: 5, sender: 'bea', text: 'Mensagem antiga', createdAt: null },
      { id: 6, sender: 'ana', text: 'Depois', createdAt: null }]);
    delayed.complete();
    expect(component.historicalPreview).toBeTrue();
    expect(component.messages.map(x => x.id)).toEqual([4, 5, 6]);
    expect(inboxApi.markRead).not.toHaveBeenCalled();
    component.viewMessageSearchResult(message('session:7', 99));
    expect(component.selectedSearchResultId).toBe(5);
    component.onMessageSearchTermChange();
    expect(component.selectedSearchResultId).toBeNull();
    expect(component.searchResultNotInPreview).toBeFalse();
  });


  it('does not join live socket messages into a historical window or mark them read', () => {
    const selected = item('session', 41);
    component.conversations = [selected];
    component.selectedKey = selected.key;
    component.historicalPreview = true;
    component.messages = [message(selected.key, 5)];
    (component as any).acceptRealtime(selected.key, message(selected.key, 90, 'bea'));
    expect(component.messages.map(x => x.id)).toEqual([5]);
    expect(inboxApi.markRead).not.toHaveBeenCalled();
    expect(component.conversations[0].newThisVisit).toBe(1);
  });

  it('ignores a delayed historical context after switching conversation', () => {
    const old = item('community', 7), next = item('direct', 'bea');
    component.conversations = [old, next];
    component.selectedKey = old.key;
    component.messageSearchResults = [message(old.key, 5)];
    const pending = new Subject<any[]>();
    inboxApi.messageContext.and.returnValue(pending.asObservable());
    direct.recentHistory.and.returnValue(of({ content: [], last: true }));
    component.viewMessageSearchResult(component.messageSearchResults[0]);
    component.selectConversation(next);
    pending.next([{ id: 5, sender: 'bea', text: 'old', createdAt: null }]);
    pending.complete();
    expect(component.selectedKey).toBe(next.key);
    expect(component.historicalPreview).toBeFalse();
    expect(component.messages).toEqual([]);
  });

  it('refuses a mismatched context and keeps recent messages intact', () => {
    const selected = item('direct', 'bea');
    component.conversations = [selected];
    component.selectedKey = selected.key;
    component.messages = [message(selected.key, 80)];
    component.messageSearchResults = [message(selected.key, 5)];
    inboxApi.messageContext.and.returnValue(of([
      { id: 7, sender: 'bea', text: 'other', createdAt: null }
    ]));
    component.viewMessageSearchResult(component.messageSearchResults[0]);
    expect(component.historyLocateError).toBeTrue();
    expect(component.historicalPreview).toBeFalse();
    expect(component.messages.map(m => m.id)).toEqual([80]);
  });

  it('loads additional pages newest first with no duplicate messages', () => {
    const selected = item('community', 7);
    component.conversations = [selected];
    component.selectedKey = selected.key;
    component.messageSearchOpen = true;
    component.messageSearchTerm = 'treino';
    inboxApi.searchMessages.and.returnValues(
      of({ page: 0, hasMore: true, results: [{ id: 30, sender: 'ana',
        text: 'Treino recente', createdAt: '2026-10-23T10:00:00Z' }] }),
      of({ page: 1, hasMore: false, results: [
        { id: 30, sender: 'ana', text: 'Treino recente', createdAt: '2026-10-23T10:00:00Z' },
        { id: 9, sender: 'bea', text: 'Treino antigo', createdAt: '2026-08-15T10:00:00Z' }
      ] })
    );
    component.submitMessageSearch();
    component.submitMessageSearch(1);
    expect(component.messageSearchResults.map(m => m.id)).toEqual([30, 9]);
    expect(component.messageSearchHasMore).toBeFalse();
    expect(inboxApi.searchMessages).toHaveBeenCalledTimes(2);
  });

  it('discards search results after switching conversations or changing the query', () => {
    const older = new Subject<any>();
    const selected = item('session', 41);
    component.conversations = [selected, item('direct', 'bea')];
    component.selectedKey = selected.key;
    component.messageSearchOpen = true;
    component.messageSearchTerm = 'golo';
    inboxApi.searchMessages.and.returnValue(older.asObservable());
    component.submitMessageSearch();
    component.messageSearchTerm = 'jogo';
    component.onMessageSearchTermChange();
    older.next({ page: 0, hasMore: false, results: [
      { id: 33, sender: 'ana', text: 'golo', createdAt: null }
    ] });
    older.complete();
    expect(component.messageSearchResults).toEqual([]);
    expect(component.messageSearchLoading).toBeFalse();
    expect(component.messageSearchSearched).toBeFalse();
    component.toggleMessageSearch();
    expect(component.messageSearchOpen).toBeFalse();
  });

  it('refuses short searches and does not quote historical results from another chat', () => {
    const selected = item('direct', 'bea');
    component.conversations = [selected];
    component.selectedKey = selected.key;
    component.messageSearchOpen = true;
    component.messageSearchTerm = 'a';
    component.submitMessageSearch();
    expect(inboxApi.searchMessages).not.toHaveBeenCalled();
    component.composerAllowed = true;
    component.replyToMessage(message('community:7', 11));
    expect(component.replyingTo).toBeNull();
  });

  it('shows friends, membership communities and confirmed sessions without N+1 histories', () => {
    friends.friends.and.returnValue(of([{ username: 'Bea', nickname: 'Bia', fullName: null, profilePicUrl: null, chatBlocked: false, blockedByMe: false }]));
    communities.mine.and.returnValue(of([{ id: 7, name: 'CNG', sport: 'Futsal' }] as any));
    const futureGameDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    sessions.mine.and.returnValue(of({
      created: [{ id: 41, sport: 'Ténis', city: 'Cacém', gameDate: futureGameDate }],
      joined: [{ id: 41, sport: 'Ténis', city: 'Cacém', gameDate: futureGameDate }],
      waitlisted: [{ id: 99, sport: 'Futebol', city: 'Lisboa', gameDate: futureGameDate }]
    } as any));
    component.loadInbox();
    expect(component.conversations.map(x => x.key).sort()).toEqual([
      'community:7', 'direct:bea', 'session:41'
    ]);
    expect(component.selectedKey).toBeNull();
    expect(direct.recentHistory).not.toHaveBeenCalled();
    expect(timeline.list).not.toHaveBeenCalled();
    expect(sessions.messages).not.toHaveBeenCalled();
  });

  it('keeps partial results when one category fails', () => {
    friends.friends.and.returnValue(throwError(() => new Error('offline')));
    communities.mine.and.returnValue(of([{ id: 7, name: 'CNG' }] as any));
    component.loadInbox();
    expect(component.sourceError).toBeTrue();
    expect(component.failedSources).toEqual(['direct']);
    expect(component.conversations.map(x => x.key)).toEqual(['community:7']);
  });

  it('discovers an offline friend and recovers selected history after authenticated reconnect', () => {
    connected.next(false);
    const token = 'eyJhbGciOiJub25lIn0.'
      + btoa(JSON.stringify({sub:'ana',exp:4102444800})).replace(/=+$/, '')
      + '.fixture';
    spyOn(localStorage,'getItem').and.callFake(key => key === 't' ? token : null);
    friends.friends.and.returnValues(
      of([{username:'bea',nickname:'Bea'}] as any),
      of([{username:'bea',nickname:'Bea'}, {username:'carla',nickname:'Carla'}] as any));
    direct.recentHistory.and.returnValues(
      of({content:[{id:41,username1:'bea',username2:'ana',text:'Antiga',
        date:'2026-10-23T09:00:00Z',dataDisplay:null}],last:true} as any),
      of({content:[{id:42,username1:'bea',username2:'ana',text:'Offline',
        date:'2026-10-23T10:00:00Z',dataDisplay:null},
        {id:41,username1:'bea',username2:'ana',text:'Antiga',
        date:'2026-10-23T09:00:00Z',dataDisplay:null}],last:true} as any));
    inboxApi.summaries.and.callFake(refs => of(refs.map(ref => ({
      ...ref, latestMessageId: ref.id === 'bea' ? 42 : 50,
      latestText:'sincronizada',latestSender:'bea',latestAt:'2026-10-23T10:00:00Z',
      unreadCount: ref.id === 'carla' ? 2 : 1
    }))));
    component.ngOnInit();
    try {
      connected.next(true); // first AUTH is not an outage
      expect(friends.friends).toHaveBeenCalledTimes(1);
      component.selectConversation(component.conversations.find(x => x.key === 'direct:bea')!);
      expect(component.messages.map(m => m.id)).toEqual([41]);

      connected.next(false);
      connected.next(true);
      expect(friends.friends).toHaveBeenCalledTimes(2);
      expect(component.conversations.map(x => x.key)).toContain('direct:carla');
      expect(component.conversations.find(x => x.key === 'direct:carla')?.unreadCount).toBe(2);
      expect(component.selectedKey).toBe('direct:bea');
      expect(direct.recentHistory).toHaveBeenCalledTimes(2);
      expect(component.messages.map(m => m.id)).toEqual([41,42]);
      connected.next(true); // redundant signal must not trigger another GET
      expect(friends.friends).toHaveBeenCalledTimes(2);
      expect(direct.recentHistory).toHaveBeenCalledTimes(2);
    } finally {
      component.ngOnDestroy();
      connected.next(false);
    }
  });

  it('recovers messages received during an outage before the first socket AUTH', () => {
    connected.next(false);
    const token = 'eyJhbGciOiJub25lIn0.'
      + btoa(JSON.stringify({sub:'ana',exp:4102444800})).replace(/=+$/, '')
      + '.fixture';
    spyOn(localStorage,'getItem').and.callFake(key => key === 't' ? token : null);
    friends.friends.and.returnValues(
      of([{username:'bea',nickname:'Bea'}] as any),
      of([{username:'bea',nickname:'Bea'}, {username:'carla',nickname:'Carla'}] as any));
    direct.recentHistory.and.returnValues(
      of({content:[{id:41,username1:'bea',username2:'ana',text:'Antes',
        date:'2026-10-23T09:00:00Z',dataDisplay:null}],last:true} as any),
      of({content:[{id:42,username1:'bea',username2:'ana',text:'Enquanto offline',
        date:'2026-10-23T10:00:00Z',dataDisplay:null},
        {id:41,username1:'bea',username2:'ana',text:'Antes',
        date:'2026-10-23T09:00:00Z',dataDisplay:null}],last:true} as any));
    component.ngOnInit();
    try {
      component.selectConversation(component.conversations.find(c => c.key === 'direct:bea')!);
      expect(component.messages.map(m => m.id)).toEqual([41]);
      expect(friends.friends).toHaveBeenCalledTimes(1);
      // Browser fails to authenticate its first socket. The REST snapshot
      // already completed, so first successful AUTH must catch up the gap.
      connected.next(false);
      connected.next(true);
      expect(friends.friends).toHaveBeenCalledTimes(2);
      expect(component.conversations.map(c => c.key)).toContain('direct:carla');
      expect(component.messages.map(m => m.id)).toEqual([41, 42]);
      expect(direct.recentHistory).toHaveBeenCalledTimes(2);
      connected.next(true);
      expect(friends.friends).toHaveBeenCalledTimes(2);
      expect(direct.recentHistory).toHaveBeenCalledTimes(2);
      expect(direct.send).not.toHaveBeenCalled();
    } finally {
      component.ngOnDestroy();
      connected.next(false);
    }
  });

  it('keeps authorized conversations on a transient membership lookup failure', () => {
    component.conversations=[item('direct','bea'), item('community',7)];
    friends.friends.and.returnValue(throwError(() => new Error('temporary outage')));
    communities.mine.and.returnValue(of([{id:7,name:'CNG'}] as any));
    (component as any).receiptSessionToken = 'qa-session';
    spyOn(localStorage,'getItem').and.returnValue('qa-session');
    component.loadInbox(true);
    expect(component.failedSources).toEqual(['direct']);
    expect(component.conversations.map(x => x.key).sort()).toEqual([
      'community:7','direct:bea'
    ]);
    expect(component.selectedKey).toBeNull();
  });

  it('removes a revoked conversation after a successful membership refresh', () => {
    component.conversations=[item('direct','bea'), item('community',7)];
    component.selectedKey='direct:bea';
    component.messages=[message('direct:bea',41)];
    friends.friends.and.returnValue(of([]));
    communities.mine.and.returnValue(of([{id:7,name:'CNG'}] as any));
    (component as any).receiptSessionToken = 'qa-session';
    spyOn(localStorage,'getItem').and.returnValue('qa-session');
    component.loadInbox(true);
    expect(component.failedSources).toEqual([]);
    expect(component.conversations.map(x => x.key)).toEqual(['community:7']);
    expect(component.selectedKey).toBeNull();
    expect(component.messages).toEqual([]);
    expect(direct.recentHistory).not.toHaveBeenCalled();
  });

  it('retains the older loaded window and unread status while scrolled up on recovery', () => {
    const conversation=item('direct','bea');
    component.conversations=[conversation];
    component.selectedKey=conversation.key;
    component.messages=[message(conversation.key,30,'bea'),message(conversation.key,31,'bea')];
    component.previewLog={nativeElement:{
      scrollHeight:900,scrollTop:100,clientHeight:200
    }} as any;
    direct.recentHistory.and.returnValue(of({content:[
      {id:31,username1:'bea',username2:'ana',text:'Já vista',
        date:'2026-10-23T09:00:00Z',dataDisplay:null},
      {id:32,username1:'bea',username2:'ana',text:'Durante a falha',
        date:'2026-10-23T10:00:00Z',dataDisplay:null}
    ],last:true} as any));
    (component as any).loadHistory(conversation);
    expect(component.messages.map(x => x.id)).toEqual([30,31,32]);
    expect(component.newMessagesPending).toBe(1);
    expect(inboxApi.markRead).not.toHaveBeenCalled();
    expect(component.selectedKey).toBe(conversation.key);
  });

  it('preserves socket messages newer than an in-flight reconnect HTTP snapshot', () => {
    const conversation=item('direct','bea');
    const pending=new Subject<any>();
    component.conversations=[conversation];
    component.selectedKey=conversation.key;
    direct.recentHistory.and.returnValue(pending.asObservable());
    (component as any).loadHistory(conversation);
    (component as any).acceptRealtime(conversation.key,message(conversation.key,48,'bea'));
    pending.next({content:[
      {id:47,username1:'bea',username2:'ana',text:'Servidor',
        date:'2026-10-23T10:00:00Z',dataDisplay:null}
    ],last:true});
    pending.complete();
    expect(component.messages.map(x => x.id)).toEqual([47,48]);
    expect(component.messages.filter(x => x.id === 48)).toHaveSize(1);
  });

  it('does not recover another account history when the shared login token changes', () => {
    connected.next(false);
    const original='eyJhbGciOiJub25lIn0.'
      + btoa(JSON.stringify({sub:'ana',exp:4102444800})).replace(/=+$/, '')
      + '.fixture';
    let browserToken=original;
    spyOn(localStorage,'getItem').and.callFake(key => key === 't' ? browserToken : null);
    component.ngOnInit();
    try {
      connected.next(true);
      expect(friends.friends).toHaveBeenCalledTimes(1);
      connected.next(false);
      browserToken='replaced-by-another-account';
      connected.next(true);
      expect(friends.friends).toHaveBeenCalledTimes(1);
      expect(direct.recentHistory).not.toHaveBeenCalled();
    } finally {
      component.ngOnDestroy();
      connected.next(false);
    }
  });

  it('drops stale history from a previous selection, even after switching types', () => {
    const old = new Subject<any[]>();
    const newer = new Subject<any>();
    component.conversations = [item('community', 7), item('direct', 'bea')];
    timeline.list.and.returnValue(old.asObservable());
    direct.recentHistory.and.returnValue(newer.asObservable());
    component.selectConversation(component.conversations[0]);
    component.selectConversation(component.conversations[1]);
    old.next([{ id: 31, communityId: 7, kind: 'CHAT', username: 'ana', body: 'Antiga', createdAt: '2026-10-20T10:00:00Z' }]);
    newer.next({ last: true, content: [{ id: 32, username1: 'bea', username2: 'ana', text: 'Olá', date: '2026-10-23T09:00:00Z', dataDisplay: null }] });
    expect(component.messages.map(x => x.id)).toEqual([32]);
    expect(component.selectedKey).toBe('direct:bea');
  });

  it('reconciles live messages with a pending HTTP response without duplicating IDs', () => {
    const delayed = new Subject<any[]>();
    const community = item('community', 7);
    component.conversations = [community];
    timeline.list.and.returnValue(delayed.asObservable());
    component.selectConversation(community);
    (component as any).acceptRealtime('community:7', message('community:7', 8));
    (component as any).acceptRealtime('community:7', message('community:7', 8));
    delayed.next([{ id: 7, communityId: 7, kind: 'CHAT', username: 'ana', body: 'Anterior', createdAt: '2026-10-23T08:00:00Z' }]);
    expect(component.messages.map(x => x.id)).toEqual([7, 8]);
    // A live message received while the HTTP history was still loading has
    // not been rendered/read yet; keep it unread until the visible read ACK.
    expect(component.recentCount).toBe(1);
    expect(inboxApi.markRead).not.toHaveBeenCalled();
  });

  it('counts only incoming messages for other conversations during this visit', () => {
    component.conversations = [item('direct', 'bea'), item('community', 7)];
    component.selectedKey = 'community:7';
    (component as any).acceptRealtime('direct:bea', message('direct:bea', 4, 'Bea'));
    (component as any).acceptRealtime('direct:bea', message('direct:bea', 4, 'Bea'));
    (component as any).acceptRealtime('direct:bea', message('direct:bea', 5, 'ana'));
    (component as any).acceptRealtime('community:999', message('community:999', 6));
    expect(component.recentCount).toBe(1);
    expect(component.conversations.find(x => x.key === 'direct:bea')?.newThisVisit).toBe(1);
    direct.recentHistory.and.returnValue(of({ content: [], last: true }));
    component.selectConversation(component.conversations.find(x => x.key === 'direct:bea')!);
    // Selecting a conversation without a rendered message is not reading it.
    expect(component.recentCount).toBe(1);
  });

  it('lists only upcoming session conversations and opens a linked authorized session', () => {
    const active = new Date(Date.now() + 3600_000).toISOString();
    const past = new Date(Date.now() - 3600_000).toISOString();
    sessions.mine.and.returnValue(of({ created: [
      { id: 14, gameDate: active, status: 'OPEN', sport: 'Futebol', city: 'Lisboa' },
      { id: 15, gameDate: past, status: 'OPEN', sport: 'Padel', city: 'Lisboa' },
      { id: 16, gameDate: active, status: 'CANCELLED', sport: 'Padel', city: 'Lisboa' }
    ], joined: [], waitlisted: [] } as any));
    sessions.messages.and.returnValue(of([]));
    component = new MessagesCenterComponent(friends, communities, sessions, direct, timeline,
      realtime, inboxApi, { snapshot: { queryParamMap: { get: (key: string) =>
        key === 'kind' ? 'session' : key === 'id' ? '14' : null } } } as any);
    component.loadInbox();
    expect(component.conversations.filter(c => c.kind === 'session').map(c => c.id)).toEqual([14]);
    expect(component.selectedKey).toBe('session:14');
    expect(sessions.messages).toHaveBeenCalledWith(14);
  });

  it('handles query-param changes without reopening a manually selected conversation', () => {
    const params = new BehaviorSubject<{ get: (key: string) => string | null }>({
      get: (key: string) => key === 'kind' ? 'direct' : key === 'id' ? 'bea' : null
    });
    friends.friends.and.returnValue(of([
      { username: 'bea', fullName: 'Bea' }, { username: 'ana', fullName: 'Ana' }
    ] as any));
    direct.recentHistory.and.returnValue(of({ content: [], last: true } as any));
    component = new MessagesCenterComponent(friends, communities, sessions, direct, timeline,
      realtime, inboxApi, { queryParamMap: params.asObservable() } as any);
    component.ngOnInit();
    expect(component.selectedKey).toBe('direct:bea');
    params.next({ get: key => key === 'kind' ? 'direct' : key === 'id' ? 'ana' : null });
    expect(component.selectedKey).toBe('direct:ana');
    component.selectConversation(component.conversations.find(item => item.key === 'direct:bea')!);
    component.loadInbox();
    expect(component.selectedKey).toBe('direct:bea');
    component.ngOnDestroy();
  });

  it('enforces kickoff in the message center even if access was cached', () => {
    const current = item('session', 14);
    component.conversations = [current];
    component.selectedKey = current.key;
    component.composerAllowed = true;
    component.draft = 'Olá';
    (component as any).sessionKickoffs.set(14, Date.now() - 1000);
    expect(component.isSelectedSessionOpen()).toBeFalse();
    expect(component.canSendMessage()).toBeFalse();
    (component as any).sessionKickoffs.set(14, Date.now() + 3600_000);
    expect(component.isSelectedSessionOpen()).toBeTrue();
    expect(component.canSendMessage()).toBeTrue();
  });

  it('opens a non-friend participant conversation only after backend authorization', () => {
    friends.friends.and.returnValue(of([]));
    direct.info.and.returnValue(of({chatBlocked:false, whoBlocked:null}));
    direct.recentHistory.and.returnValue(of({content:[], last:true}));
    component = new MessagesCenterComponent(friends, communities, sessions, direct, timeline,
      realtime, inboxApi, { snapshot: { queryParamMap: { get: (key: string) =>
        key === 'kind' ? 'direct' : key === 'id' ? 'new-player' : null } } } as any);
    component.loadInbox();
    expect(direct.info).toHaveBeenCalledWith('new-player');
    expect(component.selectedKey).toBe('direct:new-player');
    expect(component.conversations.some(c => c.key === 'direct:new-player')).toBeTrue();
  });

  it('never opens a non-friend deep link when the backend denies contact', () => {
    friends.friends.and.returnValue(of([]));
    direct.info.and.returnValue(throwError(() => new HttpErrorResponse({status:403})));
    component = new MessagesCenterComponent(friends, communities, sessions, direct, timeline,
      realtime, inboxApi, { snapshot: { queryParamMap: { get: (key: string) =>
        key === 'kind' ? 'direct' : key === 'id' ? 'stranger' : null } } } as any);
    component.loadInbox();
    expect(direct.info).toHaveBeenCalledWith('stranger');
    expect(component.selectedKey).toBeNull();
    expect(component.conversations.some(c => c.key === 'direct:stranger')).toBeFalse();
    expect(direct.recentHistory).not.toHaveBeenCalledWith('stranger');
  });

  it('does not invent a conversation from a forged or expired deep link', () => {
    component = new MessagesCenterComponent(friends, communities, sessions, direct, timeline,
      realtime, inboxApi, { snapshot: { queryParamMap: { get: (key: string) =>
        key === 'kind' ? 'session' : key === 'id' ? '999' : null } } } as any);
    component.loadInbox();
    expect(component.selectedKey).toBeNull();
    expect(sessions.messages).not.toHaveBeenCalled();
  });

  it('normalizes case and accents in search and deduplicates history by ID', () => {
    expect(inboxKey('direct', 'BÉA')).toBe('direct:béa');
    const match = { ...item('community', 7), title: 'Futebol Cacém' };
    expect(matchesInboxSearch(match, 'CACEM')).toBeTrue();
    expect(matchesInboxSearch(match, 'Ténis')).toBeFalse();
    expect(mergeInboxMessages([message('community:7', 9), message('community:7', 8),
      message('community:7', 9)]).map(x => x.id)).toEqual([8, 9]);
    expect(orderInbox([
      { ...item('session', 1), latestAt: '2026-10-22T00:00:00Z' },
      { ...item('direct', 'bea'), latestAt: '2026-10-23T00:00:00Z' }
    ])[0].key).toBe('direct:bea');
  });

  it('sorts a live message without a timestamp after older history using the persisted ID', () => {
    const key = 'direct:bea';
    const history = message(key, 10, 'bea');
    const live = { ...message(key, 12, 'bea'), createdAt: '' };
    const result = mergeInboxMessages([live, history]);
    expect(result.map(entry => entry.id)).toEqual([10, 12]);
    // No timestamp is invented; the backend record remains authoritative.
    expect(result[1].createdAt).toBe('');
  });

  it('sends a community reply once and reconciles WebSocket before HTTP success', () => {
    const selected = item('community', 7);
    component.conversations = [selected];
    timeline.list.and.returnValue(of([]));
    const post = new Subject<any>();
    timeline.send.and.returnValue(post.asObservable());
    component.selectConversation(selected);
    component.draft = '  Vamos jogar?  ';
    component.sendMessage();
    expect(timeline.send).toHaveBeenCalledOnceWith(7, 'CHAT', 'Vamos jogar?');
    expect(component.sending).toBeTrue();
    component.sendMessage();
    expect(timeline.send).toHaveBeenCalledTimes(1);
    const saved = { id: 80, communityId: 7, kind: 'CHAT', username: 'ana',
      body: 'Vamos jogar?', createdAt: new Date().toISOString() };
    (component as any).acceptRealtime('community:7', {
      key: 'community:7', id: 80, sender: 'ana', text: 'Vamos jogar?', createdAt: saved.createdAt
    });
    post.next(saved);
    post.complete();
    expect(component.messages.map(x => x.id)).toEqual([80]);
    expect(component.draft).toBe('');
    expect(component.sending).toBeFalse();
  });

  it('restores composer focus at submit and does not refocus asynchronously on delivery', () => {
    const selected = item('direct', 'bea');
    component.conversations = [selected];
    direct.recentHistory.and.returnValue(of({ content: [], last: true }));
    const send = new Subject<any>();
    direct.send.and.returnValue(send.asObservable());
    component.selectConversation(selected);
    component.draft = 'Olá novamente';

    const focus = jasmine.createSpy('focus');
    component.composerTextarea = { nativeElement: { focus } } as any;
    component.sendMessage();
    expect(focus).toHaveBeenCalledOnceWith({ preventScroll: true });
    expect(component.sending).toBeTrue();

    component.sendMessage();
    expect(direct.send).toHaveBeenCalledTimes(1);
    send.next({ id: 83, username1: 'ana', username2: 'bea', text: 'Olá novamente',
      date: new Date().toISOString(), dataDisplay: null });
    send.complete();
    expect(component.sending).toBeFalse();
    expect(component.draft).toBe('');
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('sends once and shows no redundant success notice after the server confirms delivery', () => {
    const peer = item('direct', 'bea');
    component.conversations = [peer];
    direct.recentHistory.and.returnValue(of({last:true,content:[]} as any));
    const post = new Subject<any>();
    direct.send.and.returnValue(post.asObservable());
    component.selectConversation(peer);
    component.draft = 'Boa jogada';
    component.sendMessage();
    expect(component.sending).toBeTrue();
    post.next({id:83,username1:'ana',username2:'bea',text:'Boa jogada',
      date:new Date().toISOString(),dataDisplay:null});
    post.complete();
    expect(component.sending).toBeFalse();
    expect(component.deliveryUncertain).toBeFalse();
    expect(component.composerError).toBe('');
    expect(component.messages.map(m=>m.id)).toEqual([83]);
    expect(component.draft).toBe('');
    expect(direct.send).toHaveBeenCalledTimes(1);
  });

  it('keeps a useful error notice when delivery is uncertain', () => {
    const peer=item('direct','bea');
    component.conversations=[peer];
    // Opening the conversation succeeds; only the subsequent verification
    // request fails after the POST becomes ambiguous.
    direct.recentHistory.and.returnValues(
      of({last:true,content:[]} as any),
      throwError(()=>new HttpErrorResponse({status:503})));
    direct.send.and.returnValue(
      throwError(()=>new HttpErrorResponse({status:0})));
    component.selectConversation(peer);
    component.draft='Sem confirmação';
    component.sendMessage();
    expect(component.deliveryUncertain).toBeTrue();
    expect(component.composerError).toBeTruthy();
    expect(direct.send).toHaveBeenCalledTimes(1);
  });

  it('quotes a private message by ID and keeps its server snapshot when showing history', () => {
    const selected = item('direct', 'bea');
    component.conversations = [selected];
    direct.recentHistory.and.returnValue(of({ last: true, content: [{
      id: 12, username1: 'bea', username2: 'ana', text: 'Tudo bem?',
      date: '2026-10-23T09:00:00Z', dataDisplay: null
    }] }));
    component.selectConversation(selected);
    expect(component.messages[0].id).toBe(12);
    component.replyToMessage(component.messages[0]);
    expect(component.replyingTo?.id).toBe(12);
    component.draft = 'Sim!';
    direct.send.and.returnValue(of({ id: 13, username1: 'ana', username2: 'bea',
      text: 'Sim!', date: '2026-10-23T09:01:00Z', dataDisplay: null,
      replyToMessageId: 12, replyToSender: 'bea', replyToText: 'Tudo bem?' }));
    component.sendMessage();
    expect(direct.send).toHaveBeenCalledOnceWith('bea', 'Sim!', 12);
    expect(component.replyingTo).toBeNull();
    expect(component.messages.find(m => m.id === 13)).toEqual(jasmine.objectContaining({
      replyToMessageId: 12, replyToSender: 'bea', replyToText: 'Tudo bem?'
    }));
  });

  it('quotes a community message and sends its ID without exposing a direct chat payload', () => {
    const selected = item('community', 7);
    component.conversations = [selected];
    timeline.list.and.returnValue(of([
      { id: 10, communityId: 7, kind: 'CHAT', username: 'bea',
        body: 'Vamos jogar?', createdAt: '2026-10-23T09:00:00Z' }
    ]));
    component.selectConversation(selected);
    component.replyToMessage(component.messages[0]);
    expect(component.replyingTo?.id).toBe(10);
    component.draft = 'Sim!';
    timeline.send.and.returnValue(of({ id: 11, communityId: 7, kind: 'CHAT',
      username: 'ana', body: 'Sim!', createdAt: '2026-10-23T09:01:00Z',
      replyToMessageId: 10, replyToSender: 'bea', replyToText: 'Vamos jogar?' }));
    component.sendMessage();
    expect(timeline.send).toHaveBeenCalledOnceWith(7, 'CHAT', 'Sim!', 10);
    expect(component.replyingTo).toBeNull();
    expect(component.messages.find(m => m.id === 11)?.replyToText).toBe('Vamos jogar?');
  });

  it('quotes a session message and clears it when another conversation is selected', () => {
    const session = item('session', 41);
    const directChat = item('direct', 'bea');
    component.conversations = [session, directChat];
    sessions.messages.and.returnValue(of([
      { id: 33, sessionId: 41, senderUsername: 'bea', body: 'Traz uma bola?',
        createdAt: '2026-10-23T09:00:00Z' }
    ]));
    sessions.detail.and.returnValue(of({ id: 41, status: 'OPEN', joined: true,
      gameDate: new Date(Date.now() + 3600_000).toISOString() } as any));
    component.selectConversation(session);
    component.replyToMessage(component.messages[0]);
    component.draft = 'Combinado';
    sessions.postMessage.and.returnValue(of({ id: 34, sessionId: 41,
      senderUsername: 'ana', body: 'Combinado', createdAt: new Date().toISOString(),
      replyToMessageId: 33, replyToSender: 'bea', replyToText: 'Traz uma bola?' }));
    component.sendMessage();
    expect(sessions.postMessage).toHaveBeenCalledOnceWith(41, 'Combinado', 33);
    expect(component.replyingTo).toBeNull();
    direct.recentHistory.and.returnValue(of({ last: true, content: [] }));
    component.selectConversation(directChat);
    expect(component.replyingTo).toBeNull();
  });

  it('restores each reply target with its draft when switching chats', () => {
    const bea=item('direct','bea'), group=item('community',7);
    component.conversations=[bea,group];
    direct.recentHistory.and.returnValue(of({last:true,content:[{
      id:41,username1:'bea',username2:'ana',text:'Vens jogar?',
      date:'2026-10-23T09:00:00Z',dataDisplay:null
    }]} as any));
    timeline.list.and.returnValue(of([{
      id:51,communityId:7,kind:'CHAT',username:'carla',
      body:'A que horas?',createdAt:'2026-10-23T10:00:00Z'
    }] as any));
    component.selectConversation(bea);
    component.replyToMessage(component.messages[0]);
    component.draft='Sim!';
    component.selectConversation(group);
    expect(component.replyingTo).toBeNull();
    component.replyToMessage(component.messages[0]);
    component.draft='Às 18h';

    component.selectConversation(bea);
    expect(component.draft).toBe('Sim!');
    expect(component.replyingTo).toEqual(jasmine.objectContaining({
      key:bea.key,id:41,text:'Vens jogar?'
    }));
    component.selectConversation(group);
    expect(component.draft).toBe('Às 18h');
    expect(component.replyingTo).toEqual(jasmine.objectContaining({
      key:group.key,id:51,text:'A que horas?'
    }));

    component.selectConversation(bea);
    direct.send.and.returnValue(of({id:55,username1:'ana',username2:'bea',
      text:'Sim!',date:new Date().toISOString(),dataDisplay:null,
      replyToMessageId:41,replyToText:'Vens jogar?',replyToSender:'bea'} as any));
    component.sendMessage();
    expect(direct.send).toHaveBeenCalledOnceWith('bea','Sim!',41);
    expect(component.replyingTo).toBeNull();
    component.selectConversation(group);
    expect(component.replyingTo?.id).toBe(51);
    component.selectConversation(bea);
    expect(component.draft).toBe('');
    expect(component.replyingTo).toBeNull();
  });

  it('cancels a quoted draft only for its current conversation', () => {
    const bea=item('direct','bea'), group=item('community',7);
    component.conversations=[bea,group];
    direct.recentHistory.and.returnValue(of({last:true,content:[{
      id:41,username1:'bea',username2:'ana',text:'Olá',
      date:'2026-10-23T09:00:00Z',dataDisplay:null
    }]} as any));
    timeline.list.and.returnValue(of([{
      id:42,communityId:7,kind:'CHAT',username:'carla',
      body:'Olá grupo',createdAt:'2026-10-23T10:00:00Z'
    }] as any));
    component.selectConversation(bea);
    component.replyToMessage(component.messages[0]);
    component.draft='Mensagem privada';
    component.selectConversation(group);
    component.replyToMessage(component.messages[0]);
    component.cancelReply();
    expect(component.replyingTo).toBeNull();
    component.selectConversation(bea);
    expect(component.replyingTo?.id).toBe(41);
    component.selectConversation(group);
    expect(component.replyingTo).toBeNull();
    expect(component.draft).toBe('');
  });

  it('clears an off-screen reply target only when that conversation send is confirmed', () => {
    const bea=item('direct','bea'), group=item('community',7);
    component.conversations=[bea,group];
    direct.recentHistory.and.returnValue(of({last:true,content:[{
      id:41,username1:'bea',username2:'ana',text:'Responde',
      date:'2026-10-23T09:00:00Z',dataDisplay:null
    }]} as any));
    timeline.list.and.returnValue(of([]));
    const post=new Subject<any>();
    direct.send.and.returnValue(post.asObservable());
    component.selectConversation(bea);
    component.replyToMessage(component.messages[0]);
    component.draft='Uma resposta';
    component.sendMessage();
    component.selectConversation(group);
    component.draft='O meu outro rascunho';
    post.next({id:52,username1:'ana',username2:'bea',text:'Uma resposta',
      date:new Date().toISOString(),dataDisplay:null,
      replyToMessageId:41,replyToText:'Responde',replyToSender:'bea'});
    post.complete();
    expect(component.draft).toBe('O meu outro rascunho');
    component.selectConversation(bea);
    expect(component.draft).toBe('');
    expect(component.replyingTo).toBeNull();
    expect(direct.send).toHaveBeenCalledOnceWith('bea','Uma resposta',41);
  });

  it('does not POST direct messages when the original chat is blocked', () => {
    const selected = item('direct', 'bea');
    component.conversations = [selected];
    direct.recentHistory.and.returnValue(of({ last: true, content: [] }));
    direct.info.and.returnValue(of({ chatBlocked: true, whoBlocked: 'bea' }));
    component.selectConversation(selected);
    component.draft = 'Olá';
    expect(component.canSendMessage()).toBeFalse();
    component.sendMessage();
    expect(direct.send).not.toHaveBeenCalled();
  });

  it('does not POST to completed sessions or to a session without membership', () => {
    const selected = item('session', 41);
    component.conversations = [selected];
    sessions.messages.and.returnValue(of([]));
    sessions.detail.and.returnValue(of({ id: 41, status: 'COMPLETED', joined: true,
      gameDate: '2026-11-01T10:00:00Z' } as any));
    component.selectConversation(selected);
    component.draft = 'Olá';
    expect(component.canSendMessage()).toBeFalse();
    expect(sessions.postMessage).not.toHaveBeenCalled();
  });

  it('preserves an uncertain draft and blocks re-sends after network timeout', () => {
    const selected = item('community', 7);
    component.conversations = [selected];
    timeline.list.and.returnValue(of([]));
    timeline.send.and.returnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    component.selectConversation(selected);
    component.draft = '  Bora! ';
    component.sendMessage();
    expect(component.deliveryUncertain).toBeTrue();
    expect(component.draft).toBe('  Bora! ');
    component.sendMessage();
    expect(timeline.send).toHaveBeenCalledTimes(1);
    component.resumeAfterUncertainSend();
    expect(component.deliveryUncertain).toBeFalse();
    expect(component.draft).toBe('  Bora! ');
  });

  it('confirms a successful session POST after a lost HTTP response without a second POST', () => {
    const selected = item('session', 41);
    component.conversations = [selected];
    sessions.messages.and.returnValues(of([]), of([{
      id: 33, sessionId: 41, senderUsername: 'ana', body: 'Até logo',
      createdAt: new Date().toISOString()
    }]));
    sessions.detail.and.returnValue(of({ id: 41, status: 'OPEN', joined: true,
      gameDate: new Date(Date.now() + 60_000).toISOString() } as any));
    sessions.postMessage.and.returnValue(throwError(() => new HttpErrorResponse({ status: 503 })));
    component.selectConversation(selected);
    component.draft = 'Até logo';
    component.sendMessage();
    expect(sessions.postMessage).toHaveBeenCalledOnceWith(41, 'Até logo');
    expect(component.deliveryUncertain).toBeFalse();
    expect(component.draft).toBe('');
    expect(component.messages.map(m => m.id)).toEqual([33]);
  });

  it('retains pending drafts per conversation but never sends while ambiguous', () => {
    const community = item('community', 7);
    const directChat = item('direct', 'bea');
    component.conversations = [community, directChat];
    timeline.list.and.returnValue(of([]));
    timeline.send.and.returnValue(throwError(() => new HttpErrorResponse({ status: 408 })));
    direct.recentHistory.and.returnValue(of({ last: true, content: [] }));
    component.selectConversation(community);
    component.draft = 'Pendente';
    component.sendMessage();
    expect(component.deliveryUncertain).toBeTrue();
    component.selectConversation(directChat);
    component.draft = 'Uma conversa diferente';
    component.selectConversation(community);
    expect(component.deliveryUncertain).toBeTrue();
    expect(component.draft).toBe('Pendente');
    component.sendMessage();
    expect(timeline.send).toHaveBeenCalledTimes(1);
  });

  it('allows switching during an in-flight POST without mutating the next conversation draft', () => {
    const bea=item('direct','bea'), group=item('community',7);
    component.conversations=[bea,group];
    direct.recentHistory.and.returnValue(of({last:true,content:[]} as any));
    timeline.list.and.returnValue(of([]));
    const post=new Subject<any>();
    direct.send.and.returnValue(post.asObservable());
    component.selectConversation(bea);
    component.draft='A enviar para Bea';
    component.sendMessage();
    expect(component.sending).toBeTrue();

    component.selectConversation(group);
    expect(component.selectedKey).toBe(group.key);
    expect(component.sending).toBeFalse();
    component.draft='Rascunho na comunidade';
    post.next({id:52,username1:'ana',username2:'bea',
      text:'A enviar para Bea',date:new Date().toISOString(),dataDisplay:null});
    post.complete();

    expect(component.selectedKey).toBe(group.key);
    expect(component.draft).toBe('Rascunho na comunidade');
    expect(component.messages).toEqual([]);
    expect(component.conversations.find(x=>x.key===bea.key)?.latestMessageId).toBe(52);
    component.selectConversation(bea);
    expect(component.draft).toBe('');
    expect(component.deliveryUncertain).toBeFalse();
    expect(direct.send).toHaveBeenCalledTimes(1);
  });

  it('preserves a newer draft in the same chat when an older POST completes after navigation', () => {
    const bea=item('direct','bea'), group=item('community',7);
    component.conversations=[bea,group];
    direct.recentHistory.and.returnValue(of({last:true,content:[]} as any));
    timeline.list.and.returnValue(of([]));
    const post=new Subject<any>();
    direct.send.and.returnValue(post.asObservable());
    component.selectConversation(bea);
    component.draft='Primeira mensagem';
    component.sendMessage();
    component.selectConversation(group);
    component.selectConversation(bea);
    // A new typed draft is independent from the earlier in-flight message.
    component.draft='Nova mensagem, ainda não enviada';
    post.next({id:53,username1:'ana',username2:'bea',
      text:'Primeira mensagem',date:new Date().toISOString(),dataDisplay:null});
    post.complete();
    expect(component.selectedKey).toBe(bea.key);
    expect(component.draft).toBe('Nova mensagem, ainda não enviada');
    expect(component.sending).toBeFalse();
    expect(component.deliveryUncertain).toBeFalse();
    expect(component.messages.map(x=>x.id)).toEqual([53]);
    component.selectConversation(group);
    component.selectConversation(bea);
    expect(component.draft).toBe('Nova mensagem, ainda não enviada');
    expect(direct.send).toHaveBeenCalledTimes(1);
  });

  it('does not erase a newer off-screen draft when the original POST is confirmed', () => {
    const bea=item('direct','bea'), group=item('community',7);
    component.conversations=[bea,group];
    direct.recentHistory.and.returnValue(of({last:true,content:[]} as any));
    timeline.list.and.returnValue(of([]));
    const post=new Subject<any>();
    direct.send.and.returnValue(post.asObservable());
    component.selectConversation(bea);
    component.draft='Primeira mensagem';
    component.sendMessage();
    component.selectConversation(group);
    // Simulate a draft saved for Bea while the POST is in progress.
    (component as any).drafts.set(bea.key, 'Novo rascunho para Bea');
    post.next({id:54,username1:'ana',username2:'bea',
      text:'Primeira mensagem',date:new Date().toISOString(),dataDisplay:null});
    post.complete();
    expect(component.draft).toBe('');
    component.selectConversation(bea);
    expect(component.draft).toBe('Novo rascunho para Bea');
    expect(direct.send).toHaveBeenCalledTimes(1);
  });

  it('preserves newer text when read-only verification confirms an older uncertain send', () => {
    const bea=item('direct','bea'), other=item('community',7);
    component.conversations=[bea,other];
    direct.recentHistory.and.returnValue(of({last:true,content:[]} as any));
    timeline.list.and.returnValue(of([]));
    direct.send.and.returnValue(throwError(()=>new HttpErrorResponse({status:503})));
    component.selectConversation(bea);
    component.draft='Mensagem antiga';
    component.sendMessage();
    expect(component.deliveryUncertain).toBeTrue();
    component.selectConversation(other);
    component.selectConversation(bea);
    component.draft='Novo rascunho depois da falha';
    const delivered:InboxMessage={...message(bea.key,61,'ana'),
      text:'Mensagem antiga',createdAt:new Date().toISOString()};
    (component as any).confirmFromHistoryIfPresent(bea.key,[delivered]);
    expect(component.deliveryUncertain).toBeFalse();
    expect(component.draft).toBe('Novo rascunho depois da falha');
    expect(direct.send).toHaveBeenCalledTimes(1);
    component.selectConversation(other);
    component.selectConversation(bea);
    expect(component.draft).toBe('Novo rascunho depois da falha');
  });

  it('preserves a changed quoted reply when an earlier uncertain send is confirmed', () => {
    const bea=item('direct','bea'), other=item('community',7);
    component.conversations=[bea,other];
    direct.recentHistory.and.returnValue(of({last:true,content:[]} as any));
    timeline.list.and.returnValue(of([]));
    direct.send.and.returnValue(throwError(()=>new HttpErrorResponse({status:503})));
    component.selectConversation(bea);
    component.draft='Texto idêntico';
    component.sendMessage();
    expect(component.deliveryUncertain).toBeTrue();
    component.selectConversation(other);
    component.selectConversation(bea);
    const quoted:InboxMessage={...message(bea.key,47,'bea')};
    component.replyingTo=quoted;
    const delivered:InboxMessage={...message(bea.key,62,'ana'),
      text:'Texto idêntico',createdAt:new Date().toISOString()};
    (component as any).confirmFromHistoryIfPresent(bea.key,[delivered]);
    expect(component.replyingTo?.id).toBe(47);
    expect(component.draft).toBe('Texto idêntico');
    expect(component.deliveryUncertain).toBeFalse();
    expect(direct.send).toHaveBeenCalledTimes(1);
  });

  it('keeps a new reply target when an earlier HTTP POST succeeds late', () => {
    const bea=item('direct','bea'), group=item('community',7);
    component.conversations=[bea,group];
    direct.recentHistory.and.returnValue(of({last:true,content:[]} as any));
    timeline.list.and.returnValue(of([]));
    const post=new Subject<any>();
    direct.send.and.returnValue(post.asObservable());
    component.selectConversation(bea);
    component.draft='Mesmo texto';
    component.sendMessage();
    component.selectConversation(group);
    component.selectConversation(bea);
    component.replyingTo=message(bea.key,33,'bea');
    post.next({id:63,username1:'ana',username2:'bea',
      text:'Mesmo texto',date:new Date().toISOString(),dataDisplay:null});
    post.complete();
    expect(component.draft).toBe('Mesmo texto');
    expect(component.replyingTo?.id).toBe(33);
    expect(component.sending).toBeFalse();
    expect(direct.send).toHaveBeenCalledTimes(1);
  });

  it('prevents duplicate POST on the original thread when switching back during an in-flight send', () => {
    const bea=item('direct','bea'), group=item('community',7);
    component.conversations=[bea,group];
    direct.recentHistory.and.returnValue(of({last:true,content:[]} as any));
    timeline.list.and.returnValue(of([]));
    const post=new Subject<any>();
    direct.send.and.returnValue(post.asObservable());
    component.selectConversation(bea);
    component.draft='Uma só mensagem';
    component.sendMessage();
    component.selectConversation(group);
    component.selectConversation(bea);
    expect(component.sending).toBeTrue();
    expect(component.draft).toBe('Uma só mensagem');
    expect(component.canSendMessage()).toBeFalse();
    component.sendMessage();
    expect(direct.send).toHaveBeenCalledTimes(1);
    post.next({id:51,username1:'ana',username2:'bea',
      text:'Uma só mensagem',date:new Date().toISOString(),dataDisplay:null});
    post.complete();
    expect(component.sending).toBeFalse();
    expect(component.draft).toBe('');
    expect(component.messages.map(x=>x.id)).toEqual([51]);
  });

  it('keeps an ambiguous POST attached to its original conversation if HTTP fails after switching', () => {
    const bea=item('direct','bea'), group=item('community',7);
    component.conversations=[bea,group];
    direct.recentHistory.and.returnValue(of({last:true,content:[]} as any));
    timeline.list.and.returnValue(of([]));
    const post=new Subject<any>();
    direct.send.and.returnValue(post.asObservable());
    component.selectConversation(bea);
    component.draft='Não reenviar sem confirmar';
    component.sendMessage();
    component.selectConversation(group);
    component.draft='Texto independente';
    post.error(new HttpErrorResponse({status:503}));
    expect(component.deliveryUncertain).toBeFalse();
    expect(component.draft).toBe('Texto independente');
    component.selectConversation(bea);
    expect(component.deliveryUncertain).toBeTrue();
    expect(component.draft).toBe('Não reenviar sem confirmar');
    component.sendMessage();
    expect(direct.send).toHaveBeenCalledTimes(1);
  });

  it('does not start a stale verification after the user resolves delivery uncertainty', () => {
    const bea=item('direct','bea'), other=item('community',7);
    component.conversations=[bea,other];
    direct.recentHistory.and.returnValue(of({last:true,content:[]} as any));
    timeline.list.and.returnValue(of([]));
    direct.send.and.returnValue(throwError(()=>new HttpErrorResponse({status:503})));
    component.selectConversation(bea);
    component.draft='Mensagem não confirmada';
    component.sendMessage();
    const original=(component as any).pendingByConversation.get(bea.key);
    expect(original).toBeTruthy();
    component.resumeAfterUncertainSend();
    expect(component.deliveryUncertain).toBeFalse();
    direct.recentHistory.calls.reset();
    component.selectConversation(other);
    (component as any).checkPendingDelivery(bea,original);
    expect(direct.recentHistory).not.toHaveBeenCalled();
    expect((component as any).verifyingKeys.has(bea.key)).toBeFalse();
    expect(component.selectedKey).toBe(other.key);
    expect(component.deliveryChecking).toBeFalse();
    expect(direct.send).toHaveBeenCalledTimes(1);
  });

  it('ignores a queued recovery check for a conversation that was removed', () => {
    const bea=item('direct','bea'), other=item('community',7);
    component.conversations=[bea,other];
    direct.recentHistory.and.returnValue(of({last:true,content:[]} as any));
    timeline.list.and.returnValue(of([]));
    direct.send.and.returnValue(throwError(()=>new HttpErrorResponse({status:503})));
    component.selectConversation(bea);
    component.draft='Mensagem por confirmar';
    component.sendMessage();
    const original=(component as any).pendingByConversation.get(bea.key);
    component.conversations=[other];
    direct.recentHistory.calls.reset();
    (component as any).checkPendingDelivery(bea,original);
    expect(direct.recentHistory).not.toHaveBeenCalled();
    expect((component as any).verifyingKeys.has(bea.key)).toBeFalse();
    expect(direct.send).toHaveBeenCalledTimes(1);
  });

  it('removes previous-account conversations, drafts and pending state on logout in another tab', () => {
    const peer=item('direct','bea');
    component.conversations=[peer];
    component.selectedKey=peer.key;
    component.messages=[message(peer.key,7)];
    component.draft='Texto privado';
    component.replyingTo=message(peer.key,3);
    (component as any).drafts.set(peer.key,'Outro rascunho');
    (component as any).replyDrafts.set(peer.key,message(peer.key,3));
    (component as any).pendingByConversation.set(peer.key,{
      key:peer.key,text:'Pendente',replyToMessageId:null,
      knownIds:new Set<number>(),startedAt:Date.now()
    });
    (component as any).currentUsername='ana';
    (component as any).receiptSessionToken='old-account-token';
    spyOn(localStorage,'getItem').and.returnValue('new-account-token');
    (component as any).onAuthStorageChange({key:'t'} as StorageEvent);
    expect(component.conversations).toEqual([]);
    expect(component.selectedKey).toBeNull();
    expect(component.messages).toEqual([]);
    expect(component.draft).toBe('');
    expect(component.replyingTo).toBeNull();
    expect((component as any).drafts.size).toBe(0);
    expect((component as any).replyDrafts.size).toBe(0);
    expect((component as any).pendingByConversation.size).toBe(0);
    expect(component.canSendMessage()).toBeFalse();
    expect(component.composerAllowed).toBeFalse();
  });

  it('rejects a delayed initial inbox load after a different login takes over', () => {
    const delayedFriends=new Subject<any[]>();
    friends.friends.and.returnValue(delayedFriends.asObservable());
    (component as any).currentUsername='ana';
    (component as any).receiptSessionToken='old-account-token';
    let token='old-account-token';
    spyOn(localStorage,'getItem').and.callFake(key=>key==='t'?token:null);
    component.loadInbox();
    expect(component.loading).toBeTrue();
    token='other-account-token';
    (component as any).clearMediaOnAccountChange();
    delayedFriends.next([{username:'bea',nickname:'Bea'}] as any);
    delayedFriends.complete();
    expect(component.conversations).toEqual([]);
    expect(component.selectedKey).toBeNull();
    expect(component.loading).toBeFalse();
    expect(direct.recentHistory).not.toHaveBeenCalled();
  });

  it('ignores an old account WebSocket message after the login token changes', () => {
    const peer=item('direct','bea');
    component.conversations=[peer];
    component.selectedKey=peer.key;
    component.messages=[message(peer.key,1)];
    (component as any).receiptSessionToken='previous-account-token';
    spyOn(localStorage,'getItem').and.returnValue('next-account-token');
    (component as any).acceptRealtime(peer.key,{
      key:peer.key,id:99,sender:'bea',text:'Mensagem antiga',
      createdAt:new Date().toISOString()
    });
    expect(component.messages.map(m=>m.id)).toEqual([1]);
    expect(component.conversations[0].latestMessageId).toBeUndefined();
    expect(component.conversations[0].newThisVisit).toBe(0);
  });

  it('cannot resolve an old account pending send after the login changes', () => {
    const peer=item('direct','bea');
    component.conversations=[peer];
    component.selectedKey=peer.key;
    (component as any).receiptSessionToken='previous-account-token';
    spyOn(localStorage,'getItem').and.returnValue('next-account-token');
    const pending={key:peer.key,text:'Pendente antiga',replyToMessageId:null,
      knownIds:new Set<number>(),startedAt:Date.now()};
    (component as any).pendingByConversation.set(peer.key,pending);
    component.deliveryUncertain=true;
    component.draft='Pendente antiga';
    (component as any).confirmFromHistoryIfPresent(peer.key,[{
      key:peer.key,id:99,sender:'ana',text:'Pendente antiga',
      createdAt:new Date().toISOString()
    }]);
    expect((component as any).pendingByConversation.get(peer.key)).toBe(pending);
    expect(component.deliveryUncertain).toBeTrue();
    expect(component.draft).toBe('Pendente antiga');
  });

  it('ignores a late successful POST from the previous login', () => {
    const peer=item('direct','bea');
    let activeToken='original-login';
    spyOn(localStorage,'getItem').and.callFake(key => key === 't' ? activeToken : null);
    (component as any).receiptSessionToken=activeToken;
    component.conversations=[peer];
    direct.recentHistory.and.returnValue(of({last:true,content:[]} as any));
    const result=new Subject<any>();
    direct.send.and.returnValue(result.asObservable());
    component.selectConversation(peer);
    component.draft='Mensagem da conta antiga';
    component.sendMessage();
    expect(direct.send).toHaveBeenCalledTimes(1);
    activeToken='new-login';
    result.next({id:221,username1:'ana',username2:'bea',
      text:'Mensagem da conta antiga',date:new Date().toISOString(),dataDisplay:null});
    result.complete();
    expect(component.messages).toEqual([]);
    expect(component.draft).toBe('Mensagem da conta antiga');
    expect(component.conversations[0].latestMessageId).toBeUndefined();
  });

  it('keeps a newer delivery verification locked when an older GET finishes late', () => {
    const peer=item('direct','bea');
    component.conversations=[peer];
    const oldCheck=new Subject<any>();
    const newCheck=new Subject<any>();
    direct.recentHistory.and.returnValues(
      of({last:true,content:[]} as any),oldCheck.asObservable(),newCheck.asObservable());
    direct.send.and.returnValue(throwError(()=>new HttpErrorResponse({status:503})));
    component.selectConversation(peer);
    component.draft='Primeira mensagem';
    component.sendMessage();
    expect(component.deliveryUncertain).toBeTrue();
    expect(component.deliveryChecking).toBeTrue();

    // Live socket proves the first send before its read-only verification ends.
    (component as any).acceptRealtime(peer.key,{
      key:peer.key,id:125,sender:'ana',text:'Primeira mensagem',
      createdAt:new Date().toISOString()
    });
    expect(component.deliveryUncertain).toBeFalse();
    expect(component.deliveryChecking).toBeFalse();

    component.draft='Segunda mensagem';
    component.sendMessage();
    expect(component.deliveryUncertain).toBeTrue();
    expect(component.deliveryChecking).toBeTrue();
    expect(direct.recentHistory).toHaveBeenCalledTimes(3);
    expect(direct.send).toHaveBeenCalledTimes(2);

    // This is the OLD GET: it must not unlock the new pending send.
    oldCheck.next({last:true,content:[]} as any);
    oldCheck.complete();
    expect(component.deliveryUncertain).toBeTrue();
    expect(component.deliveryChecking).toBeTrue();
    expect(component.draft).toBe('Segunda mensagem');
    newCheck.next({last:true,content:[]} as any);
    newCheck.complete();
    expect(component.deliveryChecking).toBeFalse();
    expect(component.deliveryUncertain).toBeTrue();
    expect(direct.send).toHaveBeenCalledTimes(2);
  });

  it('unblocks a newly edited draft when WebSocket confirms delivery during a pending verification GET', () => {
    const peer=item('direct','bea');
    component.conversations=[peer];
    const verification=new Subject<any>();
    direct.recentHistory.and.returnValues(
      of({last:true,content:[]} as any), verification.asObservable());
    direct.send.and.returnValue(throwError(()=>new HttpErrorResponse({status:503})));
    component.selectConversation(peer);
    component.draft='Primeiro envio';
    component.sendMessage();
    expect(component.deliveryUncertain).toBeTrue();
    expect(component.deliveryChecking).toBeTrue();

    component.draft='Nova mensagem ainda não enviada';
    (component as any).acceptRealtime(peer.key,{
      key:peer.key,id:124,sender:'ana',text:'Primeiro envio',
      createdAt:new Date().toISOString()
    });
    expect(component.deliveryUncertain).toBeFalse();
    expect(component.deliveryChecking).toBeFalse();
    expect(component.draft).toBe('Nova mensagem ainda não enviada');
    expect(component.canSendMessage()).toBeTrue();
    expect(direct.send).toHaveBeenCalledTimes(1);

    // An older verification response must not undo the socket confirmation.
    verification.next({last:true,content:[]} as any);
    verification.complete();
    expect(component.deliveryUncertain).toBeFalse();
    expect(component.draft).toBe('Nova mensagem ainda não enviada');
    expect(direct.send).toHaveBeenCalledTimes(1);
  });

  it('accepts a delayed verification after switching without clearing the next composer', () => {
    const bea=item('direct','bea'), group=item('community',7);
    component.conversations=[bea,group];
    const verification=new Subject<any>();
    direct.recentHistory.and.returnValues(
      of({last:true,content:[]} as any), verification.asObservable(),
      of({last:true,content:[]} as any));
    timeline.list.and.returnValue(of([]));
    direct.send.and.returnValue(throwError(()=>new HttpErrorResponse({status:0})));
    component.selectConversation(bea);
    component.draft='Confirmar envio';
    component.sendMessage();
    expect(component.deliveryChecking).toBeTrue();
    component.selectConversation(group);
    expect(component.selectedKey).toBe(group.key);
    component.draft='Novo rascunho';
    verification.next({last:true,content:[{id:80,username1:'ana',username2:'bea',
      text:'Confirmar envio',date:new Date().toISOString(),dataDisplay:null}]});
    verification.complete();
    expect(component.draft).toBe('Novo rascunho');
    expect(component.deliveryChecking).toBeFalse();
    component.selectConversation(bea);
    expect(component.deliveryUncertain).toBeFalse();
    expect(component.draft).toBe('');
    expect(component.conversations.find(x=>x.key===bea.key)?.latestMessageId).toBe(80);
    expect(direct.send).toHaveBeenCalledTimes(1);
  });

  it('confirms an uncertain community send via WebSocket while another thread is open', () => {
    const group = item('community', 7), peer = item('direct', 'bea');
    component.conversations = [group, peer];
    timeline.list.and.returnValue(of([]));
    direct.recentHistory.and.returnValue(of({last:true,content:[]} as any));
    timeline.send.and.returnValue(throwError(() => new HttpErrorResponse({status:503})));
    component.selectConversation(group);
    component.draft = 'Bora jogar às 18h';
    component.sendMessage();
    expect(component.deliveryUncertain).toBeTrue();
    component.selectConversation(peer);
    component.draft = 'Não apagar este texto';

    (component as any).acceptRealtime(group.key, {
      key:group.key,id:95,sender:'ana',text:'Bora jogar às 18h',
      createdAt:new Date().toISOString()
    });

    expect(component.draft).toBe('Não apagar este texto');
    expect(component.messages).toEqual([]);
    component.selectConversation(group);
    expect(component.deliveryUncertain).toBeFalse();
    expect(component.draft).toBe('');
    expect(component.conversations.find(c=>c.key===group.key)?.latestMessageId).toBe(95);
    expect(timeline.send).toHaveBeenCalledTimes(1);
  });

  it('trusts a confirmed socket message that arrives before a timed-out HTTP response', () => {
    const peer = item('direct','bea');
    component.conversations=[peer];
    direct.recentHistory.and.returnValue(of({last:true,content:[]} as any));
    const request = new Subject<any>();
    direct.send.and.returnValue(request.asObservable());
    component.selectConversation(peer);
    component.draft='Mensagem persistida';
    component.sendMessage();

    (component as any).acceptRealtime(peer.key,{
      key:peer.key,id:72,sender:'ana',text:'Mensagem persistida',
      createdAt:new Date().toISOString()
    });
    request.error(new HttpErrorResponse({status:0}));

    expect(component.deliveryUncertain).toBeFalse();
    expect(component.draft).toBe('');
    expect(component.messages.map(m=>m.id)).toEqual([72]);
    expect(direct.recentHistory).toHaveBeenCalledTimes(1);
    expect(direct.send).toHaveBeenCalledTimes(1);
  });

  it('does not confirm an uncertain message from a different sender or text', () => {
    const group=item('community',7),peer=item('direct','bea');
    component.conversations=[group,peer];
    timeline.list.and.returnValue(of([]));
    direct.recentHistory.and.returnValue(of({last:true,content:[]} as any));
    timeline.send.and.returnValue(throwError(() => new HttpErrorResponse({status:408})));
    component.selectConversation(group);
    component.draft='Não confirmada';
    component.sendMessage();
    expect(component.deliveryUncertain).toBeTrue();
    component.selectConversation(peer);
    (component as any).acceptRealtime(group.key,{
      key:group.key,id:98,sender:'bea',text:'Não confirmada',
      createdAt:new Date().toISOString()
    });
    (component as any).acceptRealtime(group.key,{
      key:group.key,id:99,sender:'ana',text:'Texto diferente',
      createdAt:new Date().toISOString()
    });
    component.selectConversation(group);
    expect(component.deliveryUncertain).toBeTrue();
    expect(component.draft).toBe('Não confirmada');
    expect(timeline.send).toHaveBeenCalledTimes(1);
  });

  it('recovers an off-screen uncertain direct send after authenticated WebSocket reconnect', () => {
    connected.next(false);
    const token='eyJhbGciOiJub25lIn0.'
      + btoa(JSON.stringify({sub:'ana',exp:4102444800})).replace(/=+$/,'')
      + '.fixture';
    spyOn(localStorage,'getItem').and.returnValue(token);
    friends.friends.and.returnValue(of([{username:'bea',nickname:'Bea'}] as any));
    communities.mine.and.returnValue(of([{id:7,name:'CNG'}] as any));
    timeline.list.and.returnValue(of([]));
    direct.recentHistory.and.returnValue(of({last:true,content:[{
      id:87,username1:'ana',username2:'bea',text:'Enviado antes da falha',
      date:new Date().toISOString(),dataDisplay:null
    }]} as any));
    component.ngOnInit();
    try {
      connected.next(true); // first authorization must not scan histories
      const group=component.conversations.find(x=>x.key==='community:7')!;
      component.selectConversation(group);
      component.draft='Outro rascunho';
      (component as any).pendingByConversation.set('direct:bea',{
        key:'direct:bea',text:'Enviado antes da falha',
        replyToMessageId:null,knownIds:new Set(),startedAt:Date.now()
      });
      expect(direct.recentHistory).not.toHaveBeenCalled();
      connected.next(false);
      connected.next(true);
      expect(direct.recentHistory).toHaveBeenCalledTimes(1);
      expect(component.draft).toBe('Outro rascunho');
      expect(component.selectedKey).toBe('community:7');
      expect((component as any).pendingByConversation.has('direct:bea')).toBeFalse();
      expect(component.conversations.find(x=>x.key==='direct:bea')?.latestMessageId).toBe(87);
      component.selectConversation(component.conversations.find(x=>x.key==='direct:bea')!);
      expect(component.deliveryUncertain).toBeFalse();
      expect(component.draft).toBe('');
      expect(direct.send).not.toHaveBeenCalled();
      connected.next(true);
      expect(direct.recentHistory).toHaveBeenCalledTimes(2); // opening only
    } finally {
      component.ngOnDestroy();
      connected.next(false);
    }
  });

  it('retains uncertainty when reconnect GET fails, and never retries POST', () => {
    connected.next(false);
    const token='eyJhbGciOiJub25lIn0.'
      + btoa(JSON.stringify({sub:'ana',exp:4102444800})).replace(/=+$/,'')
      + '.fixture';
    spyOn(localStorage,'getItem').and.returnValue(token);
    friends.friends.and.returnValue(of([{username:'bea',nickname:'Bea'}] as any));
    direct.recentHistory.and.returnValue(throwError(()=>new HttpErrorResponse({status:503})));
    component.ngOnInit();
    try {
      connected.next(true);
      (component as any).pendingByConversation.set('direct:bea',{
        key:'direct:bea',text:'Sem confirmação',
        replyToMessageId:null,knownIds:new Set(),startedAt:Date.now()
      });
      connected.next(false);
      connected.next(true);
      expect(direct.recentHistory).toHaveBeenCalledTimes(1);
      expect((component as any).pendingByConversation.has('direct:bea')).toBeTrue();
      expect(direct.send).not.toHaveBeenCalled();
      expect(component.conversations.map(c=>c.key)).toContain('direct:bea');
    } finally {
      component.ngOnDestroy();
      connected.next(false);
    }
  });

  it('ignores an old recovery GET after account switches while request is pending', () => {
    connected.next(false);
    const original='eyJhbGciOiJub25lIn0.'
      + btoa(JSON.stringify({sub:'ana',exp:4102444800})).replace(/=+$/,'')
      + '.fixture';
    let token=original;
    spyOn(localStorage,'getItem').and.callFake(k=>k==='t'?token:null);
    friends.friends.and.returnValue(of([{username:'bea',nickname:'Bea'}] as any));
    const oldGet=new Subject<any>();
    direct.recentHistory.and.returnValue(oldGet.asObservable());
    component.ngOnInit();
    try {
      connected.next(true);
      (component as any).pendingByConversation.set('direct:bea',{
        key:'direct:bea',text:'Privada',replyToMessageId:null,
        knownIds:new Set(),startedAt:Date.now()
      });
      connected.next(false);
      connected.next(true);
      expect(direct.recentHistory).toHaveBeenCalledTimes(1);
      token='logged-in-as-another-account';
      oldGet.next({content:[{id:51,username1:'ana',username2:'bea',
        text:'Privada',date:new Date().toISOString(),dataDisplay:null}],last:true});
      oldGet.complete();
      expect((component as any).pendingByConversation.has('direct:bea')).toBeTrue();
      expect(component.conversations.find(x=>x.key==='direct:bea')?.latestMessageId).not.toBe(51);
      expect(direct.send).not.toHaveBeenCalled();
    } finally {
      component.ngOnDestroy();
      connected.next(false);
    }
  });

  it('deduplicates repeated foreground checks of a still uncertain send', () => {
    (component as any).receiptSessionToken='qa-session';
    spyOn(localStorage,'getItem').and.returnValue('qa-session');
    component.conversations=[item('direct','bea')];
    (component as any).pendingByConversation.set('direct:bea',{
      key:'direct:bea',text:'Em espera',replyToMessageId:null,
      knownIds:new Set(),startedAt:Date.now()
    });
    direct.recentHistory.and.returnValue(of({content:[],last:true} as any));
    (component as any).onPageActive();
    (component as any).onPageActive();
    expect(direct.recentHistory).toHaveBeenCalledTimes(1);
    expect((component as any).pendingByConversation.has('direct:bea')).toBeTrue();
    expect(direct.send).not.toHaveBeenCalled();
  });

  it('restores a blocked pending send after reload and confirms it with one read-only GET', () => {
    const storageKey='jynlo.chat.uncertain-posts.v1';
    sessionStorage.removeItem(storageKey);
    connected.next(false);
    const token='eyJhbGciOiJub25lIn0.'
      + btoa(JSON.stringify({sub:'ana',exp:4102444800})).replace(/=+$/,'')
      + '.fixture';
    spyOn(localStorage,'getItem').and.returnValue(token);
    friends.friends.and.returnValue(of([{username:'bea',nickname:'Bea'}] as any));
    const heldPost=new Subject<any>();
    direct.send.and.returnValue(heldPost.asObservable());
    direct.recentHistory.and.returnValue(of({last:true,content:[]} as any));
    component.ngOnInit();
    try {
      const peer=component.conversations.find(x=>x.key==='direct:bea')!;
      component.selectConversation(peer);
      component.draft='A mesma mensagem sem reenvio';
      component.sendMessage();
      expect(sessionStorage.getItem(storageKey)).toContain('A mesma mensagem sem reenvio');
      expect(direct.send).toHaveBeenCalledTimes(1);
      component.ngOnDestroy();

      direct.recentHistory.and.returnValue(of({last:true,content:[{
        id:92,username1:'ana',username2:'bea',
        text:'A mesma mensagem sem reenvio',date:new Date().toISOString(),dataDisplay:null
      }]} as any));
      const reloaded=new MessagesCenterComponent(friends,communities,sessions,direct,
        timeline,realtime,inboxApi);
      reloaded.ngOnInit();
      try {
        expect(direct.recentHistory).toHaveBeenCalledTimes(2);
        expect((reloaded as any).pendingByConversation.size).toBe(0);
        expect(sessionStorage.getItem(storageKey)).toBeNull();
        const restoredPeer=reloaded.conversations.find(x=>x.key==='direct:bea')!;
        reloaded.selectConversation(restoredPeer);
        expect(reloaded.deliveryUncertain).toBeFalse();
        expect(reloaded.draft).toBe('');
        expect(direct.send).toHaveBeenCalledTimes(1);
      } finally {
        reloaded.ngOnDestroy();
      }
    } finally {
      sessionStorage.removeItem(storageKey);
      connected.next(false);
    }
  });

  it('restores but does not resend when the server cannot confirm the original POST', () => {
    const key='jynlo.chat.uncertain-posts.v1';
    sessionStorage.removeItem(key);
    connected.next(false);
    const token='eyJhbGciOiJub25lIn0.'
      + btoa(JSON.stringify({sub:'ana',exp:4102444800})).replace(/=+$/,'')
      + '.fixture';
    spyOn(localStorage,'getItem').and.returnValue(token);
    friends.friends.and.returnValue(of([{username:'bea',nickname:'Bea'}] as any));
    const heldPost=new Subject<any>();
    direct.send.and.returnValue(heldPost.asObservable());
    direct.recentHistory.and.returnValue(of({last:true,content:[]} as any));
    component.ngOnInit();
    try {
      const peer=component.conversations[0];
      component.selectConversation(peer);
      component.draft='Nunca enviar duas vezes';
      component.sendMessage();
      component.ngOnDestroy();
      direct.recentHistory.and.returnValue(
        throwError(()=>new HttpErrorResponse({status:503})));
      const reloaded=new MessagesCenterComponent(friends,communities,sessions,direct,
        timeline,realtime,inboxApi);
      reloaded.ngOnInit();
      try {
        reloaded.selectConversation(reloaded.conversations[0]);
        expect(reloaded.deliveryUncertain).toBeTrue();
        expect(reloaded.draft).toBe('Nunca enviar duas vezes');
        reloaded.sendMessage();
        expect(direct.send).toHaveBeenCalledTimes(1);
        expect(sessionStorage.getItem(key)).toContain('Nunca enviar duas vezes');
      } finally { reloaded.ngOnDestroy(); }
    } finally {
      sessionStorage.removeItem(key);
      connected.next(false);
    }
  });

  it('allows Shift+Enter and composition without triggering send', () => {
    const evt = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, cancelable: true });
    component.onComposerEnter(evt);
    expect(evt.defaultPrevented).toBeFalse();
    const ime = new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, cancelable: true });
    component.onComposerEnter(ime);
    expect(ime.defaultPrevented).toBeFalse();
    expect(timeline.send).not.toHaveBeenCalled();
  });


  it('renders persistent unread badge text instead of local visit count', () => {
    const remoteUnread = { ...item('direct', 'bea'), unreadCount: 12, newThisVisit: 0 };
    expect(component.unreadCountFor(remoteUnread)).toBe(12);
    expect(component.unreadBadgeText(remoteUnread)).toBe('12');
    const many = { ...remoteUnread, unreadCount: 142 };
    expect(component.unreadBadgeText(many)).toBe('99+');
    const localFallback = { ...item('direct', 'bea'), newThisVisit: 3 };
    expect(component.unreadBadgeText(localFallback)).toBe('3');
    component.conversations = [remoteUnread];
    component.setFilter('recent');
    expect(component.filteredConversations).toEqual([remoteUnread]);
    expect(component.recentCount).toBe(12);
  });

  it('hydrates previews and unread counts from authenticated server snapshots without fetching chat histories', () => {
    friends.friends.and.returnValue(of([{ username: 'bea', fullName: null, nickname: null,
      profilePicUrl: null, chatBlocked: false, blockedByMe: false }]));
    inboxApi.summaries.and.returnValue(of([{
      kind: 'direct', id: 'bea', latestMessageId: 70, latestText: 'Vamos jogar?',
      latestSender: 'bea', latestAt: '2026-10-23T09:00:00Z', unreadCount: 4
    }]));
    component.loadInbox();
    expect(component.conversations[0].latestText).toBe('Vamos jogar?');
    expect(component.recentCount).toBe(4);
    component.setFilter('recent');
    expect(component.filteredConversations.map(x => x.key)).toEqual(['direct:bea']);
    expect(direct.recentHistory).not.toHaveBeenCalled();
  });

  it('persists a read cursor after authorized history loads and clears the unread badge', () => {
    const community = item('community', 7);
    community.unreadCount = 5;
    component.conversations = [community];
    timeline.list.and.returnValue(of([{ id: 75, communityId: 7, kind: 'CHAT',
      username: 'bea', body: 'Olá', createdAt: '2026-10-23T09:00:00Z' }]));
    inboxApi.markRead.and.returnValue(of({
      kind: 'community', id: '7', latestMessageId: 75, latestText: 'Olá',
      latestSender: 'bea', latestAt: '2026-10-23T09:00:00Z', unreadCount: 0
    }));
    component.selectConversation(community);
    expect(inboxApi.markRead).not.toHaveBeenCalled();
    expect(component.recentCount).toBe(5);
    component.previewLog = {nativeElement:{
      scrollHeight:500,scrollTop:0,clientHeight:200,
      querySelector: (selector:string) => selector === '[data-message-id="75"]'
        ? {getBoundingClientRect: () => ({top:180,bottom:220,width:200,height:40})}
        : null,
      getBoundingClientRect: () => ({top:100,bottom:300,width:400,height:200})
    }} as any;
    component.ngAfterViewChecked();
    expect(inboxApi.markRead).toHaveBeenCalledOnceWith(
      { kind: 'community', id: '7' }, 75);
    expect(component.recentCount).toBe(0);
  });

  it('never persists read on HTTP forbidden or failed preview', () => {
    const community = item('community', 7);
    component.conversations = [community];
    timeline.list.and.returnValue(throwError(() => new Error('403')));
    component.selectConversation(community);
    expect(inboxApi.markRead).not.toHaveBeenCalled();
    expect(component.previewError).toBeTrue();
  });

  it('retains locally newer socket activity when a snapshot arrives late', () => {
    const community = item('community', 7);
    component.conversations = [community];
    const pending = new Subject<any>();
    inboxApi.summaries.and.returnValue(pending.asObservable());
    component.refreshSummaries();
    (component as any).acceptRealtime('community:7', {
      key: 'community:7', id: 80, sender: 'bea', text: 'Nova',
      createdAt: '2026-10-23T10:00:00Z'
    });
    pending.next([{ kind: 'community', id: '7', latestMessageId: 79,
      latestText: 'Antiga', latestSender: 'ana',
      latestAt: '2026-10-23T09:00:00Z', unreadCount: 1 }]);
    pending.complete();
    expect(component.conversations[0].latestText).toBe('Nova');
    expect(component.conversations[0].unreadCount).toBe(1);
  });

});

describe('Direct chat confirmed read status', () => {
  // Intentionally tested without a DOM renderer: these are authorization
  // and state-race contracts for the inbox, not visual snapshot tests.
  let inbox: MessagesCenterComponent;
  let api: jasmine.SpyObj<InboxApiService>;
  let direct: jasmine.SpyObj<DirectChatService>;
  let friends: jasmine.SpyObj<CommunityService>;
  let communities: jasmine.SpyObj<CommunityGroupsService>;
  let sessions: jasmine.SpyObj<SessionService>;
  let timeline: jasmine.SpyObj<CommunityTimelineService>;
  let realtime: DirectChatRealtimeService;
  let browserToken: string;

  beforeEach(() => {
    browserToken = 'fixture-auth-token-for-ana';
    spyOn(localStorage, 'getItem').and.callFake(key => key === 't' ? browserToken : null);
    // Make the background/read contract independent of the Karma runner's focus.
    spyOn(document, 'hasFocus').and.returnValue(true);
    spyOnProperty(document, 'visibilityState', 'get').and.returnValue('visible');
    friends = jasmine.createSpyObj('CommunityService', ['friends']);
    communities = jasmine.createSpyObj('CommunityGroupsService', ['mine']);
    sessions = jasmine.createSpyObj('SessionService', ['mine','messages','detail','postMessage']);
    direct = jasmine.createSpyObj('DirectChatService', ['recentHistory','info','send']);
    timeline = jasmine.createSpyObj('CommunityTimelineService', ['list','send']);
    api = jasmine.createSpyObj<InboxApiService>('InboxApiService',
      ['summaries','markRead','searchMessages','messageContext','directReadReceipt']);
    api.summaries.and.returnValue(of([]));
    api.directReadReceipt.and.callFake(peer=>of({peerUsername:peer,lastReadMessageId:0}));
    api.markRead.and.returnValue(of({kind:'direct',id:'bea',
      latestMessageId:null,latestText:null,latestAt:null,latestSender:null,unreadCount:0}));
    direct.recentHistory.and.returnValue(of({content:[],last:true} as any));
    direct.info.and.returnValue(of({chatBlocked:false,whoBlocked:null} as any));
    realtime = {connected$:new BehaviorSubject(false).asObservable(),
      messages$:new Subject<any>().asObservable(),
      readReceipts$:new Subject<any>().asObservable(),
      ownReads$:new Subject<any>().asObservable(),
      communityMessages$:new Subject<any>().asObservable(),
      sessionMessages$:new Subject<any>().asObservable(),
      connect:()=>{}} as unknown as DirectChatRealtimeService;
    inbox = new MessagesCenterComponent(friends,communities,sessions,
      direct,timeline,realtime,api);
    (inbox as any).currentUsername = 'ana';
    (inbox as any).receiptSessionToken = browserToken;
  });

  function select(peer:string):void {
    const conversation={key:'direct:'+peer,kind:'direct' as const,
      id:peer,title:peer,subtitle:peer,newThisVisit:0};
    inbox.conversations=[conversation];
    inbox.selectConversation(conversation);
  }

  it('only marks persisted own private messages read when the peer cursor covers their ID',()=>{
    api.directReadReceipt.and.returnValue(of({peerUsername:'bea',lastReadMessageId:11}));
    select('bea');
    expect(inbox.isDirectMessageRead({key:'direct:bea',id:10,sender:'ana',
      text:'a',createdAt:''})).toBeTrue();
    expect(inbox.isDirectMessageRead({key:'direct:bea',id:12,sender:'ana',
      text:'b',createdAt:''})).toBeFalse();
    expect(inbox.isDirectMessageRead({key:'direct:bea',id:10,sender:'bea',
      text:'c',createdAt:''})).toBeFalse();
    expect(inbox.isDirectMessageRead({key:'direct:bea',id:0,sender:'ana',
      text:'unsaved',createdAt:''})).toBeFalse();
  });

  it('ignores a delayed response from a previous selected conversation',()=>{
    const slow=new Subject<{peerUsername:string;lastReadMessageId:number}>();
    api.directReadReceipt.and.callFake(peer => peer==='bea'
      ? slow.asObservable() : of({peerUsername:peer,lastReadMessageId:0}));
    select('bea');
    select('carla');
    slow.next({peerUsername:'bea',lastReadMessageId:999});
    slow.complete();
    expect(inbox.isDirectMessageRead({key:'direct:carla',id:10,
      sender:'ana',text:'not read',createdAt:''})).toBeFalse();
    expect(api.directReadReceipt).toHaveBeenCalledWith('bea');
    expect(api.directReadReceipt).toHaveBeenCalledWith('carla');
  });

  it('hides stale read receipts immediately if another tab replaces the login token',()=> {
    api.directReadReceipt.and.returnValue(of({peerUsername:'bea',lastReadMessageId:42}));
    select('bea');
    const own = {key:'direct:bea',id:42,sender:'ana',text:'hello',createdAt:''};
    expect(inbox.isDirectMessageRead(own)).toBeTrue();
    browserToken = 'fixture-token-from-another-account';
    expect(inbox.isDirectMessageRead(own)).toBeFalse();
    (inbox as any).refreshPeerReadReceipt(true);
    expect((inbox as any).peerReadCursor).toBeNull();
    expect(api.directReadReceipt).toHaveBeenCalledTimes(1);
  });

  it('never reuses a peer receipt for a message belonging to another conversation',()=> {
    api.directReadReceipt.and.returnValue(of({peerUsername:'bea',lastReadMessageId:42}));
    select('bea');
    expect(inbox.isDirectMessageRead({key:'direct:carla',id:40,sender:'ana',
      text:'other chat',createdAt:''})).toBeFalse();
  });

  it('does not acknowledge a read while the recipient tab is hidden or unfocused',()=> {
    select('bea');
    inbox.messages=[{key:'direct:bea',id:42,sender:'bea',
      text:'unread while away',createdAt:'2026-10-23T10:00:00Z'}];
    inbox.previewLog = {nativeElement:{scrollHeight:100,scrollTop:0,clientHeight:100,
      querySelector: () => ({getBoundingClientRect: () => ({
        top: 120,bottom: 150,width: 200,height: 30
      })}),
      getBoundingClientRect: () => ({top:100,bottom:250,width:400,height:150})
    }} as any;
    (document.hasFocus as jasmine.Spy).and.returnValue(false);
    (inbox as any).markRenderedRead('direct:bea');
    expect(api.markRead).not.toHaveBeenCalled();
    (document.hasFocus as jasmine.Spy).and.returnValue(true);
    (inbox as any).markRenderedRead('direct:bea');
    expect(api.markRead).toHaveBeenCalledOnceWith(
      {kind:'direct',id:'bea'},42);
  });

  it('stops receipt GET polling while inactive and refreshes on return',()=> {
    const clock=spyOn(Date,'now').and.returnValue(100_000);
    select('bea');
    expect(api.directReadReceipt).toHaveBeenCalledTimes(1);
    (document.hasFocus as jasmine.Spy).and.returnValue(false);
    clock.and.returnValue(116_000);
    (inbox as any).refreshPeerReadReceipt();
    expect(api.directReadReceipt).toHaveBeenCalledTimes(1);
    (document.hasFocus as jasmine.Spy).and.returnValue(true);
    (inbox as any).onPageActive();
    expect(api.directReadReceipt).toHaveBeenCalledTimes(2);
    clock.and.returnValue(130_999);
    (inbox as any).refreshPeerReadReceipt();
    expect(api.directReadReceipt).toHaveBeenCalledTimes(2);
    clock.and.returnValue(131_000);
    (inbox as any).refreshPeerReadReceipt();
    expect(api.directReadReceipt).toHaveBeenCalledTimes(3);
  });

  it('does not fetch a receipt or mark read if the document is hidden',()=> {
    select('bea');
    inbox.messages=[{key:'direct:bea',id:40,sender:'bea',text:'hidden',createdAt:''}];
    // The foreground visibility spy was installed by this suite's setup.
    const descriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    expect(descriptor?.get).toBeDefined();
    (descriptor!.get as jasmine.Spy).and.returnValue('hidden');
    (inbox as any).markRenderedRead('direct:bea');
    (inbox as any).refreshPeerReadReceipt(true);
    expect(api.markRead).not.toHaveBeenCalled();
    expect(api.directReadReceipt).toHaveBeenCalledTimes(1);
  });

  it('applies server-confirmed WebSocket reads to the selected direct peer immediately',()=> {
    api.directReadReceipt.and.returnValue(of({peerUsername:'bea',lastReadMessageId:5}));
    select('bea');
    (inbox as any).acceptPersistedPeerReadReceipt({peerUsername:'bea',lastReadMessageId:42});
    expect(inbox.isDirectMessageRead({key:'direct:bea',id:42,sender:'ana',
      text:'read',createdAt:''})).toBeTrue();
    // Later stale HTTP GET cannot regress the newer server-sent watermark.
    api.directReadReceipt.and.returnValue(of({peerUsername:'bea',lastReadMessageId:10}));
    (inbox as any).refreshPeerReadReceipt(true);
    expect(inbox.isDirectMessageRead({key:'direct:bea',id:42,sender:'ana',
      text:'read',createdAt:''})).toBeTrue();
  });

  it('ignores forged, foreign, noninteger, and old-account socket receipts',()=> {
    select('bea');
    const own={key:'direct:bea',id:42,sender:'ana',text:'unread',createdAt:''};
    for(const invalid of [
      {peerUsername:'carla',lastReadMessageId:999},
      {peerUsername:'bea',lastReadMessageId:42.7},
      {peerUsername:'bea',lastReadMessageId:-1},
      {peerUsername:'bea',lastReadMessageId:0}
    ]) (inbox as any).acceptPersistedPeerReadReceipt(invalid);
    expect(inbox.isDirectMessageRead(own)).toBeFalse();
    browserToken='switched-to-another-account';
    (inbox as any).acceptPersistedPeerReadReceipt({peerUsername:'bea',lastReadMessageId:999});
    expect(inbox.isDirectMessageRead(own)).toBeFalse();
    browserToken='fixture-auth-token-for-ana';
    expect(inbox.isDirectMessageRead(own)).toBeFalse();
  });

  it('does not apply a read event from an earlier selected conversation',()=> {
    select('bea');
    select('carla');
    (inbox as any).acceptPersistedPeerReadReceipt({peerUsername:'bea',lastReadMessageId:999});
    expect(inbox.isDirectMessageRead({key:'direct:carla',id:10,
      sender:'ana',text:'not read',createdAt:''})).toBeFalse();
  });

  it('synchronizes the own unread badge from a scoped committed server summary',()=> {
    const conversation={...item('direct','bea'),unreadCount:4,
      latestAt:'2026-10-23T09:00:00Z',latestMessageId:42};
    inbox.conversations=[conversation];
    api.summaries.and.returnValue(of([{
      kind:'direct',id:'bea',latestMessageId:42,latestText:'lida',
      latestSender:'bea',latestAt:'2026-10-23T09:00:00Z',unreadCount:0
    }]));
    (inbox as any).refreshOwnPersistedRead({
      kind:'direct',conversationId:'bea',lastReadMessageId:42
    });
    expect(api.summaries).toHaveBeenCalledOnceWith([{kind:'direct',id:'bea'}]);
    expect(inbox.unreadCountFor(inbox.conversations[0])).toBe(0);
  });

  it('never clears newer unread activity from an older own-read snapshot',()=> {
    const pending=new Subject<any[]>();
    api.summaries.and.returnValue(pending.asObservable());
    inbox.conversations=[{...item('community',7),unreadCount:3,
      latestAt:'2026-10-23T09:00:00Z',latestMessageId:42}];
    (inbox as any).refreshOwnPersistedRead({
      kind:'community',conversationId:'7',lastReadMessageId:42
    });
    inbox.conversations=[{...inbox.conversations[0],unreadCount:4,
      latestAt:'2026-10-23T10:00:00Z',latestMessageId:43}];
    pending.next([{kind:'community',id:'7',latestMessageId:42,latestText:'antiga',
      latestSender:'ana',latestAt:'2026-10-23T09:00:00Z',unreadCount:0}]);
    pending.complete();
    expect(inbox.conversations[0].unreadCount).toBe(4);
    expect(inbox.conversations[0].latestMessageId).toBe(43);
  });

  it('ignores unknown conversations and reads from an earlier login',()=> {
    inbox.conversations=[{...item('session',8),unreadCount:3}];
    (inbox as any).refreshOwnPersistedRead({
      kind:'session',conversationId:'9',lastReadMessageId:42
    });
    (inbox as any).refreshOwnPersistedRead({
      kind:'session',conversationId:'8',lastReadMessageId:0
    });
    expect(api.summaries).not.toHaveBeenCalled();
    browserToken='different-login-token';
    (inbox as any).refreshOwnPersistedRead({
      kind:'session',conversationId:'8',lastReadMessageId:42
    });
    expect(api.summaries).not.toHaveBeenCalled();
    expect(inbox.conversations[0].unreadCount).toBe(3);
  });

  it('ignores an older in-flight sync when a newer own-read event arrives',()=> {
    const old=new Subject<any[]>();
    const newer={kind:'direct' as const,id:'bea',latestMessageId:50,
      latestText:'ok',latestSender:'bea',latestAt:'2026-10-23T09:00:00Z',
      unreadCount:0};
    api.summaries.and.returnValues(old.asObservable(),of([newer]));
    inbox.conversations=[{...item('direct','bea'),unreadCount:5}];
    (inbox as any).refreshOwnPersistedRead({
      kind:'direct',conversationId:'bea',lastReadMessageId:42
    });
    (inbox as any).refreshOwnPersistedRead({
      kind:'direct',conversationId:'bea',lastReadMessageId:50
    });
    old.next([{...newer,unreadCount:4}]);
    old.complete();
    expect(inbox.unreadCountFor(inbox.conversations[0])).toBe(0);
  });

  it('does not trust errors, wrong identities, or decreasing cursors',()=>{
    api.directReadReceipt.and.returnValue(of({peerUsername:'bea',lastReadMessageId:18}));
    select('bea');
    api.directReadReceipt.and.returnValue(of({peerUsername:'other',lastReadMessageId:999}));
    (inbox as any).refreshPeerReadReceipt(true);
    expect(inbox.isDirectMessageRead({key:'direct:bea',id:18,
      sender:'ana',text:'read',createdAt:''})).toBeTrue();
    expect(inbox.isDirectMessageRead({key:'direct:bea',id:19,
      sender:'ana',text:'unread',createdAt:''})).toBeFalse();
    api.directReadReceipt.and.returnValue(of({peerUsername:'bea',lastReadMessageId:5}));
    (inbox as any).refreshPeerReadReceipt(true);
    expect(inbox.isDirectMessageRead({key:'direct:bea',id:18,
      sender:'ana',text:'read',createdAt:''})).toBeTrue();
  });
});
