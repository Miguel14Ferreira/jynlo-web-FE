import { noticesToShow } from './page-notice-popup.component';

describe('page notices as pop-ups', () => {
  it('shows each new error or success banner once, and again when its text changes', () => {
    const root = document.createElement('div');
    root.innerHTML = '<div class="feedback error-feedback"> Não foi possível criar a época. </div>'
      + '<div class="feedback success-feedback"></div><div class="feedback">x</div>';
    const seen = new WeakMap<Element, string>();
    expect(noticesToShow(root, seen)).toEqual([{ tone: 'error', text: 'Não foi possível criar a época.' }]);
    expect(noticesToShow(root, seen)).toEqual([]);
    root.querySelector('.success-feedback')!.textContent = 'Guardado.';
    expect(noticesToShow(root, seen)).toEqual([{ tone: 'success', text: 'Guardado.' }]);
  });

  it('pops up form errors only when they follow a button press', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p role="alert">O nome é obrigatório.</p>';
    const seen = new WeakMap<Element, string>();
    expect(noticesToShow(root, seen, false)).toEqual([]);
    root.querySelector('p')!.textContent = 'Não foi possível guardar.';
    expect(noticesToShow(root, seen, true)).toEqual([{ tone: 'error', text: 'Não foi possível guardar.' }]);
  });
});
