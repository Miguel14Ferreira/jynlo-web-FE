import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { environment } from 'src/environment/environment';
import { CommunityLiveService } from './community-live.service';

describe('Community live API contract', () => {
  let service: CommunityLiveService;
  let http: jasmine.SpyObj<HttpClient>;
  const base = environment.apiUrl + '/api/communities/7/live';

  beforeEach(() => {
    http = jasmine.createSpyObj<HttpClient>('HttpClient', ['get', 'post']);
    http.get.and.returnValue(of([]));
    http.post.and.returnValue(of({}));
    TestBed.configureTestingModule({
      providers: [
        CommunityLiveService,
        {provide: HttpClient, useValue: http}
      ]
    });
    service = TestBed.inject(CommunityLiveService);
  });

  it('checks availability and organizer rights separately from event listing', () => {
    service.capabilities(7).subscribe();
    service.list(7).subscribe();
    expect(http.get).toHaveBeenCalledWith(base + '/capabilities');
    expect(http.get).toHaveBeenCalledWith(base);
  });

  it('creates a scheduled event without supplying any client-side identity', () => {
    const when = '2026-12-12T18:00:00.000Z';
    service.schedule(7, 'Jogo', 'Futebol', when).subscribe();
    expect(http.post).toHaveBeenCalledOnceWith(base, {
      title:'Jogo', description:'Futebol', scheduledAt:when
    });
  });

  it('has distinct endpoints for start, end and viewer connection', () => {
    service.start(7, 12).subscribe();
    service.end(7, 12).subscribe();
    service.join(7, 12).subscribe();
    expect(http.post).toHaveBeenCalledWith(base + '/12/start', {});
    expect(http.post).toHaveBeenCalledWith(base + '/12/end', {});
    expect(http.post).toHaveBeenCalledWith(base + '/12/join', {});
    const serialized = JSON.stringify(http.post.calls.allArgs());
    expect(serialized).not.toContain('token');
    expect(serialized).not.toContain('password');
  });
});
