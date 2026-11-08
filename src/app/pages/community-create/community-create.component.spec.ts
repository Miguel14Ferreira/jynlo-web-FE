import { of, throwError } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { I18nService, preloadEnglishTranslations } from '../../i18n/i18n.service';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { CommunityGroupsService } from '../../services/community-groups.service';
import { CommunityCreateComponent } from './community-create.component';

describe('Community creation onboarding', () => {
  it('reads the owned community quota and blocks creation at the limit', () => {
    const service = {
      creationQuota: jasmine.createSpy('creationQuota').and.returnValue(of({
        owned: 5, limit: 5, canCreate: false
      })),
      create: jasmine.createSpy('create').and.returnValue(of({ id: 42 }))
    };
    const router = { navigate: jasmine.createSpy('navigate').and.resolveTo(true) };
    const component = new CommunityCreateComponent(service as any, router as any);
    component.ngOnInit();
    component.name = 'Mais um grupo';
    expect(component.quota?.owned).toBe(5);
    component.create();
    expect(service.create).not.toHaveBeenCalled();
  });

  it('allows further creation when under the owned limit, without a daily quota', () => {
    const service = {
      creationQuota: jasmine.createSpy('creationQuota').and.returnValue(of({
        owned: 4, limit: 5, canCreate: true
      })),
      create: jasmine.createSpy('create').and.returnValue(of({ id: 50 }))
    };
    const router = { navigate: jasmine.createSpy('navigate').and.resolveTo(true) };
    const component = new CommunityCreateComponent(service as any, router as any);
    component.ngOnInit();
    component.name = 'Quinta comunidade';
    component.create();
    expect(service.create).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/menu/communities', 50, 'invite']);
  });

  it('does not block when the quota status endpoint is unavailable', () => {
    const service = {
      creationQuota: jasmine.createSpy('creationQuota')
        .and.returnValue(throwError(() => new Error('offline'))),
      create: jasmine.createSpy('create').and.returnValue(of({ id: 43 }))
    };
    const router = { navigate: jasmine.createSpy('navigate').and.resolveTo(true) };
    const component = new CommunityCreateComponent(service as any, router as any);
    component.name = 'Uma comunidade';
    component.ngOnInit();
    expect(component.quota).toBeNull();
    component.create();
    expect(service.create).toHaveBeenCalled();
  });


  it('opens the invite screen after creating a community', () => {
    const service = { create: jasmine.createSpy('create').and.returnValue(of({ id: 42 })) };
    const router = { navigate: jasmine.createSpy('navigate').and.resolveTo(true) };
    const component = new CommunityCreateComponent(service as any, router as any);
    component.name = 'Futebol das Quintas';

    component.create();

    expect(service.create).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/menu/communities', 42, 'invite']);
  });

  it('still opens the invite screen when optional photo upload fails', () => {
    const service = {
      create: jasmine.createSpy('create').and.returnValue(of({ id: 42 })),
      updatePhoto: jasmine.createSpy('updatePhoto').and.returnValue(throwError(() => new Error('upload failed')))
    };
    const router = { navigate: jasmine.createSpy('navigate').and.resolveTo(true) };
    const component = new CommunityCreateComponent(service as any, router as any);
    component.name = 'Futebol das Quintas';
    component.photo = new File(['photo'], 'photo.png', { type: 'image/png' });

    component.create();

    expect(service.updatePhoto).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/menu/communities', 42, 'invite']);
  });
  it('submits multiple sports with the first as the legacy primary sport', () => {
    const service = { create: jasmine.createSpy('create').and.returnValue(of({ id: 42 })) };
    const router = { navigate: jasmine.createSpy('navigate').and.resolveTo(true) };
    const component = new CommunityCreateComponent(service as any, router as any);
    component.name = 'Desporto entre amigos';
    component.sportSearch = 'pa';
    expect(component.sportSuggestions).toContain('Padel');
    component.addSport('Padel');
    component.addSport('Basquetebol');
    component.addSport('Padel');
    expect(component.sports).toEqual(['Padel', 'Basquetebol']);

    component.create();
    expect(service.create).toHaveBeenCalledWith(jasmine.objectContaining({
      sport: 'Padel', sports: ['Padel', 'Basquetebol']
    }));
    expect(router.navigate).toHaveBeenCalledWith(['/menu/communities', 42, 'invite']);
  });

  it('supports sportless communities and removable selections', () => {
    const service = { create: jasmine.createSpy('create').and.returnValue(of({ id: 43 })) };
    const router = { navigate: jasmine.createSpy('navigate').and.resolveTo(true) };
    const component = new CommunityCreateComponent(service as any, router as any);
    component.name = 'Atividades ao ar livre';
    component.addSport('Corrida');
    component.removeSport('Corrida');
    expect(component.sports).toEqual([]);
    component.create();
    expect(service.create).toHaveBeenCalledWith(jasmine.objectContaining({
      sport: null, sports: []
    }));
  });


  it('translates the sports picker and accessible actions in Portuguese and English', async () => {
    await preloadEnglishTranslations();
    const previousLanguage = localStorage.getItem('d24-language');
    try {
      localStorage.setItem('d24-language', 'pt');
      const service = {
        creationQuota: jasmine.createSpy('creationQuota').and.returnValue(of({
          owned: 1, limit: 5, canCreate: true
        }))
      };
      await TestBed.configureTestingModule({
        declarations: [CommunityCreateComponent],
        imports: [FormsModule, TranslatePipe],
        providers: [
          { provide: CommunityGroupsService, useValue: service },
          { provide: Router, useValue: { navigate: jasmine.createSpy('navigate') } }
        ]
      }).compileComponents();

      const fixture = TestBed.createComponent(CommunityCreateComponent);
      fixture.componentInstance.sports = ['Padel'];
      fixture.componentInstance.sportSearch = 'bas';
      fixture.detectChanges();
      const host: HTMLElement = fixture.nativeElement;
      expect(host.querySelector('.create-community-page.jynlo-community-create-premium')).toBeTruthy();
      expect(host.querySelector('input[name="name"]')).toBeTruthy();
      expect(host.querySelector('input[type="file"]')).toBeTruthy();
      expect(host.querySelector('#community-sport-search')).toBeTruthy();
      expect(host.querySelector('#community-visibility')).toBeTruthy();
      expect(host.querySelector('.form-actions button[type="submit"]')).toBeTruthy();
      expect(host.querySelector('.creation-note[role="status"]')).toBeTruthy();
      const quotaBanner = host.querySelector<HTMLElement>('.creation-note[role="status"]');
      const setupPanel = host.querySelector<HTMLElement>('form.create-panel');
      expect(quotaBanner?.nextElementSibling).toBe(setupPanel || null);
      // Scoped margin prevents the panels from touching on desktop or mobile.
      const expectedGap = window.matchMedia('(max-width: 720px)').matches ? '20px' : '24px';
      expect(setupPanel).toBeTruthy();
      expect(window.getComputedStyle(setupPanel!).marginTop).toBe(expectedGap);
      const label = () => host.querySelector('label[for="community-sport-search"]')?.textContent?.trim();
      const hint = () => host.querySelector('.sport-selection .field-help')?.textContent?.trim();
      const selected = () => host.querySelector('.sport-tags')?.getAttribute('aria-label');
      const remove = () => host.querySelector('.sport-tag button')?.getAttribute('aria-label');
      const placeholder = () => host.querySelector('#community-sport-search')?.getAttribute('placeholder');
      const suggestions = () => host.querySelector('.sport-suggestions')?.getAttribute('aria-label');

      expect(label()).toBe('Modalidades da comunidade (opcional)');
      expect(hint()).toContain('Escolhe uma ou várias modalidades.');
      expect(selected()).toBe('Modalidades selecionadas');
      expect(remove()).toBe('Remover Padel');
      expect(placeholder()).toBe('Pesquisar modalidade, ex.: padel');
      expect(suggestions()).toBe('Sugestões de modalidades');

      fixture.componentInstance.sports = ['Airsoft'];
      fixture.detectChanges();
      expect(host.querySelector('[role="note"]')?.textContent).toContain('organização de jogos');
      TestBed.inject(I18nService).setLanguage('en');
      fixture.detectChanges();
      expect(host.querySelector('[role="note"]')?.textContent).toContain('game organization');
      expect(label()).toBe('Community sports (optional)');
      expect(hint()).toContain('Choose one or more sports.');
      expect(selected()).toBe('Selected sports');
      expect(remove()).toBe('Remove Airsoft');
      expect(placeholder()).toBe('Search for a sport, e.g. padel');
      expect(suggestions()).toBe('Sport suggestions');
    } finally {
      if (previousLanguage === null) localStorage.removeItem('d24-language');
      else localStorage.setItem('d24-language', previousLanguage);
    }
  });

});
