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
  attachments: {index: number; filename: string; mimeType: string}[] = [];
  attachmentUrls = new Map<number, string>();
  loadingAttachmentIndex: number | null = null;
  attachmentListLoading = false;
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
    this.loadAttachments(idea);
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

  private loadAttachments(idea: AdminIdea): void {
    const version = this.attachmentRequestVersion;
    this.attachmentListLoading = true;
    this.adminIdeasService.attachments(idea.id).pipe(timeout(10_000),
      finalize(() => {
        if (version === this.attachmentRequestVersion) this.attachmentListLoading = false;
      })).subscribe({
        next: items => {
          if (version === this.attachmentRequestVersion && this.selected?.id === idea.id)
            this.attachments = items;
        },
        error: () => {
          if (version === this.attachmentRequestVersion) {
            this.attachmentError = 'Não foi possível obter a lista de anexos.';
            if (idea.attachmentName) this.attachments =
              [{index:0,filename:idea.attachmentName,mimeType:idea.attachmentMimeType || 'image/png'}];
          }
        }
      });
  }

  showAttachmentAt(idea: AdminIdea, index: number): void {
    if (this.selected?.id !== idea.id || this.loadingAttachmentIndex !== null) return;
    const existing = this.attachmentUrls.get(index);
    if (existing) {
      URL.revokeObjectURL(existing);
      this.attachmentUrls.delete(index);
      return;
    }
    const version = this.attachmentRequestVersion;
    this.attachmentError = '';
    this.loadingAttachmentIndex = index;
    this.adminIdeasService.attachmentAt(idea.id, index).pipe(timeout(15_000),
      finalize(() => { if (version === this.attachmentRequestVersion) this.loadingAttachmentIndex = null; }))
      .subscribe({
        next: blob => {
          if (version !== this.attachmentRequestVersion || this.selected?.id !== idea.id) return;
          if (!['image/png','image/jpeg','image/webp','image/gif'].includes(blob.type)) {
            this.attachmentError = 'O formato da imagem não é suportado.';
            return;
          }
          this.attachmentUrls.set(index, URL.createObjectURL(blob));
        },
        error: () => {
          if (version === this.attachmentRequestVersion)
            this.attachmentError = 'Não foi possível carregar a imagem.';
        }
      });
  }

  downloadAttachmentAt(index: number, filename: string): void {
    const url = this.attachmentUrls.get(index);
    if (!url) return;
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
  }

  private clearAttachmentPreview(): void {
    ++this.attachmentRequestVersion;
    for (const url of this.attachmentUrls.values()) URL.revokeObjectURL(url);
    this.attachmentUrls.clear();
    this.attachments = [];
    this.attachmentListLoading = false;
    this.loadingAttachmentIndex = null;
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
