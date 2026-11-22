import { Pipe, PipeTransform } from '@angular/core';
import { I18nService } from './i18n.service';
import { venueCatalogueDisplayLabel } from '../shared/venue-catalogue-display';

/** Sport name in the selected language. The stored (Portuguese) value is never changed;
 * unknown or user-typed sports are shown as they are. */
@Pipe({
  name: 'sportName',
  pure: false,
  standalone: true
})
export class SportNamePipe implements PipeTransform {
  constructor(private readonly i18n: I18nService) {}

  transform(value: string | null | undefined): string {
    return venueCatalogueDisplayLabel(value, 'sport', this.i18n.currentLanguage);
  }
}
