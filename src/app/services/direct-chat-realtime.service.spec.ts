import { DirectChatMessage } from '../pages/model/direct-chat';
import { chatReconnectDelayMs, DirectChatRealtimeService, normalizeDirectChatRealtimeMessage, normalizeRealtimeChatInstant } from './direct-chat-realtime.service';
import { fakeAsync, tick } from '@angular/core/testing';

describe('Direct chat WebSocket timestamps', () => {
  const message: DirectChatMessage = {
    id: 42,
    username1: 'jynloteste01',
    username2: 'jynloteste02',
    text: 'Olá em tempo real',
    date: null,
    dataDisplay: null
  };
  const iso = '2026-10-23T11:52:00.000Z';

  it('converts the Java Date epoch milliseconds from the WebSocket to ISO', () => {
    const incoming = { ...message, date: Date.parse(iso) as unknown as string };
    const normalized = normalizeDirectChatRealtimeMessage(incoming);
    expect(normalized.date).toBe(iso);
    expect(normalized.id).toBe(42);
    expect(normalized.text).toBe(message.text);
    expect(Date.parse(normalized.date!)).toBe(Date.parse(iso));
  });

  it('also handles a decimal millisecond timestamp string without changing the message', () => {
    const incoming = { ...message, date: String(Date.parse(iso)) };
    expect(normalizeDirectChatRealtimeMessage(incoming).date).toBe(iso);
    expect(incoming.date).toBe(String(Date.parse(iso)));
  });

  it('preserves already ISO-serialized dates and absent dates', () => {
    const withIso = { ...message, date: iso };
    expect(normalizeDirectChatRealtimeMessage(withIso)).toBe(withIso);
    expect(normalizeDirectChatRealtimeMessage(message)).toBe(message);
  });

  it('does not invent a timestamp for invalid numeric events', () => {
    const invalid = { ...message, date: Number.NaN as unknown as string };
    expect(normalizeDirectChatRealtimeMessage(invalid).date).toBeNull();
    const infinite = { ...message, date: Number.POSITIVE_INFINITY as unknown as string };
    expect(normalizeDirectChatRealtimeMessage(infinite).date).toBeNull();
  });
});


describe('Session and community realtime timestamps', () => {
  const iso = '2026-10-24T16:23:18.123Z';

  it('converts Jackson Instant epoch seconds and fractions, preserving ISO values', () => {
    const seconds = Date.parse(iso) / 1000;
    expect(normalizeRealtimeChatInstant(seconds)).toBe(iso);
    expect(normalizeRealtimeChatInstant(String(seconds))).toBe(iso);
    expect(normalizeRealtimeChatInstant(Date.parse(iso))).toBe(iso);
    expect(normalizeRealtimeChatInstant(iso)).toBe(iso);
  });

  it('does not invent a send time for invalid or absent server dates', () => {
    expect(normalizeRealtimeChatInstant(null)).toBe('');
    expect(normalizeRealtimeChatInstant(Number.NaN)).toBe('');
    expect(normalizeRealtimeChatInstant(Number.POSITIVE_INFINITY)).toBe('');
    expect(normalizeRealtimeChatInstant(-1)).toBe('');
  });
});

/** Browser-only fake socket: no real network and no persisted credentials. */
class RealtimeFakeSocket {
  static sockets: RealtimeFakeSocket[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readyState = RealtimeFakeSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  sent: string[] = [];
  closeCalls = 0;
  constructor(readonly url: string) { RealtimeFakeSocket.sockets.push(this); }
  send(payload: string): void { this.sent.push(payload); }
  close(): void {
    this.closeCalls++;
    this.readyState = RealtimeFakeSocket.CLOSED;
  }
  open(): void {
    this.readyState = RealtimeFakeSocket.OPEN;
    this.onopen?.(new Event('open'));
  }
  receive(envelope: unknown): void {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(envelope) }));
  }
  closed(code = 1006): void {
    this.readyState = RealtimeFakeSocket.CLOSED;
    this.onclose?.({ code } as CloseEvent);
  }
}

