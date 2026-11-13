import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { environment } from 'src/environment/environment';
import { CommunityTimelineService } from './community-timeline.service';

describe('CommunityTimelineService API contract', () => {
  let http: jasmine.SpyObj<HttpClient>;
  let service: CommunityTimelineService;
  const base = environment.apiUrl + '/api/communities/7';

  beforeEach(() => {
    http = jasmine.createSpyObj<HttpClient>('HttpClient', ['get', 'post', 'delete']);
    http.get.and.returnValue(of([]));
    http.post.and.returnValue(of({}));
    http.delete.and.returnValue(of(undefined));
    service = new CommunityTimelineService(http);
  });

  it('keeps posts and chat in separate, community-specific paths', () => {
    service.list(7, 'POST').subscribe();
    expect(http.get).toHaveBeenCalledWith(base + '/posts');
    service.list(7, 'CHAT').subscribe();
    expect(http.get).toHaveBeenCalledWith(base + '/messages');
  });

  it('trims messages and never sends untrusted user identity fields', () => {
    service.send(7, 'POST', '  Festa!  ').subscribe();
    expect(http.post).toHaveBeenCalledWith(base + '/posts', { body: 'Festa!' });
    service.send(7, 'CHAT', '  Até já!  ').subscribe();
    expect(http.post).toHaveBeenCalledWith(base + '/messages', { body: 'Até já!' });
  });

  it('sends a single image using the established multipart image field', () => {
    const image=new File(['jpeg'], 'MF.jpg', {type:'image/jpeg'});
    service.sendPostWithMedia(7,'',image).subscribe();
    const [url,body]=http.post.calls.mostRecent().args;
    expect(url).toBe(base+'/posts');
    expect(body instanceof FormData).toBeTrue();
    const form=body as FormData;
    expect(form.get('content')).toBe('');
    expect((form.get('image') as File).name).toBe('MF.jpg');
    expect(form.has('files')).toBeFalse();
  });

  it('uses repeated multipart files for a real multi-image gallery', () => {
    const first=new File(['a'],'one.jpg',{type:'image/jpeg'});
    const second=new File(['b'],'two.png',{type:'image/png'});
    service.sendPostAlbum(7,'Fotografias',[first,second]).subscribe();
    const [url,body]=http.post.calls.mostRecent().args;
    expect(url).toBe(base+'/posts');
    const form=body as FormData;
    expect(form.get('content')).toBe('Fotografias');
    expect((form.getAll('files') as File[]).map(file=>file.name))
      .toEqual(['one.jpg','two.png']);
    expect(form.has('image')).toBeFalse();
    expect(form.has('video')).toBeFalse();
  });

  it('only requests deletion of the selected item in the selected channel', () => {
    service.delete(7, 'CHAT', 19).subscribe();
    expect(http.delete).toHaveBeenCalledWith(base + '/messages/19');
  });
});
