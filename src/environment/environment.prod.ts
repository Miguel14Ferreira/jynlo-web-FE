export const environment = {
  production: true,
  // The site on jynlosports.com talks to api.jynlosports.com (same site, so the
  // refresh cookie stays first-party); d24sports.com keeps its own API host.
  apiUrl: typeof location !== 'undefined' && /(^|\.)jynlosports\.com$/.test(location.hostname)
    ? 'https://api.jynlosports.com'
    : 'https://api.d24sports.com'
};
