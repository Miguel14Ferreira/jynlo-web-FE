import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { ContactComponent } from './contact.component';
import { FeedbackService } from '../../services/feedback.service';
import { TEST_IMPORTS, TEST_PROVIDERS } from '../../testing/test-providers';

describe('ContactComponent', () => {
  let component: ContactComponent;
  let fixture: ComponentFixture<ContactComponent>;
  let service: jasmine.SpyObj<FeedbackService>;

  beforeEach(async () => {
    service = jasmine.createSpyObj<FeedbackService>('FeedbackService', ['submit', 'submitWithImage', 'submitWithImages']);
    service.submit.and.returnValue(of({ message: 'Obrigado' } as any));
    service.submitWithImages.and.returnValue(of({ message: 'Recebido' } as any));

    await TestBed.configureTestingModule({
      declarations: [ContactComponent],
      imports: TEST_IMPORTS,
      providers: [
        ...TEST_PROVIDERS,
        { provide: FeedbackService, useValue: service }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ContactComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  function fill(): void {
    component.name = 'Miguel Ferreira';
    component.email = 'miguel@example.com';
    component.category = 'contact.category.tournaments';
    component.problem = 'Gostava de ter torneios.';
  }

  it('declares POST on the contact form', () => {
    const form = fixture.nativeElement.querySelector('form.contact-card') as HTMLFormElement;
    expect(form.getAttribute('method')).toBe('post');
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should submit feedback through the public API', () => {
    fill();

    component.submit();

    expect(service.submit).toHaveBeenCalledWith({
      name: 'Miguel Ferreira',
      city: '',
      email: 'miguel@example.com',
      gender: '',
      subject: jasmine.any(String),
      problem: 'Gostava de ter torneios.'
    });
    expect(component.successMessage).toContain('Obrigado');
  });

  it('submits multiple screenshots together and clears the batch on success', () => {
    fill();
    const first = new File(['mock screenshot'], 'captura.png', { type: 'image/png' });
    const second = new File(['another screenshot'], 'captura2.png', { type: 'image/png' });
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [first, second] });
    component.onScreenshotChosen({ target: input } as unknown as Event);
    expect(component.screenshots.map(item => item.file)).toEqual([first, second]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.contact-attachment-preview img').length).toBe(2);
    component.submit();
    expect(service.submit).not.toHaveBeenCalled();
    expect(service.submitWithImages).toHaveBeenCalledOnceWith(jasmine.objectContaining({
      name: 'Miguel Ferreira', email: 'miguel@example.com'
    }), [first, second]);
    expect(component.screenshots.length).toBe(0);
    expect(component.successMessage).toContain('Recebido');
  });

  it('removes one image without disturbing other previews', () => {
    const files = [new File(['one'], 'one.png', {type:'image/png'}),
      new File(['two'], 'two.png', {type:'image/png'})];
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: files });
    component.onScreenshotChosen({target:input} as unknown as Event);
    component.removeScreenshot(0);
    expect(component.screenshots.map(item => item.file.name)).toEqual(['two.png']);
  });

  it('enforces the eight-image cap without discarding accepted images', () => {
    const files = Array.from({length: 10}, (_, i) =>
      new File(['image'], 'img' + i + '.png', {type: 'image/png'}));
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', {value: files});
    component.onScreenshotChosen({target:input} as unknown as Event);
    expect(component.screenshots.length).toBe(8);
    expect(component.screenshotError).toContain('8');
  });

  it('does not intercept pasted text and rejects invalid screenshot formats', () => {
    const fake = new File(['<script>unsafe</script>'], 'test.html', { type:'text/html' });
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [fake] });
    component.onScreenshotChosen({ target: input } as unknown as Event);
    expect(component.screenshots.length).toBe(0);
    expect(component.screenshotError).toContain('PNG');
    const preventDefault = jasmine.createSpy('preventDefault');
    component.onMessagePaste({ clipboardData: { items: [] }, preventDefault } as unknown as ClipboardEvent);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('should show contextual email validation', () => {
    fill();
    component.email = 'invalid-email';

    component.submit();

    expect(service.submit).not.toHaveBeenCalled();
    expect(component.fieldErrors.email).toBeTruthy();
  });

  it('should reject incomplete feedback', () => {
    component.name = 'Miguel';

    component.submit();

    expect(service.submit).not.toHaveBeenCalled();
    expect(component.fieldErrors.email).toBeTruthy();
    expect(component.fieldErrors.category).toBeTruthy();
    expect(component.fieldErrors.problem).toBeTruthy();
  });
});
