import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';

import { FooterComponent } from './footer.component';
import { TranslatePipe } from '../../i18n/translate.pipe';

describe('FooterComponent', () => {
  let component: FooterComponent;
  let fixture: ComponentFixture<FooterComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [FooterComponent],
      imports: [RouterModule.forRoot([]), TranslatePipe]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(FooterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the legal and contact links', () => {
    const links = Array.from(
      fixture.nativeElement.querySelectorAll('.footer-links a')
    ) as HTMLAnchorElement[];

    expect(links.map(link => link.getAttribute('href')))
      .toEqual(['/terms', '/privacy', '/for-venues', '/contact', 'mailto:geral@jynlosports.com']);
  });
});
