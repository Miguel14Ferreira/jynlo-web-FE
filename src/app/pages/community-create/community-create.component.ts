import { sportMatchesQuery } from '../../shared/venue-catalogue-display';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, finalize, of, switchMap, timeout } from 'rxjs';
import { appTranslate as t } from '../../i18n/i18n.service';

import { CommunityVisibility } from '../model/community-group';
import { CommunityCreationQuota, CommunityGroupsService } from '../../services/community-groups.service';
import { SPORTS_CATALOG } from '../../shared/sports-catalog';

@Component({
  selector: 'app-community-create',
  templateUrl: './community-create.component.html',
  styleUrls: ['./community-create.component.css', './community-create-concept-one-premium.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class CommunityCreateComponent implements OnInit {
  name = '';
  description = '';
  sports: string[] = [];
  sportSearch = '';
  visibility: CommunityVisibility = 'PRIVATE';

  photo?: File;
  photoPreview = '';

  readonly sportsCatalog = SPORTS_CATALOG;

  saving = false;
  errorMessage = '';
  quota: CommunityCreationQuota | null = null;
  quotaLoading = true;

  get sportSuggestions(): string[] {
    const query = this.sportSearch.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    if (!query) return [];
    return this.sportsCatalog.filter(sport =>
      sportMatchesQuery(sport, query)
      && !this.sports.includes(sport)
    ).slice(0, 8);
  }

  addSport(sport: string): void {
    if (this.saving || this.sports.length >= 128 || !this.sportsCatalog.includes(sport)
        || this.sports.includes(sport)) return;
    this.sports = [...this.sports, sport];
    this.sportSearch = '';
  }

  removeSport(sport: string): void {
    if (this.saving) return;
    this.sports = this.sports.filter(value => value !== sport);
  }

  constructor(
    private communityService: CommunityGroupsService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.communityService.creationQuota()
      .pipe(timeout(10_000), finalize(() => this.quotaLoading = false))
      .subscribe({
        next: quota => this.quota = quota,
        error: () => { this.quota = null; }
      });
  }

  create(): void {
    if (!this.name.trim() || this.saving || this.quota?.canCreate === false) {
      return;
    }

    this.saving = true;
    this.errorMessage = '';

    this.communityService.create({
      name: this.name.trim(),
      description: this.description.trim() || null,
      sport: this.sports[0] || null,
      sports: [...this.sports],
      visibility: this.visibility
    })
      .pipe(
        timeout(10_000),
        switchMap(community =>
          this.photo
            ? this.communityService.updatePhoto(community.id, this.photo)
                .pipe(
                  timeout(10_000),
                  catchError(() => of(community))
                )
            : of(community)
        ),
        finalize(() => this.saving = false)
      )
      .subscribe({
        next: community => {
          void this.router.navigate(['/menu/communities', community.id, 'invite']);
        },
        error: error => {
          this.errorMessage = error.error?.message || t('communityCreate.error');
          if (error.status === 409 || error.status === 429) {
            this.communityService.creationQuota().pipe(timeout(10_000)).subscribe({
              next: quota => this.quota = quota,
              error: () => {}
            });
          }
        }
      });
  }

  onPhotoChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
      this.photo = undefined;
      this.photoPreview = '';
      return;
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      this.errorMessage = t('feedback.image.choose');
      input.value = '';
      return;
    }

    this.photo = file;
    this.errorMessage = '';

    const reader = new FileReader();
    reader.onload = () => {
      this.photoPreview = typeof reader.result === 'string' ? reader.result : '';
    };
    reader.readAsDataURL(file);
  }

  removePhoto(): void {
    this.photo = undefined;
    this.photoPreview = '';
  }

  cancel(): void {
    void this.router.navigate(['/menu/communities']);
  }
}
