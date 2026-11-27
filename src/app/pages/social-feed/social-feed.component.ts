import { InboxApiService } from '../../services/inbox-api.service';
import { playersMissingForGame } from '../../shared/session-minimum-players';
import { isLightboxBackdropClick } from '../../shared/lightbox-click';
import { appTranslate } from '../../i18n/i18n.service';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, HostListener, OnDestroy, OnInit, Optional, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subject, Subscription, auditTime, catchError, finalize, forkJoin, of, retry, switchMap, takeUntil, timeout, timer, interval } from 'rxjs';

import { environment } from 'src/environment/environment';
import { appTranslate as t } from '../../i18n/i18n.service';
import { AuthenticationService } from '../../services/authethication.service';
import { SocialFeedService } from '../../services/social-feed.service';
import { DirectChatRealtimeService } from '../../services/direct-chat-realtime.service';
import { DirectChatService } from '../../services/direct-chat.service';
import { CommunityService, KnownSuggestion } from '../../services/community.service';
import { CommunityGroupsService } from '../../services/community-groups.service';
import { CommunityTimelineService } from '../../services/community-timeline.service';
import { SportsTeamsService } from '../../services/sports-teams.service';
import { CommunityGroup } from '../model/community-group';
import { MySessionsResponse } from '../model/my-sessions-response';
import { nextWeekGames, nextWeekWaitlist, weekOffers } from './my-sports-week';
import { SessionService } from '../../services/session.service';
import { SessionSummary } from '../model/session-summary';
import { FeedItem, SocialComment } from '../model/feed-item';
import { sessionCancellationNotice } from '../../shared/session-cancellation-notice';
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
import { injectAppDialog } from '../../shared/app-dialog/app-dialog.service';

export interface PostDestination { kind: 'community' | 'team'; id: number; name: string; }

