import { ChangeDetectionStrategy, Component, OnInit, OnDestroy } from '@angular/core';
import { finalize, retry, timeout } from 'rxjs';

import { AdminIdea, IdeaStatus } from '../model/admin-idea';
import { appTranslate as t } from '../../i18n/i18n.service';
import { AdminIdeasService } from '../../services/admin-ideas.service';

@Component({
  selector: 'app-admin-ideas',
  templateUrl: './admin-ideas.component.html',
  styleUrls: ['./admin-ideas.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class AdminIdeasComponent implements OnInit, OnDestroy {
  ideas: AdminIdea[] = [];
  selected?: AdminIdea;
  loading = false;
  updatingId: number | null = null;
  replyingId: number | null = null;
  replyText = '';
  attachmentLoading = false;
  attachmentError = '';
  attachmentPreviewUrl: string | null = null;
  private attachmentBlob: Blob | null = null;
  private attachmentRequestVersion = 0;
  replySuccess = false;
  replyError = '';
  errorMessage = '';
  newCount = 0;
  private readonly dateTimeFormatter = new Intl.DateTimeFormat('pt-PT', {
    dateStyle: 'short',
    timeStyle: 'short'
  });

  readonly statuses: IdeaStatus[] = [
    'NEW',
    'IN_REVIEW',
    'PLANNED',
    'REJECTED',
    'IMPLEMENTED'
  ];

  constructor(private adminIdeasService: AdminIdeasService) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    if (this.replyingId !== null) return;
    this.loading = true;
    this.errorMessage = '';

    this.adminIdeasService.list()
      .pipe(
        timeout(10_000),
        retry({ count: 1 }),
        finalize(() => this.loading = false)
      )
      .subscribe({
        next: ideas => {
          this.ideas = ideas;
          this.newCount = ideas.filter(idea => idea.status === 'NEW').length;
          if (this.selected) {
            this.selected = ideas.find(idea => idea.id === this.selected?.id);
          }
        },
        error: () => {
          this.ideas = [];
          this.newCount = 0;
          this.errorMessage = t('adminIdeas.loadError');
        }
      });
  }

  select(idea: AdminIdea): void {
    if (this.replyingId !== null) return;
    this.clearAttachmentPreview();
    this.selected = idea;
    this.replyText = '';
    this.replyError = '';
    this.replySuccess = false;
  }

  close(): void {
    if (this.replyingId !== null) return;
    this.clearAttachmentPreview();
    this.selected = undefined;
    this.replyText = '';
  }

  showAttachment(idea: AdminIdea): void {
    if (!idea.attachmentName || this.attachmentLoading) return;
    if (this.selected?.id !== idea.id) return;
    if (this.attachmentPreviewUrl) {
      this.clearAttachmentPreview();
      return;
    }
    const version = ++this.attachmentRequestVersion;
    this.attachmentError = '';
    this.attachmentLoading = true;
    this.adminIdeasService.attachment(idea.id).pipe(timeout(15_000),
      finalize(() => { if (version === this.attachmentRequestVersion) this.attachmentLoading = false; }))
      .subscribe({
        next: blob => {
          if (version !== this.attachmentRequestVersion || this.selected?.id !== idea.id) return;
          if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(blob.type)) {
            this.attachmentError = 'O formato da imagem não é suportado.';
            return;
          }
          this.attachmentBlob = blob;
          this.attachmentPreviewUrl = URL.createObjectURL(blob);
        },
        error: () => {
          if (version === this.attachmentRequestVersion)
            this.attachmentError = 'Não foi possível carregar a imagem.';
        }
      });
  }

  downloadAttachment(idea: AdminIdea): void {
    if (!this.attachmentBlob || !this.attachmentPreviewUrl || this.selected?.id !== idea.id) return;
    const link = document.createElement('a');
    link.href = this.attachmentPreviewUrl;
    link.download = idea.attachmentName || 'captura';
    link.click();
  }

  private clearAttachmentPreview(): void {
    ++this.attachmentRequestVersion;
    if (this.attachmentPreviewUrl) URL.revokeObjectURL(this.attachmentPreviewUrl);
    this.attachmentPreviewUrl = null;
    this.attachmentBlob = null;
    this.attachmentLoading = false;
    this.attachmentError = '';
  }

  ngOnDestroy(): void {
    this.clearAttachmentPreview();
  }

  useThankYouTemplate(): void {
    const selected = this.selected;
    if (!selected || selected.adminRepliedAt || this.replyingId !== null) return;
    const name = (selected.name || '').trim().slice(0, 80);
    this.replyText = t('adminIdeas.replyThanksTemplate').replace('{{name}}', name || '!');
    this.replySuccess = false;
    this.replyError = '';
  }

  get canReply(): boolean {
    return !!this.selected && !this.selected.adminRepliedAt && !this.loading
      && this.replyingId === null && this.updatingId === null
      && this.replyText.trim().length >= 3 && this.replyText.trim().length <= 2000;
  }

  replyToIdea(): void {
    const selected = this.selected;
    if (!selected || !this.canReply) return;
    const message = this.replyText.trim();
    this.replyingId = selected.id;
    this.replyError = '';
    this.replySuccess = false;
    this.adminIdeasService.reply(selected.id, message)
      .pipe(timeout(15_000), finalize(() => this.replyingId = null))
      .subscribe({
        next: updated => {
          this.ideas = this.ideas.map(idea => idea.id === updated.id ? updated : idea);
          if (this.selected?.id === updated.id) this.selected = updated;
          this.replyText = '';
          this.replySuccess = true;
        },
        error: () => this.replyError = t('adminIdeas.replyError')
      });
  }

  updateStatus(idea: AdminIdea, status: IdeaStatus): void {
    if (this.updatingId !== null || this.replyingId !== null || idea.status === status) {
      return;
    }

    this.updatingId = idea.id;
    this.errorMessage = '';

    this.adminIdeasService.updateStatus(idea.id, status)
      .pipe(
        timeout(10_000),
        finalize(() => this.updatingId = null)
      )
      .subscribe({
        next: updated => {
          this.ideas = this.ideas.map(item => item.id === updated.id ? updated : item);
          this.newCount = this.ideas.filter(item => item.status === 'NEW').length;
          if (this.selected?.id === updated.id) {
            this.selected = updated;
          }
        },
        error: () => {
          this.errorMessage = t('adminIdeas.updateError');
        }
      });
  }

  statusLabel(status: IdeaStatus): string {
    return t('adminIdeas.status.' + status);
  }

  formatDate(value: string | null): string {
    if (!value) {
      return t('adminIdeas.dateUnavailable');
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return this.dateTimeFormatter.format(date);
  }
}
