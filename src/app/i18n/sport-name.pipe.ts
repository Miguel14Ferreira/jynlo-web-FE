import { ChangeDetectorRef, OnDestroy, Pipe, PipeTransform } from '@angular/core';
import { Subscription } from 'rxjs';
import { I18nService } from './i18n.service';
import { venueCatalogueDisplayLabel } from '../shared/venue-catalogue-display';

/** Sport name in the selected language. The stored (Portuguese) value is never changed;
 * unknown or user-typed sports are shown as they are. */
@Pipe({
  name: 'sportName',
  pure: false,
  standalone: true
})
export class SportNamePipe implements PipeTransform, OnDestroy {
  private readonly languageSub: Subscription;

  constructor(private readonly i18n: I18nService, cdr: ChangeDetectorRef) {
    // OnPush views would otherwise keep the old language after PT/EN is switched.
    this.languageSub = i18n.languageChanges$.subscribe(() => cdr.markForCheck());
  }

  ngOnDestroy(): void {
    this.languageSub.unsubscribe();
  }

  transform(value: string | null | undefined): string {
    return venueCatalogueDisplayLabel(value, 'sport', this.i18n.currentLanguage);
  }
}
