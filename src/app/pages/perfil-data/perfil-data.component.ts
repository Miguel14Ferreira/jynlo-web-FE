import { appTranslate as t } from '../../i18n/i18n.service';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { finalize, of, catchError, retry, timeout } from 'rxjs';

import { environment } from 'src/environment/environment';
import { MyProfile, ProfileActivity } from '../model/my-profile';
import { ReliabilitySummary } from '../model/reliability-summary';
import { MyProfileService } from '../../services/my-profile.service';
import { SocialGraphService } from '../../services/social-graph.service';
import { FollowProfile, FollowStatus } from '../model/follow';
import { ReliabilityService } from '../../services/reliability.service';
import { sportIcon } from '../../shared/sports-catalog';
import { calculateProfileCompletion, ProfileCompletion, ProfileCompletionItem } from '../../shared/profile-completion';

@Component({
  selector: 'app-perfil-data',
  templateUrl: './perfil-data.component.html',
  styleUrls: ['./perfil-data.component.css', './perfil-data-v3-finish.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class PerfilDataComponent implements OnInit {
  profile?: MyProfile;
  reliability?: ReliabilitySummary;
  activity?: ProfileActivity;
  followStatus?: FollowStatus;
  followListMode: 'followers' | 'following' | null = null;
  followListProfiles: FollowProfile[] = [];
  followListLoading = false;
  followListError = false;
  loading = false;
  errorMessage = '';
  favoritesExpanded = false;
  favoriteSports: string[] = [];
  profileCompletion: ProfileCompletion = calculateProfileCompletion();
  completionMissingPreview: ProfileCompletionItem[] = [];
  readonly iconForSport = sportIcon;

  constructor(
    private myProfileService: MyProfileService,
    private reliabilityService: ReliabilityService,
    private socialGraphService: SocialGraphService
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.errorMessage = '';

    this.myProfileService.get()
      .pipe(
        timeout(10_000),
        retry({ count: 1 }),
        finalize(() => this.loading = false)
      )
      .subscribe({
        next: profile => {
          this.profile = profile;
          this.profileCompletion = calculateProfileCompletion(profile);
          this.completionMissingPreview = this.profileCompletion.missing.slice(0, 3);
          this.favoriteSports = (profile.favoriteSports || '')
            .split(',')
            .map(value => value.trim())
            .filter(Boolean);
          this.loadReliability(profile.username);
          this.loadActivity(profile.username);
          this.socialGraphService.status(profile.username).pipe(timeout(10000))
            .subscribe({ next: status => this.followStatus = status, error: () => this.followStatus = undefined });
        },
        error: () => this.errorMessage = t('feedback.profile.loadError')
      });
  }

  openFollowList(mode: 'followers' | 'following'): void {
    if (!this.profile) return;
    const username = this.profile.username;
    this.followListMode = mode;
    this.followListProfiles = [];
    this.followListLoading = true;
    this.followListError = false;
    (mode === 'followers' ? this.socialGraphService.followers(username) : this.socialGraphService.following(username))
      .pipe(timeout(10000), finalize(() => this.followListLoading = false))
      .subscribe({
        next: profiles => { if (this.profile?.username === username && this.followListMode === mode) this.followListProfiles = profiles; },
        error: () => { if (this.followListMode === mode) this.followListError = true; }
      });
  }

  closeFollowList(): void {
    this.followListMode = null;
    this.followListProfiles = [];
  }

  get visibleFavoriteSports(): string[] {
    return this.favoritesExpanded
      ? this.favoriteSports
      : this.favoriteSports.slice(0, 5);
  }

  get hiddenFavoriteSportsCount(): number {
    return Math.max(0, this.favoriteSports.length - 5);
  }

  toggleFavoriteSports(): void {
    this.favoritesExpanded = !this.favoritesExpanded;
  }

  profileImage(): string | null {
    const path = this.profile?.profilePicUrl;
    if (!path) {
      return null;
    }

    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
      return path;
    }

    return environment.apiUrl + (path.startsWith('/') ? path : '/' + path);
  }

  initials(): string {
    const source = this.profile?.fullName?.trim() || this.profile?.username || '?';
    return source
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(value => value.charAt(0).toUpperCase())
      .join('');
  }

  private loadActivity(username: string): void {
    this.reliabilityService.activity(username)
      .pipe(
        timeout(10_000),
        retry({ count: 1 }),
        catchError(() => of(undefined))
      )
      .subscribe(activity => this.activity = activity);
  }

  private loadReliability(username: string): void {
    this.reliabilityService.summary(username)
      .pipe(
        timeout(10_000),
        retry({ count: 1 }),
        catchError(() => of(undefined))
      )
      .subscribe(summary => this.reliability = summary);
  }
}
