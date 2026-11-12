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
  screenshots: { file: File; url: string }[] = [];
  readonly maxScreenshots = 8;
  readonly maxTotalScreenshotBytes = 16 * 1024 * 1024;
  screenshotError = '';
  readonly maxScreenshotBytes = 3 * 1024 * 1024;
  readonly maxMediaBytes = 12 * 1024 * 1024;
  isImage(file: File): boolean { return file.type.startsWith('image/'); }
  isVideo(file: File): boolean { return file.type.startsWith('video/'); }
  isAudio(file: File): boolean { return file.type.startsWith('audio/'); }

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

    const send = this.screenshots.length
      ? this.feedbackService.submitWithImages(request, this.screenshots.map(item => item.file))
      : this.feedbackService.submit(request);
    send.pipe(timeout(20_000), finalize(() => this.loading = false))
      .subscribe({
        next: response => {
          this.successMessage = response.message || t('feedback.contact.thanks');
          this.category = '';
          this.problem = '';
          this.revokeScreenshots();
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
    const files = Array.from(input.files ?? []);
    input.value = '';
    this.addScreenshots(files);
  }

  onMessagePaste(event: ClipboardEvent): void {
    const images = Array.from(event.clipboardData?.items ?? [])
      .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
      .map(item => item.getAsFile())
      .filter((file): file is File => !!file);
    if (!images.length || this.loading) return;
    event.preventDefault();
    this.addScreenshots(images);
  }

  private addScreenshots(files: File[]): void {
    if (this.loading || !files.length) return;
    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif',
      'video/mp4', 'video/webm', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'application/pdf'];
    const problems: string[] = [];
    let total = this.screenshots.reduce((sum, item) => sum + item.file.size, 0);
    for (const file of files) {
      if (this.screenshots.length >= this.maxScreenshots) {
        problems.push('Só podes adicionar até 8 ficheiros.');
        break;
      }
      if (!allowed.includes(file.type.toLowerCase())) {
        problems.push('Formatos permitidos: PNG, JPG, WebP, GIF, MP4, WebM, MP3, M4A, OGG ou PDF.');
        continue;
      }
      if (!file.size || file.size > (this.isImage(file) ? this.maxScreenshotBytes : this.maxMediaBytes)) {
        problems.push('Cada imagem pode ter até 3 MB; vídeos, áudio e PDF até 12 MB.');
        continue;
      }
      if (total + file.size > this.maxTotalScreenshotBytes) {
        problems.push('O conjunto das imagens pode ter até 16 MB.');
        continue;
      }
      if (this.screenshots.some(item => item.file.name === file.name
            && item.file.size === file.size && item.file.lastModified === file.lastModified)) {
        problems.push('Essa imagem já foi adicionada.');
        continue;
      }
      this.screenshots.push({ file, url: URL.createObjectURL(file) });
      total += file.size;
    }
    this.screenshotError = [...new Set(problems)].join(' ');
  }

  removeScreenshot(index: number): void {
    if (this.loading || index < 0 || index >= this.screenshots.length) return;
    const removed = this.screenshots.splice(index, 1)[0];
    URL.revokeObjectURL(removed.url);
    this.screenshotError = '';
  }

  clearScreenshot(): void {
    if (this.loading) return;
    this.revokeScreenshots();
    this.screenshotError = '';
  }

  private revokeScreenshots(): void {
    for (const item of this.screenshots) URL.revokeObjectURL(item.url);
    this.screenshots = [];
  }

  ngOnDestroy(): void {
    this.revokeScreenshots();
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
