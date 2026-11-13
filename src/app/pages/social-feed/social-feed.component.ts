import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, HostListener, OnDestroy, OnInit, Optional, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subject, auditTime, catchError, finalize, forkJoin, of, retry, switchMap, takeUntil, timeout, timer, interval } from 'rxjs';

import { environment } from 'src/environment/environment';
import { appTranslate as t } from '../../i18n/i18n.service';
import { AuthenticationService } from '../../services/authethication.service';
import { SocialFeedService } from '../../services/social-feed.service';
import { DirectChatRealtimeService } from '../../services/direct-chat-realtime.service';
import { DirectChatService } from '../../services/direct-chat.service';
import { CommunityService } from '../../services/community.service';
import { CommunityGroupsService } from '../../services/community-groups.service';
import { CommunityGroup } from '../model/community-group';
import { MySessionsResponse } from '../model/my-sessions-response';
import { nextWeekGames, nextWeekWaitlist, weekOffers } from './my-sports-week';
import { SessionService } from '../../services/session.service';
import { SessionSummary } from '../model/session-summary';
import { FeedItem, SocialComment } from '../model/feed-item';
import { FollowProfile } from '../model/follow';
import { CommunityProfile } from '../model/community-profile';
import { FriendSummary } from '../model/friend-summary';
import { VenueService } from '../../services/venue.service';
import { Venue } from '../model/venue';
import { RealPlace, RealPlaceSearchService } from '../../services/real-place-search.service';
import { addTextToPhoto } from './social-photo-text';
import { TextPlacement } from './movable-text.component';
import { CommunityLiveEvent, CommunityLiveService } from '../../services/community-live.service';
import { PersonalLiveEvent, PersonalLiveService } from '../../services/personal-live.service';

