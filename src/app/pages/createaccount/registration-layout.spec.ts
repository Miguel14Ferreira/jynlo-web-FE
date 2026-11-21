import { TestBed } from '@angular/core/testing';
import { CreateaccountComponent } from './createaccount.component';
import { TEST_IMPORTS, TEST_PROVIDERS } from '../../testing/test-providers';

describe('Registration layout alignment', () => {
  it('aligns fields and keeps native and custom controls the same height', async () => {
    await TestBed.configureTestingModule({
      imports: [...TEST_IMPORTS, CreateaccountComponent],
      providers: TEST_PROVIDERS
    }).compileComponents();

    const fixture = TestBed.createComponent(CreateaccountComponent);
    fixture.detectChanges();
    const grid = fixture.nativeElement.querySelector('.form-grid') as HTMLElement;
    const labels = Array.from(grid.querySelectorAll(':scope > label')) as HTMLLabelElement[];
    expect(labels.length).toBe(8);
    expect(getComputedStyle(grid).alignItems).toBe('start');

    const fields = labels.map(label =>
      label.querySelector('input, .jynlo-select__trigger') as HTMLElement
    );
    for (let i = 0; i < labels.length; i++) {
      expect(getComputedStyle(labels[i]).flexDirection).toBe('column');
      expect(fields[i]).withContext('field ' + i).not.toBeNull();
      expect(Math.round(fields[i].getBoundingClientRect().height)).toBe(50);
    }

    if (getComputedStyle(grid).gridTemplateColumns.split(' ').length === 2) {
      for (const [left, right] of [[0, 1], [2, 3], [4, 5], [6, 7]]) {
        expect(Math.abs(fields[left].getBoundingClientRect().top -
          fields[right].getBoundingClientRect().top)).toBeLessThan(1);
      }
    }
    fixture.destroy();
  });
});
