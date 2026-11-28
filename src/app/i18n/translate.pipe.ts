import { ChangeDetectorRef, OnDestroy, Pipe, PipeTransform } from '@angular/core';
import { Subscription } from 'rxjs';
import { I18nService } from './i18n.service';

@Pipe({
  name: 't',
  pure: false,
  standalone: true
})
export class TranslatePipe implements PipeTransform, OnDestroy {
  // Components default to OnPush in this Angular version, so a page would keep the old language
  // after PT/EN is switched. Each pipe marks its own view for refresh when the language changes.
  private readonly languageSub: Subscription;

  constructor(private readonly i18n: I18nService, cdr: ChangeDetectorRef) {
    this.languageSub = i18n.languageChanges$.subscribe(() => cdr.markForCheck());
  }

  transform(key: string, params?: Record<string, string | number | null | undefined>): string {
    return this.i18n.translate(key, params);
  }

  ngOnDestroy(): void {
    this.languageSub.unsubscribe();
  }
}