@Component({
  selector: 'app-social-feed',
  templateUrl: './social-feed.component.html',
  styleUrls: ['./social-feed.component.css', './social-feed-concept-one-refresh.css', './social-feed-neon-glass.css', './social-feed-action-polish.css', './feed-create-entry.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class SocialFeedComponent implements OnInit, OnDestroy {
  items: FeedItem[] = [];

  // A viewer may hide any feed entry without deleting the author's content.
  // These browser-local preferences are isolated by the logged-in username.
  private hiddenFeedEntries = new Set<string>();
  recentlyHiddenFeedEntry: string | null = null;

  private get hiddenFeedStorageKey(): string {
    return 'jynlo:hidden-feed:v1:' + this.currentUsername.toLocaleLowerCase();
  }

  private loadHiddenFeedEntries(): void {
    if (!this.currentUsername || typeof localStorage === 'undefined') return;
    try {
      const value: unknown = JSON.parse(localStorage.getItem(this.hiddenFeedStorageKey) || '[]');
      this.hiddenFeedEntries = new Set(
        Array.isArray(value)
          ? value.filter((key): key is string => typeof key === 'string' && key.length <= 150).slice(-500)
          : []
      );
    } catch {
      this.hiddenFeedEntries = new Set();
    }
  }

  private persistHiddenFeedEntries(): void {
    if (!this.currentUsername || typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(this.hiddenFeedStorageKey, JSON.stringify([...this.hiddenFeedEntries].slice(-500)));
    } catch {
      // Storage may be disabled; hiding still applies to the current view.
    }
  }

  private feedEntryKey(item: FeedItem): string | null {
    if (item.type === 'POST' && Number.isSafeInteger(item.postId) && (item.postId ?? 0) > 0)
      return 'post:' + item.postId;
    if (item.type === 'SESSION_ATTENDED' && Number.isSafeInteger(item.sessionId) && (item.sessionId ?? 0) > 0)
      return 'attendance:' + item.sessionId;
    if (item.type === 'SESSION_CREATED' && Number.isSafeInteger(item.sessionId) && (item.sessionId ?? 0) > 0)
      return 'created:' + item.sessionId + ':' + item.authorUsername;
    return null;
  }

  hidingFeedPostId: number | null = null;
  private lastHiddenPostId: number | null = null;

  hideFromMyFeed(item: FeedItem): void {
    const key = this.feedEntryKey(item);
    if (!this.currentUsername || !key || this.hidingFeedPostId !== null) return;
    if (item.type === 'POST' && item.postId !== null) {
      const postId = item.postId;
      this.hidingFeedPostId = postId;
      this.actionError = '';
      this.feedService.hidePost(postId)
        .pipe(timeout(10_000), finalize(() => this.hidingFeedPostId = null))
        .subscribe({
          next: () => {
            this.hiddenFeedEntries.add(key);
            this.lastHiddenPostId = postId;
            this.recentlyHiddenFeedEntry = key;
            this.persistHiddenFeedEntries();
          },
          error: () => this.actionError = 'Não foi possível ocultar esta publicação. Tenta novamente.'
        });
      return;
    }
    this.hiddenFeedEntries.add(key);
    this.lastHiddenPostId = null;
    this.recentlyHiddenFeedEntry = key;
    this.persistHiddenFeedEntries();
  }

  undoHideFromMyFeed(): void {
    const key = this.recentlyHiddenFeedEntry;
    if (!key || this.hidingFeedPostId !== null) return;
    if (this.lastHiddenPostId !== null) {
      const postId = this.lastHiddenPostId;
      this.hidingFeedPostId = postId;
      this.actionError = '';
      this.feedService.restoreHiddenPost(postId)
        .pipe(timeout(10_000), finalize(() => this.hidingFeedPostId = null))
        .subscribe({
          next: () => {
            this.hiddenFeedEntries.delete(key);
            this.recentlyHiddenFeedEntry = null;
            this.lastHiddenPostId = null;
            this.persistHiddenFeedEntries();
            // A server-side hide removes the post from subsequent feed responses.
            // Reload the authorized feed to retrieve it when undoing.
            this.load();
          },
          error: () => this.actionError = 'Não foi possível repor a publicação. Tenta novamente.'
        });
      return;
    }
    this.hiddenFeedEntries.delete(key);
    this.recentlyHiddenFeedEntry = null;
    this.persistHiddenFeedEntries();
  }

  hiddenPostsPanelOpen = false;
  hiddenPostsLoading = false;
  hiddenPostsList: FeedItem[] = [];
  hiddenPostsError = '';
  restoringHiddenPostId: number | null = null;

  toggleHiddenPostsPanel(): void {
    this.hiddenPostsPanelOpen = !this.hiddenPostsPanelOpen;
    if (!this.hiddenPostsPanelOpen) return;
    this.hiddenPostsLoading = true;
    this.hiddenPostsError = '';
    this.feedService.hiddenPosts()
      .pipe(timeout(10_000), finalize(() => this.hiddenPostsLoading = false))
      .subscribe({
        next: posts => this.hiddenPostsList = posts,
        error: () => this.hiddenPostsError = 'Não foi possível consultar as publicações ocultas.'
      });
  }

  restoreHiddenPostFromPanel(postId: number): void {
    if (this.restoringHiddenPostId !== null) return;
    this.restoringHiddenPostId = postId;
    this.hiddenPostsError = '';
    this.feedService.restoreHiddenPost(postId)
      .pipe(timeout(10_000), finalize(() => this.restoringHiddenPostId = null))
      .subscribe({
        next: () => {
          this.hiddenPostsList = this.hiddenPostsList.filter(post => post.postId !== postId);
          this.hiddenFeedEntries.delete('post:' + postId);
          if (this.recentlyHiddenFeedEntry === 'post:' + postId) {
            this.recentlyHiddenFeedEntry = null;
            this.lastHiddenPostId = null;
          }
          this.persistHiddenFeedEntries();
          this.load();
        },
        error: () => this.hiddenPostsError = 'Não foi possível repor a publicação. Tenta novamente.'
      });
  }

  get visibleFeedItems(): FeedItem[] {
    return this.items.filter(item => {
      const key = this.feedEntryKey(item);
      return !key || !this.hiddenFeedEntries.has(key);
    });
  }

  // Automatic attendance is a compact, session-level update rather than
  // one full-sized publication per participant. Only use entries already
  // returned by the permission-filtered feed endpoint.
  get attendanceGroups(): Array<{ sessionId: number; item: FeedItem; count: number; ownActivity?: FeedItem }> {
    const groups = new Map<number, { sessionId: number; item: FeedItem; usernames: Set<string>; ownActivity?: FeedItem }>();
    for (const item of this.visibleFeedItems) {
      if (item.type !== 'SESSION_ATTENDED' || !Number.isSafeInteger(item.sessionId) || (item.sessionId ?? 0) <= 0) continue;
      const sessionId = item.sessionId as number;
      let group = groups.get(sessionId);
      if (!group) {
        group = { sessionId, item, usernames: new Set<string>() };
        groups.set(sessionId, group);
      }
      group.usernames.add(item.authorUsername);
      if (item.authorUsername === this.currentUsername) group.ownActivity = item;
    }
    return Array.from(groups.values()).map(group => ({
      sessionId: group.sessionId, item: group.item,
      count: group.usernames.size, ownActivity: group.ownActivity
    }));
  }

  showAllAttendance = false;

  get displayedAttendanceGroups() {
    const groups = this.attendanceGroups;
    return this.showAllAttendance ? groups : groups.slice(0, 5);
  }

  get fullFeedItems(): FeedItem[] {
    return this.visibleFeedItems.filter(item =>
      item.type !== 'SESSION_ATTENDED' ||
      !Number.isSafeInteger(item.sessionId) || (item.sessionId ?? 0) <= 0);
  }
  likersPostId: number | null = null;
  likersList: FollowProfile[] = [];
  likersLoading = false;
  likersError = false;
  likerPreview: Record<number, string> = {};
  likersPrivacySavingId: number | null = null;
  postComposerOpen = false;
  postComposerPrivacy = 'PUBLIC';
  postComposerTagAi = false;

  openPostComposer(): void {
    this.postComposerOpen = true;
  }

  closePostComposer(): void {
    if (this.posting) return;
    // Closing the overlay never discards a draft or any uploaded photos.
    this.postComposerOpen = false;
  }

  @HostListener('document:keydown.escape')
  closePostComposerOnEscape(): void {
    if (this.postComposerOpen) this.closePostComposer();
  }

  private readonly personalLiveService=inject(PersonalLiveService);
  liveMode: 'PERSONAL' | 'COMMUNITY' = 'PERSONAL';
  personalLiveEvents: PersonalLiveEvent[] = [];
  personalLiveRoom: PersonalLiveEvent | null = null;
  private personalLiveDeepLinkSeen=false;
  personalLiveError = '';

  refreshPersonalLive(): void {
    this.personalLiveService.active().pipe(timeout(10000),
      catchError(() => of([] as PersonalLiveEvent[])), takeUntil(this.destroyed))
      .subscribe(events => {
        this.personalLiveEvents = events;
        if (!this.personalLiveDeepLinkSeen) {
          const raw=this.route.snapshot.queryParamMap.get('personalLive');
          if (raw && /^[1-9][0-9]{0,12}$/.test(raw)) {
            const match=events.find(event=>event.id===Number(raw));
            if(match) {
              this.personalLiveDeepLinkSeen=true;
              this.watchPersonalLive(match);
            }
          }
        }
      });
  }
  watchPersonalLive(event: PersonalLiveEvent): void {
    if (event.status !== 'LIVE') return;
    this.personalLiveRoom=event;
  }
  closePersonalLiveRoom(): void {
    this.personalLiveRoom=null;
    this.refreshPersonalLive();
  }
  liveComposerOpen = false;
  liveCommunityId: number | null = null;
  liveTitle = '';
  liveBusy = false;
  liveStartError = '';

  openLiveComposer(): void {
    this.liveMode = 'PERSONAL';
    this.liveCommunityId = this.managedLiveCommunities[0]?.id ?? null;
    this.liveTitle = 'Direto desportivo';
    this.liveStartError = '';
    this.liveComposerOpen = true;
  }

  closeLiveComposer(): void {
    if (this.liveBusy) return;
    this.liveComposerOpen = false;
  }

  startLiveFromFeed(): void {
    if (this.liveBusy) return;
    const title=this.liveTitle.trim();
    if (!title) {
      this.liveStartError='Escreve o título do direto.';
      return;
    }
    if (this.liveMode === 'PERSONAL') {
      this.liveBusy=true;
      this.liveStartError='';
      this.personalLiveService.start(title).pipe(timeout(12000),
        finalize(()=>this.liveBusy=false),takeUntil(this.destroyed)).subscribe({
        next:event=>{
          this.liveComposerOpen=false;
          this.personalLiveRoom=event;
          this.refreshPersonalLive();
        },
        error:()=>this.liveStartError='Não foi possível iniciar o teu direto. Confirma se já tens uma transmissão ativa.'
      });
      return;
    }
    const communityId = this.liveCommunityId;
    if (!communityId || this.liveBusy || !this.communityLiveService ||
        !this.managedLiveCommunities.some(group => group.id === communityId)) return;
    const title = this.liveTitle.trim();
    if (!title) {
      this.liveStartError = 'Escreve o título do direto.';
      return;
    }
    this.liveBusy = true;
    this.liveStartError = '';
    this.communityLiveService.capabilities(communityId).pipe(
      timeout(12000),
      switchMap(capabilities => {
        if (!capabilities.enabled || !capabilities.canManage)
          throw new Error('Sem permissão para iniciar diretos nesta comunidade.');
        return this.communityLiveService!.list(communityId).pipe(timeout(12000));
      }),
      switchMap(events => {
        if (events.some(event => event.status === 'LIVE'))
          throw new Error('Já existe um direto ativo nesta comunidade.');
        return this.communityLiveService!.schedule(communityId, title, '', new Date().toISOString())
          .pipe(timeout(12000));
      }),
      switchMap(scheduled => this.communityLiveService!.start(communityId, scheduled.id).pipe(timeout(12000))),
      finalize(() => this.liveBusy = false),
      takeUntil(this.destroyed)
    ).subscribe({
      next: event => {
        this.liveComposerOpen = false;
        // Opening the broadcast does not silently enable microphone/camera.
        // The presenter enters the active room from the community Live panel.
        window.location.assign('/menu/communities?community=' + communityId +
          '&tab=feed&liveEvent=' + event.id);
      },
      error: error => {
        this.liveStartError = error instanceof Error && error.message.startsWith('Sem permissão')
          ? error.message
          : error instanceof Error && error.message.startsWith('Já existe')
            ? error.message : 'Não foi possível iniciar o direto. Tenta novamente.';
      }
    });
  }

  publicLiveEvents: { communityName: string; event: CommunityLiveEvent }[] = [];
  liveDiscoveryLoading = false;

  private loadAccessibleLiveEvents(groups: CommunityGroup[]): void {
    if (!this.communityLiveService || !groups.length) return;
    const visible = groups.filter(group => group.visibility === 'PUBLIC').slice(0, 12);
    if (!visible.length) return;
    this.liveDiscoveryLoading = true;
    forkJoin(visible.map(group => this.communityLiveService!.list(group.id).pipe(
      timeout(7_000),
      catchError(() => of([] as CommunityLiveEvent[])),
      switchMap(events => of(events.filter(event => event.status === 'LIVE')
        .map(event => ({ communityName: group.name, event }))))
    ))).pipe(takeUntil(this.destroyed)).subscribe({
      next: grouped => {
        this.publicLiveEvents = grouped.flat().slice(0, 6);
        this.liveDiscoveryLoading = false;
      },
      error: () => this.liveDiscoveryLoading = false
    });
  }

  private readonly realPlaceSearch = inject(RealPlaceSearchService);
  postLocationSuggestions: Venue[] = [];
  postRealPlaces: RealPlace[] = [];
  postLocationVerified = false;
  postLocationLoading = false;
  postLocationOpen = false;
  postLocationError = '';
  private postLocationQuerySerial = 0;

  /** Debounced real map search; typing alone never creates a location sticker. */
  onPostLocationQuery(value: string): void {
    const query = value.trim();
    this.postLocationVerified = false;
    this.postLocationOpen = query.length >= 2;
    this.postLocationSuggestions = [];
    this.postRealPlaces = [];
    this.postLocationError = '';
    const serial = ++this.postLocationQuerySerial;
    this.postLocationLoading = this.postLocationOpen;
    if (!this.postLocationOpen) return;
    timer(400).pipe(
      switchMap(() => this.realPlaceSearch.search(query).pipe(
        timeout(8000), catchError(() => of([] as RealPlace[])))),
      takeUntil(this.destroyed)
    ).subscribe(places => {
      if (serial !== this.postLocationQuerySerial || !this.postLocationOpen) return;
      this.postRealPlaces = places;
      this.postLocationLoading = false;
      if (!places.length) this.postLocationError =
        'Não foram encontrados locais verificados. Experimenta escrever o nome completo.';
    });
  }

  selectPostRealPlace(place: RealPlace): void {
    this.postLocation = [place.label, place.subtitle].filter(Boolean).join(', ').slice(0,160);
    this.postLocationVerified = true;
    this.postLocationOpen = false;
    this.postRealPlaces = [];
    this.postLocationQuerySerial++;
  }

  selectPostPlaceName(): void {
    this.postLocationError = 'Escolhe uma localização real da lista de sugestões.';
  }

  selectPostLocation(place: Venue): void {
    this.postLocation = [place.name, place.city].filter(Boolean).join(', ').slice(0,160);
    this.postLocationVerified = true;
    this.postLocationOpen = false;
    this.postLocationSuggestions = [];
    this.postLocationQuerySerial++;
  }

  postTagSearchOpen = false;
  postTagSuggestions: FriendSummary[] = [];
  postTagSearchLoading = false;
  private postTagProfiles: FriendSummary[] = [];

  openPostTagSearch(): void {
    this.postTagSearchOpen = !this.postTagSearchOpen;
    if (!this.postTagSearchOpen) return;
    this.postTagSearchLoading = true;
    // Do not fetch Jynlo's public profile directory for tagging.
    // Accepted, unblocked friendships are the only eligible suggestions.
    this.communityService.friends().pipe(
      timeout(10_000), catchError(() => of([] as FriendSummary[])),
      takeUntil(this.destroyed)
    ).subscribe(friends => {
      if (!this.postTagSearchOpen) return;
      this.postTagProfiles = friends.filter(friend =>
        !!friend.username && !friend.blockedByMe && !friend.chatBlocked
        && friend.username.toLowerCase() !== this.currentUsername.toLowerCase());
      this.searchPostTags(this.postTagQuery);
      this.postTagSearchLoading = false;
    });
  }

  photoTextEditorIndex: number | null = null;
  photoTextDraft = '';
  photoTextPosition: 'top' | 'center' | 'bottom' = 'center';
  photoTextInk: 'white' | 'yellow' | 'black' = 'white';
  photoTextBackground: 'dark' | 'light' | 'none' = 'dark';
  photoTextFont: 'modern' | 'classic' | 'mono' = 'modern';
  photoImageRotation = 0;
  photoImageZoom = 1;
  photoImageX = 0;
  photoImageY = 0;
  private activePhotoGesture: 'move' | 'rotate' | 'zoom' | null = null;
  private activePhotoPointer = -1;
  private photoGestureInitial = {x:0,y:0,rotation:0,zoom:1,clientX:0,clientY:0};
  private photoGestureDimensions = {width:1,height:1};

  beginPhotoGesture(event: PointerEvent, kind: 'move' | 'rotate' | 'zoom'): void {
    if (this.photoTextSaving || this.activePhotoGesture || event.button !== 0) return;
    const target = event.currentTarget as HTMLElement;
    const stage = target.closest('.feed-photo-direct-stage') as HTMLElement | null;
    const rect = stage?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return;
    event.preventDefault();
    event.stopPropagation();
    this.activePhotoGesture = kind;
    this.activePhotoPointer = event.pointerId;
    this.photoGestureInitial = {x:this.photoImageX,y:this.photoImageY,
      rotation:this.photoImageRotation,zoom:this.photoImageZoom,
      clientX:event.clientX,clientY:event.clientY};
    this.photoGestureDimensions = {width:rect.width,height:rect.height};
    target.setPointerCapture(event.pointerId);
  }
  movePhotoGesture(event: PointerEvent): void {
    if (!this.activePhotoGesture || event.pointerId !== this.activePhotoPointer) return;
    const dx = event.clientX-this.photoGestureInitial.clientX;
    const dy = event.clientY-this.photoGestureInitial.clientY;
    if (this.activePhotoGesture === 'move') {
      this.photoImageX = Math.max(-45,Math.min(45,this.photoGestureInitial.x+dx/this.photoGestureDimensions.width*100));
      this.photoImageY = Math.max(-45,Math.min(45,this.photoGestureInitial.y+dy/this.photoGestureDimensions.height*100));
    } else if (this.activePhotoGesture === 'rotate') {
      this.photoImageRotation = Math.max(-180,Math.min(180,
        this.photoGestureInitial.rotation+Math.round(dx)));
    } else {
      this.photoImageZoom = Math.max(.4,Math.min(2,
        this.photoGestureInitial.zoom+(dx+dy)/Math.min(
          this.photoGestureDimensions.width,this.photoGestureDimensions.height)));
    }
  }
  finishPhotoGesture(event: PointerEvent): void {
    if (event.pointerId !== this.activePhotoPointer) return;
    this.activePhotoGesture = null;
    this.activePhotoPointer = -1;
  }

  get photoTextColor(): string {
    return this.photoTextInk === 'black' ? '#020617' : this.photoTextInk === 'yellow' ? '#fef08a' : '#ffffff';
  }
  get photoTextBackdrop(): string {
    return this.photoTextBackground === 'none' ? 'transparent'
      : this.photoTextBackground === 'light'
        || (this.photoTextBackground === 'dark' && this.photoTextInk === 'black')
        ? 'rgba(255,255,255,.86)' : 'rgba(1,9,20,.68)';
  }
  get photoTextFontFamily(): string {
    return this.photoTextFont === 'classic' ? 'Georgia,serif'
      : this.photoTextFont === 'mono' ? 'monospace' : 'system-ui,sans-serif';
  }
  photoTextPlacement: TextPlacement = {x:50,y:50,rotation:0,scale:1};
  photoTextPreview = '';
  photoTextAspect = '4 / 3';
  resetPhotoEditor(): void {
    this.photoTextPlacement = {x:50,y:50,rotation:0,scale:1};
    this.photoImageRotation = 0;
    this.photoImageZoom = 1;
    this.photoImageX = 0;
    this.photoImageY = 0;
    this.photoTextInk = 'white';
    this.photoTextBackground = 'dark';
    this.photoTextFont = 'modern';
    this.photoTextError = '';
  }

  photoTextSaving = false;
  photoTextError = '';

  openPhotoTextEditor(index: number): void {
    const file = index === -1 ? this.postImageFile : this.postGallery[index]?.file;
    if (!file || !file.type.startsWith('image/') || this.posting) return;
    this.photoTextEditorIndex = index;
    this.photoTextDraft = '';
    this.photoTextPlacement = {x:50,y:50,rotation:0,scale:1};
    this.photoTextInk = 'white';
    this.photoTextBackground = 'dark';
    this.photoTextFont = 'modern';
    this.photoImageRotation = 0;
    this.photoImageZoom = 1;
    this.photoImageX = 0;
    this.photoImageY = 0;
    if (this.photoTextPreview) URL.revokeObjectURL(this.photoTextPreview);
    this.photoTextPreview = URL.createObjectURL(file);
    this.photoTextAspect = '4 / 3';
    const previewUrl = this.photoTextPreview;
    const image = new Image();
    image.onload = () => {
      if (this.photoTextPreview === previewUrl && image.naturalWidth && image.naturalHeight)
        this.photoTextAspect = image.naturalWidth + ' / ' + image.naturalHeight;
    };
    image.src = previewUrl;
    this.photoTextError = '';
  }

  closePhotoTextEditor(): void {
    if (this.photoTextSaving) return;
    this.photoTextEditorIndex = null;
    if (this.photoTextPreview) URL.revokeObjectURL(this.photoTextPreview);
    this.photoTextPreview = '';
    this.photoTextError = '';
  }

  async savePhotoText(): Promise<void> {
    const index = this.photoTextEditorIndex;
    if (index === null || this.posting || this.photoTextSaving) return;
    const input = index === -1 ? this.postImageFile : this.postGallery[index]?.file;
    if (!input || !this.photoTextDraft.trim()) return;
    this.photoTextSaving = true;
    this.photoTextError = '';
    try {
      const image = await addTextToPhoto(input, this.photoTextDraft,
        this.photoTextPosition, this.photoTextInk, this.photoTextPlacement,
        this.photoTextBackground, this.photoTextFont,
        { rotation: this.photoImageRotation, zoom: this.photoImageZoom,
          x: this.photoImageX, y: this.photoImageY });
      if (index === -1) {
        this.postImageFile = image;
        const reader = new FileReader();
        reader.onload = () => this.postImagePreview = typeof reader.result === 'string' ? reader.result : '';
        reader.readAsDataURL(image);
      } else if (this.postGallery[index]) {
        URL.revokeObjectURL(this.postGallery[index].url);
        this.postGallery[index] = { file: image, url: URL.createObjectURL(image) };
      }
      this.photoTextEditorIndex = null;
      if (this.photoTextPreview) URL.revokeObjectURL(this.photoTextPreview);
      this.photoTextPreview = '';
    } catch (error) {
      this.photoTextError = error instanceof Error ? error.message : 'Não foi possível editar a fotografia.';
    } finally {
      this.photoTextSaving = false;
    }
  }

  postTagQuery = '';

  searchPostTags(query: string): void {
    const needle = query.trim().replace(/^@/, '').toLocaleLowerCase();
    this.postTagSuggestions = this.postTagProfiles.filter(profile =>
      profile.username.toLocaleLowerCase().includes(needle)
      || (profile.fullName || '').toLocaleLowerCase().includes(needle)).slice(0, 8);
  }

  tagPostProfile(profile: FriendSummary): void {
    const mention = '@' + profile.username;
    if (!this.postContent.includes(mention) && this.postContent.length + mention.length + 1 <= 1000) {
      this.postContent += (this.postContent.trim() ? ' ' : '') + mention + ' ';
    }
    this.postTagQuery = '';
    this.postTagSearchOpen = false;
  }

  postContent = '';
  postLocation = '';
  postImageFile?: File;
  postImagePreview = '';
  postVideoFile?: File;
  postVideoPreview = '';
  postGallery: { file: File; url: string }[] = [];
  postGalleryIndex = 0;
  galleryTouchStartX: number | null = null;
  showPostGallery(index: number): void {
    if (index >= 0 && index < this.postGallery.length) this.postGalleryIndex = index;
  }
  shiftPostGallery(step: number): void {
    if (!this.postGallery.length) return;
    this.postGalleryIndex = (this.postGalleryIndex + step + this.postGallery.length) % this.postGallery.length;
  }
  onComposerGalleryTouchStart(event: TouchEvent): void {
    this.galleryTouchStartX = event.changedTouches[0]?.clientX ?? null;
  }
  onComposerGalleryTouchEnd(event: TouchEvent): void {
    if (this.galleryTouchStartX == null) return;
    const difference = (event.changedTouches[0]?.clientX ?? this.galleryTouchStartX) - this.galleryTouchStartX;
    if (Math.abs(difference) > 45) this.shiftPostGallery(difference < 0 ? 1 : -1);
    this.galleryTouchStartX = null;
  }

  // Populated only by verified deep links from session details.
  availableSessions: SessionSummary[] = [];
  private readonly destroyed = new Subject<void>();
  private readonly liveRefreshRequested = new Subject<void>();

  /**
   * Reconcile visible like/comment counters through the authorized HTTP feed.
   * Never replace or reorder on-screen cards merely because someone liked
   * one; this preserves scroll position and the user's open comment drafts.
   */
  private connectLiveCounters(): void {
    if (!this.realtime || !this.currentUsername) return;
    this.realtime.connect();
    this.realtime.socialFeedInvalidated$
      .pipe(takeUntil(this.destroyed))
      .subscribe(() => this.liveRefreshRequested.next());
    this.realtime.connected$
      .pipe(takeUntil(this.destroyed))
      .subscribe(connected => { if (connected) this.liveRefreshRequested.next(); });
    this.liveRefreshRequested.pipe(
      auditTime(750),
      switchMap(() => this.feedService.feed().pipe(
        timeout(10_000),
        catchError(() => of(null as FeedItem[] | null))
      )),
      takeUntil(this.destroyed)
    ).subscribe(latest => {
      if (!latest) return;
      const byPostId = new Map(latest.filter(item => item.postId !== null)
        .map(item => [item.postId, item]));
      for (const current of this.items) {
        if (current.postId === null || current.postId === this.interactionLoadingPostId) continue;
        const updated = byPostId.get(current.postId);
        if (!updated) continue;
        current.likeCount = updated.likeCount;
        current.likedByMe = updated.likedByMe;
        current.commentCount = updated.commentCount;
      }
    });
  }
  suggestedSessions: SessionSummary[] = [];
  suggestedPeople: CommunityProfile[] = [];

  // A minha semana: all entries come from existing, permission-checked APIs.
  myWeekGames: SessionSummary[] = [];

  // Only a session in the current user's created list may be promoted.
  // The detail view rechecks ownership and canSharePublicly from the backend.
  canPromoteWeekGame(session: SessionSummary): boolean {
    return !!this.myWeekMine?.created.some(created => created.id === session.id)
      && session.audience === 'PUBLIC'
      && !session.privateGame
      && session.status === 'OPEN'
      && session.maxParticipants > session.participantCount
      && Number.isFinite(Date.parse(session.gameDate))
      && Date.parse(session.gameDate) > Date.now();
  }
  myWeekWaitlist: SessionSummary[] = [];
  myWeekOffers: SessionSummary[] = [];
  myWeekCommunities: CommunityGroup[] = [];
  managedLiveCommunities: CommunityGroup[] = [];
  myWeekGamesLoading = true;
  myWeekGamesError = false;
  myWeekCommunitiesLoading = true;
  myWeekCommunitiesError = false;
  private myWeekMine: MySessionsResponse | null = null;
  private myWeekDiscovered: SessionSummary[] = [];
  private myWeekProfile: CommunityProfile | null = null;
  selectedSessionId: number | null = null;
  postGameSessionId: number | null = null;
  newSessionShareId: number | null = null;
  get newSessionForFeed(): SessionSummary | null {
    return this.newSessionShareId !== null && this.selectedSessionId === this.newSessionShareId
      ? this.availableSessions.find(session => session.id === this.newSessionShareId) ?? null
      : null;
  }

  detachNewSession(): void {
    if (this.posting || !this.newSessionForFeed) return;
    this.selectedSessionId = null;
    this.newSessionShareId = null;
  }

  get postGameSession(): SessionSummary | null {
    if (this.postGameSessionId === null || this.selectedSessionId !== this.postGameSessionId) {
      return null;
    }
    return this.availableSessions.find(session => session.id === this.postGameSessionId) ?? null;
  }

  detachPostGameSession(): void {
    if (this.posting || !this.postGameSession) {
      return;
    }
    this.selectedSessionId = null;
    this.postGameSessionId = null;
  }

  readonly postGamePromptKeys = [
    'feed.postGamePrompt.bestMoment',
    'feed.postGamePrompt.team',
    'feed.postGamePrompt.nextGame'
  ];
  loadingSessions = false;
  sessionSearchError = false;

  loading = false;
  posting = false;
  deletingPostId: number | null = null;
  hidingAttendanceSessionId: number | null = null;
  interactionLoadingPostId: number | null = null;
  deletingCommentId: number | null = null;
  reportingCommentId: number | null = null;
  reportedCommentIds = new Set<number>();
  reportingPostId: number | null = null;
  reportedPostIds = new Set<number>();
  openCommentPosts = new Set<number>();
  commentsByPost: Record<number, SocialComment[]> = {};
  commentDrafts: Record<number, string> = {};
  errorMessage = '';
  actionError = '';
  sharingSessionId: number | null = null;
  shareFeedbackSessionId: number | null = null;
  shareFeedbackMessage = '';
  manualShareItem: FeedItem | null = null;
  manualShareUrl = '';

  readonly currentUsername: string;
  showWelcomeHero = true;

  private updateWelcomeVisibility(): void {
    // Keep the first two feed visits welcoming without repeating a large banner forever.
    // The key is per account and per browser; storage failures leave the banner visible.
    if (!this.currentUsername || typeof localStorage === 'undefined') return;
    try {
      const key = 'jynlo:feed-welcome:v1:' + this.currentUsername.toLocaleLowerCase();
      const visits = Number(localStorage.getItem(key) ?? '0');
      const count = Number.isSafeInteger(visits) && visits >= 0 ? visits : 0;
      this.showWelcomeHero = count < 2;
      localStorage.setItem(key, String(Math.min(count + 1, 2)));
    } catch {
      this.showWelcomeHero = true;
    }
  }

  constructor(
    private feedService: SocialFeedService,
    private sessionService: SessionService,
    private authenticationService: AuthenticationService,
    private route: ActivatedRoute,
    private communityService: CommunityService,
    @Optional() private communityGroupsService: CommunityGroupsService | null = null,
    @Optional() private realtime: DirectChatRealtimeService | null = null,
    @Optional() private venueService: VenueService | null = null,
    @Optional() private communityLiveService: CommunityLiveService | null = null
  ) {
    this.authenticationService.isLoggedIn();
    this.currentUsername = this.authenticationService.loggedInPerfilname || '';
  }

  ngOnInit(): void {
    this.updateWelcomeVisibility();
    this.loadHiddenFeedEntries();
    this.load();
    this.connectLiveCounters();
    this.loadSuggestedPeople();
    this.preparePostGameMoment();
    this.prepareNewSessionShare();
    this.loadCompletedSessions();
    this.loadMyWeekCommunities();
    this.refreshPersonalLive();
    interval(20000).pipe(takeUntil(this.destroyed)).subscribe(() => this.refreshPersonalLive());
    // Suggestions and weekly vacancies still need discovery; the composer does not.
    this.loadingSessions = true;
    this.sessionService.discover({
      query: '', privateGame: false, availability: 'available', sort: 'date'
    }).pipe(
      timeout(10_000),
      catchError(() => of(null as SessionSummary[] | null)),
      takeUntil(this.destroyed)
    ).subscribe(sessions => {
      this.loadingSessions = false;
      if (sessions === null) {
        this.sessionSearchError = true;
        return;
      }
      this.myWeekDiscovered = sessions.filter(session => session.audience !== 'COMMUNITY_ONLY');
      this.refreshMyWeekOffers();
      this.suggestedSessions = this.myWeekDiscovered
        .filter(session => session.status?.toUpperCase() === 'OPEN'
          && !session.privateGame && session.participantCount < session.maxParticipants
          && !session.joinedByViewer && !session.waitlistedByViewer
          && Date.parse(session.gameDate) > Date.now())
        .sort((first, second) => Date.parse(first.gameDate) - Date.parse(second.gameDate))
        .slice(0, 3);
    });
  }

  private loadSuggestedPeople(): void {
    if (!this.currentUsername) {
      return;
    }
    this.communityService.publicProfile(this.currentUsername)
      .pipe(
        timeout(10_000),
        catchError(() => of(null as CommunityProfile | null)),
        switchMap(me => {
          this.myWeekProfile = me;
          this.refreshMyWeekOffers();
          return forkJoin({
          profiles: this.communityService.discoverProfiles().pipe(
            timeout(10_000),
            catchError(() => of([] as CommunityProfile[]))
          ),
          friends: this.communityService.friends().pipe(timeout(10_000))
        }).pipe(
          // Without the friends list, do not risk recommending existing friends.
          catchError(() => of({ profiles: [] as CommunityProfile[], friends: [] })),
          switchMap(({ profiles, friends }) => of(this.rankSuggestedPeople(
            profiles, me, new Set(friends.map(friend => friend.username.toLowerCase()))
          )))
        );
        }),
        takeUntil(this.destroyed)
      )
      .subscribe(profiles => this.suggestedPeople = profiles);
  }

  private loadMyWeekCommunities(): void {
    if (!this.communityGroupsService) {
      this.myWeekCommunitiesLoading = false;
      return;
    }
    this.communityGroupsService.mine().pipe(
      timeout(10_000), catchError(() => {
        this.myWeekCommunitiesError = true;
        return of([] as CommunityGroup[]);
      }), takeUntil(this.destroyed)
    ).subscribe(groups => {
      this.myWeekCommunities = groups.slice(0, 3);
      // Only community owners can create live broadcasts. Authorization remains
      // enforced by the live API after following the deep link.
      this.managedLiveCommunities = groups.filter(group => group.myRole === 'OWNER');
      this.loadAccessibleLiveEvents(groups);
      this.myWeekCommunitiesLoading = false;
    });
  }

  private refreshMyWeekOffers(): void {
    if (!this.myWeekMine) {
      this.myWeekOffers = [];
      return;
    }
    this.myWeekOffers = weekOffers(
      this.myWeekDiscovered, this.myWeekMine, this.myWeekProfile
    );
  }

  // QA accounts stay usable for testing, but must never be promoted as people to follow.
  // Match only the two known test usernames, not a general 'test' substring.
  private readonly qaSuggestionUsernames = new Set(['jynloteste01', 'jynloteste02']);

  private rankSuggestedPeople(profiles: CommunityProfile[], me: CommunityProfile | null, friends: Set<string>): CommunityProfile[] {
    const sports = new Set((me?.favoriteSports || '').split(/[,;|]/)
      .map(value => this.normalizeSuggestion(value)).filter(Boolean));
    const location = this.normalizeSuggestion(me?.location || '');
    return profiles
      .filter(profile => profile.username?.trim()
        && profile.username.toLowerCase() !== this.currentUsername.toLowerCase()
        && !friends.has(profile.username.toLowerCase())
        && !this.qaSuggestionUsernames.has(profile.username.trim().toLowerCase()))
      .map((profile, index) => {
        const theirSports = (profile.favoriteSports || '').split(/[,;|]/)
          .map(value => this.normalizeSuggestion(value));
        const sameSport = sports.size > 0 && theirSports.some(sport => sports.has(sport));
        const sameLocation = Boolean(location && this.normalizeSuggestion(profile.location || '') === location);
        return { profile, index, score: Number(sameSport) * 2 + Number(sameLocation) };
      })
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, 3)
      .map(item => item.profile);
  }

  private normalizeSuggestion(value: string): string {
    return value.trim().toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  suggestedProfileImage(profile: Pick<CommunityProfile, 'profilePicUrl'>): string | null {
    const path = profile.profilePicUrl;
    if (!path) {
      return null;
    }

    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
      return path;
    }

    return environment.apiUrl + (path.startsWith('/') ? path : '/' + path);
  }

  private loadCompletedSessions(): void {
    this.sessionService.mine().pipe(
      timeout(10_000),
      catchError(() => of(null)),
      takeUntil(this.destroyed)
    ).subscribe(mine => {
      this.myWeekGamesLoading = false;
      if (!mine) {
        this.myWeekGamesError = true;
        return;
      }
      this.myWeekMine = mine;
      this.myWeekGames = nextWeekGames(mine);
      this.myWeekWaitlist = nextWeekWaitlist(mine);
      this.refreshMyWeekOffers();
    });
  }

    private prepareNewSessionShare(): void {
    const raw = this.route.snapshot.queryParamMap.get('shareSession');
    if (!raw || !/^[1-9][0-9]*$/.test(raw)) return;
    const id = Number(raw);
    if (!Number.isSafeInteger(id)) return;

    this.sessionService.detail(id).pipe(
      timeout(10_000), catchError(() => of(null)), takeUntil(this.destroyed)
    ).subscribe(session => {
      if (!session || session.id !== id || session.canSharePublicly !== true
          || session.privateGame || session.audience === 'COMMUNITY_ONLY'
          || !this.currentUsername
          || session.creatorUsername?.toLowerCase() !== this.currentUsername.toLowerCase()
          || (session.status !== 'OPEN' && session.status !== 'FULL')
          || Date.parse(session.gameDate) <= Date.now()) return;
      this.newSessionShareId = id;
      this.selectedSessionId = id;
      this.availableSessions = [session, ...this.availableSessions.filter(item => item.id !== id)];
      if (!this.postContent.trim()) {
        this.postContent = t('feed.newSessionInvitation', {
          sport: session.sport, city: session.city
        });
      }
    });
  }

  private preparePostGameMoment(): void {
    const raw = this.route.snapshot.queryParamMap.get('momentSession');
    if (!raw || !/^[1-9]\d*$/.test(raw)) {
      return;
    }
    const id = Number(raw);
    if (!Number.isSafeInteger(id)) {
      return;
    }

    this.sessionService.detail(id).pipe(
      timeout(10_000),
      catchError(() => of(null))
    ).subscribe(session => {
      if (!session || session.id !== id
        || session.status !== 'COMPLETED'
        || session.canSharePublicly !== true
        || session.privateGame
        || (!session.joined
          && (!this.currentUsername
            || session.creatorUsername?.toLowerCase() !== this.currentUsername.toLowerCase()))) {
        return;
      }
      this.postGameSessionId = id;
      this.selectedSessionId = id;
      this.availableSessions = [session, ...this.availableSessions.filter(item => item.id !== id)];
    });
  }

  applyPostGamePrompt(key: string): void {
    if (this.postGameSessionId === null
      || this.selectedSessionId !== this.postGameSessionId
      || this.posting
      || !this.postGamePromptKeys.includes(key)) {
      return;
    }
    const suggestion = t(key);
    const current = this.postContent.trim();
    if (current.includes(suggestion)) {
      return;
    }
    const next = current ? current + '\n' + suggestion : suggestion;
    if (next.length <= 1000) {
      this.postContent = next;
    }
  }

  ngOnDestroy(): void {
    this.removePostVideo();
    this.clearPostGallery();
    this.destroyed.next();
    this.destroyed.complete();
  }

  load(): void {
    this.loading = true;
    this.errorMessage = '';

    this.feedService.feed()
      .pipe(
        timeout(10_000),
        retry({ count: 1 }),
        finalize(() => this.loading = false)
      )
      .subscribe({
        next: items => {
          this.items = items;
          this.loadLikerPreviews();
          this.loadSharedPost();
        },
        error: () => {
          this.items = [];
          this.errorMessage = t('feedback.feed.loadError');
        }
      });
  }

  private loadSharedPost(): void {
    const raw = this.route.snapshot.queryParamMap.get('post');
    if (!raw || !/^[1-9][0-9]{0,12}$/.test(raw)) return;
    const id = Number(raw);
    const focus = () => setTimeout(() =>
      document.getElementById('jynlo-post-' + id)?.scrollIntoView({behavior:'smooth',block:'start'}), 0);
    if (this.items.some(item => item.type === 'POST' && item.postId === id)) {
      focus();
      return;
    }
    this.feedService.postById(id).pipe(timeout(10000), takeUntil(this.destroyed))
      .subscribe({
        next: item => {
          if (!this.items.some(existing => existing.type === 'POST' && existing.postId === id))
            this.items = [item, ...this.items];
          focus();
        },
        error: () => this.actionError = 'Esta publicação não está disponível ou não tens permissão para a ver.'
      });
  }

  isPostedToday(iso: string): boolean {
    const published = new Date(iso);
    const today = new Date();
    return !Number.isNaN(published.getTime())
      && published.getFullYear() === today.getFullYear()
      && published.getMonth() === today.getMonth()
      && published.getDate() === today.getDate();
  }

  get canPublishPost(): boolean {
    return !this.posting && !!(this.postContent.trim() || this.postImageFile
      || this.postVideoFile || this.postGallery.length);
  }

  publish(): void {
    const content = this.postContent.trim();
    const location = this.postLocation.trim();
    if (!this.canPublishPost) return;
    if (location && !this.postLocationVerified) {
      this.actionError = 'Escolhe uma localização real da lista antes de publicar.';
      return;
    }

    this.posting = true;
    this.actionError = '';

    const singleGalleryFile = this.postGallery.length === 1 ? this.postGallery[0].file : undefined;
    const send = this.postGallery.length > 1
      ? this.feedService.createPostAlbum(content, this.postGallery.map(item => item.file),
          this.selectedSessionId ?? undefined, location || undefined)
      : this.feedService.createPost(content,
          singleGalleryFile?.type.startsWith('image/') ? singleGalleryFile : this.postImageFile,
          this.selectedSessionId ?? undefined,
          singleGalleryFile?.type.startsWith('video/') ? singleGalleryFile : this.postVideoFile,
          location || undefined);
    send.pipe(
        timeout(this.postGallery.length || this.postVideoFile ? 90_000 : 30_000),
        finalize(() => this.posting = false)
      )
      .subscribe({
        next: item => {
          this.items = [item, ...this.items];
          this.postContent = '';
          this.postLocation = '';
          this.postLocationVerified = false;
          this.postImageFile = undefined;
          this.postImagePreview = '';
          this.removePostVideo();
          this.clearPostGallery();
          this.selectedSessionId = null;
          this.postGameSessionId = null;
          this.newSessionShareId = null;
          this.postComposerOpen = false;
        },
        error: (error: unknown) => {
          if (error instanceof HttpErrorResponse) {
            if (error.status === 413) {
              this.actionError = 'Os ficheiros são demasiado grandes para o servidor. Reduz o tamanho e tenta novamente.';
              return;
            }
            if (error.status === 415) {
              this.actionError = 'O servidor recusou o formato do envio. Experimenta uma fotografia JPG/PNG ou vídeo MP4.';
              return;
            }
            if (error.status === 400 || error.status === 422) {
              this.actionError = 'O servidor recusou algum campo da publicação. Verifica o ficheiro e os dados e tenta novamente.';
              return;
            }
            if (error.status === 500 || error.status === 502 || error.status === 503 || error.status === 504) {
              this.actionError = 'O servidor não conseguiu guardar a publicação. A fotografia continua selecionada para tentares novamente.';
              return;
            }
            if (error.status === 401 || error.status === 403) {
              this.actionError = 'A sessão expirou ou não tens permissão para publicar. Inicia sessão novamente.';
              return;
            }
            if (error.status === 0) {
              this.actionError = 'Não foi possível contactar o servidor. Verifica a ligação e tenta novamente.';
              return;
            }
          }
          this.actionError = t('feedback.feed.publishError');
        }
      });
  }

  async shareSession(item: FeedItem): Promise<void> {
    const sessionId = item.sessionId;
    if (sessionId === null || this.sharingSessionId !== null) {
      return;
    }

    const url = new URL('/sessions/' + sessionId, window.location.origin).href;
    const title = item.sport
      ? t('publicSession.shareTitle', { sport: item.sport })
      : t('publicSession.share');
    const message = item.sport && item.city
      ? t('publicSession.whatsappSportCity', { sport: item.sport, city: item.city })
      : item.sport
        ? t('publicSession.whatsappSport', { sport: item.sport })
        : item.city
          ? t('publicSession.whatsappCity', { city: item.city })
          : t('publicSession.shareMessage');

    this.sharingSessionId = sessionId;
    this.shareFeedbackSessionId = null;
    this.manualShareItem = null;
    this.manualShareUrl = '';
    this.actionError = '';

    try {
      if (typeof navigator.share === 'function') {
        try {
          await navigator.share({ title, text: message, url });
          this.shareFeedbackSessionId = sessionId;
          this.shareFeedbackMessage = t('publicSession.shared');
          return;
        } catch (error) {
          // Closing the native share sheet is not an error.
          if (error instanceof Error && error.name === 'AbortError') {
            return;
          }
          // Some desktop browsers expose share() but cannot complete it.
        }
      }

      await this.copyShareUrl(url);
      this.shareFeedbackSessionId = sessionId;
      this.shareFeedbackMessage = t('publicSession.linkCopied');
    } catch {
      this.manualShareItem = item;
      this.manualShareUrl = url;
      this.shareFeedbackSessionId = sessionId;
      this.shareFeedbackMessage = t('publicSession.selectLink');
    } finally {
      this.sharingSessionId = null;
    }
  }

  private copyShareUrl(url: string): Promise<void> {
    if (!navigator.clipboard?.writeText) {
      return Promise.reject(new Error('Clipboard unavailable'));
    }
    return navigator.clipboard.writeText(url);
  }

  onPostImageChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      this.actionError = t('feedback.feed.imageType');
      input.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      this.actionError = t('feedback.feed.imageSize');
      input.value = '';
      return;
    }

    this.removePostVideo();
    this.clearPostGallery();
    this.postImageFile = file;
    this.actionError = '';

    const reader = new FileReader();
    reader.onload = () => {
      this.postImagePreview = typeof reader.result === 'string'
        ? reader.result
        : '';
    };
    reader.readAsDataURL(file);
  }

  removePostImage(): void {
    this.postImageFile = undefined;
    this.postImagePreview = '';
  }

  onPostVideoChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!['video/mp4', 'video/webm'].includes(file.type)) {
      this.actionError = t('feedback.feed.videoType');
      input.value = '';
      return;
    }
    if (file.size === 0 || file.size > 20 * 1024 * 1024) {
      this.actionError = t('feedback.feed.videoSize');
      input.value = '';
      return;
    }
    this.removePostVideo();
    this.removePostImage();
    this.clearPostGallery();
    this.postVideoFile = file;
    this.postVideoPreview = URL.createObjectURL(file);
    this.actionError = '';
    input.value = '';
  }

  removePostVideo(): void {
    if (this.postVideoPreview) URL.revokeObjectURL(this.postVideoPreview);
    this.postVideoPreview = '';
    this.postVideoFile = undefined;
  }

  onPostGalleryChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!files.length) return;
    const valid = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'];
    const combined = [...this.postGallery.map(item => item.file), ...files];
    if (combined.length > 6 || combined.some(file => !valid.includes(file.type)
        || file.size === 0 || file.size > (file.type.startsWith('video/') ? 20 : 5) * 1024 * 1024)
        || combined.reduce((sum, file) => sum + file.size, 0) > 60 * 1024 * 1024) {
      this.actionError = 'Até 6 fotografias ou vídeos, máximo de 60 MB no total (5 MB por foto e 20 MB por vídeo).';
      return;
    }
    this.removePostImage();
    this.removePostVideo();
    this.postGallery.push(...files.map(file => ({file, url: URL.createObjectURL(file)})));
    this.postGalleryIndex = Math.max(0, this.postGallery.length - files.length);
    this.actionError = '';
  }

  movePostGalleryItem(index: number, direction: -1 | 1): void {
    if (this.posting || index < 0 || index >= this.postGallery.length) return;
    const destination = index + direction;
    if (destination < 0 || destination >= this.postGallery.length) return;
    const [item] = this.postGallery.splice(index, 1);
    this.postGallery.splice(destination, 0, item);
    this.postGalleryIndex = destination;
  }

  removePostGalleryItem(index: number): void {
    if (this.posting || index < 0 || index >= this.postGallery.length) return;
    const [item] = this.postGallery.splice(index, 1);
    URL.revokeObjectURL(item.url);
    this.postGalleryIndex = Math.min(this.postGalleryIndex, Math.max(0, this.postGallery.length - 1));
  }

  clearPostGallery(): void {
    for (const item of this.postGallery) URL.revokeObjectURL(item.url);
    this.postGallery = [];
    this.postGalleryIndex = 0;
  }

  // A single lightbox covers the primary photo and every album attachment.
  // Inline videos remain playable without opening a second player.
  expandedMedia: { url: string; mimeType: string }[] = [];
  expandedMediaIndex = 0;

  mediaForPost(item: FeedItem): { url: string; mimeType: string }[] {
    const media: { url: string; mimeType: string }[] = [];
    if (item.imageUrl) media.push({ url: item.imageUrl, mimeType: 'image/jpeg' });
    if (item.videoUrl) media.push({ url: item.videoUrl, mimeType: 'video/mp4' });
    for (const extra of item.extraMedia ?? []) {
      if (extra?.url && (extra.mimeType?.startsWith('image/') || extra.mimeType?.startsWith('video/'))) {
        media.push(extra);
      }
    }
    return media;
  }

  // A compact, per-post carousel prevents an album of six files from
  // occupying six full cards. Selection is independent for each publication.
  activePostMediaIndex: Record<number, number> = {};
  private postMediaTouchStart: { postId: number; x: number; y: number } | null = null;

  selectedPostMediaIndex(item: FeedItem): number {
    const id = item.postId;
    const length = this.mediaForPost(item).length;
    if (id == null || !length) return 0;
    const index = this.activePostMediaIndex[id] ?? 0;
    return index >= 0 && index < length ? index : 0;
  }

  setPostMediaIndex(item: FeedItem, index: number): void {
    const id = item.postId;
    const length = this.mediaForPost(item).length;
    if (id == null || index < 0 || index >= length) return;
    this.activePostMediaIndex[id] = index;
  }

  shiftPostMedia(item: FeedItem, direction: number): void {
    const length = this.mediaForPost(item).length;
    if (length < 2) return;
    const next = this.selectedPostMediaIndex(item) + direction;
    // The inline carousel does not wrap; its end controls clearly disable.
    this.setPostMediaIndex(item, Math.min(length - 1, Math.max(0, next)));
  }

  onPostMediaKeydown(event: KeyboardEvent, item: FeedItem): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    // Avoid intercepting keystrokes intended for video playback controls.
    if (event.target instanceof HTMLVideoElement) return;
    this.shiftPostMedia(item, event.key === 'ArrowRight' ? 1 : -1);
    event.preventDefault();
  }

  onPostMediaTouchStart(event: TouchEvent, item: FeedItem): void {
    if (this.mediaForPost(item).length < 2 || item.postId == null) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    this.postMediaTouchStart = { postId: item.postId, x: touch.clientX, y: touch.clientY };
  }

  onPostMediaTouchEnd(event: TouchEvent, item: FeedItem): void {
    const start = this.postMediaTouchStart;
    this.postMediaTouchStart = null;
    if (!start || item.postId !== start.postId) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 45 || Math.abs(dx) <= Math.abs(dy) * 1.3) return;
    this.shiftPostMedia(item, dx < 0 ? 1 : -1);
  }

  openPostMedia(item: FeedItem, index: number): void {
    const media = this.mediaForPost(item);
    if (index < 0 || index >= media.length) return;
    this.expandedMedia = media;
    this.expandedMediaIndex = index;
  }

  closePostMedia(): void {
    this.expandedMedia = [];
    this.expandedMediaIndex = 0;
  }

  changePostMedia(direction: number): void {
    if (!this.expandedMedia.length) return;
    this.expandedMediaIndex = (this.expandedMediaIndex + direction + this.expandedMedia.length)
      % this.expandedMedia.length;
  }

  @HostListener('document:keydown', ['$event'])
  handlePostMediaKeys(event: KeyboardEvent): void {
    if (!this.expandedMedia.length) return;
    if (event.key === 'Escape') this.closePostMedia();
    else if (event.key === 'ArrowRight') this.changePostMedia(1);
    else if (event.key === 'ArrowLeft') this.changePostMedia(-1);
    else return;
    event.preventDefault();
  }

  postVideo(item: FeedItem): string | null {
    return this.resolvePostMedia(item.videoUrl);
  }

  postImage(item: FeedItem): string | null {
    return this.resolvePostMedia(item.imageUrl);
  }

  resolvePostMedia(path: string | null | undefined): string | null {
    if (!path) {
      return null;
    }

    if (
      path.startsWith('http://')
      || path.startsWith('https://')
      || path.startsWith('data:')
    ) {
      return path;
    }

    return environment.apiUrl + (path.startsWith('/') ? path : '/' + path);
  }

  private resolvingAttendanceSessionId: number | null = null;

  /** Lazy materialization lets existing attendance activities gain interactions without
   * generating duplicate posts when nobody has interacted with them. */
  private withInteractionPost(item: FeedItem, action: () => void): void {
    if (item.type !== 'SESSION_ATTENDED' || item.sessionId === null
        || this.resolvingAttendanceSessionId !== null) return;
    this.resolvingAttendanceSessionId = item.sessionId;
    this.actionError = '';
    this.feedService.ensureAttendancePost(item.sessionId, item.authorUsername)
      .pipe(timeout(10_000), finalize(() => this.resolvingAttendanceSessionId = null))
      .subscribe({
        next: id => {
          item.postId = id;
          action();
        },
        error: () => this.actionError = t('feedback.feed.commentsLoadError')
      });
  }

  likedByText(item: FeedItem): string {
    const count = item.likeCount;
    if (count <= 0) return '';
    if (item.hideLikers && item.authorUsername !== this.currentUsername) {
      return count === 1 ? '1 gosto' : count + ' gostos';
    }
    const display = item.postId !== null ? this.likerPreview[item.postId] : null;
    if (display) {
      return count === 1 ? 'Gostado por ' + display : 'Gostado por ' + display + ' e outras pessoas';
    }
    return count === 1 ? 'Gostado por 1 pessoa' : 'Gostado por ' + count + ' pessoas';
  }

  private loadLikerPreviews(): void {
    // Only visible posts, maximum eight extra small lookups; never request hidden identities.
    this.items.filter(item => item.postId !== null && item.likeCount > 0
      && (!item.hideLikers || item.authorUsername === this.currentUsername))
      .slice(0, 8).forEach(item => {
        const postId = item.postId!;
        this.feedService.likers(postId).pipe(timeout(6000), takeUntil(this.destroyed))
          .subscribe({
            next: people => {
              if (people.length) this.likerPreview[postId] =
                people[0].nickname || people[0].fullName || '@' + people[0].username;
            },
            error: () => { /* Keep the count if a preview is unavailable. */ }
          });
      });
  }

  toggleLikersPrivacy(item: FeedItem): void {
    if (item.authorUsername !== this.currentUsername || item.postId === null
        || this.likersPrivacySavingId !== null) return;
    const id = item.postId;
    this.likersPrivacySavingId = id;
    this.feedService.setLikersHidden(id, !item.hideLikers)
      .pipe(timeout(10000), finalize(() => this.likersPrivacySavingId = null),
        takeUntil(this.destroyed))
      .subscribe({
        next: hidden => { item.hideLikers = hidden; },
        error: () => { this.actionError = 'Não foi possível alterar a privacidade dos gostos.'; }
      });
  }

  showLikers(item: FeedItem): void {
    if (item.hideLikers && item.authorUsername !== this.currentUsername) return;
    if (item.postId === null) {
      if (item.type === 'SESSION_ATTENDED') {
        this.withInteractionPost(item, () => this.showLikers(item));
      }
      return;
    }
    const id = item.postId;
    this.likersPostId = id;
    this.likersList = [];
    this.likersLoading = true;
    this.likersError = false;
    this.feedService.likers(id).pipe(timeout(10000), finalize(() => this.likersLoading = false))
      .subscribe({
        next: users => { if (this.likersPostId === id) this.likersList = users; },
        error: () => { if (this.likersPostId === id) this.likersError = true; }
      });
  }

  closeLikers(): void {
    this.likersPostId = null;
    this.likersList = [];
  }

  toggleLike(item: FeedItem): void {
    if (item.type === 'SESSION_ATTENDED' && item.postId === null) {
      this.withInteractionPost(item, () => this.toggleLike(item));
      return;
    }
    if (
      (item.type !== 'POST' && item.type !== 'SESSION_ATTENDED')
      || item.postId === null
      || this.interactionLoadingPostId !== null
    ) {
      return;
    }

    this.interactionLoadingPostId = item.postId;
    this.actionError = '';

    const request$ = item.likedByMe
      ? this.feedService.unlikePost(item.postId)
      : this.feedService.likePost(item.postId);

    request$
      .pipe(
        timeout(10_000),
        finalize(() => this.interactionLoadingPostId = null)
      )
      .subscribe({
        next: status => {
          item.likedByMe = status.likedByMe;
          item.likeCount = status.likeCount;
        },
        error: () => this.actionError = t('feedback.feed.likeError')
      });
  }

  toggleComments(item: FeedItem): void {
    if (item.type === 'SESSION_ATTENDED' && item.postId === null) {
      this.withInteractionPost(item, () => this.toggleComments(item));
      return;
    }
    if ((item.type !== 'POST' && item.type !== 'SESSION_ATTENDED') || item.postId === null) {
      return;
    }

    const postId = item.postId;

    if (this.openCommentPosts.has(postId)) {
      this.openCommentPosts.delete(postId);
      return;
    }

    this.openCommentPosts.add(postId);

    if (this.commentsByPost[postId]) {
      return;
    }

    this.feedService.comments(postId)
      .pipe(
        timeout(10_000),
        retry({ count: 1 })
      )
      .subscribe({
        next: comments => this.commentsByPost[postId] = comments,
        error: () => this.actionError = t('feedback.feed.commentsLoadError')
      });
  }

  submitComment(item: FeedItem): void {
    if (item.type === 'SESSION_ATTENDED' && item.postId === null) {
      this.withInteractionPost(item, () => this.submitComment(item));
      return;
    }
    if (
      (item.type !== 'POST' && item.type !== 'SESSION_ATTENDED')
      || item.postId === null
      || this.interactionLoadingPostId !== null
    ) {
      return;
    }

    const postId = item.postId;
    const content = (this.commentDrafts[postId] || '').trim();

    if (!content) {
      return;
    }

    this.interactionLoadingPostId = postId;
    this.actionError = '';

    this.feedService.addComment(postId, content)
      .pipe(
        timeout(10_000),
        finalize(() => this.interactionLoadingPostId = null)
      )
      .subscribe({
        next: comment => {
          this.commentsByPost[postId] = [
            ...(this.commentsByPost[postId] || []),
            comment
          ];
          this.commentDrafts[postId] = '';
          item.commentCount++;
        },
        error: () => this.actionError = t('feedback.feed.commentError')
      });
  }

  deleteComment(item: FeedItem, comment: SocialComment): void {
    if (
      item.postId === null
      || comment.authorUsername !== this.currentUsername
      || this.deletingCommentId !== null
    ) {
      return;
    }

    const postId = item.postId;
    this.deletingCommentId = comment.id;
    this.actionError = '';

    this.feedService.deleteComment(postId, comment.id)
      .pipe(
        timeout(10_000),
        finalize(() => this.deletingCommentId = null)
      )
      .subscribe({
        next: () => {
          this.commentsByPost[postId] = (this.commentsByPost[postId] || [])
            .filter(current => current.id !== comment.id);
          item.commentCount = Math.max(0, item.commentCount - 1);
        },
        error: () => this.actionError = t('feedback.feed.commentDeleteError')
      });
  }

  reportComment(item: FeedItem, comment: SocialComment): void {
    if (
      item.postId === null
      || comment.authorUsername === this.currentUsername
      || this.reportingCommentId !== null
      || this.reportedCommentIds.has(comment.id)
    ) {
      return;
    }

    const reason = window.prompt(t('feed.reportCommentReasonPrompt'))?.trim();
    if (!reason) {
      return;
    }

    const postId = item.postId;
    this.reportingCommentId = comment.id;
    this.actionError = '';

    this.feedService.reportComment(postId, comment.id, reason.slice(0, 1000))
      .pipe(
        timeout(10_000),
        finalize(() => this.reportingCommentId = null)
      )
      .subscribe({
        next: () => this.reportedCommentIds.add(comment.id),
        error: () => this.actionError = t('feedback.feed.commentReportError')
      });
  }

  reportPost(item: FeedItem): void {
    if (
      item.type !== 'POST'
      || item.postId === null
      || item.authorUsername === this.currentUsername
      || this.reportingPostId !== null
      || this.reportedPostIds.has(item.postId)
    ) {
      return;
    }

    const reason = window.prompt(t('feed.reportReasonPrompt'))?.trim();
    if (!reason) {
      return;
    }

    const postId = item.postId;
    this.reportingPostId = postId;
    this.actionError = '';

    this.feedService.reportPost(postId, reason.slice(0, 1000))
      .pipe(
        timeout(10_000),
        finalize(() => this.reportingPostId = null)
      )
      .subscribe({
        next: () => this.reportedPostIds.add(postId),
        error: () => this.actionError = t('feedback.feed.reportError')
      });
  }

  hideAttendanceActivity(item: FeedItem): void {
    if (
      item.type !== 'SESSION_ATTENDED'
      || item.sessionId === null
      || item.authorUsername !== this.currentUsername
      || this.hidingAttendanceSessionId !== null
    ) {
      return;
    }

    const sessionId = item.sessionId;
    this.hidingAttendanceSessionId = sessionId;
    this.actionError = '';

    this.feedService.hideAttendanceActivity(sessionId)
      .pipe(
        timeout(10_000),
        finalize(() => this.hidingAttendanceSessionId = null)
      )
      .subscribe({
        next: () => {
          this.items = this.items.filter(current =>
            !(current.type === 'SESSION_ATTENDED'
              && current.sessionId === sessionId
              && current.authorUsername === this.currentUsername)
          );
        },
        error: () => this.actionError = t('feedback.feed.hideAttendanceError')
      });
  }

  editingPostId: number | null = null;
  editingPostContent = '';
  editingPostLocation = '';
  editingPostReplacementFiles: File[] = [];
  editingPostReplaceMedia = false;
  editingPostMediaError = '';
  savingPostId: number | null = null;

  selectEditPostMedia(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    input.value = '';
    if (files.length > 6 || files.some(file =>
      !['image/jpeg','image/png','image/webp','video/mp4','video/webm'].includes(file.type)
      || file.size > 20 * 1024 * 1024)
      || files.reduce((sum, file) => sum + file.size, 0) > 60 * 1024 * 1024) {
      this.editingPostMediaError = 'Escolhe até 6 fotografias/vídeos (máximo 20 MB por ficheiro e 60 MB no total).';
      return;
    }
    this.editingPostReplacementFiles = files;
    this.editingPostReplaceMedia = true;
    this.editingPostMediaError = '';
  }

  keepEditPostMedia(): void {
    this.editingPostReplaceMedia = false;
    this.editingPostReplacementFiles = [];
    this.editingPostMediaError = '';
  }

  removeEditPostMedia(): void {
    this.editingPostReplaceMedia = true;
    this.editingPostReplacementFiles = [];
    this.editingPostMediaError = '';
  }

  beginEditPost(item: FeedItem): void {
    if (item.type !== 'POST' || item.postId == null
        || item.authorUsername !== this.currentUsername || this.savingPostId !== null) return;
    this.editingPostId = item.postId;
    this.editingPostContent = item.content || '';
    this.editingPostLocation = item.location || '';
    this.keepEditPostMedia();
    this.actionError = '';
  }

  cancelEditPost(): void {
    if (this.savingPostId !== null) return;
    this.editingPostId = null;
    this.keepEditPostMedia();
  }

  savePostEdit(item: FeedItem): void {
    if (item.postId == null || this.editingPostId !== item.postId
        || item.authorUsername !== this.currentUsername || this.savingPostId !== null) return;
    const content = this.editingPostContent.trim();
    const location = this.editingPostLocation.trim();
    if (content.length > 1000 || location.length > 160
        || (!content && (this.editingPostReplaceMedia
          ? !this.editingPostReplacementFiles.length : !this.mediaForPost(item).length))) {
      this.actionError = 'Adiciona uma descrição ou mantém uma fotografia/vídeo. Máximo de 1000 caracteres.';
      return;
    }
    this.savingPostId = item.postId;
    this.actionError = '';
    const request = this.editingPostReplaceMedia
      ? this.feedService.editPostWithMedia(item.postId, content, location,
          this.editingPostReplacementFiles, true)
      : this.feedService.editPost(item.postId, content, location);
    request.pipe(timeout(this.editingPostReplaceMedia ? 90000 : 10000),
      finalize(() => this.savingPostId = null)).subscribe({
        next: updated => {
          item.content = updated.content;
          item.location = updated.location;
          item.imageUrl = updated.imageUrl;
          item.videoUrl = updated.videoUrl;
          item.extraMedia = updated.extraMedia;
          this.editingPostId = null;
          this.keepEditPostMedia();
        },
        error: () => this.actionError = 'Não foi possível guardar a edição. A publicação original mantém-se.'
      });
  }

  pendingDeletePost: FeedItem | null = null;
  private readonly postShareChat = inject(DirectChatService);
  postShareFriends: FriendSummary[] = [];
  postShareLoadingFriends = false;
  postShareSendingTo: string | null = null;
  postShareFriendsOpen = false;
  postShareFriendsError = '';
  postShareSearch = '';

  get filteredPostShareFriends(): FriendSummary[] {
    const term = this.postShareSearch.trim().toLocaleLowerCase();
    return this.postShareFriends.filter(friend => !term ||
      friend.username.toLocaleLowerCase().includes(term) ||
      (friend.fullName || '').toLocaleLowerCase().includes(term)).slice(0,30);
  }

  openPostFriendShare(item: FeedItem): void {
    if (item.type !== 'POST' || item.postId == null) return;
    this.postShareTargetId = item.postId;
    this.postShareLink = new URL('/menu/feed?post=' + item.postId, window.location.origin).href;
    this.postShareFriendsOpen = true;
    this.postShareFriendsError = '';
    this.postShareSearch = '';
    this.postShareLoadingFriends = true;
    this.communityService.friends().pipe(timeout(10000),takeUntil(this.destroyed))
      .subscribe({
        next: friends => {
          this.postShareFriends = friends.filter(friend => !!friend.username &&
            !friend.blockedByMe && !friend.chatBlocked);
          this.postShareLoadingFriends = false;
        },
        error: () => {
          this.postShareFriendsError = 'Não foi possível carregar os teus amigos.';
          this.postShareLoadingFriends = false;
        }
      });
  }

  closePostFriendShare(): void {
    if (this.postShareSendingTo) return;
    this.postShareFriendsOpen = false;
  }

  sendPostToFriend(friend: FriendSummary): void {
    if (!this.postShareFriendsOpen || this.postShareSendingTo ||
        !this.postShareFriends.some(user => user.username === friend.username)) return;
    this.postShareSendingTo = friend.username;
    this.postShareFriendsError = '';
    this.postShareChat.send(friend.username, 'Partilhei esta publicação contigo na Jynlo: ' +
      this.postShareLink).pipe(timeout(12000),finalize(() => this.postShareSendingTo = null),
        takeUntil(this.destroyed)).subscribe({
      next: () => {
        this.postShareMessage = 'Publicação enviada para @' + friend.username;
        this.postShareFriendsOpen = false;
      },
      error: () => this.postShareFriendsError = 'Não foi possível enviar. Verifica se podes trocar mensagens com este amigo.'
    });
  }
  postShareMessage = '';
  postShareLink = '';
  postShareTargetId: number | null = null;

  requestDeletePost(item: FeedItem): void {
    if (item.type !== 'POST' || item.postId == null ||
        item.authorUsername !== this.currentUsername || this.deletingPostId !== null) return;
    this.pendingDeletePost = item;
  }

  cancelDeletePost(): void {
    if (this.deletingPostId !== null) return;
    this.pendingDeletePost = null;
  }

  async shareFeedPost(item: FeedItem): Promise<void> {
    if (item.type !== 'POST' || item.postId == null) return;
    // This is an absolute post permalink, not a link to the generic feed.
    const url = new URL('/menu/feed?post=' + item.postId, window.location.origin).href;
    this.postShareTargetId = item.postId;
    this.postShareLink = url;
    this.postShareMessage = '';
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Publicação na Jynlo', text: item.content || '', url });
        this.postShareMessage = 'Partilhado';
        return;
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
      }
    }
    try {
      await this.copyShareUrl(url);
      this.postShareMessage = 'Link copiado';
    } catch {
      this.postShareMessage = 'Copia o endereço abaixo para partilhar';
    }
  }

  deletePost(item: FeedItem): void {
    if (
      item.type !== 'POST'
      || item.postId === null
      || item.authorUsername !== this.currentUsername
      || this.deletingPostId !== null
      || this.pendingDeletePost?.postId !== item.postId
    ) {
      return;
    }

    this.deletingPostId = item.postId;
    this.actionError = '';

    this.feedService.deletePost(item.postId)
      .pipe(
        timeout(10_000),
        finalize(() => this.deletingPostId = null)
      )
      .subscribe({
        next: () => {
          this.items = this.items.filter(
            current => current.postId !== item.postId
          );
          this.pendingDeletePost = null;
        },
        error: () => this.actionError = t('feedback.feed.deleteError')
      });
  }

  commentProfileImage(comment: SocialComment): string | null {
    const path = comment.authorProfilePicUrl;
    if (!path) {
      return null;
    }

    if (
      path.startsWith('http://')
      || path.startsWith('https://')
      || path.startsWith('data:')
    ) {
      return path;
    }

    return environment.apiUrl + (path.startsWith('/') ? path : '/' + path);
  }

  commentInitials(comment: SocialComment): string {
    return (comment.authorDisplayName || comment.authorUsername)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part.charAt(0).toUpperCase())
      .join('');
  }

  profileImage(item: FeedItem): string | null {
    const path = item.authorProfilePicUrl;
    if (!path) {
      return null;
    }

    if (
      path.startsWith('http://')
      || path.startsWith('https://')
      || path.startsWith('data:')
    ) {
      return path;
    }

    return environment.apiUrl + (path.startsWith('/') ? path : '/' + path);
  }

  initials(item: FeedItem): string {
    return (item.authorDisplayName || item.authorUsername)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part.charAt(0).toUpperCase())
      .join('');
  }
}
