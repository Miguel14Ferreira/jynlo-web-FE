import { appTranslate } from '../../i18n/i18n.service';
import { CommonModule } from '@angular/common';
import { ProtectedMediaDirective } from '../../shared/protected-media.directive';
import { ChangeDetectorRef, Component, ElementRef, HostListener, OnDestroy, OnInit, Optional, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { catchError, distinctUntilChanged, EMPTY, finalize, map, of, Subject, Subscription, takeUntil, timeout, switchMap, timer } from 'rxjs';

import { environment } from 'src/environment/environment';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { appTranslate as t, I18nService } from '../../i18n/i18n.service';
import { DirectChatService } from '../../services/direct-chat.service';
import { CommunityGroupsService } from '../../services/community-groups.service';
import { SportsTeamsService, SportsTeam } from '../../services/sports-teams.service';
import { SocialStoriesService, type StoryAudience } from '../../services/social-stories.service';
import { CommunityGroup } from '../model/community-group';
import { SocialStory } from '../model/social-story';
import { VenueService } from '../../services/venue.service';
import { Venue } from '../model/venue';
import { RealPlace, RealPlaceSearchService } from '../../services/real-place-search.service';
import { CommunityService } from '../../services/community.service';
import { MovableTextComponent, TextPlacement } from './movable-text.component';
import { FriendSummary } from '../model/friend-summary';
import { CommunityProfile } from '../model/community-profile';

interface StoryGroup {
  key: string;
  name: string;
  avatar: string | null;
  stories: SocialStory[];
}

@Component({
  selector: 'app-social-stories',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, TranslatePipe, MovableTextComponent, ProtectedMediaDirective],
  templateUrl: './social-stories.component.html',
  styleUrls: ['./social-stories.component.css', './story-create-editor.css']
})
export class SocialStoriesComponent implements OnInit, OnDestroy {
  entries: SocialStory[] = [];
  mineEntries: SocialStory[] = [];
  private feedRequestVersion = 0;
  private mineRequestVersion = 0;
  private readonly confirmedStories = new Map<number, { story: SocialStory; until: number }>();

  private retainConfirmedStories(received: SocialStory[]): SocialStory[] {
    const now = Date.now();
    for (const [id, value] of this.confirmedStories) {
      if (value.until <= now || received.some(story => story.id === id)) this.confirmedStories.delete(id);
    }
    const pending = [...this.confirmedStories.values()].map(item => item.story);
    const pendingIds = new Set(pending.map(item => item.id));
    return [...pending, ...received.filter(story => !pendingIds.has(story.id))];
  }
  mineLoading = true;
  mineError = '';
  groups: CommunityGroup[] = [];
  ownedTeams: SportsTeam[] = [];
  loading = true;
  composerOpen = false;
  uploading = false;
  deleting = false;
  deleteConfirmOpen = false;
  deleteError = '';
  caption = '';
  communityId = '';
  file: File | null = null;
  filePreview: string | null = null;
  /** Keep the selected media in the editor after any failed POST. */
  publishError = '';
  storyTextScale: 'small' | 'medium' | 'large' = 'medium';
  storyTextPosition: 'top' | 'center' | 'bottom' = 'bottom';
  storyTextStyle: 'plain' | 'pill' = 'pill';
  storyTextColor: 'white' | 'black' | 'yellow' | 'mint' | 'pink' | 'blue' = 'white';
  storyTextBackground: 'dark' | 'light' | 'none' = 'dark';
  storyTextFont: 'modern' | 'classic' | 'mono' = 'modern';

