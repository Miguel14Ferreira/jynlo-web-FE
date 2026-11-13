import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environment/environment';

export type CommunityTimelineKind = 'POST' | 'CHAT';

export interface CommunityTimelineEntry {
  id: number;
  communityId: number;
  kind: CommunityTimelineKind;
  username: string;
  body: string;
  createdAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  extraMedia?: {url: string; mimeType: string}[];
  attachments?: {index: number; filename: string; mimeType: string; size: number}[];
  attachmentName?: string | null;
  attachmentMimeType?: string | null;
  attachmentSize?: number | null;
  replyToMessageId?: number | null;
  replyToSender?: string | null;
  replyToText?: string | null;
}

@Injectable({ providedIn: 'root' })
export class CommunityTimelineService {
  private readonly api = environment.apiUrl + '/api/communities';
  constructor(private readonly http: HttpClient) {}

  private url(id: number, kind: CommunityTimelineKind): string {
    return this.api + '/' + id + (kind === 'POST' ? '/posts' : '/messages');
  }

  list(id: number, kind: CommunityTimelineKind): Observable<CommunityTimelineEntry[]> {
    return this.http.get<CommunityTimelineEntry[]>(this.url(id, kind));
  }

  olderMessages(id: number, beforeId: number): Observable<CommunityTimelineEntry[]> {
    return this.http.get<CommunityTimelineEntry[]>(
      this.url(id, 'CHAT') + '/older', { params: { before: String(beforeId) } });
  }

  send(id: number, kind: CommunityTimelineKind, body: string,
       replyToMessageId?: number): Observable<CommunityTimelineEntry> {
    return this.http.post<CommunityTimelineEntry>(this.url(id, kind),
      { body: body.trim(), ...(kind === 'CHAT' && replyToMessageId ? { replyToMessageId } : {}) });
  }

  editChatMessage(id: number, messageId: number, text: string): Observable<CommunityTimelineEntry> {
    return this.http.put<CommunityTimelineEntry>(this.url(id, 'CHAT') + '/' + messageId, {text});
  }

  deleteChatForEveryone(id: number, messageId: number): Observable<CommunityTimelineEntry> {
    return this.http.delete<CommunityTimelineEntry>(
      this.url(id, 'CHAT') + '/' + messageId + '/for-everyone');
  }

  chatAttachmentsAvailable(id: number): Observable<{ available: boolean }> {
    return this.http.get<{ available: boolean }>(
      this.url(id, 'CHAT') + '/attachments/availability');
  }

  sendChatAttachment(id: number, file: File, caption: string,
                     replyToMessageId?: number): Observable<CommunityTimelineEntry> {
    const form = new FormData();
    form.append('file', file, file.name);
    if (caption.trim()) form.append('caption', caption.trim());
    if (replyToMessageId) form.append('replyToMessageId', String(replyToMessageId));
    return this.http.post<CommunityTimelineEntry>(
      this.url(id, 'CHAT') + '/attachments', form);
  }

  sendChatAttachments(id: number, files: File[], caption: string,
                      replyToMessageId?: number): Observable<CommunityTimelineEntry> {
    const form = new FormData();
    for (const file of files) form.append('files', file, file.name);
    if (caption.trim()) form.append('caption', caption.trim());
    if (replyToMessageId) form.append('replyToMessageId', String(replyToMessageId));
    return this.http.post<CommunityTimelineEntry>(
      this.url(id, 'CHAT') + '/attachments/batch', form);
  }

  downloadChatAttachmentAt(id: number, messageId: number, index: number): Observable<Blob> {
    return this.http.get(this.url(id, 'CHAT') + '/attachments/' + messageId + '/' + index,
      {responseType: 'blob'});
  }

  downloadChatAttachment(id: number, messageId: number): Observable<Blob> {
    return this.http.get(this.url(id, 'CHAT') + '/attachments/' + messageId,
      { responseType: 'blob' });
  }

  sendPostWithMedia(id: number, body: string, image?: File, video?: File): Observable<CommunityTimelineEntry> {
    const form = new FormData();
    form.append('content', body.trim());
    if (image) form.append('image', image);
    if (video) form.append('video', video);
    return this.http.post<CommunityTimelineEntry>(this.url(id, 'POST'), form);
  }

  sendPostAlbum(id: number, body: string, files: File[]): Observable<CommunityTimelineEntry> {
    const form = new FormData();
    form.append('content', body.trim());
    for (const file of files) form.append('files', file, file.name);
    return this.http.post<CommunityTimelineEntry>(this.url(id, 'POST'), form);
  }

  editPost(id: number, entryId: number, content: string): Observable<CommunityTimelineEntry> {
    return this.http.put<CommunityTimelineEntry>(this.url(id, 'POST') + '/' + entryId, { content });
  }

  delete(id: number, kind: CommunityTimelineKind, entryId: number): Observable<void> {
    return this.http.delete<void>(this.url(id, kind) + '/' + entryId);
  }
}
