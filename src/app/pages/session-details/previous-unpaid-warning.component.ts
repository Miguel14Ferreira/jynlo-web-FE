import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, Input, OnChanges, OnDestroy } from '@angular/core';
import { RouterModule } from '@angular/router';
import { Subscription, timeout } from 'rxjs';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { PreviousUnpaid, SessionPaymentService } from '../../services/session-payment.service';

/**
 * Shown to the organiser next to "open the list": who still owes the previous
 * game. Informative only; opening the list stays the organiser's decision.
 */
@Component({
  selector: 'app-previous-unpaid-warning',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslatePipe],
  template: `
    @if (data?.sessionId && data!.unpaid.length > 0) {
      <p class="previous-unpaid" role="note">
        💶 {{ 'payments.previousUnpaid' | t:{ count: data!.unpaid.length, names: names() } }}
        <a [routerLink]="['/menu/events', data!.sessionId]">{{ 'payments.previousOpen' | t }}</a>
      </p>
    }`,
  styles: [`.previous-unpaid{margin:.5rem 0;padding:.6rem .8rem;border-radius:12px;background:rgba(255,210,122,.12);border:1px solid rgba(255,210,122,.4);color:#ffe3a8;font-size:.88rem}
    .previous-unpaid a{color:#ffe3a8;font-weight:800;margin-left:.35rem}`]
})
export class PreviousUnpaidWarningComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) sessionId!: number;
  data: PreviousUnpaid | null = null;
  private load?: Subscription;
  private loadedId = 0;

  constructor(private readonly payments: SessionPaymentService, private readonly cdr: ChangeDetectorRef) {}

  ngOnChanges(): void {
    if (!this.sessionId || this.sessionId === this.loadedId) return;
    this.loadedId = this.sessionId;
    this.load?.unsubscribe();
    this.data = null;
    this.load = this.payments.previousUnpaid(this.sessionId).pipe(timeout(10000)).subscribe({
      next: data => { this.data = data; this.cdr.markForCheck(); },
      error: () => { this.data = null; }
    });
  }

  ngOnDestroy(): void { this.load?.unsubscribe(); }

  names(): string {
    const list = this.data?.unpaid ?? [];
    return list.length <= 4 ? list.join(', ') : list.slice(0, 4).join(', ') + ' +' + (list.length - 4);
  }
}