describe('Chat WebSocket identity and reconnection', () => {
  let oldSocket: typeof WebSocket;
  let oldToken: string | null;
  let service: DirectChatRealtimeService;

  function qaToken(username: string): string {
    const payload = btoa(JSON.stringify({ sub: username, exp: 4102444800 }))
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    return 'eyJhbGciOiJIUzI1NiJ9.' + payload + '.synthetic';
  }

  beforeEach(() => {
    oldSocket = window.WebSocket;
    oldToken = localStorage.getItem('t');
    (window as any).WebSocket = RealtimeFakeSocket;
    RealtimeFakeSocket.sockets = [];
    localStorage.setItem('t', qaToken('jynloteste01'));
    service = new DirectChatRealtimeService();
  });

  afterEach(() => {
    service.disconnect();
    (window as any).WebSocket = oldSocket;
    if (oldToken === null) localStorage.removeItem('t');
    else localStorage.setItem('t', oldToken);
    RealtimeFakeSocket.sockets = [];
  });

  it('signals personal-live updates only after WebSocket authentication', () => {
    const received = jasmine.createSpy('liveUpdated');
    service.personalLiveInvalidated$.subscribe(received);
    service.connect();
    const socket = RealtimeFakeSocket.sockets[0];
    socket.open();
    socket.receive({type:'PERSONAL_LIVE_INVALIDATED'});
    expect(received).not.toHaveBeenCalled();
    socket.receive({type:'AUTHENTICATED'});
    socket.receive({type:'PERSONAL_LIVE_INVALIDATED'});
    expect(received).toHaveBeenCalledTimes(1);
    expect(received.calls.mostRecent().args).toEqual([]);
  });

  it('normalizes authenticated community and session messages before emitting them', () => {
    const sessionSeen = jasmine.createSpy('session');
    const communitySeen = jasmine.createSpy('community');
    service.sessionMessages$.subscribe(sessionSeen);
    service.communityMessages$.subscribe(communitySeen);
    service.connect();
    const socket = RealtimeFakeSocket.sockets[0];
    socket.open();
    const iso = '2026-10-24T16:23:18.123Z';
    const createdAt = Date.parse(iso) / 1000;
    const sessionMessage = { id: 5, sessionId: 41, senderUsername: 'jynloteste02',
      body: 'Teste', createdAt };
    const communityMessage = { id: 9, communityId: 7, kind: 'CHAT',
      username: 'jynloteste02', body: 'Teste', createdAt: String(createdAt) };
    socket.receive({ type: 'SESSION_CHAT_MESSAGE', message: sessionMessage });
    socket.receive({ type: 'COMMUNITY_CHAT_MESSAGE', message: communityMessage });
    expect(sessionSeen).not.toHaveBeenCalled();
    expect(communitySeen).not.toHaveBeenCalled();
    socket.receive({ type: 'AUTHENTICATED' });
    socket.receive({ type: 'SESSION_CHAT_MESSAGE', message: sessionMessage });
    socket.receive({ type: 'COMMUNITY_CHAT_MESSAGE', message: communityMessage });
    expect(sessionSeen).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({ createdAt: iso, id: 5 }));
    expect(communitySeen).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({ createdAt: iso, id: 9 }));
  });

  it('requires successful AUTH before releasing any private chat event', () => {
    const received = jasmine.createSpy('received');
    let connected = false;
    service.messages$.subscribe(received);
    service.connected$.subscribe(value => connected = value);

    service.connect();
    const socket = RealtimeFakeSocket.sockets[0];
    expect(socket.url).toContain('/ws/chat');
    socket.open();
    expect(JSON.parse(socket.sent[0]).type).toBe('AUTH');
    expect(connected).toBeFalse();

    const message = { id: 42, username1: 'jynloteste01',
      username2: 'jynloteste02', text: 'QA', date: null, dataDisplay: null };
    socket.receive({ type: 'CHAT_MESSAGE', message });
    expect(received).not.toHaveBeenCalled();
    socket.receive({ type: 'AUTHENTICATED' });
    expect(connected).toBeTrue();
    socket.receive({ type: 'CHAT_MESSAGE', message });
    expect(received).toHaveBeenCalledTimes(1);
  });

  it('forwards committed read receipts only after socket authentication',()=> {
    const seen = jasmine.createSpy('read');
    service.readReceipts$.subscribe(seen);
    service.connect();
    const socket = RealtimeFakeSocket.sockets[0];
    socket.open();
    const receipt={peerUsername:'jynloteste02',lastReadMessageId:42};
    socket.receive({type:'CHAT_READ_RECEIPT',receipt});
    expect(seen).not.toHaveBeenCalled();
    socket.receive({type:'AUTHENTICATED'});
    for(const invalid of [
      {peerUsername:'jynloteste02',lastReadMessageId:0},
      {peerUsername:'jynloteste02',lastReadMessageId:42.5},
      {peerUsername:'jynloteste02',lastReadMessageId:'42'},
      {peerUsername:null,lastReadMessageId:999}
    ]) socket.receive({type:'CHAT_READ_RECEIPT',receipt:invalid});
    expect(seen).not.toHaveBeenCalled();
    socket.receive({type:'CHAT_READ_RECEIPT',receipt});
    expect(seen).toHaveBeenCalledOnceWith(receipt);
  });

  it('does not leak a prior session read receipt after a different login',()=> {
    const seen = jasmine.createSpy('read');
    service.readReceipts$.subscribe(seen);
    service.connect();
    const socket = RealtimeFakeSocket.sockets[0];
    socket.open();
    socket.receive({type:'AUTHENTICATED'});
    localStorage.setItem('t',qaToken('jynloteste02'));
    socket.receive({type:'CHAT_READ_RECEIPT',receipt:{
      peerUsername:'jynloteste02',lastReadMessageId:500
    }});
    expect(seen).not.toHaveBeenCalled();
    expect(socket.closeCalls).toBe(1);
  });

  it('emits only authenticated and strictly validated own-read updates',()=> {
    const seen=jasmine.createSpy('ownRead');
    service.ownReads$.subscribe(seen);
    service.connect();
    const socket=RealtimeFakeSocket.sockets[0];
    socket.open();
    const read={kind:'community',conversationId:'7',lastReadMessageId:50};
    socket.receive({type:'INBOX_OWN_READ_UPDATED',read});
    expect(seen).not.toHaveBeenCalled();
    socket.receive({type:'AUTHENTICATED'});
    for(const invalid of [
      {kind:'other',conversationId:'7',lastReadMessageId:50},
      {kind:'community',conversationId:'7',lastReadMessageId:0},
      {kind:'community',conversationId:'7',lastReadMessageId:50.4},
      {kind:'community',conversationId:7,lastReadMessageId:50},
      {kind:'direct',conversationId:'',lastReadMessageId:50}
    ]) socket.receive({type:'INBOX_OWN_READ_UPDATED',read:invalid});
    expect(seen).not.toHaveBeenCalled();
    socket.receive({type:'INBOX_OWN_READ_UPDATED',read});
    expect(seen).toHaveBeenCalledOnceWith(read);
  });

  it('drops an own-read event from a socket authenticated for the previous account',()=> {
    const seen=jasmine.createSpy('ownRead');
    service.ownReads$.subscribe(seen);
    service.connect();
    const socket=RealtimeFakeSocket.sockets[0];
    socket.open();
    socket.receive({type:'AUTHENTICATED'});
    localStorage.setItem('t',qaToken('jynloteste02'));
    socket.receive({type:'INBOX_OWN_READ_UPDATED',read:{
      kind:'direct',conversationId:'bea',lastReadMessageId:99
    }});
    expect(seen).not.toHaveBeenCalled();
    expect(socket.closeCalls).toBe(1);
  });

  it('replaces a socket when the account token changes and ignores late old events', fakeAsync(() => {
    const old = localStorage.getItem('t');
    const received = jasmine.createSpy('received');
    let connected = false;
    service.messages$.subscribe(received);
    service.connected$.subscribe(value => connected = value);

    service.connect();
    const first = RealtimeFakeSocket.sockets[0];
    first.open();
    first.receive({ type: 'AUTHENTICATED' });
    expect(connected).toBeTrue();

    const tokenB = qaToken('jynloteste02');
    localStorage.setItem('t', tokenB);
    service.connect();
    expect(first.closeCalls).toBe(1);
    const second = RealtimeFakeSocket.sockets[1];
    expect(second).toBeDefined();
    expect(connected).toBeFalse();
    second.open();
    expect(JSON.parse(second.sent[0]).token).toBe(tokenB);
    second.receive({ type: 'AUTHENTICATED' });
    expect(connected).toBeTrue();

    // Chrome may deliver first.onclose after the new socket authenticated.
    first.closed();
    first.receive({ type: 'CHAT_MESSAGE', message: {
      id: 88, username1: 'jynloteste01', username2: 'jynloteste02',
      text: 'stale', date: null, dataDisplay: null
    } });
    expect(connected).toBeTrue();
    expect(received).not.toHaveBeenCalled();
    tick(6000);
    expect(RealtimeFakeSocket.sockets.length).toBe(2);
    expect(localStorage.getItem('t')).toBe(tokenB);
    expect(old).not.toBe(tokenB);
  }));

  it('backs off repeated failures, resets after AUTH, and cancels pending reconnect on logout', fakeAsync(() => {
    expect([0, 1, 2, 3, 4, 9].map(chatReconnectDelayMs))
      .toEqual([3000, 6000, 12000, 24000, 30000, 30000]);

    service.connect();
    RealtimeFakeSocket.sockets[0].closed();
    tick(2999);
    expect(RealtimeFakeSocket.sockets.length).toBe(1);
    tick(1);
    expect(RealtimeFakeSocket.sockets.length).toBe(2);
    RealtimeFakeSocket.sockets[1].closed();
    tick(5999);
    expect(RealtimeFakeSocket.sockets.length).toBe(2);
    tick(1);
    expect(RealtimeFakeSocket.sockets.length).toBe(3);
    const third = RealtimeFakeSocket.sockets[2];
    third.open();
    third.receive({ type: 'AUTHENTICATED' });
    third.closed();
    tick(3000);
    expect(RealtimeFakeSocket.sockets.length).toBe(4);

    RealtimeFakeSocket.sockets[3].closed();
    service.disconnect();
    tick(60000);
    expect(RealtimeFakeSocket.sockets.length).toBe(4);
  }));

  it('does not retry an explicit invalid-token close (gateway 1003)', fakeAsync(() => {
    service.connect();
    RealtimeFakeSocket.sockets[0].closed(1003);
    tick(60000);
    expect(RealtimeFakeSocket.sockets.length).toBe(1);
    service.connect();
    expect(RealtimeFakeSocket.sockets.length).toBe(2);
  }));
});