@Component({
  selector: 'app-social-feed',
  templateUrl: './social-feed.component.html',
  styleUrls: ['./social-feed.component.css', './social-feed-concept-one-refresh.css', './social-feed-neon-glass.css', './social-feed-action-polish.css', './feed-create-entry.css', './social-feed-visual-redesign.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class SocialFeedComponent implements OnInit, OnDestroy {
  private readonly appDialog = injectAppDialog();
  readonly t = t;
  items: FeedItem[] = [];
  // An eventual feed refresh must not erase a newly confirmed publication.
  private feedLoadGeneration = 0;
  private readonly confirmedPosts = new Map<number, { item: FeedItem; expiresAt: number }>();

  private preserveConfirmedPosts(received: FeedItem[]): FeedItem[] {
    const now = Date.now();
    for (const [id, pending] of this.confirmedPosts) {
      if (pending.expiresAt <= now || received.some(item => item.type === 'POST' && item.postId === id)) {
        this.confirmedPosts.delete(id);
      }
    }
    const merged = [...this.confirmedPosts.values()].map(entry => entry.item);
    const ids = new Set(merged.map(item => item.postId));
    return [...merged, ...received.filter(item => item.type !== 'POST' || !ids.has(item.postId))];
  }

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
          error: () => this.actionError = appTranslate('Não foi possível ocultar esta publicação. Tenta novamente.')
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
          error: () => this.actionError = appTranslate('Não foi possível repor a publicação. Tenta novamente.')
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
        error: () => this.hiddenPostsError = appTranslate('Não foi possível consultar as publicações ocultas.')
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
        error: () => this.hiddenPostsError = appTranslate('Não foi possível repor a publicação. Tenta novamente.')
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

  /** "Publicar em": null = my profile; otherwise a community or team feed I belong to. */
  postDestination: PostDestination | null = null;
  postDestinations: PostDestination[] = [];
  publishedDestination: PostDestination | null = null;
  private postDestinationsLoaded = false;
  static readonly TEAM_FEED_MAX_FILES = 4;

  openPostComposer(): void {
    this.postComposerOpen = true;
    this.loadPostDestinations();
  }

  loadPostDestinations(): void {
    if (this.postDestinationsLoaded || !this.currentUsername) return;
    this.postDestinationsLoaded = true;
    forkJoin({
      groups: this.communityGroupsService ? this.communityGroupsService.mine().pipe(catchError(() => of([] as CommunityGroup[]))) : of([] as CommunityGroup[]),
      teams: this.sportsTeams ? this.sportsTeams.mine().pipe(catchError(() => of([]))) : of([])
    }).subscribe(({ groups, teams }) => {
      const list: PostDestination[] = [];
      for (const group of groups ?? []) {
        const mayPost = group.membersCanPost !== false || group.myRole === 'OWNER' || group.myRole === 'ADMIN';
        if (mayPost && Number.isSafeInteger(group.id) && group.id > 0) list.push({ kind: 'community', id: group.id, name: group.name });
      }
      for (const team of teams ?? []) {
        if (team.feedEnabled !== false && Number.isSafeInteger(team.id) && team.id > 0) list.push({ kind: 'team', id: team.id, name: team.name });
      }
      this.postDestinations = list;
    });
  }

  get showPostDestinations(): boolean {
    return this.postDestinations.length > 0 && !this.postGameSession && !this.newSessionForFeed;
  }

  isPostDestination(option: PostDestination | null): boolean {
    if (!option) return this.postDestination === null;
    return this.postDestination?.kind === option.kind && this.postDestination.id === option.id;
  }

  selectPostDestination(option: PostDestination | null): void {
    if (this.posting) return;
    this.postDestination = option;
    if (option) {
      this.postLocation = '';
      this.postLocationVerified = false;
      this.selectedSessionId = null;
    }
  }

  destinationLink(destination: PostDestination): string[] {
    return destination.kind === 'community'
      ? ['/menu/communities', String(destination.id)]
      : ['/menu/teams', String(destination.id)];
  }

  /** Posts in a community or team feed (members only; the server checks membership). */
  private publishToDestination(destination: PostDestination, content: string): void {
    const files = this.postGallery.length
      ? this.postGallery.map(item => item.file)
      : [this.postImageFile, this.postVideoFile].filter((file): file is File => !!file);
    let send: Observable<unknown>;
    if (destination.kind === 'community') {
      if (!this.communityTimeline) return;
      send = files.length
        ? this.communityTimeline.sendPostAlbum(destination.id, content, files)
        : this.communityTimeline.send(destination.id, 'POST', content);
    } else {
      if (!this.sportsTeams) return;
      if (files.length > SocialFeedComponent.TEAM_FEED_MAX_FILES) {
        this.actionError = appTranslate('No feed da equipa podes publicar até 4 fotografias ou vídeos de cada vez.');
        return;
      }
      send = files.length
        ? this.sportsTeams.uploadContentFiles(destination.id, 'feed', files, content, null)
        : this.sportsTeams.sendContent(destination.id, 'feed', content);
    }
    this.posting = true;
    this.actionError = '';
    this.publishedDestination = null;
    send.pipe(timeout(files.length ? 90_000 : 30_000), finalize(() => this.posting = false)).subscribe({
      next: () => {
        this.publishedDestination = destination;
        this.postContent = '';
        this.postImageFile = undefined;
        this.postImagePreview = '';
        this.removePostVideo();
        this.clearPostGallery();
        this.postDestination = null;
        this.postComposerOpen = false;
      },
      error: (error: unknown) => {
        if (error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403)) {
          this.actionError = appTranslate('Não tens permissão para publicar aqui. Confirma que ainda és membro.');
          return;
        }
        if (error instanceof HttpErrorResponse && error.status === 413) {
          this.actionError = appTranslate('Os ficheiros são demasiado grandes para o servidor. Reduz o tamanho e tenta novamente.');
          return;
        }
        this.actionError = appTranslate('Não foi possível confirmar a publicação. Verifica o feed antes de repetir.');
      }
    });
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

  liveMode: 'PERSONAL' | 'COMMUNITY' = 'PERSONAL';
  /** "há 12 min" for a live that started at this time. */
  liveSince(startedAt: string): string {
    const ms = Date.now() - Date.parse(startedAt);
    if (!Number.isFinite(ms) || ms < 60000) return appTranslate('agora mesmo');
    const min = Math.floor(ms / 60000);
    if (min < 60) return appTranslate('há {{n}} min', { n: min });
    return appTranslate('há {{n}} h', { n: Math.floor(min / 60) });
  }
  personalLiveEvents: PersonalLiveEvent[] = [];
  personalLiveRoom: PersonalLiveEvent | null = null;
  private requestedPersonalLiveId: number | null = null;
  private openedPersonalLiveId: number | null = null;
  private personalLiveLoading = false;
  personalLiveError = '';
  personalLiveNotice = '';

  private openRequestedPersonalLive(): void {
    const id = this.requestedPersonalLiveId;
    if (id === null || id === this.openedPersonalLiveId) return;
    const event = this.personalLiveEvents.find(item => item.id === id && item.status === 'LIVE');
    if (event) {
      this.openedPersonalLiveId = id;
      this.personalLiveError = '';
      this.watchPersonalLive(event);
    } else {
      // Called with a completed listing (or a known in-memory match).
      // Do not suppress the unavailable state while finalize() is still pending.
      this.personalLiveError = appTranslate('Este direto já terminou ou não está disponível.');
    }
  }

  refreshPersonalLive(): void {
    if (!this.personalLiveService || this.personalLiveLoading) return;
    this.personalLiveLoading = true;
    this.personalLiveService.active().pipe(
      timeout(10000),
      takeUntil(this.destroyed),
      finalize(() => this.personalLiveLoading = false)
    ).subscribe({
      next: events => {
        this.personalLiveEvents = events;
        this.personalLiveError = '';
        this.openRequestedPersonalLive();
      },
      error: () => {
        if (this.requestedPersonalLiveId !== null)
          this.personalLiveError = appTranslate('Não foi possível carregar este direto. Tenta novamente.');
      }
    });
  }

  watchPersonalLive(event: PersonalLiveEvent): void {
    if (event.status !== 'LIVE') return;
    this.personalLiveNotice = '';
    this.personalLiveRoom = event;
    if (this.requestedPersonalLiveId === event.id) this.openedPersonalLiveId = event.id;
  }

  closePersonalLiveRoom(reason: 'LEFT' | 'ENDED' = 'LEFT'): void {
    const dismissedId = this.personalLiveRoom?.id;
    const wasHost = this.personalLiveRoom?.canManage ?? false;
    this.personalLiveNotice = reason === 'ENDED'
      ? (wasHost ? appTranslate('Terminaste o direto para todos.') : appTranslate('A transmissão terminou.'))
      : '';
    this.personalLiveRoom = null;
    this.openedPersonalLiveId = null;
    if (dismissedId !== undefined && this.requestedPersonalLiveId === dismissedId) {
      this.requestedPersonalLiveId = null;
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { personalLive: null },
        queryParamsHandling: 'merge',
        replaceUrl: true
      });
    }
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
      this.liveStartError=appTranslate('Escreve o título do direto.');
      return;
    }
    if (this.liveMode === 'PERSONAL') {
      if (!this.personalLiveService) {this.liveStartError=appTranslate('Diretos indisponíveis.');return;}
      this.liveBusy=true;
      this.liveStartError='';
      this.personalLiveService.start(title).pipe(timeout(12000),
        finalize(()=>this.liveBusy=false),takeUntil(this.destroyed)).subscribe({
        next:event=>{
          this.liveComposerOpen=false;
          // The backend has already created an active broadcast. Show it in
          // the feed immediately; sharing its URL is entirely optional.
          this.personalLiveEvents=[event,...this.personalLiveEvents.filter(item=>item.id!==event.id)];
          this.personalLiveRoom=event;
          this.refreshPersonalLive();
        },
        error:()=>this.liveStartError=appTranslate('Não foi possível iniciar o teu direto. Confirma se já tens uma transmissão ativa.')
      });
      return;
    }
    const communityId = this.liveCommunityId;
    if (!communityId || !this.communityLiveService ||
        !this.managedLiveCommunities.some(group => group.id === communityId)) return;
    this.liveBusy = true;
    this.liveStartError = '';
    this.communityLiveService.capabilities(communityId).pipe(
      timeout(12000),
      switchMap(capabilities => {
        if (!capabilities.enabled || !capabilities.canManage)
          throw new Error(appTranslate('Sem permissão para iniciar diretos nesta comunidade.'));
        return this.communityLiveService!.list(communityId).pipe(timeout(12000));
      }),
      switchMap(events => {
        if (events.some(event => event.status === 'LIVE'))
          throw new Error(appTranslate('Já existe um direto ativo nesta comunidade.'));
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
        void this.router.navigate(['/menu/communities'], {
           queryParams: { community: communityId, tab: 'feed', liveEvent: event.id }
         });
      },
      error: error => {
        this.liveStartError = error instanceof Error && error.message.startsWith('Sem permissão')
          ? error.message
          : error instanceof Error && error.message.startsWith('Já existe')
            ? error.message : appTranslate('Não foi possível iniciar o direto. Tenta novamente.');
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

  encodeLocation(value:string):string { return encodeURIComponent(value); }
  postLocationSuggestions: Venue[] = [];
  postRealPlaces: RealPlace[] = [];
  postLocationVerified = false;
  postLocationResolving = false;
  postLocationProvider: 'google' | 'open' | null = null;
  private postPlaceSessionToken = crypto.randomUUID();
  postLocationLoading = false;
  postLocationOpen = false;
  postLocationError = '';
  private postLocationQuerySerial = 0;
  private postLocationSearchSubscription?: Subscription;

  /** Debounced real map search; typing alone never creates a location sticker. */
  onPostLocationQuery(value: string): void {
    const query = value.trim();
    this.postLocationVerified = false;
    this.postLocationProvider = null;
    this.postLocationOpen = query.length >= 2;
    this.postLocationSuggestions = [];
    this.postRealPlaces = [];
    this.postLocationError = '';
    const serial = ++this.postLocationQuerySerial;
    this.postLocationSearchSubscription?.unsubscribe();
    this.postLocationLoading = this.postLocationOpen;
    if (!this.postLocationOpen || !this.realPlaceSearch) return;
    this.postLocationSearchSubscription = timer(400).pipe(
      switchMap(() => this.realPlaceSearch!.search(query,this.postPlaceSessionToken).pipe(
        timeout(8000), catchError(() => of([] as RealPlace[])))),
      takeUntil(this.destroyed)
    ).subscribe(places => {
      if (serial !== this.postLocationQuerySerial || !this.postLocationOpen) return;
      this.postRealPlaces = places;
      this.postLocationLoading = false;
      if (!places.length) this.postLocationError =
        appTranslate('Não foram encontrados locais verificados. Experimenta escrever o nome completo.');
    });
  }

  selectPostRealPlace(place: RealPlace): void {
    if(this.postLocationResolving) return;
    if(place.provider!=='google') {
      this.postLocation=[place.label,place.subtitle].filter(Boolean).join(', ').slice(0,160);
      this.postLocationVerified=true;
      this.postLocationProvider='open';
      this.postLocationOpen=false;
      this.postRealPlaces=[];
      this.postLocationQuerySerial++;
      return;
    }
    if(!this.realPlaceSearch)return;
    this.postLocationResolving=true;
    this.postLocationError='';
    const requestSerial=this.postLocationQuerySerial;
    this.realPlaceSearch.resolve(place,this.postPlaceSessionToken).pipe(
      timeout(10000),takeUntil(this.destroyed),
      finalize(()=>this.postLocationResolving=false)
    ).subscribe({
      next:verified=>{
        if(requestSerial!==this.postLocationQuerySerial)return;
        this.postLocation=[verified.label,verified.subtitle].filter(Boolean).join(', ').slice(0,160);
        this.postLocationVerified=true;
        this.postLocationProvider=verified.provider||'open';
        this.postLocationOpen=false;
        this.postRealPlaces=[];
        this.postLocationQuerySerial++;
        this.postPlaceSessionToken=crypto.randomUUID();
      },
      error:()=>this.postLocationError=appTranslate('Não foi possível verificar este local. Escolhe outro ou tenta novamente.')
    });
  }

  selectPostPlaceName(): void {
    this.postLocationError = appTranslate('Escolhe uma localização real da lista de sugestões.');
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
  private postTagQuerySerial = 0;
  private postTagSearchSubscription?: Subscription;

  openPostTagSearch(): void {
    this.postTagSearchOpen = !this.postTagSearchOpen;
    this.postTagSuggestions = [];
    this.postTagSearchLoading = false;
    this.postTagSearchSubscription?.unsubscribe();
    if (this.postTagSearchOpen && this.postTagQuery.trim().replace(/^@/,'').length >= 3)
      this.searchPostTags(this.postTagQuery);
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
    // The editor opens below the post (one wide column): bring it into view.
    setTimeout(() => {
      try { document.querySelector('.feed-photo-text-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch { /* ignore */ }
    }, 80);
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
    if (!input || (!this.photoTextDraft.trim() &&
      this.photoImageRotation === 0 && this.photoImageZoom === 1 &&
      this.photoImageX === 0 && this.photoImageY === 0)) return;
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
      this.photoTextError = error instanceof Error ? error.message : appTranslate('Não foi possível editar a fotografia.');
    } finally {
      this.photoTextSaving = false;
    }
  }

  postTagQuery = '';

  searchPostTags(query: string): void {
    const needle = query.trim().replace(/^@/, '');
    const serial = ++this.postTagQuerySerial;
    this.postTagSearchSubscription?.unsubscribe();
    this.postTagSuggestions = [];
    this.postTagSearchLoading = needle.length >= 3;
    if (!this.postTagSearchOpen || needle.length < 3) return;
    this.postTagSearchSubscription = timer(350).pipe(
      switchMap(() => this.communityService.searchProfiles(needle).pipe(timeout(8000),
        catchError(() => of([] as CommunityProfile[])))),
      takeUntil(this.destroyed)
    ).subscribe(profiles => {
      if (serial !== this.postTagQuerySerial || !this.postTagSearchOpen) return;
      this.postTagSuggestions = profiles.filter(profile =>
        !!profile.username &&
        profile.username.toLocaleLowerCase() !== this.currentUsername.toLocaleLowerCase()
      ).slice(0,8).map(profile => ({
        username:profile.username,fullName:profile.fullName,nickname:profile.nickname,
        profilePicUrl:profile.profilePicUrl,chatBlocked:false,blockedByMe:false
      }));
      this.postTagSearchLoading=false;
    });
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
  /** Occupancy is derived only from real session API counts; invalid limits display an empty bar. */
  sessionCapacityPercent(session: SessionSummary): number {
    const capacity = session.maxParticipants;
    const count = session.participantCount;
    if (!Number.isFinite(capacity) || capacity <= 0 || !Number.isFinite(count)) return 0;
    return Math.round(Math.max(0, Math.min(100, (count / capacity) * 100)));
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
  recentlyPublishedPostId: number | null = null;
  focusPublishedPost(): void {
    const id = this.recentlyPublishedPostId;
    if (!id) return;
    document.getElementById('jynlo-post-' + id)?.scrollIntoView({behavior: 'smooth', block: 'start'});
  }
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
  editingCommentId: number | null = null;
  editingCommentDraft = '';
  savingCommentId: number | null = null;
  likingCommentId: number | null = null;

  beginCommentEdit(comment:SocialComment):void {
    if (comment.authorUsername !== this.currentUsername || this.savingCommentId!==null) return;
    this.editingCommentId=comment.id;
    this.editingCommentDraft=comment.content;
  }
  cancelCommentEdit():void {
    if (this.savingCommentId!==null) return;
    this.editingCommentId=null;
    this.editingCommentDraft='';
  }
  saveCommentEdit(postId:number,comment:SocialComment):void {
    if (this.editingCommentId!==comment.id || this.savingCommentId!==null ||
        comment.authorUsername!==this.currentUsername) return;
    const value=this.editingCommentDraft.trim();
    if (!value || value.length>500) {
      this.actionError=appTranslate('O comentário deve ter entre 1 e 500 caracteres.');
      return;
    }
    if (value===comment.content) {this.cancelCommentEdit();return;}
    this.savingCommentId=comment.id;
    this.feedService.editComment(postId,comment.id,value).pipe(timeout(10000),
      finalize(()=>this.savingCommentId=null),takeUntil(this.destroyed)).subscribe({
        next:updated=>{
          Object.assign(comment,updated);
          this.editingCommentId=null;
          this.editingCommentDraft='';
        },
        error:()=>this.actionError=appTranslate('Não foi possível editar o comentário. Tenta novamente.')
      });
  }
  toggleCommentLike(postId:number,comment:SocialComment):void {
    if (this.likingCommentId!==null) return;
    this.likingCommentId=comment.id;
    const call=comment.likedByMe
      ? this.feedService.unlikeComment(postId,comment.id)
      : this.feedService.likeComment(postId,comment.id);
    call.pipe(timeout(10000),finalize(()=>this.likingCommentId=null),
      takeUntil(this.destroyed)).subscribe({
        next:updated=>{
          comment.likeCount=updated.likeCount;
          comment.likedByMe=updated.likedByMe;
        },
        error:()=>this.actionError=appTranslate('Não foi possível atualizar o gosto no comentário.')
      });
  }

  commentDrafts: Record<number, string> = {};
  errorMessage = '';
  actionError = '';
  sharingSessionId: number | null = null;
  shareFeedbackSessionId: number | null = null;
  shareFeedbackMessage = '';
  manualShareItem: FeedItem | null = null;
  manualShareUrl = '';

  readonly currentUsername: string;
  constructor(
    private feedService: SocialFeedService,
    private sessionService: SessionService,
    private authenticationService: AuthenticationService,
    private route: ActivatedRoute,
    private router: Router,
    private communityService: CommunityService,
    @Optional() private communityGroupsService: CommunityGroupsService | null = null,
    @Optional() private realtime: DirectChatRealtimeService | null = null,
    @Optional() private venueService: VenueService | null = null,
    @Optional() private communityLiveService: CommunityLiveService | null = null,
    @Optional() private personalLiveService: PersonalLiveService | null = null,
    @Optional() private realPlaceSearch: RealPlaceSearchService | null = null,
    @Optional() private postShareChat: DirectChatService | null = null,
    @Optional() private communityTimeline: CommunityTimelineService | null = null,
    @Optional() private sportsTeams: SportsTeamsService | null = null
  ) {
    this.authenticationService.isLoggedIn();
    this.currentUsername = this.authenticationService.loggedInPerfilname || '';
  }

  ngOnInit(): void {
    this.loadHiddenFeedEntries();
    this.load();
    this.connectLiveCounters();
    this.loadSuggestedPeople();
    this.preparePostGameMoment();
    this.prepareNewSessionShare();
    this.loadCompletedSessions();
    this.loadMyWeekCommunities();
    this.route.queryParamMap.pipe(takeUntil(this.destroyed)).subscribe(params => {
      // "Criar → Publicação" opens the composer, also when the feed is already open.
      // The flag is removed afterwards so the same menu item works every time.
      if (params.get('compose') === 'post') {
        this.openPostComposer();
        try {
          void this.router.navigate?.([], { relativeTo: this.route, queryParams: { compose: null },
            queryParamsHandling: 'merge', replaceUrl: true })?.catch(() => undefined);
        } catch { /* Opening the composer matters more than tidying the URL. */ }
      }
      const raw = params.get('personalLive');
      const valid = raw && /^[1-9][0-9]{0,12}$/.test(raw) && Number.isSafeInteger(Number(raw));
      const id = valid ? Number(raw) : null;
      if (id !== this.requestedPersonalLiveId) {
        this.requestedPersonalLiveId = id;
        this.openedPersonalLiveId = null;
        this.personalLiveError = '';
        if (id !== null) {
          // Changing the permalink must not keep the previous stream visible.
          if (this.personalLiveRoom && this.personalLiveRoom.id !== id)
            this.personalLiveRoom = null;
          if (this.personalLiveEvents.some(event => event.id === id && event.status === 'LIVE'))
            this.openRequestedPersonalLive();
          else if (!this.personalLiveLoading)
            this.refreshPersonalLive(); // Do not reject a newly started live using stale cached listings.
        }
      }
    });
    this.refreshPersonalLive();
    if(this.realtime){
      this.realtime.connect();
      // Older realtime mocks/providers may not expose the optional live signal.
      this.realtime.personalLiveInvalidated$?.pipe(takeUntil(this.destroyed))
        .subscribe(()=>this.refreshPersonalLive());
    }
    // Reconcile after connection loss; regular updates arrive via WebSocket.
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
          friends: this.communityService.friends().pipe(timeout(10_000)),
          known: (this.communityService.peopleYouMayKnow?.() ?? of([] as KnownSuggestion[])).pipe(timeout(10_000), catchError(() => of([] as KnownSuggestion[])))
        }).pipe(
          // Without the friends list, do not risk recommending existing friends.
          catchError(() => of({ profiles: [] as CommunityProfile[], friends: [], known: [] as KnownSuggestion[] })),
          switchMap(({ profiles, friends, known }) => {
            const friendNames = new Set(friends.map(friend => friend.username.toLowerCase()));
            return of(this.withKnownFirst(known, this.rankSuggestedPeople(profiles, me, friendNames), friendNames));
          })
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
      this.loadCommunityNews(this.myWeekCommunities);
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

  /** "Seguido por @a e @b": why a suggested person is shown (people you follow follow them). */
  suggestedReason = new Map<string, KnownSuggestion>();

  suggestedReasonText(username: string): string | null {
    const known = this.suggestedReason.get(username.toLowerCase());
    if (!known || !known.followedBy.length) return null;
    const [first, second] = known.followedBy;
    if (known.followedByCount === 1) return t('Seguido por @{{a}}', { a: first });
    if (known.followedByCount === 2 && second) return t('Seguido por @{{a}} e @{{b}}', { a: first, b: second });
    return t('Seguido por @{{a}} e mais {{n}}', { a: first, n: known.followedByCount - 1 });
  }

  private withKnownFirst(known: KnownSuggestion[], ranked: CommunityProfile[], friends: Set<string>): CommunityProfile[] {
    this.suggestedReason = new Map();
    const picked: CommunityProfile[] = [];
    for (const k of known) {
      const name = k.username?.trim().toLowerCase();
      if (!name || name === this.currentUsername.toLowerCase() || friends.has(name) || this.qaSuggestionUsernames.has(name)) continue;
      this.suggestedReason.set(name, k);
      picked.push({ ...(ranked.find(p => p.username.toLowerCase() === name) || {}), username: k.username, fullName: k.fullName,
        nickname: k.nickname, profilePicUrl: k.profilePicUrl } as CommunityProfile);
      if (picked.length === 3) return picked;
    }
    for (const p of ranked) {
      if (picked.length === 3) break;
      if (!picked.some(x => x.username.toLowerCase() === p.username.toLowerCase())) picked.push(p);
    }
    return picked;
  }

  /** What's new in each of my communities: unread messages, otherwise the next game. */
  communityNews = new Map<number, { unread: number }>();
  // Tests build this component with `new`: no injection context there, so no news.
  private readonly inboxApi = (() => { try { return inject(InboxApiService, { optional: true }); } catch { return null; } })();
  private loadCommunityNews(groups: CommunityGroup[]): void {
    if (!this.inboxApi || !groups.length) return;
    this.inboxApi.summaries(groups.map(g => ({ kind: 'community' as const, id: String(g.id) })))
      .pipe(timeout(10_000), catchError(() => of([])), takeUntil(this.destroyed))
      .subscribe(rows => {
        const next = new Map<number, { unread: number }>();
        for (const row of rows || []) next.set(Number(row.id), { unread: row.unreadCount || 0 });
        this.communityNews = next;
      });
  }
  /** "sex., 27/11 18:00" in the app's language (the date pipe would use English weekdays). */
  gameWhen(iso: string): string {
    let lang = 'pt-PT';
    try { lang = localStorage.getItem('d24-language') === 'en' ? 'en-GB' : 'pt-PT'; } catch { /* default */ }
    return new Intl.DateTimeFormat(lang, { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      timeZone: 'Europe/Lisbon' }).format(new Date(iso));
  }

  communityNextGame(communityId: number): SessionSummary | null {
    const now = Date.now();
    // Every session list the feed already has: my games, offers, discovered and suggested ones.
    const known = [...this.myWeekGames, ...this.myWeekOffers, ...this.myWeekDiscovered, ...this.suggestedSessions, ...this.availableSessions];
    return known
      .filter(s => s.communityId === communityId && Date.parse(s.gameDate) > now)
      .sort((a, b) => Date.parse(a.gameDate) - Date.parse(b.gameDate))[0] ?? null;
  }

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

  missingForGame(session: SessionSummary): number { return playersMissingForGame(session); }

  suggestedProfileImage(profile: Pick<CommunityProfile, 'profilePicUrl'>): string | null {
    const path = profile.profilePicUrl;
    if (!path) {
      return null;
    }
    if (path.startsWith('/api/profile-media/')) return path;

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
      // A moment link is a compose intent, not a request to browse the feed.
      // Open only after server-side session eligibility has been confirmed.
      this.openPostComposer();
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
    const generation = ++this.feedLoadGeneration;
    this.loading = true;
    this.errorMessage = '';

    this.feedService.feed()
      .pipe(
        timeout(10_000),
        retry({ count: 1 }),
        takeUntil(this.destroyed),
        finalize(() => { if (generation === this.feedLoadGeneration) this.loading = false; })
      )
      .subscribe({
        next: items => {
          if (generation !== this.feedLoadGeneration) return;
          const visible = items.filter(item => item.type !== 'SESSION_CREATED' ||
            item.sessionId === null || !this.cancelledFeedSessionIds.has(item.sessionId));
          this.items = this.preserveConfirmedPosts(visible);
          this.loadLikerPreviews();
          this.loadSharedPost();
        },
        error: () => {
          if (generation !== this.feedLoadGeneration) return;
          // Keep previously loaded posts and confirmed uploads visible offline.
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
        error: () => this.actionError = appTranslate('Esta publicação não está disponível ou não tens permissão para a ver.')
      });
  }

  feedCreatedWhen(iso: string, now: Date = new Date()): string {
    const date = new Date(iso);
    if (!Number.isFinite(date.getTime())) return '';
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const days = Math.round((today - day) / 86_400_000);
    if (days === 0) return appTranslate('Hoje');
    if (days === 1) return appTranslate('Ontem');
    if (days > 1 && days < 7) return appTranslate('Há {{n}} dias', {n: days});
    if (days >= 7 && days < 14) return appTranslate('Há 1 semana');
    if (days >= 14 && days < 30) return appTranslate('Há {{n}} semanas', {n: Math.floor(days / 7)});
    return date.toLocaleDateString('pt-PT');
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
    if (this.postDestination) {
      this.publishToDestination(this.postDestination, content);
      return;
    }
    if (location && !this.postLocationVerified) {
      this.actionError = appTranslate('Escolhe uma localização real da lista antes de publicar.');
      return;
    }

    this.posting = true;
    this.actionError = '';
    this.recentlyPublishedPostId = null;

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
          if (item?.type !== 'POST' || !Number.isSafeInteger(item.postId) || (item.postId ?? 0) <= 0) {
            this.actionError = appTranslate('O servidor não confirmou a publicação. Verifica o teu perfil antes de repetir.');
            return;
          }
          this.recentlyPublishedPostId = item.postId!;
          this.confirmedPosts.set(item.postId!, { item, expiresAt: Date.now() + 120_000 });
          this.items = this.preserveConfirmedPosts([item, ...this.items.filter(current => current.postId !== item.postId)]);
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
              this.actionError = appTranslate('Os ficheiros são demasiado grandes para o servidor. Reduz o tamanho e tenta novamente.');
              return;
            }
            if (error.status === 415) {
              this.actionError = appTranslate('O servidor recusou o formato do envio. Experimenta uma fotografia JPG/PNG ou vídeo MP4.');
              return;
            }
            if (error.status === 400 || error.status === 422) {
              this.actionError = appTranslate('O servidor recusou algum campo da publicação. Verifica o ficheiro e os dados e tenta novamente.');
              return;
            }
            if (error.status === 500 || error.status === 502 || error.status === 503 || error.status === 504) {
              this.actionError = appTranslate('O servidor não conseguiu guardar a publicação. A fotografia continua selecionada para tentares novamente.');
              return;
            }
            if (error.status === 401 || error.status === 403) {
              this.actionError = appTranslate('A sessão expirou ou não tens permissão para publicar. Inicia sessão novamente.');
              return;
            }
            if (error.status === 0) {
              this.actionError = appTranslate('Não foi possível contactar o servidor. Verifica a ligação e tenta novamente.');
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
      // An older FileReader may finish after another image or album is selected.
      if (this.postImageFile !== file) return;
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
    if (this.posting || !files.length) return;

    // A photo/video selected through the dedicated picker must remain in the
    // draft when the organiser later adds more files through the album picker.
    const existing = this.postGallery.map(item => item.file);
    if (!existing.length) {
      if (this.postImageFile) existing.push(this.postImageFile);
      if (this.postVideoFile) existing.push(this.postVideoFile);
    }
    const unique = [...existing];
    for (const file of files) {
      if (!unique.some(previous => previous === file ||
          (previous.name === file.name && previous.size === file.size &&
            previous.lastModified === file.lastModified && previous.type === file.type))) {
        unique.push(file);
      }
    }
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'];
    if (unique.length > 6 || unique.some(file => !allowed.includes(file.type)
        || file.size === 0 || file.size > (file.type.startsWith('video/') ? 20 : 5) * 1024 * 1024)
        || unique.reduce((sum, file) => sum + file.size, 0) > 60 * 1024 * 1024) {
      this.actionError = appTranslate('Até 6 fotografias ou vídeos, máximo de 60 MB no total (5 MB por foto e 20 MB por vídeo).');
      return;
    }

    // Create object URLs before clearing the old standalone preview. Reuse URLs
    // for existing album entries to avoid unnecessary allocations and flicker.
    const gallery = unique.map(file => {
      const previous = this.postGallery.find(entry => entry.file === file);
      return previous ?? { file, url: URL.createObjectURL(file) };
    });
    const removed = this.postGallery.filter(entry => !gallery.some(item => item.url === entry.url));
    for (const entry of removed) URL.revokeObjectURL(entry.url);
    this.postGallery = gallery;
    this.postGalleryIndex = Math.max(0, gallery.length - 1);
    this.removePostImage();
    this.removePostVideo();
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

  /** Instagram-style: one click opens the photo, a double click likes the post with a heart. */
  heartBurstPostId: number | null = null;
  private postImageClickTimer?: ReturnType<typeof setTimeout>;
  private heartBurstTimer?: ReturnType<typeof setTimeout>;

  onPostImageClick(item: FeedItem, index: number, event?: MouseEvent): void {
    if (this.postImageClickTimer) clearTimeout(this.postImageClickTimer);
    // Keyboard (Enter/Space) has no double click: open straight away.
    if (!event || event.detail === 0) { this.postImageClickTimer = undefined; this.openPostMedia(item, index); return; }
    this.postImageClickTimer = setTimeout(() => {
      this.postImageClickTimer = undefined;
      this.openPostMedia(item, index);
    }, 260);
  }

  onPostImageDoubleClick(item: FeedItem, event?: Event): void {
    event?.preventDefault();
    if (this.postImageClickTimer) clearTimeout(this.postImageClickTimer);
    this.postImageClickTimer = undefined;
    this.heartBurstPostId = item.postId ?? null;
    if (this.heartBurstTimer) clearTimeout(this.heartBurstTimer);
    this.heartBurstTimer = setTimeout(() => { this.heartBurstPostId = null; }, 900);
    // A double tap only ever likes (never removes a like), like Instagram.
    if (!item.likedByMe) this.toggleLike(item);
  }

  openPostMedia(item: FeedItem, index: number): void {
    const media = this.mediaForPost(item);
    if (index < 0 || index >= media.length) return;
    this.expandedMedia = media;
    this.expandedMediaIndex = index;
  }

  onPostLightboxClick(event: Event): void {
    event.stopPropagation();
    if (isLightboxBackdropClick(event)) this.closePostMedia();
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
      return count === 1 ? appTranslate('1 gosto') : appTranslate('{{n}} gostos', {n: count});
    }
    const display = item.postId !== null ? this.likerPreview[item.postId] : null;
    if (display) {
      return count === 1 ? appTranslate('Gostado por {{name}}', {name: display}) : appTranslate('Gostado por {{name}} e outras pessoas', {name: display});
    }
    return count === 1 ? appTranslate('Gostado por 1 pessoa') : appTranslate('Gostado por {{n}} pessoas', {n: count});
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
        error: () => { this.actionError = appTranslate('Não foi possível alterar a privacidade dos gostos.'); }
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

    void this.appDialog.prompt(t('feed.reportCommentReasonPrompt'), { confirmLabel: 'Denunciar', maxLength: 1000, placeholder: t('Explica o que se passa') }).then(reason => {
      if (!reason) return;

      const postId = item.postId;
      if (postId === null) return;
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

    void this.appDialog.prompt(t('feed.reportReasonPrompt'), { confirmLabel: 'Denunciar', maxLength: 1000, placeholder: t('Explica o que se passa') }).then(reason => {
      if (!reason) return;

      const postId = item.postId;
      if (postId === null) return;
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
      this.editingPostMediaError = appTranslate('Escolhe até 6 fotografias/vídeos (máximo 20 MB por ficheiro e 60 MB no total).');
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
      this.actionError = appTranslate('Adiciona uma descrição ou mantém uma fotografia/vídeo. Máximo de 1000 caracteres.');
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
        error: () => this.actionError = appTranslate('Não foi possível guardar a edição. A publicação original mantém-se.')
      });
  }

  pendingDeletePost: FeedItem | null = null;
  recentlyCancelledSession: FeedItem | null = null;
  cancellationShareText = '';
  cancellationShareNotice = '';
  pendingCancelSession: FeedItem | null = null;
  private pendingCancelSessionSnapshot: { id: number; sport: string | null; city: string | null; gameDate: string | null } | null = null;
  checkingCancelSessionId: number | null = null;
  cancellingSessionId: number | null = null;
  private readonly cancelledFeedSessionIds = new Set<number>();
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
          this.postShareFriendsError = appTranslate('Não foi possível carregar os teus amigos.');
          this.postShareLoadingFriends = false;
        }
      });
  }

  closePostFriendShare(): void {
    if (this.postShareSendingTo) return;
    this.postShareFriendsOpen = false;
  }

  sendPostToFriend(friend: FriendSummary): void {
    if (!this.postShareFriendsOpen || !this.postShareChat || this.postShareSendingTo ||
        !this.postShareFriends.some(user => user.username === friend.username)) return;
    this.postShareSendingTo = friend.username;
    this.postShareFriendsError = '';
    this.postShareChat.send(friend.username, appTranslate('Partilhei esta publicação contigo na Jynlo: {{link}}', {link: this.postShareLink})).pipe(timeout(12000),finalize(() => this.postShareSendingTo = null),
        takeUntil(this.destroyed)).subscribe({
      next: () => {
        this.postShareMessage = appTranslate('Publicação enviada para @{{user}}', {user: friend.username});
        this.postShareFriendsOpen = false;
      },
      error: () => this.postShareFriendsError = appTranslate('Não foi possível enviar. Verifica se podes trocar mensagens com este amigo.')
    });
  }
  postShareMessage = '';
  postShareLink = '';
  postShareTargetId: number | null = null;

  /** Optional manual communication for guests who joined without a Jynlo account.
   * Only public sport/city/time are included; never reveal arrival instructions. */
  private cancelledSessionMessage(item: Pick<FeedItem, 'sport' | 'city' | 'gameDate'>): string {
    return sessionCancellationNotice(item);
  }

  async shareCancelledSessionNotice(): Promise<void> {
    const item = this.recentlyCancelledSession;
    if (!item || !this.cancellationShareText) return;
    this.cancellationShareNotice = '';
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ text: this.cancellationShareText });
        this.cancellationShareNotice = 'Aviso partilhado.';
        return;
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
      }
    }
    try {
      await this.copyShareUrl(this.cancellationShareText);
      this.cancellationShareNotice = 'Aviso copiado. Envia-o aos participantes externos.';
    } catch {
      this.cancellationShareNotice = appTranslate('Seleciona e copia o texto para o grupo dos participantes.');
    }
  }

  /** The feed card is only a shortcut. Fetch current session details before
   * showing a destructive confirmation; the server still enforces ownership. */
  requestCancelSession(item: FeedItem): void {
    const id = item.sessionId;
    if (item.type !== 'SESSION_CREATED' || !Number.isSafeInteger(id) || id === null || id <= 0
      || !this.currentUsername || item.authorUsername.toLowerCase() !== this.currentUsername.toLowerCase()
      || this.checkingCancelSessionId !== null || this.cancellingSessionId !== null) return;
    this.checkingCancelSessionId = id;
    this.actionError = '';
    this.sessionService.detail(id).pipe(timeout(10_000), takeUntil(this.destroyed),
      finalize(() => this.checkingCancelSessionId = null)).subscribe({
      next: detail => {
        if (detail.creatorUsername?.toLowerCase() !== this.currentUsername.toLowerCase()
          || (detail.status !== 'OPEN' && detail.status !== 'FULL')) {
          this.actionError = appTranslate('Esta sessão já não pode ser cancelada ou não és o organizador.');
          return;
        }
        this.pendingCancelSessionSnapshot = {
          id, sport: detail.sport ?? item.sport, city: detail.city ?? item.city,
          gameDate: detail.gameDate ?? item.gameDate
        };
        this.pendingCancelSession = item;
      },
      error: () => this.actionError = appTranslate('Não foi possível verificar a sessão. Abre o detalhe antes de tentar novamente.')
    });
  }

  dismissCancelSession(): void {
    if (this.cancellingSessionId !== null) return;
    this.pendingCancelSession = null;
    this.pendingCancelSessionSnapshot = null;
  }

  confirmCancelSession(item: FeedItem): void {
    const id = item.sessionId;
    if (id === null || item.type !== 'SESSION_CREATED' || this.pendingCancelSession?.sessionId !== id
      || !this.currentUsername || item.authorUsername.toLowerCase() !== this.currentUsername.toLowerCase()
      || this.cancellingSessionId !== null) return;
    this.cancellingSessionId = id;
    this.actionError = '';
    this.sessionService.cancel(id).pipe(timeout(12_000), takeUntil(this.destroyed),
      finalize(() => this.cancellingSessionId = null)).subscribe({
      next: () => {
        this.cancelledFeedSessionIds.add(id);
        this.items = this.items.filter(entry => !(entry.type === 'SESSION_CREATED' && entry.sessionId === id));
        this.pendingCancelSession = null;
        this.recentlyCancelledSession = item;
        // The feed card may have an older sport/date/city. The snapshot was
        // fetched from the server immediately before the user confirmed.
        const confirmedDetails = this.pendingCancelSessionSnapshot?.id === id
          ? this.pendingCancelSessionSnapshot : item;
        this.cancellationShareText = this.cancelledSessionMessage(confirmedDetails);
        this.pendingCancelSessionSnapshot = null;
        this.cancellationShareNotice = appTranslate('Cancelamento confirmado. Os jogadores com conta Jynlo recebem a notificação interna; partilha este aviso com convidados externos.');
        this.loadCompletedSessions();
        this.load();
      },
      error: () => this.actionError =
        appTranslate('Não foi possível confirmar o cancelamento. Verifica o estado da sessão antes de repetir.')
    });
  }

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
        await navigator.share({ title: appTranslate('Publicação na Jynlo'), text: item.content || '', url });
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
      this.postShareMessage = appTranslate('Copia o endereço abaixo para partilhar');
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
          this.confirmedPosts.delete(item.postId!);
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
