import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environment/environment';
import { SocialStory } from '../pages/model/social-story';

@Injectable({ providedIn: 'root' })
export class SocialStoriesService {
  private readonly url = environment.apiUrl + '/api/stories';
  constructor(private readonly http: HttpClient) {}

  feed(): Observable<SocialStory[]> {
    return this.http.get<SocialStory[]>(this.url);
  }

  mine(): Observable<SocialStory[]> {
    return this.http.get<SocialStory[]>(this.url + '/mine');
  }

  get(id: number): Observable<SocialStory> {
    return this.http.get<SocialStory>(this.url + '/' + id);
  }

  publish(file: File, caption: string, communityId: number | null, options?: {
    textPosition: 'top' | 'center' | 'bottom';
    textScale: 'small' | 'medium' | 'large';
    textStyle: 'plain' | 'pill';
    altText?: string;
    showTime?: boolean;
  }): Observable<SocialStory> {
    const body = new FormData();
    body.append('caption', caption.trim());
    body.append(file.type.startsWith('video/') ? 'video' : 'image', file);
    if (communityId !== null) body.append('communityId', String(communityId));
    if (options) {
      body.append('textPosition', options.textPosition);
      body.append('textScale', options.textScale);
      body.append('textStyle', options.textStyle);
      if (options.altText) body.append('altText', options.altText.trim());
      body.append('showTime', String(!!options.showTime));
    }
    return this.http.post<SocialStory>(this.url, body);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(this.url + '/' + id);
  }
}
