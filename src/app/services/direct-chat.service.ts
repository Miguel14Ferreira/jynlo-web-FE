import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from 'src/environment/environment';
import { DirectChatInfo, DirectChatMessage } from '../pages/model/direct-chat';

@Injectable({
  providedIn: 'root'
})
export class DirectChatService {
  private readonly baseUrl = environment.apiUrl + '/api/chat/me';

  constructor(private http: HttpClient) {}

  history(username: string): Observable<DirectChatMessage[]> {
    return this.http.get<DirectChatMessage[]>(
      this.baseUrl + '/' + encodeURIComponent(username)
    );
  }

  recentHistory(username: string, page = 0): Observable<{ content: DirectChatMessage[]; last: boolean }> {
    return this.http.get<{ content: DirectChatMessage[]; last: boolean }>(
      this.baseUrl + '/' + encodeURIComponent(username) + '/page?page=' + page + '&size=30'
    );
  }

  send(username: string, text: string, replyToMessageId?: number): Observable<DirectChatMessage> {
    return this.http.post<DirectChatMessage>(
      this.baseUrl + '/' + encodeURIComponent(username),
      { text: text.trim(), ...(replyToMessageId ? { replyToMessageId } : {}) }
    );
  }

  editMessage(username: string, messageId: number, text: string): Observable<DirectChatMessage> {
    return this.http.put<DirectChatMessage>(this.baseUrl + '/' + encodeURIComponent(username)
      + '/messages/' + messageId, {text});
  }

  deleteMessage(username: string, messageId: number): Observable<DirectChatMessage> {
    return this.http.delete<DirectChatMessage>(this.baseUrl + '/' + encodeURIComponent(username)
      + '/messages/' + messageId);
  }

  attachmentsAvailable(username: string): Observable<{ available: boolean }> {
    return this.http.get<{ available: boolean }>(this.baseUrl + '/'
      + encodeURIComponent(username) + '/attachments/availability');
  }

  sendAttachment(username: string, file: File, caption: string,
                 replyToMessageId?: number): Observable<DirectChatMessage> {
    const form = new FormData();
    form.append('file', file, file.name);
    if (caption.trim()) form.append('caption', caption.trim());
    if (replyToMessageId) form.append('replyToMessageId', String(replyToMessageId));
    return this.http.post<DirectChatMessage>(this.baseUrl + '/'
      + encodeURIComponent(username) + '/attachments', form);
  }

  sendAttachments(username: string, files: File[], caption: string,
                  replyToMessageId?: number): Observable<DirectChatMessage> {
    const form = new FormData();
    for (const file of files) form.append('files', file, file.name);
    if (caption.trim()) form.append('caption', caption.trim());
    if (replyToMessageId) form.append('replyToMessageId', String(replyToMessageId));
    return this.http.post<DirectChatMessage>(this.baseUrl + '/'
      + encodeURIComponent(username) + '/attachments/batch', form);
  }

  downloadAttachmentAt(username: string, messageId: number, index: number): Observable<Blob> {
    return this.http.get(this.baseUrl + '/'
      + encodeURIComponent(username) + '/attachments/' + messageId + '/' + index,
      {responseType: 'blob'});
  }

  downloadAttachment(username: string, messageId: number): Observable<Blob> {
    return this.http.get(this.baseUrl + '/'
      + encodeURIComponent(username) + '/attachments/' + messageId, {responseType:'blob'});
  }

  info(username: string): Observable<DirectChatInfo> {
    return this.http.get<DirectChatInfo>(
      this.baseUrl + '/' + encodeURIComponent(username) + '/info'
    );
  }
}
