import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { AdminIdeasComponent } from './admin-ideas.component';
import { AdminIdeasService } from '../../services/admin-ideas.service';
import { AdminIdea } from '../model/admin-idea';
import { I18nService, preloadEnglishTranslations } from '../../i18n/i18n.service';
import { TEST_IMPORTS, TEST_PROVIDERS } from '../../testing/test-providers';

describe('AdminIdeasComponent PT/EN Concept One audit', () => {
  let fixture: ComponentFixture<AdminIdeasComponent>;
  let service: jasmine.SpyObj<AdminIdeasService>;
  let i18n: I18nService;
  let previousLanguage: string | null;

  const idea: AdminIdea = {
    id: 7, name: 'Alex', email: 'alex@example.com', city: 'Lisboa',
    gender: '', subject: 'Melhoria', problem: 'Nova proposta',
    status: 'NEW', createdAt: '2026-10-25T12:00:00Z'
  };

  beforeAll(async () => {
    await preloadEnglishTranslations();
  });

  beforeEach(async () => {
    previousLanguage = localStorage.getItem('d24-language');
    localStorage.setItem('d24-language', 'pt');
    service = jasmine.createSpyObj<AdminIdeasService>('AdminIdeasService', ['list', 'updateStatus', 'reply']);
    service.list.and.returnValue(of([idea]));
    service.updateStatus.and.returnValue(of({ ...idea, status: 'IN_REVIEW' }));
    await TestBed.configureTestingModule({
      declarations: [AdminIdeasComponent],
      imports: TEST_IMPORTS,
      providers: [...TEST_PROVIDERS, { provide: AdminIdeasService, useValue: service }]
    }).compileComponents();
    i18n = TestBed.inject(I18nService);
    i18n.setLanguage('pt');
    fixture = TestBed.createComponent(AdminIdeasComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    if (previousLanguage === null) localStorage.removeItem('d24-language');
    else localStorage.setItem('d24-language', previousLanguage);
  });

  it('translates titles, statuses and reply action, preserving selection and mailto brand', () => {
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('h1')?.textContent).toContain('Ideias e sugestões');
    expect(root.querySelector('.status-badge')?.textContent).toContain('Nova');

    i18n.setLanguage('en');
    fixture.detectChanges();
    expect(root.querySelector('h1')?.textContent).toContain('Ideas and suggestions');
    expect(root.querySelector('.subtitle')?.textContent).toContain('1 new idea');
    expect(root.querySelector('.status-badge')?.textContent).toContain('New');
    root.querySelector<HTMLButtonElement>('.idea-card')!.click();
    fixture.detectChanges();

    const reply = root.querySelector<HTMLAnchorElement>('.email-action');
    expect(reply?.textContent).toContain('Reply by email');
    expect(reply?.getAttribute('href')).toContain('subject=Jynlo - Melhoria');
    expect(reply?.getAttribute('href')).not.toContain('DESPORTO24');
    expect(service.updateStatus).not.toHaveBeenCalled();
  });

  it('sends the official response and displays its audit details', () => {
    const updated: AdminIdea = {
      ...idea, adminReply: 'Obrigado pelo feedback!',
      adminRepliedAt: '2026-11-10T18:00:00Z', adminRepliedBy: 'admin'
    };
    service.reply.and.returnValue(of(updated));
    fixture.componentInstance.select(idea);
    fixture.componentInstance.replyText = ' Obrigado pelo feedback! ';

    fixture.componentInstance.replyToIdea();
    fixture.detectChanges();

    expect(service.reply).toHaveBeenCalledOnceWith(7, 'Obrigado pelo feedback!');
    expect(fixture.componentInstance.selected?.adminRepliedBy).toBe('admin');
    expect(fixture.componentInstance.canReply).toBeFalse();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Obrigado pelo feedback!');
  });

  it('does not send a second response to an already answered suggestion', () => {
    fixture.componentInstance.select({
      ...idea, adminReply: 'Respondido', adminRepliedAt: '2026-11-10T18:00:00Z'
    });
    fixture.componentInstance.replyText = 'Nova resposta';
    fixture.componentInstance.replyToIdea();
    expect(service.reply).not.toHaveBeenCalled();
  });

  it('keeps the moderation action wired to the same status endpoint', () => {
    fixture.componentInstance.updateStatus(idea, 'IN_REVIEW');
    expect(service.updateStatus).toHaveBeenCalledOnceWith(7, 'IN_REVIEW');
  });
});
