import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, Optional } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subject, auditTime, catchError, finalize, forkJoin, of, retry, switchMap, takeUntil, timeout } from 'rxjs';

import { environment } from 'src/environment/environment';
import { appTranslate as t } from '../../i18n/i18n.service';
import { AuthenticationService } from '../../services/authethication.service';
import { SocialFeedService } from '../../services/social-feed.service';
import { DirectChatRealtimeService } from '../../services/direct-chat-realtime.service';
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

@Component({
  selector: 'app-social-feed',
  templateUrl: './social-feed.component.html',
  styleUrls: ['./social-feed.component.css', './social-feed-concept-one-refresh.css', './social-feed-neon-glass.css', './social-feed-action-polish.css'],
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

  hideFromMyFeed(item: FeedItem): void {
    const key = this.feedEntryKey(item);
    if (!this.currentUsername || !key) return;
    this.hiddenFeedEntries.add(key);
    this.recentlyHiddenFeedEntry = key;
    this.persistHiddenFeedEntries();
  }

  undoHideFromMyFeed(): void {
    const key = this.recentlyHiddenFeedEntry;
    if (!key) return;
    this.hiddenFeedEntries.delete(key);
    this.recentlyHiddenFeedEntry = null;
    this.persistHiddenFeedEntries();
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
  postContent = '';
  postLocation = '';
  postImageFile?: File;
  postImagePreview = '';
  postVideoFile?: File;
  postVideoPreview = '';
  postGallery: { file: File; url: string }[] = [];
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
    @Optional() private realtime: DirectChatRealtimeService | null = null
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

  suggestedProfileImage(profile: CommunityProfile): string | null {
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
        },
        error: () => {
          this.items = [];
          this.errorMessage = t('feedback.feed.loadError');
        }
      });
  }

  get canPublishPost(): boolean {
    return !this.posting && !!(this.postContent.trim() || this.postImageFile
      || this.postVideoFile || this.postGallery.length);
  }

  publish(): void {
    const content = this.postContent.trim();
    const location = this.postLocation.trim();
    if (!this.canPublishPost) return;

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
          this.postImageFile = undefined;
          this.postImagePreview = '';
          this.removePostVideo();
          this.clearPostGallery();
          this.selectedSessionId = null;
          this.postGameSessionId = null;
          this.newSessionShareId = null;
        },
        error: (error: unknown) => {
          if (error instanceof HttpErrorResponse) {
            if (error.status === 413) {
              this.actionError = 'Os ficheiros são demasiado grandes para o servidor. Reduz o tamanho e tenta novamente.';
              return;
            }
            if (error.status === 415) {
              this.actionError = 'Este formato de fotografia ou vídeo não é suportado.';
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
    this.actionError = '';
  }

  removePostGalleryItem(index: number): void {
    if (this.posting || index < 0 || index >= this.postGallery.length) return;
    const [item] = this.postGallery.splice(index, 1);
    URL.revokeObjectURL(item.url);
  }

  clearPostGallery(): void {
    for (const item of this.postGallery) URL.revokeObjectURL(item.url);
    this.postGallery = [];
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

  deletePost(item: FeedItem): void {
    if (
      item.type !== 'POST'
      || item.postId === null
      || item.authorUsername !== this.currentUsername
      || this.deletingPostId !== null
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
