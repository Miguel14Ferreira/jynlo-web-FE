import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { catchError, finalize, of, Subject, takeUntil, timeout } from 'rxjs';

import { environment } from 'src/environment/environment';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { appTranslate as t, I18nService } from '../../i18n/i18n.service';
import { DirectChatService } from '../../services/direct-chat.service';
import { CommunityGroupsService } from '../../services/community-groups.service';
import { SocialStoriesService } from '../../services/social-stories.service';
import { CommunityGroup } from '../model/community-group';
import { SocialStory } from '../model/social-story';

interface StoryGroup {
  key: string;
  name: string;
  avatar: string | null;
  stories: SocialStory[];
}

@Component({
  selector: 'app-social-stories',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './social-stories.component.html',
  styleUrls: ['./social-stories.component.css', './story-create-editor.css']
})
export class SocialStoriesComponent implements OnInit, OnDestroy {
  entries: SocialStory[] = [];
  mineEntries: SocialStory[] = [];
  mineLoading = true;
  mineError = '';
  groups: CommunityGroup[] = [];
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
  storyAltText = '';
  storyShowTime = false;
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
      if (error.status === 413) return 'O ficheiro é demasiado grande para enviar. Escolhe um mais pequeno.';
      if (error.status === 401) return 'A tua sessão terminou. Inicia sessão antes de publicar.';
      if (error.status === 403) return 'Não tens permissão para publicar nesta comunidade.';
      if (error.status === 415) return 'Formato não suportado. Usa JPG, PNG, WebP, MP4 ou WebM.';
      if (error.status === 400) return 'Este ficheiro não foi aceite. Experimenta uma imagem JPG/PNG diferente.';
      if (error.status === 502 || error.status === 503 || error.status === 504 || error.status === 0)
        return 'O servidor de imagens está temporariamente indisponível. A fotografia continua aqui para tentares novamente.';
      if (error.status >= 500) return 'O servidor não conseguiu guardar a Story. O ficheiro foi mantido para repetires.';
    }
    return 'Não foi possível publicar. A fotografia continua selecionada; tenta novamente.';
  }

  error = '';
  feedback = '';
  activeStory: SocialStory | null = null;
  currentGroup: SocialStory[] = [];
  storyIndex = 0;
  private readonly destroyed = new Subject<void>();

  // Instagram-style viewer: the only player controls are story gestures,
  // a discreet audio toggle and the progress strips. No native video chrome.
  @ViewChild('storyVideo') storyVideo?: ElementRef<HTMLVideoElement>;
  viewElapsedMs = 0;
  viewDurationMs = 7000;
  imageLoaded = false;
  mediaFailed = false;
  autoplayFailed = false;
  viewerPaused = false;
  menuOpen = false;
  muted = true;
  replyText = '';
  replyFocused = false;
  replying = false;
  private viewerTimer: ReturnType<typeof setInterval> | null = null;
  private lastFrameAt = 0;

  get viewerProgress(): number {
    return Math.min(100, Math.max(0, this.viewElapsedMs / Math.max(1, this.viewDurationMs) * 100));
  }

  storyLabel(story: SocialStory): string {
    return story.communityName || '@' + story.authorUsername.replace(/^@/, '');
  }

  storyAvatar(story: SocialStory): string | null {
    return this.media(story.communityId !== null ? story.communityPhotoUrl : story.avatarUrl);
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
    return this.viewerPaused || this.menuOpen || this.replyFocused || this.deleteConfirmOpen || document.hidden;
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
    this.imageLoaded = true;
    this.lastFrameAt = Date.now();
    this.changeDetector.markForCheck();
  }

  onVideoReady(event: Event): void {
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
    if (!story || story.communityId !== null || story.canDelete || this.replying) return;
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
        this.replyText = '';
        this.feedback = t('stories.replySent');
      },
      error: () => this.feedback = t('stories.replyFailed')
    });
  }


  constructor(
    private readonly stories: SocialStoriesService,
    private readonly directChat: DirectChatService,
    private readonly changeDetector: ChangeDetectorRef,
    private readonly communities: CommunityGroupsService,
    private readonly route: ActivatedRoute,
    private readonly i18n: I18nService
  ) {}

  ngOnInit(): void {
    // The Feed shell and this nested standalone component can be checked at
    // different times. Explicitly dirty-check Stories whenever locale changes.
    this.i18n.languageChanges$.pipe(takeUntil(this.destroyed)).subscribe(() => {
      this.changeDetector.markForCheck();
    });
    this.reload();
    this.loadMine();
    this.communities.mine().pipe(
      timeout(10000),
      catchError(() => of([] as CommunityGroup[])),
      takeUntil(this.destroyed)
    ).subscribe(groups => this.groups = groups.filter(group =>
      group.visibility === 'PUBLIC' && (group.myRole === 'OWNER' || group.myRole === 'ADMIN')
    ));
    const linkedId = this.route.snapshot.queryParamMap.get('story');
    if (linkedId && /^[1-9][0-9]*$/.test(linkedId) && Number.isSafeInteger(Number(linkedId))) {
      this.stories.get(Number(linkedId)).pipe(
        timeout(10000),
        takeUntil(this.destroyed)
      ).subscribe({
        next: story => this.showStory(story),
        error: () => this.error = t('stories.unavailable')
      });
    }
  }

  get storyGroups(): StoryGroup[] {
    const ordered = new Map<string, StoryGroup>();
    // Keep the author's own posts visible even when the discovery feed is temporarily unavailable.
    const seen = new Set<number>();
    for (const entry of [...this.mineEntries, ...this.entries]) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      if (Date.parse(entry.expiresAt) <= Date.now()) continue;
      const key = entry.communityId === null
        ? 'person:' + entry.authorUsername.toLowerCase()
        : 'group:' + entry.communityId;
      let group = ordered.get(key);
      if (!group) {
        group = {
          key,
          name: entry.communityId !== null
            ? (entry.communityName || entry.displayName)
            : '@' + entry.authorUsername.replace(/^@/, ''),
          avatar: this.media(entry.communityPhotoUrl || entry.avatarUrl),
          stories: []
        };
        ordered.set(key, group);
      }
      group.stories.push(entry);
    }
    return Array.from(ordered.values());
  }

  reload(): void {
    this.loading = true;
    this.error = '';
    this.stories.feed().pipe(
      timeout({ first: 10000 }),
      takeUntil(this.destroyed)
    ).subscribe({
      next: stories => {
        this.entries = stories;
        this.loading = false;
        this.changeDetector.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.error = t('stories.loadFailed');
        this.changeDetector.markForCheck();
      }
    });
  }

  loadMine(): void {
    this.mineLoading = true;
    this.mineError = '';
    this.stories.mine().pipe(
      timeout({ first: 10000 }),
      takeUntil(this.destroyed)
    ).subscribe({
      next: stories => {
        this.mineEntries = stories;
        this.mineLoading = false;
        this.changeDetector.markForCheck();
      },
      error: () => {
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
    this.changeDetector.markForCheck();
  }

  @HostListener('document:keydown.escape')
  escape(): void {
    this.close();
    this.composerOpen = false;
  }

  pickFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const selected = input.files?.[0];
    input.value = '';
    if (!selected) return;
    const image = ['image/jpeg', 'image/png', 'image/webp'].includes(selected.type);
    const video = ['video/mp4', 'video/webm'].includes(selected.type);
    if (!image && !video) {
      this.error = t('stories.invalidType');
      return;
    }
    if (!selected.size || selected.size > (video ? 20 : 5) * 1024 * 1024) {
      this.error = t('stories.invalidSize');
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
    const group = this.communityId ? Number(this.communityId) : null;
    if (group !== null && !this.groups.some(item => item.id === group)) return;
    this.uploading = true;
    this.error = '';
    this.publishError = '';
    this.stories.publish(this.file, this.caption, group, {
      textPosition: this.storyTextPosition,
      textScale: this.storyTextScale,
      textStyle: this.storyTextStyle,
      altText: this.storyAltText.trim(),
      showTime: this.storyShowTime
    }).pipe(
      timeout(90000),
      finalize(() => this.uploading = false),
      takeUntil(this.destroyed)
    ).subscribe({
      next: story => {
        this.entries = [story, ...this.entries.filter(item => item.id !== story.id)];
        this.mineEntries = [story, ...this.mineEntries.filter(item => item.id !== story.id)];
        this.mineError = '';
        this.removeFile();
        this.caption = '';
        this.storyAltText = '';
        this.storyShowTime = false;
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
