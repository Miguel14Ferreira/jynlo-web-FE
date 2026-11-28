import { Directive, ElementRef, HostListener, OnDestroy, OnInit, Renderer2, forwardRef, inject } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

type DateKind = 'date' | 'datetime-local';
const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/;

/** "2026-12-05" → "05/12/2026"; "2026-12-05T18:30" → "05/12/2026 18:30"; anything else → "". */
export function isoToDisplay(value: unknown, kind: DateKind): string {
  const m = ISO.exec(String(value ?? ''));
  if (!m) return '';
  const date = `${m[3]}/${m[2]}/${m[1]}`;
  return kind === 'date' ? date : `${date} ${m[4] ?? '00'}:${m[5] ?? '00'}`;
}

/** Puts the slashes and the space in while the person types digits: "0512202618" → "05/12/2026 18". */
export function maskDigits(raw: string, kind: DateKind): string {
  const d = raw.replace(/\D/g, '').slice(0, kind === 'date' ? 8 : 12);
  let out = d.slice(0, 2);
  if (d.length > 2) out += '/' + d.slice(2, 4);
  if (d.length > 4) out += '/' + d.slice(4, 8);
  if (d.length > 8) out += ' ' + d.slice(8, 10);
  if (d.length > 10) out += ':' + d.slice(10, 12);
  return out;
}

/** A complete, real date (and time) typed as digits → the value the page already works with; otherwise "". */
export function displayToIso(text: string, kind: DateKind): string {
  const iso = ISO.exec(text.trim());
  if (iso) return kind === 'date' ? `${iso[1]}-${iso[2]}-${iso[3]}` : `${iso[1]}-${iso[2]}-${iso[3]}T${iso[4] ?? '00'}:${iso[5] ?? '00'}`;
  const d = text.replace(/\D/g, '');
  if (d.length !== (kind === 'date' ? 8 : 12)) return '';
  const day = +d.slice(0, 2), month = +d.slice(2, 4), year = +d.slice(4, 8);
  const check = new Date(year, month - 1, day);
  if (year < 1900 || check.getFullYear() !== year || check.getMonth() !== month - 1 || check.getDate() !== day) return '';
  const date = `${d.slice(4, 8)}-${d.slice(2, 4)}-${d.slice(0, 2)}`;
  if (kind === 'date') return date;
  const hour = +d.slice(8, 10), minute = +d.slice(10, 12);
  if (hour > 23 || minute > 59) return '';
  return `${date}T${d.slice(8, 10)}:${d.slice(10, 12)}`;
}

/**
 * Date fields always read dd/mm/aaaa (and hh:mm), whatever the browser's language: the native
 * field shows mm/dd/yyyy on browsers set to English. Applies itself to every date field that uses
 * ngModel; the value stays "aaaa-mm-dd" / "aaaa-mm-ddThh:mm", so pages need no change.
 * The calendar icon on the right (or Alt+↓) opens the browser's calendar; typing the digits also works.
 */
@Directive({
  selector: 'input[type=date][ngModel],input[type=datetime-local][ngModel]',
  standalone: true,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => JynloDateInputDirective), multi: true }],
})
export class JynloDateInputDirective implements ControlValueAccessor, OnInit, OnDestroy {
  private readonly host = inject<ElementRef<HTMLInputElement>>(ElementRef);
  private readonly renderer = inject(Renderer2);
  private kind: DateKind = 'date';
  private picker: HTMLInputElement | null = null;
  private value = '';
  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  ngOnInit(): void {
    const el = this.host.nativeElement;
    this.kind = el.getAttribute('type') === 'datetime-local' ? 'datetime-local' : 'date';
    el.setAttribute('data-date-kind', this.kind);
    el.type = 'text';
    el.inputMode = 'numeric';
    el.autocomplete = 'off';
    if (!el.placeholder) el.placeholder = this.kind === 'date' ? 'dd/mm/aaaa' : 'dd/mm/aaaa hh:mm';
    el.maxLength = this.kind === 'date' ? 10 : 16;
    el.value = isoToDisplay(this.value, this.kind);
    // Hidden browser field, only used to show its calendar next to this one.
    const picker = this.renderer.createElement('input') as HTMLInputElement;
    picker.type = this.kind;
    picker.tabIndex = -1;
    picker.setAttribute('aria-hidden', 'true');
    picker.className = 'jynlo-date-picker-proxy';
    picker.addEventListener('change', () => this.fromPicker(picker.value));
    const parent = el.parentNode;
    if (parent) this.renderer.insertBefore(parent, picker, el.nextSibling);
    this.picker = picker;
  }

  ngOnDestroy(): void {
    this.picker?.remove();
    this.picker = null;
  }

  writeValue(value: unknown): void {
    this.value = ISO.test(String(value ?? '')) ? String(value) : '';
    this.host.nativeElement.value = isoToDisplay(this.value, this.kind);
  }
  registerOnChange(fn: (value: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(disabled: boolean): void { this.host.nativeElement.disabled = disabled; }

  @HostListener('input')
  typed(): void {
    const el = this.host.nativeElement;
    const raw = el.value;
    const iso = ISO.test(raw.trim()) ? displayToIso(raw, this.kind) : '';
    if (!iso) el.value = maskDigits(raw, this.kind);
    const next = iso || displayToIso(el.value, this.kind);
    if (iso) el.value = isoToDisplay(iso, this.kind);
    if (next !== this.value) { this.value = next; this.onChange(next); }
  }

  @HostListener('blur')
  blurred(): void {
    const el = this.host.nativeElement;
    if (el.value && !this.value) el.value = '';
    this.onTouched();
  }

  /** The calendar opens from the icon at the right end of the field; clicking the rest lets the person type. */
  @HostListener('click', ['$event'])
  clicked(event: MouseEvent): void {
    const el = this.host.nativeElement;
    if (event && typeof event.offsetX === 'number' && event.offsetX < el.clientWidth - 44) return;
    this.openCalendar();
  }

  @HostListener('keydown', ['$event'])
  keyed(event: KeyboardEvent): void {
    if (event.altKey && event.key === 'ArrowDown') { event.preventDefault(); this.openCalendar(); }
  }

  openCalendar(): void {
    const el = this.host.nativeElement;
    const picker = this.picker;
    if (!picker || el.disabled || el.readOnly || typeof picker.showPicker !== 'function') return;
    const rect = el.getBoundingClientRect();
    Object.assign(picker.style, { left: `${rect.left}px`, top: `${rect.bottom}px`, width: `${rect.width}px` });
    picker.min = el.getAttribute('min') ?? '';
    picker.max = el.getAttribute('max') ?? '';
    picker.value = this.value ? (this.kind === 'date' ? this.value.slice(0, 10) : this.value.slice(0, 16)) : '';
    try { picker.showPicker(); } catch { /* typing still works */ }
  }

  private fromPicker(value: string): void {
    const next = value ? displayToIso(value, this.kind) : '';
    this.value = next;
    this.host.nativeElement.value = isoToDisplay(next, this.kind);
    this.onChange(next);
    this.onTouched();
  }
}
