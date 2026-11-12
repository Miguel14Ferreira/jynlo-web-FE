import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from 'src/environment/environment';
import { CustomHttpResponse } from '../pages/custom-http-response';

export interface FeedbackRequest {
  name: string;
  city: string;
  email: string;
  gender: string;
  subject: string;
  problem: string;
}

@Injectable({
  providedIn: 'root'
})
export class FeedbackService {
  private readonly url = environment.apiUrl + '/api/ideas/submit';

  constructor(private http: HttpClient) {}

  submitWithImage(request: FeedbackRequest, image: File): Observable<CustomHttpResponse> {
    return this.submitWithImages(request, [image]);
  }

  submitWithImages(request: FeedbackRequest, images: File[]): Observable<CustomHttpResponse> {
    const form = new FormData();
    form.append('request', new Blob([JSON.stringify(request)], { type: 'application/json' }));
    for (const image of images) form.append('images', image, image.name);
    return this.http.post<CustomHttpResponse>(this.url + '-with-attachments', form);
  }

  submit(request: FeedbackRequest): Observable<CustomHttpResponse> {
    return this.http.post<CustomHttpResponse>(this.url, request);
  }
}
