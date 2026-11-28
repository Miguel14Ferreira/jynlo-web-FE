import { SportNamePipe } from './sport-name.pipe';
import { ChangeDetectorRef } from '@angular/core';
import { Subject } from 'rxjs';
import { I18nService } from './i18n.service';

describe('SportNamePipe', () => {
  const pipeFor = (language: 'pt' | 'en') =>
    new SportNamePipe({ currentLanguage: language, languageChanges$: new Subject() } as unknown as I18nService,
      { markForCheck: () => undefined } as unknown as ChangeDetectorRef);

  it('shows catalogue sports in English when the site is in English', () => {
    expect(pipeFor('en').transform('Futebol')).toBe('Football');
    expect(pipeFor('en').transform('Natação')).toBe('Swimming');
  });

  it('keeps the stored name in Portuguese and for unknown sports', () => {
    expect(pipeFor('pt').transform('Futebol')).toBe('Futebol');
    expect(pipeFor('en').transform('Desporto inventado')).toBe('Desporto inventado');
    expect(pipeFor('en').transform(null)).toBe('');
  });

  it('refreshes an OnPush view when the language changes', () => {
    const changes = new Subject<string>();
    const cdr = jasmine.createSpyObj<ChangeDetectorRef>('cdr', ['markForCheck']);
    const pipe = new SportNamePipe({ currentLanguage: 'pt', languageChanges$: changes } as unknown as I18nService, cdr);
    changes.next('en');
    expect(cdr.markForCheck).toHaveBeenCalled();
    pipe.ngOnDestroy();
  });
});
