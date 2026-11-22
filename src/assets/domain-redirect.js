// d24sports.com moved to jynlosports.com. Keep the path, query and hash so
// shared links, password-reset links and bookmarks still land on the same page.
(function () {
  var host = location.hostname;
  if (host === 'd24sports.com' || host === 'www.d24sports.com') {
    location.replace('https://jynlosports.com' + location.pathname + location.search + location.hash);
  }
})();
