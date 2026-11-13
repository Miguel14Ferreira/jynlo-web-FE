import { of, Subject, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { CommunitiesComponent } from './communities.component';
import { CommunityTimelineEntry } from '../../services/community-timeline.service';

describe('Community feed/chat UI state isolation', () => {
  let component: CommunitiesComponent;
  let list: jasmine.Spy;
  let send: jasmine.Spy;
  let sendPostWithMedia: jasmine.Spy;
  let sendPostAlbum: jasmine.Spy;
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
    component.feedGallery = [];
    component.chatDraft = '';
    (component as any).timelineRequestVersion = 0;
    (component as any).chatEventsDuringLoad = new Map();
    list = jasmine.createSpy('list').and.returnValue(of([]));
    send = jasmine.createSpy('send').and.returnValue(of(message('POST')));
    sendPostWithMedia = jasmine.createSpy('sendPostWithMedia').and.returnValue(of(message('POST')));
    sendPostAlbum = jasmine.createSpy('sendPostAlbum').and.returnValue(of(message('POST')));
    remove = jasmine.createSpy('delete').and.returnValue(of(undefined));
    (component as any).timelineService = { list, send, sendPostWithMedia, sendPostAlbum, delete: remove };
    (component as any).router = { navigate: jasmine.createSpy('navigate').and.returnValue(Promise.resolve(true)) };
    spyOn(component, 'canManage').and.returnValue(true);
  });

  it('shows one community album item at a time with isolated navigation and stable cover', () => {
    component.communityPostMediaIndex = {};
    const first = { ...message('POST'), id: 20, imageUrl: '/media/first.jpg',
      extraMedia: [{ url: '/media/video.mp4', mimeType: 'video/mp4' },
                   { url: '/media/last.jpg', mimeType: 'image/jpeg' }] };
    const second = { ...message('POST'), id: 21, imageUrl: '/media/second.jpg',
      extraMedia: [{ url: '/media/extra.jpg', mimeType: 'image/jpeg' }] };
    expect(component.communityPostMedia(first)).toHaveSize(3);
    expect(component.communityPostCurrentIndex(first)).toBe(0);
    component.changeCommunityPostMedia(first, 1);
    expect(component.communityPostCurrentIndex(first)).toBe(1);
    expect(component.communityPostCurrentIndex(second)).toBe(0);
    expect(component.communityPostMedia(first)[1].mimeType).toBe('video/mp4');
    component.changeCommunityPostMedia(first, 1);
    component.changeCommunityPostMedia(first, 1);
    expect(component.communityPostCurrentIndex(first)).toBe(2);
    component.selectCommunityPostMedia(first, -1);
    expect(component.communityPostCurrentIndex(first)).toBe(2);
    component.startCommunityPostSwipe({
      changedTouches: [{ clientX: 150, clientY: 20 }]
    } as unknown as TouchEvent, first);
    component.endCommunityPostSwipe({
      changedTouches: [{ clientX: 40, clientY: 30 }]
    } as unknown as TouchEvent, first);
    expect(component.communityPostCurrentIndex(first)).toBe(2);
    component.startCommunityPostSwipe({
      changedTouches: [{ clientX: 40, clientY: 20 }]
    } as unknown as TouchEvent, first);
    component.endCommunityPostSwipe({
      changedTouches: [{ clientX: 150, clientY: 30 }]
    } as unknown as TouchEvent, first);
    expect(component.communityPostCurrentIndex(first)).toBe(1);
  });

  it('reorders community album cover and preserves exact upload order', () => {
    const first = new File(['a'], 'first.jpg', { type: 'image/jpeg' });
    const cover = new File(['b'], 'cover.jpg', { type: 'image/jpeg' });
    component.feedGallery = [
      { file: first, url: 'blob:first' },
      { file: cover, url: 'blob:cover' }
    ];
    component.activeTab = 'feed';
    component.moveCommunityFeedGalleryItem(1, -1);
    expect(component.feedGallery.map(item => item.file.name)).toEqual(['cover.jpg', 'first.jpg']);
    component.moveCommunityFeedGalleryItem(0, -1);
    expect(component.feedGallery[0].file).toBe(cover);
    component.feedDraft = '';
    spyOn(URL, 'revokeObjectURL').and.stub();
    component.sendTimeline();
    expect(sendPostAlbum).toHaveBeenCalledWith(7, '', [cover, first]);
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

  it('uses the compatible single-image endpoint when only one album photo was selected', () => {
    const photo=new File(['photo'], 'MF.jpg', {type:'image/jpeg'});
    component.activeTab='feed';
    component.feedGallery=[{file:photo,url:'blob:test-photo'}];
    spyOn(component,'loadTimeline');
    component.sendTimeline();
    expect(sendPostWithMedia).toHaveBeenCalledOnceWith(7,'',photo,undefined);
    expect(sendPostAlbum).not.toHaveBeenCalled();
    expect(component.feedGallery.length).toBe(0);
  });

  it('keeps the batch endpoint for multiple photos or mixed videos', () => {
    const photo=new File(['photo'],'1.jpg',{type:'image/jpeg'});
    const video=new File(['video'],'2.mp4',{type:'video/mp4'});
    component.activeTab='feed';
    component.feedGallery=[{file:photo,url:'blob:a'},{file:video,url:'blob:b'}];
    spyOn(component,'loadTimeline');
    component.sendTimeline();
    expect(sendPostAlbum).toHaveBeenCalledOnceWith(7,'',[photo,video]);
    expect(sendPostWithMedia).not.toHaveBeenCalled();
  });

  it('preserves a failed photo and gives a useful server error instead of losing the draft', () => {
    const photo=new File(['photo'],'MF.jpg',{type:'image/jpeg'});
    component.activeTab='feed';
    component.feedGallery=[{file:photo,url:'blob:photo'}];
    component.feedDraft='Foto do jogo';
    sendPostWithMedia.and.returnValue(throwError(()=>new HttpErrorResponse({status:413})));
    component.sendTimeline();
    expect(component.timelineError).toContain('demasiado grande');
    expect(component.feedDraft).toBe('Foto do jogo');
    expect(component.feedGallery.length).toBe(1);
    expect(component.timelineSending).toBeFalse();
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
