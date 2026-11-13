import { HttpErrorResponse } from '@angular/common/http';
import { appTranslate as t } from '../../i18n/i18n.service';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit } from '@angular/core';
import { CommunityGroupsService } from '../../services/community-groups.service';
import { SessionService } from '../../services/session.service';
import { CommunityGroup } from '../model/community-group';
import { SessionSummary } from '../model/session-summary';
import { ActivatedRoute } from '@angular/router';
import { catchError, finalize, forkJoin, of, retry, Subscription, timeout } from 'rxjs';

import { environment } from 'src/environment/environment';
import { CommunityProfile } from '../model/community-profile';
import { ProfileActivity } from '../model/my-profile';
import { FeedItem } from '../model/feed-item';
import { SocialFeedService } from '../../services/social-feed.service';
import { SocialStoriesService } from '../../services/social-stories.service';
import { SocialStory } from '../model/social-story';
import { FollowStatus, FollowProfile } from '../model/follow';
import { CommunityService, FriendshipStatus, ProfileSearchFilters } from '../../services/community.service';
import { AuthenticationService } from '../../services/authethication.service';
import { ReliabilityService } from '../../services/reliability.service';
import { SocialGraphService } from '../../services/social-graph.service';
import { SPORTS_CATALOG } from '../../shared/sports-catalog';

