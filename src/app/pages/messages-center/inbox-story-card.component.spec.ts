import { HttpErrorResponse } from '@angular/common/http';
import { of, Subject, throwError } from 'rxjs';
import { SocialStoriesService } from '../../services/social-stories.service';
import { SocialStory } from '../model/social-story';
import { InboxStoryCardComponent } from './inbox-story-card.component';
import { storyIdFromChatText } from './inbox-story-share';

const story:SocialStory={
  id:9,authorUsername:'atleta',displayName:'Atleta',avatarUrl:null,
  communityId:null,communityName:null,communityPhotoUrl:null,caption:'Bom jogo!',
  mediaUrl:'https://cdn.example.test/story.jpg',video:false,
  createdAt:'2026-11-20T12:00:00Z',
  expiresAt:'2099-01-01T00:00:00Z',canDelete:false
};

describe('Jynlo story shares in inbox',()=>{
  it('recognizes the old heart and official story link without showing its raw URL',()=>{
    expect(storyIdFromChatText('❤️\nhttps://d24sports.com/menu/feed?story=9')).toBe(9);
    expect(storyIdFromChatText('https://d24sports.com/menu/feed?story=9')).toBe(9);
    expect(storyIdFromChatText('❤️\nhttps://evil.test/menu/feed?story=9')).toBeNull();
    expect(storyIdFromChatText('https://d24sports.com/menu/feed?story=9&story=10')).toBeNull();
    expect(storyIdFromChatText('https://d24sports.com/menu/feed?story=9&token=secret')).toBeNull();
    expect(storyIdFromChatText('Outra mensagem\nhttps://d24sports.com/menu/feed?story=9')).toBeNull();
  });

  it('shows verified media while active and does not show expired media',()=>{
    const api=jasmine.createSpyObj<SocialStoriesService>('SocialStoriesService',['get']);
    api.get.and.returnValue(of(story));
    const card=new InboxStoryCardComponent(api);
    card.storyId=9;card.ngOnChanges();
    expect(card.loading).toBeFalse();
    expect(card.unavailable).toBeFalse();
    expect(card.story?.mediaUrl).toBe(story.mediaUrl);
    card.ngOnDestroy();

    api.get.and.returnValue(of({...story,expiresAt:'2020-01-01T00:00:00Z'}));
    const expired=new InboxStoryCardComponent(api);
    expired.storyId=9;expired.ngOnChanges();
    expect(expired.unavailable).toBeTrue();
    expect(expired.story).toBeNull();
    expired.ngOnDestroy();
  });

  it('falls back to unavailable if API refuses private, removed or unknown stories',()=>{
    const api=jasmine.createSpyObj<SocialStoriesService>('SocialStoriesService',['get']);
    api.get.and.returnValue(throwError(()=>new HttpErrorResponse({status:404})));
    const card=new InboxStoryCardComponent(api);
    card.storyId=9;card.ngOnChanges();
    expect(card.loading).toBeFalse();
    expect(card.unavailable).toBeTrue();
    expect(card.story).toBeNull();
    card.ngOnDestroy();
  });

  it('ignores delayed results after the embedded story changes',()=>{
    const api=jasmine.createSpyObj<SocialStoriesService>('SocialStoriesService',['get']);
    const old=new Subject<SocialStory>();
    api.get.and.returnValues(old.asObservable(),of({...story,id:11}));
    const card=new InboxStoryCardComponent(api);
    card.storyId=9;card.ngOnChanges();
    card.storyId=11;card.ngOnChanges();
    old.next(story);old.complete();
    expect(card.story?.id).toBe(11);
    card.ngOnDestroy();
  });
});
