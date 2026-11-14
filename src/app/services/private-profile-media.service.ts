import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environment/environment';

/**
 * Browsers cannot send a Bearer header in a bare img/video src. The existing
 * auth interceptor protects this HTTP download and returns an in-memory URL.
 * Revoke the URL as soon as the viewer closes or signs out.
 */
@Injectable({ providedIn: 'root' })
export class PrivateProfileMediaService {
  private readonly http = inject(HttpClient);
  private readonly ownedUrls = new Set<string>();
  private readonly path = /^\/api\/profile-media\/(?:posts\/[1-9]\d*\/(?:image|video|extra-[0-5])|stories\/[1-9]\d*)$/;

  async authorizedObjectUrl(resourcePath: string): Promise<string> {
    if (!this.path.test(resourcePath)) {
      throw new Error('Invalid private media path');
    }
    const blob = await firstValueFrom(this.http.get(
      environment.apiUrl + resourcePath, { responseType: 'blob', withCredentials: false }));
    if (!/^(image\/(jpeg|png|webp)|video\/(mp4|webm))(?:;|$)/i.test(blob.type)) {
      throw new Error('Invalid protected media type');
    }
    if (!blob.size || blob.size > 60 * 1024 * 1024) {
      throw new Error('Invalid protected media size');
    }
    const url = URL.createObjectURL(blob);
    this.ownedUrls.add(url);
    return url;
  }

  revoke(url: string | null | undefined): void {
    if (!url || !this.ownedUrls.delete(url)) return;
    URL.revokeObjectURL(url);
  }
  revokeAll(): void {
    for (const url of this.ownedUrls) URL.revokeObjectURL(url);
    this.ownedUrls.clear();
  }
}