  get storyTextColorCss(): string {
    return {white:'#ffffff', black:'#020617', yellow:'#fef08a',
      mint:'#5eead4', pink:'#f9a8d4', blue:'#93c5fd'}[this.storyTextColor];
  }
  get storyTextBackgroundCss(): string {
    return this.storyTextBackground === 'none' ? 'transparent'
      : this.storyTextBackground === 'light' ||
        (this.storyTextBackground === 'dark' && this.storyTextColor === 'black')
        ? 'rgba(255,255,255,.88)' : 'rgba(2,15,24,.8)';
  }
  get storyTextFontCss(): string {
    return {modern:'system-ui,sans-serif', classic:'Georgia,serif',
      mono:'monospace'}[this.storyTextFont];
  }
  storyViewTextColor(story: SocialStory): string {
    return {white:'#ffffff', black:'#020617', yellow:'#fef08a',
      mint:'#5eead4', pink:'#f9a8d4', blue:'#93c5fd'}[story.textColor || 'white'] || '#ffffff';
  }
  storyViewTextBackground(story: SocialStory): string {
    if (story.textBackground === 'none' || story.textStyle === 'plain') return 'transparent';
    return story.textBackground === 'light' ||
      ((story.textBackground === 'dark' || !story.textBackground) && story.textColor === 'black')
      ? 'rgba(255,255,255,.88)' : 'rgba(2,15,24,.8)';
  }
  storyViewTextFont(story: SocialStory): string {
    return {modern:'system-ui,sans-serif',classic:'Georgia,serif',
      mono:'monospace'}[story.textFont || 'modern'] || 'system-ui,sans-serif';
  }
  storyPlaceUrl(label: string): string {
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(label);
  }
  storyTextPlacement: TextPlacement = {x:50,y:74,rotation:0,scale:1};
  storyAltText = '';
  storyShowTime = false;
  storyLocation = '';
  private readonly realPlaceSearch = inject(RealPlaceSearchService);
  storyRealPlaces: RealPlace[] = [];
  storyLocationVerified = false;
  storyLocationResolving = false;
  private storyPlaceSessionToken = crypto.randomUUID();
  storyLocationSearchOpen = false;
  storyLocationSearching = false;
  private storyLocationSearchSerial = 0;
  private storyLocationSearchSubscription?: Subscription;

  searchStoryLocation(value: string): void {
    const input = value.trim();
    this.storyLocationVerified = false;
    this.storyLocationSearchOpen = input.length >= 2;
    this.storyRealPlaces = [];
    const serial = ++this.storyLocationSearchSerial;
    this.storyLocationSearchSubscription?.unsubscribe();
    this.storyLocationSearching = this.storyLocationSearchOpen;
    if (!this.storyLocationSearchOpen) return;
    this.storyLocationSearchSubscription = timer(400).pipe(
      switchMap(() => this.realPlaceSearch.search(input,this.storyPlaceSessionToken).pipe(
        timeout(8000), catchError(() => of([] as RealPlace[])))),
      takeUntil(this.destroyed)
    ).subscribe(places => {
      if (serial !== this.storyLocationSearchSerial || !this.storyLocationSearchOpen) return;
      this.storyRealPlaces = places;
      this.storyLocationSearching = false;
      this.changeDetector.markForCheck();
    });
  }

  chooseStoryRealPlace(place: RealPlace): void {
    if(this.storyLocationResolving)return;
    if(place.provider!=='google') {
      this.setStoryVerifiedPlace(place);
      return;
    }
    this.storyLocationResolving=true;
    const requestSerial=this.storyLocationSearchSerial;
    this.realPlaceSearch.resolve(place,this.storyPlaceSessionToken).pipe(
      timeout(10000),takeUntil(this.destroyed),
      finalize(()=>{this.storyLocationResolving=false;this.changeDetector.markForCheck();})
    ).subscribe({
      next:verified=>{
        if(requestSerial!==this.storyLocationSearchSerial)return;
        this.setStoryVerifiedPlace(verified);
        this.storyPlaceSessionToken=crypto.randomUUID();
      },
      error:()=>{
        this.publishError=appTranslate('Não foi possível verificar este local. Tenta novamente.');
        this.changeDetector.markForCheck();
      }
    });
  }
  private setStoryVerifiedPlace(place:RealPlace):void {
    this.storyLocation=[place.label,place.subtitle].filter(Boolean).join(', ').slice(0,160);
    this.storyLocationVerified=true;
    this.storyLocationSearchOpen=false;
    this.storyLocationSearchSerial++;
    this.storyRealPlaces=[];
    this.publishError='';
    this.changeDetector.markForCheck();
  }

  storyTagQuery = '';
  storyTagOpen = false;
  storyTagLoading = false;
  storyTagResults: FriendSummary[] = [];
  storyTaggedProfiles: FriendSummary[] = [];
  private storyTagQuerySerial = 0;
  private storyTagSubscription?: Subscription;

  toggleStoryTags(): void {
    this.storyTagOpen=!this.storyTagOpen;
    this.storyTagResults=[];
    this.storyTagLoading=false;
    this.storyTagSubscription?.unsubscribe();
    if (this.storyTagOpen && this.storyTagQuery.trim().replace(/^@/,'').length>=3)
      this.searchStoryTag(this.storyTagQuery);
  }

