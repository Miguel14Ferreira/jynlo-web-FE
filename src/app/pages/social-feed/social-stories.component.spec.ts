import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { NEVER, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { SocialStoriesComponent } from './social-stories.component';
import { SocialStoriesService } from '../../services/social-stories.service';
import { DirectChatService } from '../../services/direct-chat.service';
import { CommunityGroupsService } from '../../services/community-groups.service';
import { SocialStory } from '../model/social-story';
import { I18nService, preloadEnglishTranslations } from '../../i18n/i18n.service';
import { CommunityService } from '../../services/community.service';

describe('SocialStoriesComponent', () => {
  let fixture: ComponentFixture<SocialStoriesComponent>;
  let component: SocialStoriesComponent;
  let api: jasmine.SpyObj<SocialStoriesService>;
  let communities: jasmine.SpyObj<CommunityGroupsService>;
  let direct: jasmine.SpyObj<DirectChatService>;
  let profiles: jasmine.SpyObj<CommunityService>;

  const picture: SocialStory = {
    id: 9, authorUsername: 'joao', displayName: 'João', avatarUrl: null,
    communityId: null, communityName: null, communityPhotoUrl: null,
    caption: 'Grande jogo', mediaUrl: '/media/stories/9.jpg', video: false,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(), canDelete: true
  };

  beforeEach(async () => {
    api = jasmine.createSpyObj<SocialStoriesService>('SocialStoriesService', ['feed', 'mine', 'get', 'publish', 'delete']);
    api.feed.and.returnValue(of([picture]));
    direct = jasmine.createSpyObj<DirectChatService>('DirectChatService', ['send']);
    direct.send.and.returnValue(of({} as any));
    profiles = jasmine.createSpyObj<CommunityService>('CommunityService', ['friends', 'discoverProfiles']);
    profiles.friends.and.returnValue(of([]));
    api.mine.and.returnValue(of([picture]));
    communities = jasmine.createSpyObj<CommunityGroupsService>('CommunityGroupsService', ['mine']);
    communities.mine.and.returnValue(of([
      { id: 3, name: 'CNG', visibility: 'PUBLIC', myRole: 'ADMIN' },
      { id: 4, name: 'Privada', visibility: 'PRIVATE', myRole: 'OWNER' },
      { id: 5, name: 'Sem permissão', visibility: 'PUBLIC', myRole: 'MEMBER' }
    ] as any));
    await TestBed.configureTestingModule({
      imports: [SocialStoriesComponent],
      providers: [
        { provide: SocialStoriesService, useValue: api },
        { provide: DirectChatService, useValue: direct },
        { provide: CommunityService, useValue: profiles },
        { provide: CommunityGroupsService, useValue: communities },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(SocialStoriesComponent);
    component = fixture.componentInstance;
  });

  it('shows active Stories and only offers public communities managed by the viewer', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    expect(component.storyGroups).toHaveSize(1);
    expect(component.storyGroups[0].name).toBe('@joao');
    expect(component.groups.map(c => c.id)).toEqual([3]);
    expect(fixture.nativeElement.querySelectorAll('.story-bubble:not(.story-add-action)').length).toBe(1);
  }));

  it('uses the shared premium hierarchy for Story creation and media controls', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    const root = fixture.nativeElement as HTMLElement;
    const create = root.querySelector('.story-add-action') as HTMLButtonElement;
    expect(create.classList.contains('jynlo-premium-btn--primary')).toBeTrue();
    expect(root.querySelector('.story-retry')).toBeNull();

    create.click();
    fixture.detectChanges();
    const file = root.querySelector('.story-file') as HTMLLabelElement;
    expect(file.classList.contains('jynlo-premium-btn--quiet')).toBeTrue();
    expect(file.querySelector('input[type="file"]')).not.toBeNull();
    expect(root.querySelector('.story-primary.jynlo-premium-btn--primary')).not.toBeNull();
  }));

  it('only loads accepted friends for Story tags, never global discoverable users', fakeAsync(() => {
    profiles.friends.and.returnValue(of([
      { username: 'ana', fullName: 'Ana', nickname: null, profilePicUrl: null,
        blockedByMe: false, chatBlocked: false },
      { username: 'blocked', fullName: 'Blocked', nickname: null, profilePicUrl: null,
        blockedByMe: true, chatBlocked: true }
    ]));
    fixture.detectChanges();
    tick();
    component.toggleStoryTags();
    tick();
    expect(profiles.friends).toHaveBeenCalledTimes(1);
    expect(profiles.discoverProfiles).not.toHaveBeenCalled();
    expect(component.storyTagResults.map(p => p.username)).toEqual(['ana']);
    component.searchStoryTag('no-such-friend');
    expect(component.storyTagResults).toEqual([]);
  }));

  it('permits a neighbourhood label without selecting a sports venue', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    component.storyLocation = ' Benfica ';
    component.storyLocationSearchOpen = true;
    component.chooseStoryPlaceName();
    expect(component.storyLocation).toBe('Benfica');
    expect(component.storyLocationSearchOpen).toBeFalse();
  }));

  it('only shows retry after a story request fails', fakeAsync(() => {
    api.feed.and.returnValue(of([]));
    api.mine.and.returnValue(of([]));
    fixture.detectChanges();
    tick();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.story-retry')).toBeNull();
    expect(fixture.nativeElement.querySelector('.stories-empty')).not.toBeNull();

    api.feed.and.returnValue(throwError(() => new Error('offline')));
    component.reload();
    fixture.detectChanges();
    const retry = fixture.nativeElement.querySelector('.story-retry') as HTMLButtonElement;
    expect(retry).not.toBeNull();
    expect(retry.classList.contains('jynlo-premium-btn--quiet')).toBeTrue();
  }));

  it('hides the audience selector when personal profile is the only publication target', fakeAsync(() => {
    communities.mine.and.returnValue(of([
      { id: 4, name: 'Comunidade privada', visibility: 'PRIVATE', myRole: 'OWNER' },
      { id: 5, name: 'Comunidade pública', visibility: 'PUBLIC', myRole: 'MEMBER' }
    ] as any));
    fixture.detectChanges();
    tick();
    (fixture.nativeElement.querySelector('.story-add-action') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(component.groups).toHaveSize(0);
    expect(fixture.nativeElement.querySelector('#storyAudience')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Publicar como');
    const media = fixture.nativeElement.querySelector('.story-file');
    expect(media).toBeTruthy();
    expect(media.querySelector('input[type="file"]')).toBeTruthy();
  }));

  it('preserves choosing a community when the member can publish community Stories', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    (fixture.nativeElement.querySelector('.story-add-action') as HTMLButtonElement).click();
    fixture.detectChanges();
    const audience = fixture.nativeElement.querySelector('#storyAudience') as HTMLSelectElement;
    expect(audience).not.toBeNull();
    expect(Array.from(audience.options).map(option => option.value)).toEqual(['', '3']);
    audience.value = '3';
    audience.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(component.communityId).toBe('3');
  }));


  it('uses the shared Jynlo accent and primary styles for both Story actions', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    const createButton = fixture.nativeElement.querySelector('.story-add-action') as HTMLButtonElement;
    expect(createButton.classList.contains('jynlo-action')).toBeTrue();
    expect(createButton.classList.contains('jynlo-action--accent')).toBeTrue();
    createButton.click();
    fixture.detectChanges();
    const publishButton = fixture.nativeElement.querySelector('.story-primary') as HTMLButtonElement;
    expect(publishButton).toBeTruthy();
    expect(publishButton.classList.contains('jynlo-action')).toBeTrue();
    expect(publishButton.classList.contains('jynlo-action--primary')).toBeTrue();
    expect(publishButton.disabled).toBeTrue();
    const mediaInput = fixture.nativeElement.querySelector('.story-file input[type="file"]') as HTMLInputElement;
    const photo = new File(['image'], 'story.jpg', { type: 'image/jpeg' });
    Object.defineProperty(mediaInput, 'files', { configurable: true, value: [photo] });
    mediaInput.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(component.file).toBe(photo);
    expect(publishButton.disabled).toBeFalse();
  }));

  it('keeps personal Stories available without displaying the redundant 24-hour counter', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    fixture.detectChanges();
    expect(component.mineEntries).toHaveSize(1);
    expect(api.mine).toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.story-my-status')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Stories publicadas por ti nas últimas 24 horas');
    expect(fixture.nativeElement.querySelectorAll('.story-bubble:not(.story-add-action)').length).toBe(1);
  }));

  it('groups several Stories from the same author and lets viewers move between them', fakeAsync(() => {
    const older = { ...picture, id: 8, createdAt: new Date(Date.now() - 1000).toISOString() };
    api.feed.and.returnValue(of([picture, older]));
    fixture.detectChanges();
    tick();
    expect(component.storyGroups).toHaveSize(1);
    expect(component.storyGroups[0].stories).toHaveSize(2);
    component.openGroup(component.storyGroups[0]);
    expect(component.activeStory?.id).toBe(8);
    component.next();
    expect(component.activeStory?.id).toBe(9);
    component.next();
    expect(component.activeStory).toBeNull();
  }));

  it('shows the community name rather than the author username in the Stories rail', fakeAsync(() => {
    api.feed.and.returnValue(of([{...picture, communityId: 3, communityName: 'CNG'}]));
    api.mine.and.returnValue(of([]));
    fixture.detectChanges();
    tick();
    expect(component.storyGroups[0].name).toBe('CNG');
  }));

  it('replaces native confirmation with a modal and cancels without deleting', fakeAsync(() => {
    const nativeConfirm = spyOn(window, 'confirm');
    fixture.detectChanges();
    tick();
    component.openGroup(component.storyGroups[0]);
    fixture.detectChanges();
    component.requestDeleteStory();
    fixture.detectChanges();
    expect(component.deleteConfirmOpen).toBeTrue();
    expect(fixture.nativeElement.querySelector('[role="alertdialog"]')).toBeTruthy();
    expect(nativeConfirm).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
    component.cancelDeleteStory();
    fixture.detectChanges();
    expect(component.deleteConfirmOpen).toBeFalse();
    expect(component.activeStory?.id).toBe(9);
    expect(api.delete).not.toHaveBeenCalled();
    component.close();
  }));

  it('deletes only after confirming and removes its entries from both feeds', fakeAsync(() => {
    api.delete.and.returnValue(of(void 0));
    fixture.detectChanges();
    tick();
    component.openGroup(component.storyGroups[0]);
    component.requestDeleteStory();
    expect(api.delete).not.toHaveBeenCalled();
    component.confirmDeleteStory();
    tick();
    expect(api.delete).toHaveBeenCalledOnceWith(9);
    expect(component.activeStory).toBeNull();
    expect(component.deleteConfirmOpen).toBeFalse();
    expect(component.entries).toEqual([]);
    expect(component.mineEntries).toEqual([]);
  }));

  it('keeps the confirmation visible on a delete error rather than silently closing', fakeAsync(() => {
    api.delete.and.returnValue(throwError(() => new Error('server error')));
    fixture.detectChanges();
    tick();
    component.openGroup(component.storyGroups[0]);
    component.requestDeleteStory();
    component.confirmDeleteStory();
    tick();
    fixture.detectChanges();
    expect(api.delete).toHaveBeenCalledTimes(1);
    expect(component.activeStory?.id).toBe(9);
    expect(component.deleteConfirmOpen).toBeTrue();
    expect(component.deleteError).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.story-confirm-error')).toBeTruthy();
    component.cancelDeleteStory();
    component.close();
  }));

  it('prevents navigation while confirmation is open and restores the Story on Escape', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    component.openGroup(component.storyGroups[0]);
    component.requestDeleteStory();
    component.next();
    expect(component.activeStory?.id).toBe(9);
    component.escape();
    expect(component.deleteConfirmOpen).toBeFalse();
    expect(component.activeStory?.id).toBe(9);
    component.close();
  }));

  it('publishes real venue labels and a selected member tag, restoring the viewer overlays', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    component.openComposer();
    const teammate = { username: 'ana', fullName: 'Ana Silva', nickname: null } as any;
    (component as any).storyProfileIndex = [teammate];
    component.searchStoryTag('Ana');
    expect(component.storyTagResults.map(profile => profile.username)).toEqual(['ana']);
    component.addStoryTag(teammate);
    component.storyLocation = 'Campo de Benfica, Lisboa';
    const photo = new File(['photo'], 'jogo.jpg', { type: 'image/jpeg' });
    component.file = photo;
    api.publish.and.returnValue(of({ ...picture, id: 155, locationLabel: component.storyLocation,
      taggedUsernames: 'ana' }));
    component.publish();
    expect(api.publish).toHaveBeenCalledWith(photo, '', null, {
      textPosition: 'bottom', textScale: 'medium', textStyle: 'pill',
      textX: 50, textY: 74, textRotation: 0, textZoom: 1,
      altText: '', showTime: false,
      locationLabel: 'Campo de Benfica, Lisboa', taggedUsernames: 'ana'
    });
    expect(component.storyLocation).toBe('');
    expect(component.storyTaggedProfiles).toEqual([]);
    component.showStory(component.mineEntries[0]);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.story-viewer-place')?.textContent)
      .toContain('Campo de Benfica');
    expect((fixture.nativeElement as HTMLElement).querySelector('.story-viewer-tags a')?.textContent)
      .toContain('ana');
    component.close();
  }));

  it('keeps accessibility descriptions and an optional time sticker linked to the published Story', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    component.openComposer();
    component.file = new File(['photo'], 'foto.jpg', { type: 'image/jpeg' });
    component.storyAltText = 'Jogadores num campo de futebol';
    component.storyShowTime = true;
    component.caption = '';
    api.publish.and.returnValue(of({ ...picture, id: 123, caption: '',
      altText: component.storyAltText, showTime: true }));
    component.publish();
    expect(api.publish).toHaveBeenCalledWith(jasmine.any(File), '', null, {
      textPosition: 'bottom', textScale: 'medium', textStyle: 'pill',
      textX: 50, textY: 74, textRotation: 0, textZoom: 1,
      altText: 'Jogadores num campo de futebol', showTime: true, locationLabel: '', taggedUsernames: ''
    });
    expect(component.mineEntries[0].id).toBe(123);
    expect(component.storyAltText).toBe('');
    expect(component.storyShowTime).toBeFalse();
    component.showStory(component.mineEntries[0]);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.story-viewer-time')).not.toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('.story-dialog-media > img')?.getAttribute('alt'))
      .toBe('Jogadores num campo de futebol');
    component.close();
  }));

  it('opens an immersive Story editor with a vertical media preview and optional caption', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    component.openComposer();
    component.file = new File(['image'], 'foto.jpg', { type: 'image/jpeg' });
    component.filePreview = 'blob:fixture-photo';
    component.caption = 'Golo!';
    component.storyTextPosition = 'center';
    component.storyTextScale = 'large';
    component.storyTextStyle = 'plain';
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('.story-composer[role="dialog"]') as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(dialog.querySelector('.story-create-stage')).not.toBeNull();
    expect(dialog.querySelector('app-movable-text')?.textContent).toContain('Golo!');
    expect(dialog.querySelector('app-movable-text .movable-text.plain')).not.toBeNull();
    expect(dialog.querySelector('.story-drag-hint')?.textContent).toContain('Arrasta');
    expect(dialog.querySelector('.story-primary')).not.toBeNull();
    component.filePreview = null;
  }));

  it('publishes the exact dragged position, rotation and zoom from the editor', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    component.openComposer();
    component.file = new File(['photo'], 'treino.jpg', {type:'image/jpeg'});
    component.caption = 'Golo de bicicleta!';
    component.storyTextPlacement = {x:32,y:41,rotation:38,scale:1.6};
    api.publish.and.returnValue(of({...picture, id:350, caption:component.caption,
      textX:32,textY:41,textRotation:38,textZoom:1.6}));
    component.publish();
    expect(api.publish).toHaveBeenCalledWith(jasmine.any(File), 'Golo de bicicleta!', null,
      jasmine.objectContaining({textX:32,textY:41,textRotation:38,textZoom:1.6}));
    expect(component.storyTextPlacement).toEqual({x:50,y:74,rotation:0,scale:1});
    component.showStory(component.mineEntries[0]);
    fixture.detectChanges();
    const overlay = fixture.nativeElement.querySelector('.story-caption--free') as HTMLElement;
    expect(overlay).not.toBeNull();
    expect(overlay.style.transform).toContain('rotate(38deg)');
    component.close();
  }));

  it('preserves the image and caption on a failed backend upload with useful explanation', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    component.openComposer();
    const photo = new File(['image'], 'foto.jpg', { type: 'image/jpeg' });
    component.file = photo;
    component.filePreview = 'blob:fixture-photo';
    component.caption = 'Treino';
    component.storyTextPosition = 'top';
    component.storyTextScale = 'small';
    component.storyTextStyle = 'pill';
    api.publish.and.returnValue(throwError(() => new HttpErrorResponse({ status: 502 })));

    component.publish();
    fixture.detectChanges();
    expect(api.publish).toHaveBeenCalledWith(photo, 'Treino', null, {
      textPosition: 'top', textScale: 'small', textStyle: 'pill',
      textX: 50, textY: 74, textRotation: 0, textZoom: 1,
      altText: '', showTime: false, locationLabel: '', taggedUsernames: ''
    });
    expect(component.composerOpen).toBeTrue();
    expect(component.file).toBe(photo);
    expect(component.caption).toBe('Treino');
    expect(component.uploading).toBeFalse();
    expect(component.publishError).toContain('servidor de imagens');
    expect(fixture.nativeElement.querySelector('.story-publish-error')?.textContent)
      .toContain('temporariamente indisponível');
    component.filePreview = null;
  }));

  it('blocks unsupported media and oversized videos in the browser', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    for (const file of [
      new File(['invalid'], 'a.gif', { type: 'image/gif' }),
      new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'a.mp4', { type: 'video/mp4' })
    ]) {
      const input = document.createElement('input');
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      component.pickFile({ target: input } as unknown as Event);
      expect(component.file).toBeNull();
      expect(component.error).toBeTruthy();
    }
  }));

  it('does not leave the loading indicator stuck when the API times out', fakeAsync(() => {
    api.feed.and.returnValue(NEVER);
    fixture.detectChanges();
    tick(10001);
    fixture.detectChanges();
    expect(component.loading).toBeFalse();
    expect(component.error).toBeTruthy();
    expect(component.storyGroups).toHaveSize(1); // Author-owned fallback
    expect(component.mineEntries).toHaveSize(1);
  }));

  it('shows an owned active story when discovery returns an empty result', fakeAsync(() => {
    api.feed.and.returnValue(of([]));
    fixture.detectChanges();
    tick();
    expect(component.mineEntries).toHaveSize(1);
    expect(component.storyGroups).toHaveSize(1);
  }));

  it('displays the @username and hides the native video player controls and dates', fakeAsync(() => {
    api.feed.and.returnValue(of([{ ...picture, video: true }]));
    api.mine.and.returnValue(of([]));
    fixture.detectChanges();
    tick();
    component.openGroup(component.storyGroups[0]);
    fixture.detectChanges();
    tick();
    fixture.detectChanges();
    expect(component.activeStory).not.toBeNull();
    const dialog = fixture.nativeElement.querySelector('.story-dialog') as HTMLElement;
    expect(dialog).withContext('active=' + component.activeStory?.id + ' html=' + fixture.nativeElement.innerHTML.slice(-2300)).not.toBeNull();
    expect(dialog.textContent).toContain('@joao');
    expect(dialog.querySelector('video')?.hasAttribute('controls')).toBeFalse();
    expect(dialog.querySelector('.story-progress-track')).toBeTruthy();
    expect(dialog.textContent).not.toContain('dd/MM');
    expect(dialog.querySelector('.story-dialog-footer')).toBeNull();
    component.close();
  }));

  it('advances a loaded photo when its seven-second story duration expires', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    component.openGroup(component.storyGroups[0]);
    component.onImageLoaded();
    tick(7100);
    expect(component.activeStory).toBeNull();
  }));

  it('sends an explicit Story reply through existing private chat with the Story link', fakeAsync(() => {
    const other = { ...picture, canDelete: false };
    api.feed.and.returnValue(of([other]));
    api.mine.and.returnValue(of([]));
    fixture.detectChanges();
    tick();
    component.openGroup(component.storyGroups[0]);
    component.replyText = 'Boa!';
    component.replyToStory();
    tick();
    expect(direct.send).toHaveBeenCalledWith('joao', jasmine.stringMatching(/Boa![\s\S]*story=9/));
    expect(component.replyText).toBe('');
    component.close();
  }));

  it('excludes expired stories from the visual rail', fakeAsync(() => {
    api.feed.and.returnValue(of([{...picture, expiresAt: new Date(Date.now() - 1000).toISOString()}]));
    api.mine.and.returnValue(of([]));
    fixture.detectChanges();
    tick();
    expect(component.storyGroups).toHaveSize(0);
  }));

  it('translates the complete Stories panel when switching PT → EN → PT without navigation', async () => {
    await preloadEnglishTranslations();
    const i18n = TestBed.inject(I18nService);
    const initial = localStorage.getItem('d24-language');
    try {
      api.feed.and.returnValue(of([]));
      api.mine.and.returnValue(of([]));
      i18n.setLanguage('pt');
      fixture.detectChanges();

      const panel: HTMLElement = fixture.nativeElement.querySelector('.stories-panel');
      expect(panel.querySelector('.stories-eyebrow')?.textContent?.trim()).toBe('Momentos desportivos');
      expect(panel.querySelector('.story-retry')).toBeNull();
      expect(panel.querySelector('.stories-empty')?.textContent).toContain('Ainda não há Stories');

      i18n.setLanguage('en');
      fixture.detectChanges();

      expect(panel.querySelector('.stories-eyebrow')?.textContent?.trim()).toBe('Sporting moments');
      expect(panel.querySelector('.stories-heading p')?.textContent?.trim())
        .toBe('Your friends’ and communities’ best moments, for 24 hours.');
      expect(panel.querySelector('.story-retry')).toBeNull();
      expect(panel.querySelector('.story-add-action')?.textContent?.trim()).toContain('Create Story');
      expect(panel.querySelector('.stories-empty')?.textContent?.trim())
        .toBe('No Stories yet. Share the first moment!');
      (panel.querySelector('.story-add-action') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(panel.querySelector('.story-file')?.textContent).toContain('Choose photo or video');
      expect(panel.querySelector('label[for="storyCaption"]')?.textContent?.trim()).toBe('Caption (optional)');

      i18n.setLanguage('pt');
      fixture.detectChanges();
      expect(panel.querySelector('.stories-eyebrow')?.textContent?.trim()).toBe('Momentos desportivos');
      expect(panel.querySelector('.story-retry')).toBeNull();
    } finally {
      i18n.setLanguage(initial === 'en' ? 'en' : 'pt');
      if (initial === null) localStorage.removeItem('d24-language');
    }
  });

  it('renders the English Stories texts on the first Feed load', async () => {
    await preloadEnglishTranslations();
    const i18n = TestBed.inject(I18nService);
    const initial = localStorage.getItem('d24-language');
    try {
      i18n.setLanguage('en');
      api.feed.and.returnValue(of([]));
      api.mine.and.returnValue(of([]));
      fixture.detectChanges();

      const panel: HTMLElement = fixture.nativeElement.querySelector('.stories-panel');
      expect(panel.querySelector('.stories-eyebrow')?.textContent?.trim()).toBe('Sporting moments');
      expect(panel.querySelector('.story-retry')).toBeNull();
      expect(panel.querySelector('.story-add-action')?.textContent).toContain('Create Story');
      expect(panel.querySelector('.stories-empty')?.textContent?.trim())
        .toBe('No Stories yet. Share the first moment!');
    } finally {
      i18n.setLanguage(initial === 'en' ? 'en' : 'pt');
      if (initial === null) localStorage.removeItem('d24-language');
    }
  });

});
