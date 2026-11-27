import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, inject } from '@angular/core';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { FriendsGoingService, SessionFriends } from '../../services/friends-going.service';

/** "👥 João e mais 2 amigos vão" with their photos, on a game card. Renders nothing when no friend is in. */
@Component({
  selector: 'app-friends-going',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (data; as d) {
      <span class="fg" [attr.aria-label]="label(d) | t:{ name: first(d), n: d.count - 1 }">
        <span class="fg__faces" aria-hidden="true">
          @for (f of d.friends.slice(0, 3); track f.username) {
            @if (f.profilePicUrl) { <img [src]="f.profilePicUrl" alt="" referrerpolicy="no-referrer" loading="lazy"> }
            @else { <span class="fg__initial">{{ (f.fullName || f.username).charAt(0).toUpperCase() }}</span> }
          }
        </span>
        <span class="fg__text">{{ label(d) | t:{ name: first(d), n: d.count - 1 } }}</span>
      </span>
    }
  `,
  styles: [`
    :host { display:contents; }
    .fg { display:inline-flex; align-items:center; gap:.4rem; color:#7ae5c5; font-size:.82rem; font-weight:700; }
    .fg__faces { display:inline-flex; }
    .fg__faces > * { width:22px; height:22px; border-radius:50%; border:2px solid #0b2533; margin-left:-6px; object-fit:cover;
      display:inline-flex; align-items:center; justify-content:center; background:#1d4d5c; color:#eafff9; font-size:.68rem; font-weight:800; }
    .fg__faces > *:first-child { margin-left:0; }
  `]
})
export class FriendsGoingComponent implements OnChanges, OnDestroy {
  @Input() sessionId = 0;
  data: SessionFriends | null = null;
  private sub: Subscription | null = null;
  private readonly service = inject(FriendsGoingService);
  private readonly cdr = inject(ChangeDetectorRef);

  ngOnChanges(): void {
    this.sub?.unsubscribe();
    this.data = null;
    this.sub = this.service.forSession(this.sessionId).subscribe(d => { this.data = d && d.count > 0 ? d : null; this.cdr.markForCheck(); });
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  first(d: SessionFriends): string {
    const f = d.friends[0];
    return (f?.fullName?.trim().split(/\s+/)[0]) || f?.username || '';
  }

  label(d: SessionFriends): string {
    if (d.count <= 1) return '{{name}} vai';
    if (d.count === 2) return '{{name}} e mais 1 amigo vão';
    return '{{name}} e mais {{n}} amigos vão';
  }
}