  searchStoryTag(query: string): void {
    const term=query.trim().replace(/^@/,'');
    const serial=++this.storyTagQuerySerial;
    this.storyTagSubscription?.unsubscribe();
    this.storyTagResults=[];
    this.storyTagLoading=this.storyTagOpen && term.length>=3;
    if (!this.storyTagOpen || term.length<3 || !this.profiles) return;
    this.storyTagSubscription=timer(350).pipe(switchMap(()=>
      this.profiles!.searchProfiles(term).pipe(timeout(8000),
        catchError(()=>of([] as CommunityProfile[])))),
      takeUntil(this.destroyed)).subscribe(profiles=>{
        if (serial!==this.storyTagQuerySerial || !this.storyTagOpen) return;
        const already=new Set(this.storyTaggedProfiles.map(p=>p.username.toLowerCase()));
        this.storyTagResults=profiles.filter(profile=>!!profile.username &&
          !already.has(profile.username.toLowerCase())).slice(0,8).map(profile=>({
          username:profile.username,fullName:profile.fullName,nickname:profile.nickname,
          profilePicUrl:profile.profilePicUrl,blockedByMe:false,chatBlocked:false
        }));
        this.storyTagLoading=false;
        this.changeDetector.markForCheck();
      });
  }

  addStoryTag(profile: FriendSummary): void {
    if (this.storyTaggedProfiles.length >= 5
        || this.storyTaggedProfiles.some(item => item.username.toLowerCase() === profile.username.toLowerCase())) return;
    this.storyTaggedProfiles = [...this.storyTaggedProfiles, profile];
    this.searchStoryTag('');
    this.storyTagQuery = '';
    this.changeDetector.markForCheck();
  }

  removeStoryTag(username: string): void {
    this.storyTaggedProfiles = this.storyTaggedProfiles.filter(profile => profile.username !== username);
    this.searchStoryTag(this.storyTagQuery);
  }

  storyViewerTags(story: SocialStory): string[] {
    return (story.taggedUsernames || '').split(',').map(tag => tag.trim()).filter(Boolean).slice(0, 5);
  }


  readonly storyEditorTime = new Date();
  private readonly maxCaption = 180;

  openComposer(): void {
    this.composerOpen = true;
    this.publishError = '';
    this.changeDetector.markForCheck();
  }

  closeComposer(): void {
    if (this.uploading) return;
    this.composerOpen = false;
    this.publishError = '';
    // Keep the draft, but do not let old asynchronous search results
    // re-open suggestion panels when the editor is opened again.
    ++this.storyLocationSearchSerial;
    ++this.storyTagQuerySerial;
    this.storyLocationSearchSubscription?.unsubscribe();
    this.storyTagSubscription?.unsubscribe();
    this.storyLocationSearchOpen = false;
    this.storyLocationSearching = false;
    this.storyRealPlaces = [];
    this.storyTagOpen = false;
    this.storyTagLoading = false;
    this.storyTagResults = [];
    this.changeDetector.markForCheck();
  }

  get captionPreview(): string {
    return this.caption.trim();
  }

  toggleTextStyle(): void {
    this.storyTextStyle = this.storyTextStyle === 'pill' ? 'plain' : 'pill';
  }

  changeTextPosition(): void {
    this.storyTextPosition = this.storyTextPosition === 'bottom'
      ? 'center' : this.storyTextPosition === 'center' ? 'top' : 'bottom';
  }

