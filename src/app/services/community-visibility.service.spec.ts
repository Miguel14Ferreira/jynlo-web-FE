import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { CommunityGroupsService } from './community-groups.service';

describe('CommunityGroupsService visibility', () => {
  let service: CommunityGroupsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CommunityGroupsService, provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(CommunityGroupsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('switches an existing community to private through the owner-only endpoint', () => {
    let visibility = '';
    service.updateVisibility(7, 'PRIVATE').subscribe(group => visibility = group.visibility);
    const req = http.expectOne(r => r.url.endsWith('/7/visibility'));
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ visibility: 'PRIVATE' });
    req.flush({ id: 7, visibility: 'PRIVATE' });
    expect(visibility).toBe('PRIVATE');
  });

  it('switches it back to public', () => {
    service.updateVisibility(7, 'PUBLIC').subscribe();
    const req = http.expectOne(r => r.url.endsWith('/7/visibility'));
    expect(req.request.body).toEqual({ visibility: 'PUBLIC' });
    req.flush({ id: 7, visibility: 'PUBLIC' });
  });
});
