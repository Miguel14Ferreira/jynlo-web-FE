import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ImageZoomComponent, zoomTarget } from './image-zoom.component';

describe('ImageZoomComponent', () => {
  let fixture: ComponentFixture<ImageZoomComponent>;
  let host: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ImageZoomComponent] });
    fixture = TestBed.createComponent(ImageZoomComponent);
    fixture.detectChanges();
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
    fixture.destroy();
  });

  it('only zooms images marked as zoomable', () => {
    host.innerHTML = '<img data-zoomable src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="ACM"><img id="plain" src="x.png">';
    expect(zoomTarget(host.querySelector('img[data-zoomable]'))?.alt).toBe('ACM');
    expect(zoomTarget(host.querySelector('#plain'))).toBeNull();
    expect(zoomTarget(null)).toBeNull();
  });

  it('opens on click, keeps the click from the card underneath and closes with Escape', () => {
    let cardClicks = 0;
    host.innerHTML = '<button><img data-zoomable src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="ACM"></button>';
    host.querySelector('button')!.addEventListener('click', () => cardClicks++);
    (host.querySelector('img') as HTMLImageElement).click();
    fixture.detectChanges();
    const zoomed = fixture.nativeElement.querySelector('.image-zoom-image') as HTMLImageElement;
    expect(zoomed).not.toBeNull();
    expect(zoomed.alt).toBe('ACM');
    expect(cardClicks).toBe(0);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.image-zoom-image')).toBeNull();
  });

  it('also zooms when a decorative layer above the photo receives the click', () => {
    host.innerHTML = '<div class="frame" style="position:relative;width:100px;height:100px">'
      + '<img data-zoomable alt="ACM" style="display:block;width:100px;height:100px" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">'
      + '<span class="shine" style="position:absolute;inset:0"></span></div>';
    const box = host.querySelector('img')!.getBoundingClientRect();
    const shine = host.querySelector('.shine')!;
    expect(zoomTarget(shine, box.left + 50, box.top + 50)?.alt).toBe('ACM');
    expect(zoomTarget(shine, box.right + 40, box.top + 50)).toBeNull();
  });

  it('closes when the backdrop is clicked', () => {
    fixture.componentInstance.open({ src: 'x.png', alt: '' });
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.image-zoom-backdrop') as HTMLElement).click();
    fixture.detectChanges();
    expect(fixture.componentInstance.image).toBeNull();
  });
});