  private publishingErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 413) return appTranslate('O ficheiro é demasiado grande para enviar. Escolhe um mais pequeno.');
      if (error.status === 401) return appTranslate('A tua sessão terminou. Inicia sessão antes de publicar.');
      if (error.status === 403) return appTranslate('Não tens permissão para publicar nesta comunidade.');
      if (error.status === 415) return appTranslate('Formato não suportado. Usa JPG, PNG, WebP, MP4 ou WebM.');
      if (error.status === 400) return appTranslate('Este ficheiro não foi aceite. Experimenta uma imagem JPG/PNG diferente.');
      if (error.status === 502 || error.status === 503 || error.status === 504 || error.status === 0)
        return appTranslate('O servidor de imagens está temporariamente indisponível. A fotografia continua aqui para tentares novamente.');
      if (error.status >= 500) return appTranslate('O servidor não conseguiu guardar a Story. O ficheiro foi mantido para repetires.');
    }
    return appTranslate('Não foi possível publicar. A fotografia continua selecionada; tenta novamente.');
  }

  error = '';
  feedback = '';
  activeStory: SocialStory | null = null;
  audienceOpen = false;
  audienceBusy = false;
  audienceError = '';
  audienceData: StoryAudience | null = null;
  isStoryAuthor(story: SocialStory): boolean {
    return this.mineEntries.some(entry => entry.id === story.id);
  }
  openAudience(): void {
    const story = this.activeStory;
    if (!story || !this.isStoryAuthor(story) || this.audienceBusy) return;
    this.audienceOpen = true;
    this.audienceBusy = true;
    this.audienceError = '';
    this.viewerPaused = true;
    this.stories.audience(story.id).pipe(takeUntil(this.destroyed)).subscribe({
      next: response => {
        if (this.activeStory?.id !== story.id) return;
        this.audienceData = response;
        this.audienceBusy = false;
        this.changeDetector.markForCheck();
      },
      error: () => {
        if (this.activeStory?.id !== story.id) return;
        this.audienceError = appTranslate('Não foi possível carregar as visualizações.');
        this.audienceBusy = false;
        this.changeDetector.markForCheck();
      }
    });
  }
  closeAudience(): void {
    this.audienceOpen = false;
    this.viewerPaused = false;
    this.lastFrameAt = Date.now();
    this.syncVideo();
  }

  currentGroup: SocialStory[] = [];
  storyIndex = 0;
  private readonly destroyed = new Subject<void>();

  // Instagram-style viewer: the only player controls are story gestures,
  // a discreet audio toggle and the progress strips. No native video chrome.
  @ViewChild('storyVideo') storyVideo?: ElementRef<HTMLVideoElement>;
  viewElapsedMs = 0;
  viewDurationMs = 7000;
  imageLoaded = false;
  private readonly reportedViews = new Set<number>();
  private recordRenderedView(): void {
    const active = this.activeStory;
    if (!active || this.reportedViews.has(active.id)) return;
    this.reportedViews.add(active.id);
    this.stories.recordView(active.id).pipe(takeUntil(this.destroyed)).subscribe({
      error: () => this.reportedViews.delete(active.id)
    });
  }
  mediaFailed = false;
  autoplayFailed = false;
  viewerPaused = false;
  menuOpen = false;
  muted = true;
  replyText = '';
  replyFocused = false;
  replying = false;
  readonly heartReactionsSent = new Set<number>();
  private viewerTimer: ReturnType<typeof setInterval> | null = null;
  private lastFrameAt = 0;

  get viewerProgress(): number {
    return Math.min(100, Math.max(0, this.viewElapsedMs / Math.max(1, this.viewDurationMs) * 100));
  }

  storyLabel(story: SocialStory): string {
    return story.teamName || story.communityName || '@' + story.authorUsername.replace(/^@/, '');
  }

  storyAvatar(story: SocialStory): string | null {
    return this.media(story.teamId != null ? story.teamLogoUrl : story.communityId !== null ? story.communityPhotoUrl : story.avatarUrl);
  }

  private startViewer(story: SocialStory): void {
    this.stopViewerTimer();
    this.activeStory = story;
    this.viewElapsedMs = 0;
    this.viewDurationMs = 7000;
    this.imageLoaded = false;
    this.mediaFailed = false;
    this.autoplayFailed = false;
    this.viewerPaused = false;
    this.menuOpen = false;
    this.audienceOpen = false;
    this.audienceData = null;
    this.audienceBusy = false;
    this.audienceError = '';
    this.deleteConfirmOpen = false;
    this.deleteError = '';
    this.muted = true;
    this.replyText = '';
    this.replyFocused = false;
    this.feedback = '';
    this.lastFrameAt = Date.now();
    this.changeDetector.markForCheck();
    this.viewerTimer = setInterval(() => {
      const now = Date.now();
      const elapsed = Math.max(0, now - this.lastFrameAt);
      this.lastFrameAt = now;
      if (!this.activeStory || this.activeStory.video || !this.imageLoaded || this.playbackBlocked()) return;
      this.viewElapsedMs = Math.min(this.viewDurationMs, this.viewElapsedMs + elapsed);
      this.changeDetector.markForCheck();
      if (this.viewElapsedMs >= this.viewDurationMs) this.next();
    }, 80);
  }

  private stopViewerTimer(): void {
    if (this.viewerTimer !== null) {
      clearInterval(this.viewerTimer);
      this.viewerTimer = null;
    }
  }

  playbackBlocked(): boolean {
    return this.viewerPaused || this.audienceOpen || this.menuOpen || this.replyFocused || this.deleteConfirmOpen || document.hidden;
  }

  private syncVideo(): void {
    const video = this.storyVideo?.nativeElement;
    if (!video || !this.activeStory?.video) return;
    if (this.playbackBlocked()) {
      video.pause();
      return;
    }
    const attempted = video.play();
    if (attempted && typeof attempted.catch === 'function') {
      attempted.catch(() => {
        if (this.activeStory?.video) {
          this.autoplayFailed = true;
          this.changeDetector.markForCheck();
        }
      });
    }
  }

  onImageLoaded(): void {
    this.recordRenderedView();
    this.imageLoaded = true;
    this.lastFrameAt = Date.now();
    this.changeDetector.markForCheck();
  }

  onVideoReady(event: Event): void {
    this.recordRenderedView();
    const video = event.target as HTMLVideoElement;
    if (Number.isFinite(video.duration) && video.duration > 0) {
      this.viewDurationMs = video.duration * 1000;
    }
    this.syncVideo();
  }

  onVideoTime(event: Event): void {
    const video = event.target as HTMLVideoElement;
    this.viewElapsedMs = Math.min(this.viewDurationMs, video.currentTime * 1000);
    this.changeDetector.markForCheck();
  }

  onMediaError(): void {
    this.mediaFailed = true;
    this.changeDetector.markForCheck();
  }

  retryVideo(): void {
    this.autoplayFailed = false;
    this.viewerPaused = false;
    this.syncVideo();
  }

  togglePause(): void {
    this.viewerPaused = !this.viewerPaused;
    this.lastFrameAt = Date.now();
    this.syncVideo();
  }

  toggleMute(): void {
    this.muted = !this.muted;
    if (this.storyVideo?.nativeElement) {
      this.storyVideo.nativeElement.muted = this.muted;
    }
  }

  toggleStoryMenu(): void {
    this.menuOpen = !this.menuOpen;
    this.syncVideo();
  }

  onReplyFocus(focused: boolean): void {
    this.replyFocused = focused;
    this.lastFrameAt = Date.now();
    this.syncVideo();
  }

  jumpTo(index: number): void {
    if (this.deleteConfirmOpen || index < 0 || index >= this.currentGroup.length) return;
    this.storyIndex = index;
    this.startViewer(this.currentGroup[index]);
  }

  @HostListener('document:keydown.arrowright', ['$event'])
  onRight(event: Event): void {
    if (!this.activeStory || this.isInputEvent(event)) return;
    event.preventDefault();
    this.next();
  }

  @HostListener('document:keydown.arrowleft', ['$event'])
  onLeft(event: Event): void {
    if (!this.activeStory || this.isInputEvent(event)) return;
    event.preventDefault();
    this.previous();
  }

  @HostListener('document:keydown.space', ['$event'])
  onSpace(event: Event): void {
    if (!this.activeStory || this.isInputEvent(event)) return;
    event.preventDefault();
    this.togglePause();
  }

  @HostListener('document:visibilitychange')
  onVisibilityChange(): void {
    this.lastFrameAt = Date.now();
    this.syncVideo();
  }

  private isInputEvent(event: Event): boolean {
    const target = event.target;
    return target instanceof HTMLElement && !!target.closest('input, textarea, select, [contenteditable="true"], button');
  }

  // Replies are real direct messages, subject to existing friendship/chat permissions.
  // A failed or ambiguous delivery is never auto-retried to avoid duplicate messages.
  replyToStory(reaction?: string): void {
    const story = this.activeStory;
    if (!story || story.communityId !== null || story.teamId != null || story.canDelete || this.replying) return;
    if (reaction === '❤️' && this.heartReactionsSent.has(story.id)) return;
    const text = (reaction || this.replyText).trim();
    if (!text || text.length > 500) return;
    const permalink = new URL('/menu/feed?story=' + story.id, window.location.origin).href;
    this.replying = true;
    this.onReplyFocus(true);
    this.directChat.send(story.authorUsername, text + '\n' + permalink).pipe(
      timeout(12000),
      finalize(() => {
        this.replying = false;
        this.onReplyFocus(false);
        this.changeDetector.markForCheck();
      }),
      takeUntil(this.destroyed)
    ).subscribe({
      next: () => {
        if (reaction === '❤️') this.heartReactionsSent.add(story.id);
        this.replyText = '';
        this.feedback = t('stories.replySent');
        this.changeDetector.markForCheck();
      },
      error: () => this.feedback = t('stories.replyFailed')
    });
  }


  constructor(
    private readonly stories: SocialStoriesService,
    private readonly directChat: DirectChatService,
    private readonly changeDetector: ChangeDetectorRef,
    private readonly communities: CommunityGroupsService,
    private readonly teamsService: SportsTeamsService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly i18n: I18nService,
    @Optional() private readonly venues: VenueService | null = null,
    @Optional() private readonly profiles: CommunityService | null = null
  ) {}

  ngOnInit(): void {
    // The Feed shell and this nested standalone component can be checked at
    // different times. Explicitly dirty-check Stories whenever locale changes.
    this.i18n.languageChanges$.pipe(takeUntil(this.destroyed)).subscribe(() => {
      this.changeDetector.markForCheck();
    });
    this.reload();
    this.loadMine();
    this.teamsService.mine().pipe(
      timeout(10000),
      catchError(() => of([] as SportsTeam[])),
      takeUntil(this.destroyed)
    ).subscribe(teams => {this.ownedTeams=teams;this.changeDetector.markForCheck();});
    this.communities.mine().pipe(
      timeout(10000),
      catchError(() => of([] as CommunityGroup[])),
      takeUntil(this.destroyed)
    ).subscribe(groups => this.groups = groups.filter(group =>
      group.visibility === 'PUBLIC' && (group.myRole === 'OWNER' || group.myRole === 'ADMIN'
        || group.membersCanPost === true)
    ));
    // Route reuse is common when a shared Story is opened from inside the Feed.
    // Observe link changes and cancel stale requests so a slow response cannot
    // replace a more recently selected Story.
    this.route.queryParamMap.pipe(
      map(params => params.get('story')),
      distinctUntilChanged(),
      switchMap(linkedId => {
        if (!linkedId || !/^[1-9][0-9]*$/.test(linkedId)
            || !Number.isSafeInteger(Number(linkedId))) return EMPTY;
        return this.stories.get(Number(linkedId)).pipe(
          timeout(10000),
          catchError(() => {
            this.error = t('stories.unavailable');
            this.changeDetector.markForCheck();
            return EMPTY;
          })
        );
      }),
      takeUntil(this.destroyed)
    ).subscribe(story => {
      this.error = '';
      this.showStory(story);
    });
  }

  get storyGroups(): StoryGroup[] {
    const ordered = new Map<string, StoryGroup>();
    // Keep the author's own posts visible even when the discovery feed is temporarily unavailable.
    const seen = new Set<number>();
    for (const entry of [...this.mineEntries, ...this.entries]) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      if (Date.parse(entry.expiresAt) <= Date.now()) continue;
      const key = entry.teamId != null ? 'team:' + entry.teamId
        : entry.communityId === null
        ? 'person:' + entry.authorUsername.toLowerCase()
        : 'group:' + entry.communityId;
      let group = ordered.get(key);
      if (!group) {
        group = {
          key,
          name: entry.teamId != null ? (entry.teamName || entry.displayName)
            : entry.communityId !== null ? (entry.communityName || entry.displayName)
            : '@' + entry.authorUsername.replace(/^@/, ''),
          avatar: this.media(entry.teamLogoUrl || entry.communityPhotoUrl || entry.avatarUrl),
          stories: []
        };
        ordered.set(key, group);
      }
      group.stories.push(entry);
    }
    return Array.from(ordered.values());
  }

  reload(): void {
    const requestVersion = ++this.feedRequestVersion;
    this.loading = true;
    this.error = '';
    this.stories.feed().pipe(
      timeout({ first: 10000 }),
      takeUntil(this.destroyed)
    ).subscribe({
      next: stories => {
        if (requestVersion !== this.feedRequestVersion) return;
        this.entries = this.retainConfirmedStories(stories);
        this.loading = false;
        this.changeDetector.markForCheck();
      },
      error: () => {
        if (requestVersion !== this.feedRequestVersion) return;
        this.loading = false;
        this.error = t('stories.loadFailed');
        this.changeDetector.markForCheck();
      }
    });
  }

  loadMine(): void {
    const requestVersion = ++this.mineRequestVersion;
    this.mineLoading = true;
    this.mineError = '';
    this.stories.mine().pipe(
      timeout({ first: 10000 }),
      takeUntil(this.destroyed)
    ).subscribe({
      next: stories => {
        if (requestVersion !== this.mineRequestVersion) return;
        this.mineEntries = this.retainConfirmedStories(stories);
        this.mineLoading = false;
        this.changeDetector.markForCheck();
      },
      error: () => {
        if (requestVersion !== this.mineRequestVersion) return;
        this.mineLoading = false;
        this.mineError = t('stories.mineFailed');
        this.changeDetector.markForCheck();
      }
    });
  }

  retry(): void {
    if (this.loading || this.mineLoading) return;
    this.reload();
    this.loadMine();
  }

  openGroup(group: StoryGroup): void {
    this.currentGroup = [...group.stories].reverse();
    this.storyIndex = 0;
    if (this.currentGroup[0]) this.startViewer(this.currentGroup[0]);
  }

  showStory(story: SocialStory): void {
    this.currentGroup = [story];
    this.storyIndex = 0;
    this.startViewer(story);
  }

  next(): void {
    if (this.deleteConfirmOpen) return;
    if (this.storyIndex + 1 >= this.currentGroup.length) {
      this.close();
    } else {
      this.startViewer(this.currentGroup[++this.storyIndex]);
    }
  }

  previous(): void {
    if (this.deleteConfirmOpen) return;
    if (this.storyIndex > 0) this.startViewer(this.currentGroup[--this.storyIndex]);
  }

  close(): void {
    if (this.audienceOpen) { this.closeAudience(); return; }
    if (this.deleteConfirmOpen) {
      this.cancelDeleteStory();
      return;
    }
    this.stopViewerTimer();
    this.storyVideo?.nativeElement.pause();
    this.activeStory = null;
    this.currentGroup = [];
    this.menuOpen = false;
    this.feedback = '';
    // A shared-story permalink must not reopen an already dismissed viewer
    // on browser refresh. Preserve unrelated Feed query parameters.
    if (this.route.snapshot.queryParamMap.has('story')) {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { story: null },
        queryParamsHandling: 'merge',
        replaceUrl: true
      });
    }
    this.changeDetector.markForCheck();
  }

  @HostListener('document:keydown.escape', ['$event'])
  escape(event: Event): void {
    // Escape must respect the same upload guard as the editor's close button.
    // Only handle a key when this component actually owns an open overlay.
    if (this.composerOpen) {
      if (this.uploading) return;
      event.preventDefault();
      this.closeComposer();
      return;
    }
    if (this.activeStory) {
      event.preventDefault();
      this.close();
    }
  }

  pickFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const selected = input.files?.[0];
    input.value = '';
    if (!selected) return;
    const image = ['image/jpeg', 'image/png', 'image/webp'].includes(selected.type);
    const video = ['video/mp4', 'video/webm'].includes(selected.type);
    if (!image && !video) {
      this.publishError = t('stories.invalidType');
      return;
    }
    if (!selected.size || selected.size > (video ? 20 : 5) * 1024 * 1024) {
      this.publishError = t('stories.invalidSize');
      return;
    }
    this.removeFile();
    this.file = selected;
    this.filePreview = URL.createObjectURL(selected);
    this.publishError = '';
    this.error = '';
    this.changeDetector.markForCheck();
  }

  removeFile(): void {
    if (this.filePreview) URL.revokeObjectURL(this.filePreview);
    this.filePreview = null;
    this.file = null;
  }

  publish(): void {
    if (this.uploading || !this.file) return;
    if (this.storyLocation.trim() && !this.storyLocationVerified) {
      this.publishError = appTranslate('Escolhe uma localização real das sugestões ou limpa o campo.');
      return;
    }
    const isTeam=this.communityId.startsWith('team:');
    const teamId=isTeam?Number(this.communityId.slice(5)):null;
    const group=!this.communityId||isTeam?null:Number(this.communityId);
    if (group !== null && !this.groups.some(item => item.id === group)) return;
    if (isTeam && (teamId===null || !Number.isSafeInteger(teamId) || !this.ownedTeams.some(item => item.id===teamId))) return;
    this.uploading = true;
    this.error = '';
    this.publishError = '';
    this.stories.publish(this.file, this.caption, group, {
      textPosition: this.storyTextPosition,
      textScale: this.storyTextScale,
      textStyle: this.storyTextStyle,
      textX: this.storyTextPlacement.x,
      textY: this.storyTextPlacement.y,
      textRotation: this.storyTextPlacement.rotation,
      textZoom: this.storyTextPlacement.scale,
      textColor: this.storyTextColor,
      textBackground: this.storyTextBackground,
      textFont: this.storyTextFont,
      altText: this.storyAltText.trim(),
      showTime: this.storyShowTime,
      locationLabel: this.storyLocation.trim(),
      taggedUsernames: this.storyTaggedProfiles.map(profile => profile.username).join(',')
    }, teamId).pipe(
      timeout(90000),
      finalize(() => this.uploading = false),
      takeUntil(this.destroyed)
    ).subscribe({
      next: story => {
        if (!Number.isSafeInteger(story?.id) || story.id <= 0) {
          this.publishError = appTranslate('O servidor não confirmou a Story. Verifica o perfil antes de repetir.');
          this.changeDetector.markForCheck();
          return;
        }
        this.confirmedStories.set(story.id, {story, until: Date.now() + 120_000});
        this.entries = [story, ...this.entries.filter(item => item.id !== story.id)];
        this.mineEntries = [story, ...this.mineEntries.filter(item => item.id !== story.id)];
        this.mineError = '';
        this.removeFile();
        this.caption = '';
        this.storyTextPlacement = {x:50,y:74,rotation:0,scale:1};
        this.storyTextColor = 'white';
        this.storyTextBackground = 'dark';
        this.storyTextFont = 'modern';
        this.storyAltText = '';
        this.storyShowTime = false;
        this.storyLocation = '';
        this.storyLocationVerified = false;
        this.storyTaggedProfiles = [];
        this.storyTagOpen = false;
        this.communityId = '';
        this.composerOpen = false;
        this.publishError = '';
        this.feedback = t('stories.published');
        this.changeDetector.markForCheck();
      },
      error: error => {
        this.publishError = this.publishingErrorMessage(error);
        this.changeDetector.markForCheck();
      }
    });
  }

  requestDeleteStory(): void {
    if (!this.activeStory?.canDelete || this.deleting) return;
    this.menuOpen = false;
    this.deleteError = '';
    this.deleteConfirmOpen = true;
    this.syncVideo();
    this.changeDetector.markForCheck();
  }

  cancelDeleteStory(): void {
    if (this.deleting) return;
    this.deleteConfirmOpen = false;
    this.deleteError = '';
    this.lastFrameAt = Date.now();
    this.syncVideo();
    this.changeDetector.markForCheck();
  }

  confirmDeleteStory(): void {
    const story = this.activeStory;
    if (!this.deleteConfirmOpen || !story?.canDelete || this.deleting) return;
    this.deleting = true;
    this.deleteError = '';
    this.stories.delete(story.id).pipe(
      timeout(10000),
      finalize(() => {
        this.deleting = false;
        this.changeDetector.markForCheck();
      }),
      takeUntil(this.destroyed)
    ).subscribe({
      next: () => {
        this.confirmedStories.delete(story.id);
        this.entries = this.entries.filter(entry => entry.id !== story.id);
        this.mineEntries = this.mineEntries.filter(entry => entry.id !== story.id);
        this.deleteConfirmOpen = false;
        this.close();
      },
      error: () => {
        this.deleteError = t('stories.deleteFailed');
        this.changeDetector.markForCheck();
      }
    });
  }

  async shareStory(): Promise<void> {
    if (!this.activeStory) return;
    const url = new URL('/menu/feed?story=' + this.activeStory.id, window.location.origin).href;
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: t('stories.title'), url });
        return;
      }
      await navigator.clipboard.writeText(url);
      this.feedback = t('stories.copied');
    } catch {
      this.feedback = t('stories.shareFallback');
    }
  }

  media(url: string | null | undefined): string | null {
    if (!url) return null;
    if (url.startsWith('/api/profile-media/')) return url;
    if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url;
    return environment.apiUrl + (url.startsWith('/') ? url : '/' + url);
  }

  ngOnDestroy(): void {
    this.stopViewerTimer();
    this.removeFile();
    this.destroyed.next();
    this.destroyed.complete();
  }
}
