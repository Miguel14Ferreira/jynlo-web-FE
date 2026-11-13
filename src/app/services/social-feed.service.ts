import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from 'src/environment/environment';
import { FeedItem, PostLikeStatus, SocialComment } from '../pages/model/feed-item';
import { FollowProfile } from '../pages/model/follow';

@Injectable({
  providedIn: 'root'
})
export class SocialFeedService {
  private readonly baseUrl = environment.apiUrl + '/api/feed';

  constructor(private http: HttpClient) {}

  feed(): Observable<FeedItem[]> {
    return this.http.get<FeedItem[]>(this.baseUrl);
  }

  postById(id: number): Observable<FeedItem> {
    return this.http.get<FeedItem>(this.baseUrl + '/posts/' + id);
  }

  /** Persistent authored publications, excluding expiring stories and generated activities. */
  profilePosts(username: string, page = 0): Observable<FeedItem[]> {
    return this.http.get<FeedItem[]>(
      this.baseUrl + '/users/' + encodeURIComponent(username) + '/posts',
      { params: { page: String(page) } }
    );
  }

  createPost(content: string, image?: File, sessionId?: number, video?: File, location?: string): Observable<FeedItem> {
    if (image && video) {
      throw new Error('A post can contain either a photo or a video, not both');
    }
    if (!image && !video) {
      return this.http.post<FeedItem>(
        this.baseUrl + '/posts',
        { content, ...(sessionId == null ? {} : { sessionId }),
          ...(location?.trim() ? { location: location.trim() } : {}) }
      );
    }

    const formData = new FormData();
    formData.append('content', content);
    if (location?.trim()) formData.append('location', location.trim());
    if (image) formData.append('image', image);
    if (video) formData.append('video', video);
    if (sessionId != null) {
      formData.append('sessionId', String(sessionId));
    }

    return this.http.post<FeedItem>(
      this.baseUrl + '/posts',
      formData
    );
  }

  createPostAlbum(content: string, files: File[], sessionId?: number, location?: string): Observable<FeedItem> {
    const form = new FormData();
    form.append('content', content);
    if (location?.trim()) form.append('location', location.trim());
    for (const file of files) form.append('files', file, file.name);
    if (sessionId != null) form.append('sessionId', String(sessionId));
    return this.http.post<FeedItem>(this.baseUrl + '/posts', form);
  }

  editPostWithMedia(postId: number, content: string, location: string,
      replacementFiles: File[], replaceMedia: boolean): Observable<FeedItem> {
    const form = new FormData();
    form.append('content', content);
    form.append('location', location.trim());
    form.append('replaceMedia', String(replaceMedia));
    for (const file of replacementFiles) form.append('files', file, file.name);
    return this.http.put<FeedItem>(this.baseUrl + '/posts/' + postId + '/media', form);
  }

  /** Creates or retrieves a persistent post linked to a public attendance activity. */
  ensureAttendancePost(sessionId: number, attendeeUsername: string): Observable<number> {
    return this.http.post<number>(
      this.baseUrl + '/activities/attendance/' + sessionId + '/'
        + encodeURIComponent(attendeeUsername) + '/post',
      null
    );
  }

  likers(postId: number): Observable<FollowProfile[]> {
    return this.http.get<FollowProfile[]>(this.baseUrl + '/posts/' + postId + '/likers');
  }

  setLikersHidden(postId: number, hidden: boolean): Observable<boolean> {
    return this.http.put<boolean>(this.baseUrl + '/posts/' + postId + '/likers/privacy', { hidden });
  }

  likePost(postId: number): Observable<PostLikeStatus> {
    return this.http.post<PostLikeStatus>(
      this.baseUrl + '/posts/' + postId + '/likes',
      null
    );
  }

  unlikePost(postId: number): Observable<PostLikeStatus> {
    return this.http.delete<PostLikeStatus>(
      this.baseUrl + '/posts/' + postId + '/likes'
    );
  }

  comments(postId: number): Observable<SocialComment[]> {
    return this.http.get<SocialComment[]>(
      this.baseUrl + '/posts/' + postId + '/comments'
    );
  }

  addComment(postId: number, content: string): Observable<SocialComment> {
    return this.http.post<SocialComment>(
      this.baseUrl + '/posts/' + postId + '/comments',
      { content }
    );
  }

  editComment(postId:number,commentId:number,content:string): Observable<SocialComment> {
    return this.http.put<SocialComment>(this.baseUrl+'/posts/'+postId+
      '/comments/'+commentId,{content:content.trim()});
  }

  likeComment(postId:number,commentId:number): Observable<SocialComment> {
    return this.http.post<SocialComment>(this.baseUrl+'/posts/'+postId+
      '/comments/'+commentId+'/likes',{});
  }

  unlikeComment(postId:number,commentId:number): Observable<SocialComment> {
    return this.http.delete<SocialComment>(this.baseUrl+'/posts/'+postId+
      '/comments/'+commentId+'/likes');
  }

  deleteComment(postId: number, commentId: number): Observable<void> {
    return this.http.delete<void>(
      this.baseUrl + '/posts/' + postId + '/comments/' + commentId
    );
  }

  reportComment(postId: number, commentId: number, reason: string): Observable<void> {
    return this.http.post<void>(
      this.baseUrl + '/posts/' + postId + '/comments/' + commentId + '/report',
      { reason }
    );
  }

  reportPost(postId: number, reason: string): Observable<void> {
    return this.http.post<void>(
      this.baseUrl + '/posts/' + postId + '/report',
      { reason }
    );
  }

  hideAttendanceActivity(sessionId: number): Observable<void> {
    return this.http.put<void>(
      this.baseUrl + '/attendance/' + sessionId + '/hide',
      null
    );
  }

  editPost(postId: number, content: string, location?: string | null): Observable<FeedItem> {
    return this.http.put<FeedItem>(this.baseUrl + '/posts/' + postId, {
      content, location: location || null
    });
  }

  hiddenPosts(): Observable<FeedItem[]> {
    return this.http.get<FeedItem[]>(this.baseUrl + '/posts/hidden');
  }

  hidePost(postId: number): Observable<void> {
    return this.http.put<void>(this.baseUrl + '/posts/' + postId + '/hide', null);
  }

  restoreHiddenPost(postId: number): Observable<void> {
    return this.http.delete<void>(this.baseUrl + '/posts/' + postId + '/hide');
  }

  deletePost(postId: number): Observable<void> {
    return this.http.delete<void>(
      this.baseUrl + '/posts/' + postId
    );
  }
}
