import { of, Subject } from 'rxjs';
import { CommunitiesComponent } from './communities.component';
import { CommunityTimelineEntry } from '../../services/community-timeline.service';

describe('Community feed/chat UI state isolation', () => {
  let component: CommunitiesComponent;
  let list: jasmine.Spy;
  let send: jasmine.Spy;
  let sendPostWithMedia: jasmine.Spy;
  let remove: jasmine.Spy;

  const message = (kind: 'POST' | 'CHAT'): CommunityTimelineEntry => ({
    id: 18, communityId: 7, kind, username: 'ana', body: 'Olá!',
    createdAt: '2026-10-22T10:00:00Z'
  });

  beforeEach(() => {
    component = Object.create(CommunitiesComponent.prototype) as CommunitiesComponent;
    component.selected = { id: 7, myRole: 'OWNER' } as any;
    component.activeTab = 'home';
    component.timelineEntries = [];
    component.timelineLoading = false;
    component.timelineSending = false;
    component.timelineDeletingId = null;
    component.timelineError = '';
    component.feedDraft = '';
    component.chatDraft = '';
    (component as any).timelineRequestVersion = 0;
    (component as any).chatEventsDuringLoad = new Map();
    list = jasmine.createSpy('list').and.returnValue(of([]));
    send = jasmine.createSpy('send').and.returnValue(of(message('POST')));
    sendPostWithMedia = jasmine.createSpy('sendPostWithMedia').and.returnValue(of(message('POST')));
    remove = jasmine.createSpy('delete').and.returnValue(of(undefined));
    (component as any).timelineService = { list, send, sendPostWithMedia, delete: remove };
    (component as any).router = { navigate: jasmine.createSpy('navigate').and.returnValue(Promise.resolve(true)) };
    spyOn(component, 'canManage').and.returnValue(true);
  });

  it('loads the feed and community chat separately without leaving the page', () => {
    component.setTab('home');
    expect(list).not.toHaveBeenCalled();
    component.setTab('feed');
    expect(list).toHaveBeenCalledWith(7, 'POST');
    component.setTab('chat');
    expect(list).toHaveBeenCalledWith(7, 'CHAT');
    expect(list).toHaveBeenCalledTimes(2);
    expect(component.activeTab).toBe('chat');
    expect((component as any).router.navigate).not.toHaveBeenCalled();
  });

  it('discards stale feed responses after switching to the local chat', () => {
    const earlier = new Subject<CommunityTimelineEntry[]>();
    list.and.callFake((_id: number, kind: string) =>
      kind === 'POST' ? earlier.asObservable() : of([message('CHAT')]));
    component.setTab('feed');
    component.setTab('chat');
    earlier.next([message('POST')]);
    earlier.complete();
    expect(component.timelineEntries.map(item => item.kind)).toEqual(['CHAT']);
    expect(list).toHaveBeenCalledTimes(2);
    expect(component.timelineLoading).toBeFalse();
  });

  it('sends chat text to chat only and clears draft on success', () => {
    component.activeTab = 'chat';
    component.chatDraft = '  Até já!  ';
    send.and.returnValue(of(message('CHAT')));
    spyOn(component, 'loadTimeline');
    component.sendTimeline();
    expect(send).toHaveBeenCalledWith(7, 'CHAT', 'Até já!');
    expect(component.chatDraft).toBe('');
    expect(component.feedDraft).toBe('');
    expect(component.loadTimeline).toHaveBeenCalled();
  });

  it('never submits empty or oversized messages', () => {
    component.activeTab = 'feed';
    component.feedDraft = '  ';
    component.sendTimeline();
    component.feedDraft = 'x'.repeat(1001);
    component.sendTimeline();
    component.activeTab = 'chat';
    component.chatDraft = 'x'.repeat(2001);
    component.sendTimeline();
    expect(send).not.toHaveBeenCalled();
  });

  it('sends image-only posts as multipart media without writing to community chat', () => {
    const photo = new File(['test'], 'match.jpg', { type: 'image/jpeg' });
    component.activeTab = 'feed';
    component.feedImageFile = photo;
    component.feedDraft = '';
    spyOn(component, 'loadTimeline');
    component.sendTimeline();
    expect(sendPostWithMedia).toHaveBeenCalledOnceWith(7, '', photo, undefined);
    expect(send).not.toHaveBeenCalled();
    expect(component.feedImageFile).toBeUndefined();
    expect(component.loadTimeline).toHaveBeenCalled();
  });

  it('uses the same upload for video and preserves failed media for retry', () => {
    const video = new File(['test'], 'match.mp4', { type: 'video/mp4' });
    component.activeTab = 'feed';
    component.feedVideoFile = video;
    component.feedDraft = '  Grande jogo  ';
    expect(component.canPublishCommunityPost).toBeTrue();
    spyOn(component, 'loadTimeline');
    component.sendTimeline();
    expect(sendPostWithMedia).toHaveBeenCalledOnceWith(7, 'Grande jogo', undefined, video);
    expect(component.feedVideoFile).toBeUndefined();
    expect(component.feedDraft).toBe('');
  });

  it('shows the community member name and picture in a post, with a safe fallback', () => {
    component.selected = { id: 7, myRole: 'MEMBER', members: [{
      profileId: 10, username: 'ana', fullName: 'Ana Ferreira',
      profilePicUrl: 'https://example.test/ana.jpg', role: 'MEMBER'
    }] } as any;

    expect(component.communityFeedAuthorName('ANA')).toBe('Ana Ferreira');
    expect(component.communityFeedAvatar('ana')).toBe('https://example.test/ana.jpg');
    expect(component.communityFeedInitials('ana')).toBe('AF');
    expect(component.communityFeedAuthorName('desconhecido')).toBe('desconhecido');
    expect(component.communityFeedInitials('desconhecido')).toBe('D');
    expect(component.communityFeedAvatar('desconhecido')).toBeNull();
  });

  it('allows an author to delete their own community post without manager permissions', () => {
    component.activeTab = 'feed';
    (component.canManage as jasmine.Spy).and.returnValue(false);
    const authorCheck = spyOn(component, 'isMyChatEntry').and.returnValue(true);
    spyOn(component, 'loadTimeline');
    const entry = message('POST');

    expect(component.canDeleteCommunityPost(entry)).toBeTrue();
    component.deleteTimeline(entry);
    expect(remove).toHaveBeenCalledOnceWith(7, 'POST', 18);

    authorCheck.and.returnValue(false);
    remove.calls.reset();
    expect(component.canDeleteCommunityPost(entry)).toBeFalse();
    component.deleteTimeline(entry);
    expect(remove).not.toHaveBeenCalled();
  });

  it('allows a manager to remove an item from this community and tab', () => {
    component.activeTab = 'feed';
    spyOn(component, 'loadTimeline');
    component.deleteTimeline(message('POST'));
    expect(remove).toHaveBeenCalledWith(7, 'POST', 18);
    expect(component.loadTimeline).toHaveBeenCalled();

    remove.calls.reset();
    component.deleteTimeline({ ...message('POST'), communityId: 8 });
    expect(remove).not.toHaveBeenCalled();
    (component.canManage as jasmine.Spy).and.returnValue(false);
    component.deleteTimeline(message('POST'));
    expect(remove).not.toHaveBeenCalled();
  });
});
