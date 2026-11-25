import { isLightboxBackdropClick } from './lightbox-click';

describe('isLightboxBackdropClick', () => {
  function clickOn(tag: string, parent?: HTMLElement): Event {
    const el = document.createElement(tag);
    (parent || document.body).appendChild(el);
    return { target: el } as unknown as Event;
  }
  it('closes on the empty stage around the photo', () => {
    expect(isLightboxBackdropClick(clickOn('div'))).toBeTrue();
  });
  it('keeps the viewer open on the photo, video and controls', () => {
    expect(isLightboxBackdropClick(clickOn('img'))).toBeFalse();
    expect(isLightboxBackdropClick(clickOn('video'))).toBeFalse();
    expect(isLightboxBackdropClick(clickOn('button'))).toBeFalse();
    const header = document.createElement('header');
    document.body.appendChild(header);
    expect(isLightboxBackdropClick(clickOn('span', header))).toBeFalse();
  });
});