@Component({
  selector: 'app-perfis',
  templateUrl: './perfis.component.html',
  styleUrls: ['./perfis.component.css', './perfis-v3-finish.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class PerfisComponent implements OnInit, OnDestroy {
  searchTerm = '';
  sportFilter = '';
  locationFilter = '';
  minAge: number | null = null;
  maxAge: number | null = null;
  levelFilter = '';
  readonly sportsCatalog = SPORTS_CATALOG;

  private appliedSearchFilters: ProfileSearchFilters | null = null;
  private searchSubscription?: Subscription;
  private routeSubscription?: Subscription;
  private profileSubscription?: Subscription;
  private detailSubscription?: Subscription;
  private blockStatusSubscription?: Subscription;
  private postsSubscription?: Subscription;
  private postsRevision = 0;
  private friendshipSubscription?: Subscription;
  private followListSubscription?: Subscription;
  profilePage = false;
  backToFriends = false;
  get backToFeed(): boolean {
    return this.route.snapshot.queryParamMap.get('from') === 'feed';
  }

  get backToDiscover(): boolean {
    const params = this.route.snapshot.queryParamMap;
    return params.get('from') === 'discover'
      || (params.get('from') === 'people' && params.get('via') === 'discover');
  }

  get backToPeopleSearch(): boolean {
    return this.route.snapshot.queryParamMap.get('from') === 'people';
  }

  get peopleProfileParams() {
    const filters = this.appliedSearchFilters;
    const originalDiscover = this.backToDiscover
      ? (this.discoverReturnParams || { sport: '', city: '', player: '' })
      : null;
    return {
      from: 'people',
      player: filters?.name || null,
      sport: filters?.sport || null,
      city: filters?.location || null,
      minAge: filters?.minAge ?? null,
      maxAge: filters?.maxAge ?? null,
      level: filters?.skillLevel || null,
      via: originalDiscover ? 'discover' : null,
      discoverSport: originalDiscover?.sport ?? null,
      discoverCity: originalDiscover?.city ?? null,
      discoverPlayer: originalDiscover?.player ?? null
    };
  }

  get peopleSearchReturnParams() {
    const params = this.route.snapshot.queryParamMap;
    return {
      from: 'people',
      player: params.get('player'),
      sport: params.get('sport'),
      city: params.get('city'),
      minAge: params.get('minAge'),
      maxAge: params.get('maxAge'),
      level: params.get('level'),
      via: params.get('via'),
      discoverSport: params.get('discoverSport'),
      discoverCity: params.get('discoverCity'),
      discoverPlayer: params.get('discoverPlayer')
    };
  }

  get discoverReturnParams(): { sport: string; city: string; player: string } | null {
    const params = this.route.snapshot.queryParamMap;
    const hasOriginalDiscoverFilters = params.get('from') === 'people'
      && params.get('via') === 'discover'
      && (params.has('discoverSport') || params.has('discoverCity') || params.has('discoverPlayer'));
    const sportKey = hasOriginalDiscoverFilters ? 'discoverSport' : 'sport';
    const cityKey = hasOriginalDiscoverFilters ? 'discoverCity' : 'city';
    const playerKey = hasOriginalDiscoverFilters ? 'discoverPlayer' : 'player';
    if (!params.has(sportKey) && !params.has(cityKey) && !params.has(playerKey)) {
      return null;
    }

    return {
      sport: params.get(sportKey) || '',
      city: params.get(cityKey) || '',
      player: params.get(playerKey) || ''
    };
  }

  profiles: CommunityProfile[] = [];
  selectedProfile?: CommunityProfile;
  selectedActivity?: ProfileActivity;
  profilePosts: FeedItem[] = [];
  expandedPost: FeedItem | null = null;
  profileStories:SocialStory[]=[];
  profileStoriesLoading=false;
  profileStoryViewerOpen=false;
  private profileStoriesSubscription?:Subscription;
  openProfileStories():void {
    if(!this.profileStories.length||this.selectedBlocked||this.blockStatusPending)return;
    this.profileStoryViewerOpen=true;
  }
  closeProfileStories():void {this.profileStoryViewerOpen=false;}
  private refreshProfileStories(username:string):void {
    this.profileStoriesSubscription?.unsubscribe();
    this.profileStoryViewerOpen=false;
    this.profileStories=[];
    this.profileStoriesLoading=true;
    this.profileStoriesSubscription=this.socialStories.profile(username).pipe(timeout(10000))
      .subscribe({
        next:stories=>{
          if(this.selectedProfile?.username!==username)return;
          this.profileStories=stories;
          this.profileStoriesLoading=false;
        },
        error:()=>{
          if(this.selectedProfile?.username===username)this.profileStoriesLoading=false;
        }
      });
  }


  openExpandedPost(post: FeedItem): void {
    if (post.type !== 'POST' || post.postId == null || this.selectedBlocked || this.blockStatusPending) return;
    this.expandedPost = post;
  }

  closeExpandedPost(): void { this.expandedPost = null; }
  postsPage = 0;
  postsHasMore = false;
  postsExpanded = false;
  postsLoading = false;
  postsLoadError = false;
  selectedFollowStatus?: FollowStatus;

  loading = false;
  actionLoading = false;
  followLoading = false;
  followListMode: 'followers' | 'following' | null = null;
  followListProfiles: FollowProfile[] = [];
  followListLoading = false;
  followListError = false;
  reportLoading = false;
  blockLoading = false;
  selectedBlocked = false;
  blockStatusPending = false;
  blockStatusError = false;
  reportOpen = false;
  reportReason = '';
  searched = false;

  errorMessage = '';
  actionError = '';
  actionSuccess = '';

  currentUsername = '';
  pendingFriendRequests = new Set<string>();
  friendUsernames = new Set<string>();
  selectedFriendshipStatus: FriendshipStatus | null = null;
  friendshipLoading = false;
  friendshipError = false;
  invitePanelOpen = false;
  inviteTab: 'community' | 'session' = 'community';
  inviteLoading = false;
  inviteBusyKey: string | null = null;
  inviteError = '';
  inviteSuccess = '';
  inviteCommunities: CommunityGroup[] = [];
  inviteSessions: SessionSummary[] = [];
  readonly sentInvites = new Set<string>();
  private inviteSubscription?: Subscription;
  private inviteSendSubscription?: Subscription;
  private inviteVersion = 0;

  get availableInviteCommunities(): CommunityGroup[] {
    const username = this.selectedProfile?.username.toLowerCase();
    return this.inviteCommunities.filter(group =>
      (group.myRole === 'OWNER' || group.myRole === 'ADMIN')
      && !group.members?.some(member => member.username.toLowerCase() === username));
  }

  get availableInviteSessions(): SessionSummary[] {
    const now = Date.now();
    // The /mine.created endpoint is scoped to sessions organised by this user.
    // Invitations are allowed for private and community-only sessions as well;
    // past and closed sessions are never offered.
    return this.inviteSessions.filter(session =>
      !['CANCELLED', 'COMPLETED'].includes(session.status?.toUpperCase() || '')
      && Number.isFinite(Date.parse(session.gameDate))
      && Date.parse(session.gameDate) > now);
  }

  toggleInvitePanel(): void {
    if (!this.selectedProfile || this.isOwnProfile(this.selectedProfile) || this.selectedBlocked) return;
    if (this.invitePanelOpen) { this.closeInvitePanel(); return; }
    this.invitePanelOpen = true;
    this.inviteTab = 'community';
    this.inviteError = '';
    this.inviteSuccess = '';
    this.inviteLoading = true;
    this.inviteCommunities = [];
    this.inviteSessions = [];
    const version = ++this.inviteVersion;
    this.inviteSubscription?.unsubscribe();
    this.inviteSubscription = forkJoin({
      communities: this.communityGroups.mine().pipe(timeout(12000),catchError(() => of(null))),
      sessions: this.sessionService.mine().pipe(timeout(12000),catchError(() => of(null)))
    }).subscribe(({ communities, sessions }) => {
      if (version !== this.inviteVersion || !this.invitePanelOpen) return;
      this.inviteLoading = false;
      this.inviteCommunities = communities ?? [];
      this.inviteSessions = sessions?.created ?? [];
      if (!communities && !sessions) this.inviteError = t('profileInvite.loadError');
    });
  }

  closeInvitePanel(): void {
    ++this.inviteVersion;
    this.inviteSubscription?.unsubscribe();
    this.inviteSendSubscription?.unsubscribe();
    this.invitePanelOpen = false;
    this.inviteLoading = false;
    this.inviteBusyKey = null;
    this.inviteError = '';
    this.inviteSuccess = '';
    this.inviteCommunities = [];
    this.inviteSessions = [];
  }

  sendProfileInvite(kind: 'community' | 'session', id: number): void {
    const person = this.selectedProfile;
    if (!person || this.isOwnProfile(person) || this.selectedBlocked || this.inviteBusyKey
        || !this.invitePanelOpen || !Number.isSafeInteger(id) || id <= 0) return;
    const eligible = kind === 'community'
      ? this.availableInviteCommunities.some(item => item.id === id)
      : this.availableInviteSessions.some(item => item.id === id);
    const key = kind + ':' + id + ':' + person.username.toLowerCase();
    if (!eligible || this.sentInvites.has(key)) return;
    const version = this.inviteVersion;
    this.inviteBusyKey = key;
    this.inviteError = '';
    this.inviteSuccess = '';
    const request = kind === 'community'
      ? this.communityGroups.invite(id, person.username)
      : this.sessionService.invitePlayer(id, person.username);
    this.inviteSendSubscription = request.pipe(timeout(12000)).subscribe({
      next: () => {
        if (version !== this.inviteVersion || this.selectedProfile?.username !== person.username) return;
        this.sentInvites.add(key);
        this.inviteBusyKey = null;
        this.inviteSuccess = t('profileInvite.sent');
      },
      error: () => {
        if (version !== this.inviteVersion || this.selectedProfile?.username !== person.username) return;
        this.inviteBusyKey = null;
        this.inviteError = t('profileInvite.sendError');
      }
    });
  }


  constructor(
    private communityService: CommunityService,
    private authenticationService: AuthenticationService,
    private reliabilityService: ReliabilityService,
    private socialGraphService: SocialGraphService,
    private route: ActivatedRoute,
    private communityGroups: CommunityGroupsService,
    private sessionService: SessionService,
    private socialFeed: SocialFeedService,
    private socialStories: SocialStoriesService
  ) {
    this.authenticationService.isLoggedIn();
    this.currentUsername = this.authenticationService.loggedInPerfilname || '';
  }

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    this.backToFriends = params.get('from') === 'friends';
    // A profile asks the API for its own authenticated relationship state.

    const source = params.get('from');
    if ((source === 'discover' || source === 'people')
        && !this.route.snapshot.paramMap.has('username')) {
      this.searchTerm = (params.get('player') || '').trim();
      if (source === 'discover' && this.searchTerm) {
        // Discover name search ignores sport and locality; retain that behaviour.
        this.sportFilter = '';
        this.locationFilter = '';
      } else {
        this.sportFilter = (params.get('sport') || '').trim();
        this.locationFilter = (params.get('city') || '').trim();
      }
      if (source === 'people') {
        this.minAge = this.ageFromQuery(params.get('minAge'));
        this.maxAge = this.ageFromQuery(params.get('maxAge'));
        const level = params.get('level') || '';
        this.levelFilter = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'].includes(level) ? level : '';
      }
      if (this.searchTerm || this.sportFilter || this.locationFilter
          || this.minAge !== null || this.maxAge !== null || this.levelFilter) {
        this.search();
      }
    }
    this.routeSubscription = this.route.paramMap.subscribe(params => {
      const username = params.get('username');
      this.profilePage = Boolean(username);
      if (username) {
        this.loadProfile(username);
      }
    });
  }

  ngOnDestroy(): void {
    this.searchSubscription?.unsubscribe();
    this.routeSubscription?.unsubscribe();
    this.profileSubscription?.unsubscribe();
    this.detailSubscription?.unsubscribe();
    this.blockStatusSubscription?.unsubscribe();
    this.friendshipSubscription?.unsubscribe();
    this.postsSubscription?.unsubscribe();
    this.profileStoriesSubscription?.unsubscribe();
    this.closeInvitePanel();
  }

  private ageFromQuery(value: string | null): number | null {
    if (value === null || !/^\d+$/.test(value)) {
      return null;
    }
    const age = Number(value);
    return Number.isInteger(age) && age >= 18 && age <= 99 ? age : null;
  }

  loadFriendshipStatus(username: string): void {
    this.friendshipSubscription?.unsubscribe();
    this.friendshipLoading = true;
    this.friendshipError = false;
    this.selectedFriendshipStatus = null;

    this.friendshipSubscription = this.communityService.friendshipStatus(username)
      .pipe(
        timeout(10_000),
        finalize(() => this.friendshipLoading = false)
      )
      .subscribe({
        next: status => {
          if (this.selectedProfile?.username.toLowerCase() !== username.toLowerCase()) return;
          this.selectedFriendshipStatus = status;
          this.friendshipError = false;
          if (status.friends) {
            this.friendUsernames.add(username.toLowerCase());
            this.pendingFriendRequests.delete(username);
          } else {
            this.friendUsernames.delete(username.toLowerCase());
            if (status.pendingRequest) this.pendingFriendRequests.add(username);
          }
          if (status.friends || status.pendingRequest) this.actionError = '';
        },
        error: () => {
          if (this.selectedProfile?.username.toLowerCase() !== username.toLowerCase()) return;
          this.friendshipError = true;
        }
      });
  }

  search(): void {
    const hasFilters = Boolean(
      this.searchTerm.trim()
      || this.sportFilter.trim()
      || this.locationFilter.trim()
      || this.levelFilter.trim()
      || this.minAge !== null
      || this.maxAge !== null
    );

    if (!hasFilters) {
      this.clearSearch();
      return;
    }

    if (
      this.minAge !== null
      && this.maxAge !== null
      && this.minAge > this.maxAge
    ) {
      this.errorMessage = t('feedback.community.invalidAgeRange');
      return;
    }

    this.searchSubscription?.unsubscribe();
    this.loading = true;
    this.errorMessage = '';
    this.actionError = '';
    this.actionSuccess = '';

    const filters: ProfileSearchFilters = {
      name: this.searchTerm.trim() || undefined,
      sport: this.sportFilter.trim() || undefined,
      location: this.locationFilter.trim() || undefined,
      minAge: this.minAge === null ? undefined : this.minAge,
      maxAge: this.maxAge === null ? undefined : this.maxAge,
      skillLevel: this.levelFilter || undefined
    };
    this.searchSubscription = this.communityService.findProfiles(filters)
      .pipe(
        timeout(10_000),
        retry({ count: 1 }),
        finalize(() => this.loading = false)
      )
      .subscribe({
        next: profiles => {
          this.appliedSearchFilters = { ...filters };
          this.profiles = profiles;
          this.searched = true;
          this.selectedProfile = undefined;
        },
        error: error => {
          // Keep the last successful result set and its navigation context.
          if (!this.appliedSearchFilters) {
            this.profiles = [];
            this.searched = true;
          }
          this.errorMessage = this.errorFrom(
            error,
            t('feedback.community.searchError')
          );
        }
      });
  }

  clearSearch(): void {
    this.searchSubscription?.unsubscribe();
    this.appliedSearchFilters = null;
    this.loading = false;
    this.profiles = [];
    this.searched = false;
    this.searchTerm = '';
    this.sportFilter = '';
    this.locationFilter = '';
    this.minAge = null;
    this.maxAge = null;
    this.levelFilter = '';
    this.selectedProfile = undefined;
    this.errorMessage = '';
    this.actionError = '';
    this.actionSuccess = '';
  }

  private loadProfile(username: string): void {
    this.profileSubscription?.unsubscribe();
    this.detailSubscription?.unsubscribe();
    this.blockStatusSubscription?.unsubscribe();
    this.friendshipSubscription?.unsubscribe();
    this.closeProfile();
    this.loading = true;
    this.errorMessage = '';
    this.actionError = '';
    this.actionSuccess = '';
    this.profileSubscription = this.communityService.publicProfile(username)
      .pipe(timeout(10_000), finalize(() => this.loading = false))
      .subscribe({
        next: profile => this.showProfile(profile),
        error: error => {
          this.errorMessage = this.errorFrom(error, t('community.profileLoadError'));
        }
      });
  }

  private showProfile(profile: CommunityProfile): void {
    this.closeFollowList();
    this.closeInvitePanel();
    this.sentInvites.clear();
    this.selectedProfile = profile;
    this.expandedPost = null;
    this.refreshProfileStories(profile.username);
    this.selectedActivity = undefined;
    this.selectedFollowStatus = undefined;
    this.selectedBlocked = false;
    this.blockStatusPending = false;
    this.blockStatusError = false;
    this.reportOpen = false;
    this.reportReason = '';
    this.actionError = '';
    this.actionSuccess = '';
    this.loadFriendshipStatus(profile.username);

    // Never infer permission from a failed or pending block-status request.
    this.checkProfileBlockStatus(profile.username);

    this.detailSubscription = forkJoin({
      activity: this.reliabilityService.activity(profile.username)
        .pipe(timeout(10_000), catchError(() => of(undefined))),
      followStatus: this.socialGraphService.status(profile.username)
        .pipe(timeout(10_000), catchError(() => of(undefined)))
    }).subscribe({
      next: ({ activity, followStatus }) => {
        if (this.selectedProfile?.username !== profile.username) return;
        this.selectedActivity = activity;
        this.selectedFollowStatus = followStatus;
      },
      error: () => {
        if (this.selectedProfile?.username !== profile.username) return;
        this.actionError = t('community.profileDetailsError');
      }
    });
  }

  checkProfileBlockStatus(username: string): void {
    if (this.selectedProfile?.username.toLowerCase() !== username.toLowerCase()) return;
    this.blockStatusSubscription?.unsubscribe();
    this.blockStatusPending = true;
    this.blockStatusError = false;
    this.blockStatusSubscription = this.communityService.userBlockStatus(username)
      .pipe(timeout(10_000))
      .subscribe({
        next: status => {
          if (this.selectedProfile?.username.toLowerCase() !== username.toLowerCase()) return;
          this.blockStatusPending = false;
          this.selectedBlocked = status.blocked;
          if (!status.blocked) this.loadProfilePosts(username);
        },
        error: () => {
          if (this.selectedProfile?.username.toLowerCase() !== username.toLowerCase()) return;
          this.blockStatusPending = false;
          this.blockStatusError = true;
          // Existing posts must not survive a failed permission recheck.
          this.postsSubscription?.unsubscribe();
          ++this.postsRevision;
          this.profilePosts = [];
          this.postsLoading = false;
          this.postsHasMore = false;
          this.postsExpanded = false;
        }
      });
  }

  /** Fetch published posts, ignoring late responses from a different profile. */
  loadProfilePosts(username: string, append = false): void {
    if (this.selectedProfile?.username.toLowerCase() !== username.toLowerCase()
        || this.selectedBlocked || this.blockStatusPending || this.blockStatusError
        || (append && (this.postsLoading || !this.postsHasMore))) return;
    this.postsSubscription?.unsubscribe();
    const revision = ++this.postsRevision;
    const page = append ? this.postsPage + 1 : 0;
    if (!append) {
      this.profilePosts = [];
      this.postsExpanded = false;
      this.postsPage = 0;
      this.postsHasMore = false;
    }
    this.postsLoading = true;
    this.postsLoadError = false;
    this.postsSubscription = this.socialFeed.profilePosts(username, page)
      .pipe(timeout(10_000))
      .subscribe({
        next: posts => {
          if (revision !== this.postsRevision || this.selectedBlocked
              || this.selectedProfile?.username.toLowerCase() !== username.toLowerCase()) return;
          const published = posts.filter(post => post.type === 'POST' && post.postId != null);
          const previous = append ? this.profilePosts : [];
          const known = new Set(previous.map(post => post.postId));
          this.profilePosts = [...previous, ...published.filter(post => !known.has(post.postId))];
          this.postsPage = page;
          this.postsHasMore = posts.length === 20;
          this.postsLoading = false;
        },
        error: () => {
          if (revision !== this.postsRevision || this.selectedBlocked
              || this.selectedProfile?.username.toLowerCase() !== username.toLowerCase()) return;
          this.postsLoading = false;
          this.postsLoadError = true;
        }
      });
  }

  loadMoreProfilePosts(): void {
    const username = this.selectedProfile?.username;
    if (username && this.postsExpanded) this.loadProfilePosts(username, true);
  }

  closeProfile(): void {
    this.closeFollowList();
    this.closeInvitePanel();
    this.expandedPost = null;
    this.profileStoriesSubscription?.unsubscribe();
    this.profileStories=[];
    this.profileStoryViewerOpen=false;
    this.sentInvites.clear();
    this.postsSubscription?.unsubscribe();
    ++this.postsRevision;
    this.profilePosts = [];
    this.postsPage = 0;
    this.postsHasMore = false;
    this.postsExpanded = false;
    this.postsLoading = false;
    this.postsLoadError = false;
    this.selectedProfile = undefined;
    this.selectedFriendshipStatus = null;
    this.friendshipLoading = false;
    this.friendshipError = false;
    this.selectedActivity = undefined;
    this.selectedFollowStatus = undefined;
    this.selectedBlocked = false;
    this.reportOpen = false;
    this.reportReason = '';
  }

  toggleBlock(profile: CommunityProfile): void {
    if (
      this.blockLoading
      || this.isOwnProfile(profile)
    ) {
      return;
    }

    this.blockLoading = true;
    this.actionError = '';
    this.actionSuccess = '';

    const request$ = this.selectedBlocked
      ? this.communityService.unblockUser(profile.username)
      : this.communityService.blockUser(profile.username);

    request$
      .pipe(
        timeout(10_000),
        finalize(() => this.blockLoading = false)
      )
      .subscribe({
        next: status => {
          this.selectedBlocked = status.blocked;
          this.blockStatusPending = false;
          this.blockStatusError = false;

          if (status.blocked) {
            this.postsSubscription?.unsubscribe();
            ++this.postsRevision;
            this.profilePosts = [];
            this.postsPage = 0;
            this.postsHasMore = false;
            this.postsExpanded = false;
            this.postsLoading = false;
            this.postsLoadError = false;
            this.selectedFollowStatus = undefined;
            this.friendUsernames.delete(profile.username.toLowerCase());
            this.selectedFriendshipStatus = { friends: false, pendingRequest: false };
            this.pendingFriendRequests.delete(profile.username);
            this.reportOpen = false;
            this.reportReason = '';
            this.closeInvitePanel();
          }

          if (!status.blocked) {
            this.loadFriendshipStatus(profile.username);
            this.loadProfilePosts(profile.username);
          }
          this.actionSuccess = status.blocked
            ? t('feedback.community.blocked', { username: profile.username })
            : t('feedback.community.unblocked', { username: profile.username });
        },
        error: error => {
          this.actionError = this.errorFrom(
            error,
            t('feedback.community.blockError')
          );
        }
      });
  }

  toggleReport(): void {
    if (this.reportLoading) {
      return;
    }

    this.reportOpen = !this.reportOpen;
    this.reportReason = '';
    this.actionError = '';
    this.actionSuccess = '';
  }

  submitReport(profile: CommunityProfile): void {
    const reason = this.reportReason.trim();

    if (
      this.reportLoading
      || this.isOwnProfile(profile)
      || this.selectedBlocked
      || !reason
    ) {
      return;
    }

    this.reportLoading = true;
    this.actionError = '';
    this.actionSuccess = '';

    this.communityService.reportUser(profile.username, reason)
      .pipe(
        timeout(10_000),
        finalize(() => this.reportLoading = false)
      )
      .subscribe({
        next: () => {
          this.reportOpen = false;
          this.reportReason = '';
          this.actionSuccess = t('feedback.community.reported', { username: profile.username });
        },
        error: error => {
          this.actionError = this.errorFrom(
            error,
            t('feedback.community.reportError')
          );
        }
      });
  }

  toggleFollow(profile: CommunityProfile): void {
    if (
      this.followLoading
      || this.isOwnProfile(profile)
      || this.selectedBlocked
    ) {
      return;
    }

    this.followLoading = true;
    this.actionError = '';
    this.actionSuccess = '';

    const request$ = this.selectedFollowStatus?.followedByMe
      ? this.socialGraphService.unfollow(profile.username)
      : this.socialGraphService.follow(profile.username);

    request$
      .pipe(
        timeout(10_000),
        finalize(() => this.followLoading = false)
      )
      .subscribe({
        next: status => {
          if (this.selectedProfile?.username.toLowerCase() !== profile.username.toLowerCase()) return;
          this.selectedFollowStatus = status;
          this.actionSuccess = status.followedByMe
            ? t('feedback.social.followed', { username: profile.username })
            : t('feedback.social.unfollowed', { username: profile.username });
        },
        error: error => {
          if (this.selectedProfile?.username.toLowerCase() !== profile.username.toLowerCase()) return;
          this.actionError = this.errorFrom(
            error,
            t('feedback.social.followError')
          );
        }
      });
  }

  sendFriendRequest(profile: CommunityProfile): void {
    if (
      this.actionLoading
      || this.isOwnProfile(profile)
      || this.selectedBlocked
      || this.isFriend(profile)
      || this.friendshipLoading
      || this.friendshipError
      || (this.selectedProfile?.username === profile.username && !this.selectedFriendshipStatus)
      || this.friendRequestPending(profile)
    ) {
      return;
    }

    this.actionLoading = true;
    this.actionError = '';
    this.actionSuccess = '';

    this.communityService.sendFriendRequest(profile.username)
      .pipe(
        timeout(10_000),
        finalize(() => this.actionLoading = false)
      )
      .subscribe({
        next: () => {
          this.pendingFriendRequests.add(profile.username);
          if (this.selectedProfile?.username.toLowerCase() !== profile.username.toLowerCase()) return;
          this.selectedFriendshipStatus = { friends: false, pendingRequest: true };
          this.actionSuccess = t('feedback.community.requestSent', { username: profile.username });
        },
        error: error => {
          const message = this.errorFrom(
            error,
            t('feedback.community.requestError')
          );

          if (message.toLowerCase().includes('pendente')) {
            this.pendingFriendRequests.add(profile.username);
          }

          if (this.selectedProfile?.username.toLowerCase() !== profile.username.toLowerCase()) return;
          this.actionError = message;
          // The relation may have changed in another tab. Reconcile rather than
          // leaving an erroneous 'send request' action visible indefinitely.
          if (this.selectedProfile?.username === profile.username) {
            this.loadFriendshipStatus(profile.username);
          }
        }
      });
  }

  openFollowList(mode: 'followers' | 'following'): void {
    if (!this.selectedProfile || this.selectedBlocked) return;
    const username = this.selectedProfile.username;
    // Cancel the previous request before switching tabs/profiles. A late
    // response must never overwrite the active list or its loading state.
    this.followListSubscription?.unsubscribe();
    this.followListMode = mode;
    this.followListProfiles = [];
    this.followListLoading = true;
    this.followListError = false;
    this.followListSubscription = (mode === 'followers'
      ? this.socialGraphService.followers(username)
      : this.socialGraphService.following(username))
      .pipe(timeout(10000))
      .subscribe({
        next: profiles => {
          if (this.selectedProfile?.username !== username || this.followListMode !== mode) return;
          this.followListProfiles = profiles;
          this.followListLoading = false;
        },
        error: () => {
          if (this.selectedProfile?.username !== username || this.followListMode !== mode) return;
          this.followListError = true;
          this.followListLoading = false;
        }
      });
  }

  closeFollowList(): void {
    this.followListSubscription?.unsubscribe();
    this.followListSubscription = undefined;
    this.followListMode = null;
    this.followListProfiles = [];
    this.followListLoading = false;
    this.followListError = false;
  }

  isOwnProfile(profile: CommunityProfile): boolean {
    const authenticated = (this.currentUsername || '').trim().toLowerCase();
    return !!authenticated && profile.username.trim().toLowerCase() === authenticated;
  }

  friendRequestPending(profile: CommunityProfile): boolean {
    return this.selectedProfile?.username === profile.username
      ? Boolean(this.selectedFriendshipStatus?.pendingRequest)
      : this.pendingFriendRequests.has(profile.username);
  }

  isFriend(profile: CommunityProfile): boolean {
    return this.selectedProfile?.username === profile.username
      ? Boolean(this.selectedFriendshipStatus?.friends)
      : this.friendUsernames.has(profile.username.toLowerCase());
  }

  profileImage(profile: CommunityProfile): string | null {
    const path = profile.profilePicUrl;
    if (!path) {
      return null;
    }

    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
      return path;
    }

    return environment.apiUrl + (path.startsWith('/') ? path : '/' + path);
  }

  initials(profile: CommunityProfile): string {
    const source = profile.nickname?.trim()
      || profile.fullName?.trim()
      || profile.username;
    return source
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(value => value.charAt(0).toUpperCase())
      .join('');
  }

  private errorFrom(error: HttpErrorResponse, fallback: string): string {
    const apiMessage = error.error?.message;
    return typeof apiMessage === 'string' && apiMessage.trim()
      ? apiMessage
      : fallback;
  }
}
