import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy } from '@angular/core';
import { finalize, timeout } from 'rxjs';

import { appTranslate as t } from '../../i18n/i18n.service';
import { FeedbackRequest, FeedbackService } from '../../services/feedback.service';

type ContactField = 'name' | 'email' | 'category' | 'problem';

@Component({
  selector: 'app-contact',
  templateUrl: './contact.component.html',
  styleUrls: ['./contact.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class ContactComponent implements OnDestroy {
  name = '';
  email = '';
  category = '';
  problem = '';
  screenshot: File | null = null;
  screenshotError = '';
  screenshotPreviewUrl: string | null = null;
  readonly maxScreenshotBytes = 3 * 1024 * 1024;

  readonly categories = [
    'contact.category.partners',
    'contact.category.activity',
    'contact.category.groups',
    'contact.category.tournaments',
    'contact.category.suggestions',
    'contact.category.partnerships',
    'contact.category.technical',
    'contact.category.account',
    'contact.category.safety',
    'contact.category.other'
  ];

  loading = false;
  errorMessage = '';
  successMessage = '';
  fieldErrors: Partial<Record<ContactField, string>> = {};

  constructor(
    private feedbackService: FeedbackService,
    private host: ElementRef<HTMLElement>
  ) {}

  submit(): void {
    this.fieldErrors = this.validate();

    if (Object.keys(this.fieldErrors).length > 0) {
      this.errorMessage = t('feedback.form.attention');
      this.successMessage = '';
      this.focusFirstInvalidField();
      return;
    }

    const request: FeedbackRequest = {
      name: this.name.trim(),
      city: '',
      email: this.email.trim(),
      gender: '',
      subject: t(this.category),
      problem: this.problem.trim()
    };

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    const send = this.screenshot
      ? this.feedbackService.submitWithImage(request, this.screenshot)
      : this.feedbackService.submit(request);
    send.pipe(timeout(20_000), finalize(() => this.loading = false))
      .subscribe({
        next: response => {
          this.successMessage = response.message || t('feedback.contact.thanks');
          this.category = '';
          this.problem = '';
          if (this.screenshotPreviewUrl) URL.revokeObjectURL(this.screenshotPreviewUrl);
          this.screenshotPreviewUrl = null;
          this.screenshot = null;
          this.screenshotError = '';
          this.fieldErrors = {};
        },
        error: error => {
          this.errorMessage = this.errorFrom(
            error,
            t('feedback.contact.sendError')
          );
        }
      });
  }

  onScreenshotChosen(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0) ?? null;
    input.value = '';
    if (file) this.selectScreenshot(file);
  }

  onMessagePaste(event: ClipboardEvent): void {
    const image = Array.from(event.clipboardData?.files ?? [])
      .find(file => file.type.startsWith('image/'));
    if (!image || this.loading) return;
    event.preventDefault();
    this.selectScreenshot(image);
  }

  private selectScreenshot(file: File): void {
    if (this.loading) return;
    const supported = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (!supported.includes(file.type.toLowerCase())) {
      this.screenshotError = 'Usa PNG, JPG, WebP ou GIF.';
      return;
    }
    if (!file.size || file.size > this.maxScreenshotBytes) {
      this.screenshotError = 'A imagem não pode ultrapassar 3 MB.';
      return;
    }
    this.clearScreenshot();
    this.screenshot = file;
    this.screenshotPreviewUrl = URL.createObjectURL(file);
    this.screenshotError = '';
  }

  clearScreenshot(): void {
    if (this.loading) return;
    if (this.screenshotPreviewUrl) URL.revokeObjectURL(this.screenshotPreviewUrl);
    this.screenshotPreviewUrl = null;
    this.screenshot = null;
    this.screenshotError = '';
  }

  ngOnDestroy(): void {
    if (this.screenshotPreviewUrl) URL.revokeObjectURL(this.screenshotPreviewUrl);
    this.screenshotPreviewUrl = null;
  }

  clearFieldError(field: ContactField): void {
    if (!this.fieldErrors[field]) {
      return;
    }

    const updated = { ...this.fieldErrors };
    delete updated[field];
    this.fieldErrors = updated;
  }

  private validate(): Partial<Record<ContactField, string>> {
    const errors: Partial<Record<ContactField, string>> = {};

    if (!this.name.trim()) {
      errors.name = t('feedback.contact.nameRequired');
    }

    if (!this.email.trim()) {
      errors.email = t('feedback.contact.emailRequired');
    } else if (!this.email.includes('@')) {
      errors.email = t('feedback.contact.invalidEmail');
    }

    if (!this.category) {
      errors.category = t('feedback.contact.categoryRequired');
    }

    if (!this.problem.trim()) {
      errors.problem = t('feedback.contact.messageRequired');
    } else if (this.problem.trim().length > 4000) {
      errors.problem = t('feedback.contact.messageLong');
    }

    return errors;
  }

  private focusFirstInvalidField(): void {
    queueMicrotask(() => {
      const firstInvalid = this.host.nativeElement.querySelector<HTMLElement>(
        '[aria-invalid="true"]'
      );

      if (!firstInvalid) {
        return;
      }

      firstInvalid.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
      firstInvalid.focus({ preventScroll: true });
    });
  }

  private errorFrom(error: HttpErrorResponse, fallback: string): string {
    const apiMessage = error.error?.message;
    return typeof apiMessage === 'string' && apiMessage.trim()
      ? apiMessage
      : fallback;
  }
}
