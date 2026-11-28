const REGISTRATION_DESTINATION_KEY = 'jynlo-registration-destination';
const REGISTRATION_DESTINATION_TTL_MS = 24 * 60 * 60 * 1000;
const SESSION_DESTINATION_PATTERN = /^\/menu\/events\/([1-9]\d*)(?:\?join=1)?$/;
const GUEST_DESTINATION_PATTERN = /^\/sessions\/([1-9]\d*)\?guest=([A-Za-z0-9_-]{43})$/;
const COMMUNITY_DESTINATION_PATTERN = /^\/menu\/communities\/([1-9]\d*)$/;
/** "Criar comunidade" before having an account: after signing up the person lands back on the form. */
export const CREATE_COMMUNITY_DESTINATION = '/menu/communities/create';

/** Keep only ID-based internal invitation destinations, never external URLs or setup routes. */
function isAllowedRegistrationDestination(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value === CREATE_COMMUNITY_DESTINATION) return true;
  const idText = value.match(SESSION_DESTINATION_PATTERN)?.[1]
    ?? value.match(COMMUNITY_DESTINATION_PATTERN)?.[1]
    ?? value.match(GUEST_DESTINATION_PATTERN)?.[1];
  if (!idText) return false;
  const id = Number(idText);
  return Number.isSafeInteger(id) && id > 0;
}

export function registrationSessionId(returnUrl: string | null): number | null {
  const match = returnUrl?.match(SESSION_DESTINATION_PATTERN)
    ?? returnUrl?.match(GUEST_DESTINATION_PATTERN);
  if (!match) {
    return null;
  }

  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function registrationCommunityId(returnUrl: string | null): number | null {
  const match = returnUrl?.match(COMMUNITY_DESTINATION_PATTERN);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function registrationCommunityReturnUrl(rawId: string | null): string | null {
  if (!rawId || !/^[1-9]\d*$/.test(rawId)) return null;
  const url = '/menu/communities/' + rawId;
  return registrationCommunityId(url) === null ? null : url;
}

export function registrationSessionReturnUrl(rawSessionId: string | null): string | null {
  if (!rawSessionId || !/^[1-9]\d*$/.test(rawSessionId)) {
    return null;
  }

  const returnUrl = '/menu/events/' + rawSessionId;
  return registrationSessionId(returnUrl) === null ? null : returnUrl;
}

export function rememberRegistrationDestination(value: string | null): void {
  try {
    localStorage.removeItem(REGISTRATION_DESTINATION_KEY);
    if (isAllowedRegistrationDestination(value)) {
      localStorage.setItem(REGISTRATION_DESTINATION_KEY, JSON.stringify({
        url: value,
        expiresAt: Date.now() + REGISTRATION_DESTINATION_TTL_MS
      }));
    }
  } catch {
    // Storage can be disabled: registration must still work without a return URL.
  }
}

export function takeRegistrationDestination(): string | null {
  try {
    const saved = localStorage.getItem(REGISTRATION_DESTINATION_KEY);
    localStorage.removeItem(REGISTRATION_DESTINATION_KEY);
    if (!saved) {
      return null;
    }

    const destination = JSON.parse(saved);
    return isAllowedRegistrationDestination(destination.url)
      && typeof destination.expiresAt === 'number'
      && Number.isFinite(destination.expiresAt)
      && destination.expiresAt > Date.now()
      ? destination.url
      : null;
  } catch {
    return null;
  }
}
