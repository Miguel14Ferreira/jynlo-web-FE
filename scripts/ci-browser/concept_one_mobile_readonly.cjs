/*
 * Jynlo Concept One Premium: real Chromium 390 px + desktop viewport contract.
 *
 * Uses the BUILT Angular SPA, synthetic JWT + synthetic GET API responses.
 * No production credentials, requests, WebSocket traffic or remote mutations.
 * Only reads routes; failed layout snapshots are saved to CI artifacts.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const SITE = 'http://127.0.0.1:4173';
const OUT = path.resolve('artifacts/concept-one-mobile');
fs.mkdirSync(OUT, { recursive: true });

const jwt = [
  Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
  Buffer.from(JSON.stringify({
    sub: 'mobile-fixture', Authorities: ['ROLE_USER'],
    exp: Math.floor(Date.now() / 1000) + 3600
  })).toString('base64url'),
  'synthetic-not-signed'
].join('.');

const profile = {
  userId: 'mobile-qa', username: 'mobile-fixture', fullName: 'Jogadora Fictícia',
  nickname: 'Teste', profilePicUrl: null, country: 'Portugal', location: 'Lisboa',
  email: 'qa@example.test', phone: null, favoriteSports: 'Futebol,Padel',
  joinDateDisplay: null, lastLoginDateDisplay: null, mfa: false
};
const publicPages = [
  ['/home', '.home-page'],
  ['/about', '.about-page'],
  ['/contact', '.contact-page'],
  ['/login', '.login-page'],
  ['/login/registerNewUser', '.register-page']
];
const authenticatedPages = [
  ['/menu/notifications', '.notifications-page'],
  ['/menu/my-sessions', '.my-sessions-page'],
  ['/menu/venues', '.venue-directory-page'],
  ['/menu/venues/new', '.venue-create-page'],
  ['/menu/dadosPerfil', '.profile-page'],
  ['/menu/alterardados', '.edit-page'],
  ['/menu/communities', '.communities-page'],
  ['/menu/discover', '.discover-page'],
  ['/menu/events', '.sessions-page'],
  ['/menu/createEvent', '.create-page'],
  ['/menu/perfis', '.community-page'],
  ['/menu/messages', '.inbox-page'],
  ['/menu/feed', '.feed-page']
];
// Four read-only authenticated session states. No fake backend mutations.
const futureGameDate = new Date(Date.now() + 3 * 86_400_000).toISOString();
const pastGameDate = new Date(Date.now() - 3 * 86_400_000).toISOString();
const sessionDetailFixtures = {
  901: { id: 901, sport: 'Padel', city: 'Lisboa', gameDate: futureGameDate,
    participantCount: 2, maxParticipants: 4, priceAmount: 0, status: 'OPEN',
    privateGame: false, audience: 'PUBLIC', distanceKm: null,
    creatorUsername: 'qa-organizer', address: null, canSeeExactAddress: false,
    joined: false, waitlisted: false, waitlistPosition: null, gamePhoto: null },
  902: { id: 902, sport: 'Futsal', city: 'Porto', gameDate: futureGameDate,
    participantCount: 4, maxParticipants: 4, priceAmount: 0, status: 'FULL',
    privateGame: false, audience: 'PUBLIC', distanceKm: null,
    creatorUsername: 'qa-organizer', address: null, canSeeExactAddress: false,
    joined: false, waitlisted: false, waitlistPosition: null, gamePhoto: null },
  903: { id: 903, sport: 'Voleibol', city: 'Cascais', gameDate: futureGameDate,
    participantCount: 3, maxParticipants: 6, priceAmount: 0, status: 'OPEN',
    privateGame: false, audience: 'PUBLIC', distanceKm: null,
    creatorUsername: 'qa-organizer', address: null, canSeeExactAddress: false,
    joined: true, waitlisted: false, waitlistPosition: null, gamePhoto: null },
  904: { id: 904, sport: 'Basquetebol', city: 'Sintra', gameDate: pastGameDate,
    participantCount: 4, maxParticipants: 4, priceAmount: 0, status: 'COMPLETED',
    privateGame: false, audience: 'PUBLIC', distanceKm: null,
    creatorUsername: 'qa-organizer', address: null, canSeeExactAddress: false,
    joined: true, waitlisted: false, waitlistPosition: null, gamePhoto: null }
};
const fictionalVenues = [
  { id: 201, name: 'Campo Fictício 3', city: 'Lisboa', district: 'Lisboa',
    address: null, locationStatus: 'GPS_ONLY_ADDRESS_UNKNOWN',
    latitude: 38.75, longitude: -9.16, sports: 'Futebol',
    informationSource: 'OPENSTREETMAP', createdAt: '2026-10-20T12:00:00Z' },
  { id: 202, name: 'Pavilhão Fictício', city: 'Porto', district: 'Porto',
    address: 'Rua de Exemplo 12', sports: 'Futsal',
    informationSource: 'COMMUNITY', createdAt: '2026-10-20T12:00:00Z' },
  { id: 203, name: 'Campo Fictício 5', city: 'Lisboa', district: 'Lisboa',
    address: null, locationStatus: 'GPS_ONLY_ADDRESS_UNKNOWN',
    latitude: 38.755, longitude: -9.164, sports: 'Futebol',
    informationSource: 'OPENSTREETMAP', createdAt: '2026-10-20T12:00:00Z' }
];
const fictionalParticipants = [
  { id: 51, username: 'mobile-fixture', attendanceStatus: 'PENDING',
    joinedAt: futureGameDate, teamCode: null },
  { id: 52, username: 'qa-teammate', attendanceStatus: 'PENDING',
    joinedAt: futureGameDate, teamCode: null }
];

// All internal community screenshots use synthetic, read-only records.
const fictionalCommunity = {
  id: 77, name: 'Clube QA Padel', description: 'Comunidade fictícia para validar os separadores.',
  sport: 'Padel', sports: ['Padel'], photoUrl: null, visibility: 'PUBLIC',
  rankingsEnabled: true, individualTournamentsEnabled: true, teamTournamentsEnabled: true,
  membersCanCreateSessions: true, ownerUsername: 'mobile-fixture', myRole: 'OWNER',
  memberCount: 10, createdAt: '2026-10-20T12:00:00Z', members: [
    { profileId: 1, username: 'mobile-fixture', fullName: 'Jogadora Fictícia',
      profilePicUrl: null, role: 'OWNER' },
    { profileId: 2, username: 'qa-teammate', fullName: 'Colega Fictício',
      profilePicUrl: null, role: 'MEMBER' },
    ...Array.from({length:8},(_,i)=>({
      profileId:10+i,username:'community-member-'+(i+1),
      fullName:'Membro de Teste '+(i+1),profilePicUrl:null,role:'MEMBER'
    }))
  ]
};
const fictionalRankingRows = [
  { position: 1, profileId: 1, username: 'mobile-fixture', fullName: 'Jogadora Fictícia',
    profilePicUrl: null, games: 4, wins: 3, draws: 1, losses: 0, points: 10,
    goals: 12, assists: 5, mvps: 2, cleanSheets: 1, winRate: 75,
    currentStreak: '3W', bestWinStreak: 3 },
  { position: 2, profileId: 2, username: 'qa-teammate', fullName: 'Colega Fictício',
    profilePicUrl: null, games: 4, wins: 2, draws: 1, losses: 1, points: 7,
    goals: 9, assists: 3, mvps: 1, cleanSheets: 0, winRate: 50,
    currentStreak: '1W', bestWinStreak: 2 },
  { position: 3, profileId: null, username: null, fullName: 'Jogador Histórico',
    profilePicUrl: null, games: 4, wins: 1, draws: 0, losses: 3, points: 3,
    goals: 5, assists: 1, mvps: 0, cleanSheets: 0, winRate: 25,
    currentStreak: '2L', bestWinStreak: 1 }
];
const fictionalCompetition = {
  settings: { rankingsEnabled: true, winPoints: 3, drawPoints: 1, lossPoints: 0 },
  seasons: [], selectedSeasonId: null, activeSeasonId: null, rounds: [],
  standings: fictionalRankingRows
};
const fictionalTournament = {
  id: 9010, name: 'Liga QA de Padel', sport: 'Padel', entryType: 'INDIVIDUAL',
  format: 'LEAGUE', status: 'COMPLETED', winPoints: 3, drawPoints: 1,
  lossPoints: 0, createdAt: '2026-09-01T10:00:00Z',
  startedAt: '2026-09-03T10:00:00Z', completedAt: '2026-10-20T20:00:00Z',
  championProfileId: 1, championUsername: 'mobile-fixture',
  championDisplayName: 'Jogadora Fictícia', championPoints: 7, championTied: false
};
const fictionalTournamentRows = [
  { position: 1, profileId: 1, username: 'mobile-fixture', displayName: 'Jogadora Fictícia',
    played: 3, won: 2, drawn: 1, lost: 0, goalsFor: 12, goalsAgainst: 4,
    goalDifference: 8, points: 7 },
  { position: 2, profileId: 2, username: 'qa-teammate', displayName: 'Colega Fictício',
    played: 3, won: 1, drawn: 1, lost: 1, goalsFor: 8, goalsAgainst: 7,
    goalDifference: 1, points: 4 },
  { position: 3, profileId: 3, username: 'qa-historic', displayName: 'Jogador Histórico',
    played: 3, won: 0, drawn: 0, lost: 3, goalsFor: 2, goalsAgainst: 11,
    goalDifference: -9, points: 0 }
];
// Three distinct team formats, including their real API response shapes.
const fictionalTeamTournaments = [
  { id:9020, name:'Liga de Equipas QA', sport:'Padel', entryType:'TEAM',
    format:'LEAGUE', status:'COMPLETED', playersPerTeam:2, roundRobinLegs:1,
    winPoints:3, drawPoints:1, lossPoints:0,
    createdAt:'2026-09-01T10:00:00Z', startedAt:'2026-09-02T10:00:00Z',
    completedAt:'2026-10-22T20:00:00Z',
    championTied:false, championTeamId:701, championTeamName:'Raquetes Verdes',
    championPoints:6, championProfileId:null, championUsername:null,
    championDisplayName:null },
  { id:9021, name:'Grupos e Eliminatórias QA', sport:'Padel', entryType:'TEAM',
    format:'GROUP_KNOCKOUT', status:'IN_PROGRESS', playersPerTeam:2,
    groupCount:2, winPoints:3, drawPoints:1, lossPoints:0,
    createdAt:'2026-09-05T10:00:00Z', startedAt:'2026-09-12T10:00:00Z',
    completedAt:null, championTied:false, championTeamId:null,
    championTeamName:null, championPoints:null, championProfileId:null,
    championUsername:null, championDisplayName:null },
  { id:9022, name:'Taça de Eliminatórias QA', sport:'Padel', entryType:'TEAM',
    format:'KNOCKOUT', status:'IN_PROGRESS', playersPerTeam:2,
    winPoints:3, drawPoints:1, lossPoints:0,
    createdAt:'2026-09-06T10:00:00Z', startedAt:'2026-09-15T10:00:00Z',
    completedAt:null, championTied:false, championTeamId:null,
    championTeamName:null, championPoints:null, championProfileId:null,
    championUsername:null, championDisplayName:null },
  { id:9023, name:'Preparação das Equipas QA', sport:'Padel', entryType:'TEAM',
    format:'LEAGUE', status:'DRAFT', playersPerTeam:2, roundRobinLegs:1,
    winPoints:3, drawPoints:1, lossPoints:0,
    createdAt:'2026-10-29T10:00:00Z', startedAt:null,
    completedAt:null, championTied:false, championTeamId:null,
    championTeamName:null, championPoints:null, championProfileId:null,
    championUsername:null, championDisplayName:null }
];
const fictionalTeamNames = ['Raquetes Verdes','Rede Azul','Smash Atlântico','Equipa Aurora'];
const fictionalTeams = fictionalTeamNames.map((name,i)=>({
  id:701+i, name, playersPerTeam:2, createdAt:'2026-09-01T10:00:00Z',
  players:[{profileId:100+i*2,username:'qa-team-'+i+'-a',
    displayName:'Jogador QA '+(i*2+1)},
    {profileId:101+i*2,username:'qa-team-'+i+'-b',
    displayName:'Jogador QA '+(i*2+2)}]
}));
const fictionalTeamStandings = fictionalTeamNames.slice(0,3).map((name,i)=>({
  position:i+1,teamId:701+i,teamName:name,played:2,
  won:2-i,drawn:0,lost:i,goalsFor:9-i*2,goalsAgainst:2+i*2,
  goalDifference:7-i*4,points:6-i*3
}));
const fictionalGroupStanding = {
  tournamentId:9021,knockoutStarted:true,groups:[
    {groupNumber:1,standings:[
      {...fictionalTeamStandings[0],played:1,won:1,lost:0,points:3},
      {...fictionalTeamStandings[1],played:1,won:0,lost:1,points:0}]},
    {groupNumber:2,standings:[
      {...fictionalTeamStandings[2],position:1,played:1,won:1,lost:0,points:3},
      {position:2,teamId:704,teamName:'Equipa Aurora',played:1,
        won:0,drawn:0,lost:1,goalsFor:1,goalsAgainst:3,
        goalDifference:-2,points:0}]}
  ]
};
const fictionalTeamMatches = {
  9020:[{id:9211,roundNumber:1,homeTeamId:701,homeTeamName:'Raquetes Verdes',
    awayTeamId:702,awayTeamName:'Rede Azul',status:'COMPLETED',
    homeScore:3,awayScore:1}],
  9021:[
    {id:9221,roundNumber:1,groupNumber:1,homeTeamId:701,
      homeTeamName:'Raquetes Verdes',awayTeamId:702,awayTeamName:'Rede Azul',
      status:'COMPLETED',homeScore:3,awayScore:1},
    {id:9222,roundNumber:1,groupNumber:2,homeTeamId:703,
      homeTeamName:'Smash Atlântico',awayTeamId:704,awayTeamName:'Equipa Aurora',
      status:'COMPLETED',homeScore:3,awayScore:1},
    {id:9223,roundNumber:2,groupNumber:null,homeTeamId:701,
      homeTeamName:'Raquetes Verdes',awayTeamId:703,awayTeamName:'Smash Atlântico',
      status:'SCHEDULED',homeScore:null,awayScore:null}
  ],
  9022:[
    {id:9231,roundNumber:1,homeTeamId:701,homeTeamName:'Raquetes Verdes',
      awayTeamId:704,awayTeamName:'Equipa Aurora',status:'COMPLETED',
      homeScore:3,awayScore:1},
    {id:9232,roundNumber:1,homeTeamId:702,homeTeamName:'Rede Azul',
      awayTeamId:703,awayTeamName:'Smash Atlântico',status:'SCHEDULED',
      homeScore:null,awayScore:null}
  ]
};
const fictionalCommunitySession = {
  id: 901, sport: 'Padel', city: 'Lisboa', gameDate: futureGameDate,
  participantCount: 2, maxParticipants: 4, priceAmount: 0,
  status: 'OPEN', privateGame: true, audience: 'COMMUNITY_ONLY',
  distanceKm: null, recurrenceSeriesId: null, seasonCommunityId: null
};

const unexpectedWrites = [];
const browserErrors = [];

const respond = (route, status, data) => route.fulfill({
  status, contentType: 'application/json',
  headers: { 'access-control-allow-origin': SITE, 'access-control-allow-headers': '*' },
  body: JSON.stringify(data)
});

async function main() {
  const browser = await chromium.launch({
    headless: true, args: ['--no-sandbox'],
    ...(process.env.JYNLO_USE_SYSTEM_CHROME === '1' ? { channel: 'chrome' } : {})
  });
  try {
    for (const width of [390, 768, 1366]) {
      for (const language of ['pt', 'en']) {
        const context = await browser.newContext({
          viewport: { width, height: width === 390 ? 844 : width === 768 ? 1024 : 900 },
          locale: language === 'en' ? 'en-GB' : 'pt-PT',
          isMobile: width === 390,
          hasTouch: width === 390
        });
        await context.addInitScript(({ token, lang }) => {
          // An embedded, cross-origin OSM iframe can block access to localStorage.
          // Only the audited SPA main document ever needs the synthetic identity.
          if (window.self !== window.top || location.origin !== 'http://127.0.0.1:4173') return;
          if (location.pathname.startsWith('/menu/')) localStorage.setItem('t', token);
          else localStorage.removeItem('t');
          localStorage.setItem('d24-language', lang);
        }, { token: jwt, lang: language });

        // Route API WebSockets too: HTTP routing does not intercept WS handshakes.
        await context.routeWebSocket('**/*', socket => socket.close());

        await context.route('**/*', async route => {
          const request = route.request();
          const url = new URL(request.url());
          if (url.origin === SITE) return route.continue();

          // Never contact LIVE API, CDN, provider OAuth, or remote services.
          if (url.origin !== 'https://api.d24sports.com') {
            if (request.resourceType() === 'stylesheet') {
              return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
            }
            return route.abort('blockedbyclient');
          }

          if (request.method() === 'OPTIONS') return route.fulfill({
            status: 204,
            headers: { 'access-control-allow-origin': SITE,
              'access-control-allow-methods': 'GET, OPTIONS',
              'access-control-allow-headers': '*' }
          });
          // Inbox summaries is a read-only batched lookup implemented as POST.
          // Supply an empty synthetic result, never forwarding it to production.
          if (request.method() === 'POST'
              && url.pathname === '/api/messages/inbox/summaries') {
            return respond(route, 200, []);
          }
          if (request.method() !== 'GET') {
            // The UI can attempt background telemetry/token refresh. Do not send it.
            if (url.pathname !== '/api/presence/heartbeat'
                && url.pathname !== '/api/auth/refresh'
                && url.pathname !== '/api/pilot/events/access') {
              unexpectedWrites.push(request.method() + ' ' + url.pathname);
            }
            return respond(route, 403, {});
          }

          const endpoint = url.pathname;
          if (endpoint === '/api/auth/google/config') return respond(route, 200, { clientId: '' });
          // Session details are read-only: each route receives an explicit fixture.
          const detailId = /^\/api\/sessions\/(901|902|903|904)$/.exec(endpoint);
          if (detailId) return respond(route, 200, sessionDetailFixtures[Number(detailId[1])]);
          const rosterId = /^\/api\/sessions\/(903|904)\/participants$/.exec(endpoint);
          if (rosterId) return respond(route, 200, fictionalParticipants);
          if (endpoint === '/api/profiles/qa-organizer/reliability') {
            return respond(route, 200, { attendanceRate: 100, completedSessions: 4,
              noShows: 0, lateCancellations: 0, penaltyScore: 0,
              warning: false, reducedPriority: false, joinRestricted: false });
          }

          if (endpoint === '/api/profile/me') return respond(route, 200, profile);
          if (endpoint === '/api/notifications/me') return respond(route, 200, []);
          if (endpoint === '/api/notifications/me/unread-count') return respond(route, 200, 0);
          if (endpoint === '/api/notifications/me/preferences') return respond(route, 200, {
            inAppEnabled: true, emailEnabled: true,
            disabledInAppTypes: [], disabledEmailTypes: []
          });
          if (endpoint === '/api/auth/sessions') return respond(route, 200, []);
          if (endpoint === '/api/sessions/mine') {
            return respond(route, 200, { created: [], joined: [], waitlisted: [] });
          }
          if (endpoint === '/api/communities/mine') return respond(route, 200, [fictionalCommunity]);
          if (endpoint === '/api/communities/invites/me') return respond(route, 200, []);
          if (endpoint === '/api/communities/77') return respond(route, 200, fictionalCommunity);
          if (endpoint === '/api/communities/77/competition') return respond(route, 200, fictionalCompetition);
          // Empty historical collections are valid and must not be confused with
          // unavailable data when reviewing the populated current standings.
          if (endpoint === '/api/communities/77/competition/standings-archives'
              || endpoint === '/api/communities/77/competition/match-archives') {
            return respond(route, 200, []);
          }
          if (endpoint === '/api/communities/77/sessions') return respond(route, 200, [fictionalCommunitySession]);
          if (endpoint === '/api/communities/77/sessions/competition-results') return respond(route, 200, []);
          if (endpoint === '/api/communities/77/tournaments') {
            return respond(route, 200, {
              tournaments: [fictionalTournament, ...fictionalTeamTournaments],
              page: 0, hasMore: false
            });
          }
          // Dedicated team-page fixtures are scoped before pagination.
          const ownTeamMatch = endpoint.match(/^\/api\/communities\/77\/tournaments\/(902[0-3])\/teams\/(\d+)\/matches$/);
          if (ownTeamMatch) {
            const tournamentId = Number(ownTeamMatch[1]), ownTeamId = Number(ownTeamMatch[2]);
            return respond(route, 200, {matches:(fictionalTeamMatches[tournamentId] || [])
              .filter(match => match.homeTeamId === ownTeamId || match.awayTeamId === ownTeamId),
              page:0,hasMore:false});
          }
          const teamParts = endpoint.split('/');
          const teamApi = teamParts.length >= 7
            && teamParts[1] === 'api' && teamParts[2] === 'communities'
            && teamParts[3] === '77' && teamParts[4] === 'tournaments'
            && ['9020','9021','9022','9023'].includes(teamParts[5])
            && teamParts[6] === 'teams'
            && (teamParts.length === 7 || (teamParts.length === 8
              && ['matches','standings','groups'].includes(teamParts[7])))
            ? [endpoint, teamParts[5], teamParts[7] || undefined] : null;
          if (teamApi) {
            const tournamentId = Number(teamApi[1]), action = teamApi[2];
            if (!action) return respond(route, 200,
              tournamentId === 9020 ? fictionalTeams.slice(0,3)
                : tournamentId === 9023
                ? [{...fictionalTeams[0],players:fictionalTeams[0].players.slice(0,1)},
                   fictionalTeams[1], {...fictionalTeams[2],players:[]}]
                : fictionalTeams);
            if (action === 'matches') return respond(route, 200, {
              matches:fictionalTeamMatches[tournamentId],page:0,hasMore:false
            });
            if (action === 'standings' && tournamentId === 9020) {
              return respond(route, 200, {
                tournamentId,status:'COMPLETED',totalMatches:3,completedMatches:3,
                winPoints:3,drawPoints:1,lossPoints:0,standings:fictionalTeamStandings
              });
            }
            if (action === 'groups' && tournamentId === 9021) {
              return respond(route, 200, fictionalGroupStanding);
            }
          }
          if (endpoint === '/api/communities/77/tournaments/9010/participants') {
            return respond(route, 200, { participants: [
              { profileId: 1, username: 'mobile-fixture', displayName: 'Jogadora Fictícia',
                joinedAt: '2026-09-01T12:00:00Z', status: 'CONFIRMED' },
              { profileId: 2, username: 'qa-teammate', displayName: 'Colega Fictício',
                joinedAt: '2026-09-01T12:00:00Z', status: 'CONFIRMED' }
            ], page: 0, hasMore: false });
          }
          if (endpoint === '/api/communities/77/tournaments/9010/matches') {
            return respond(route, 200, { matches: [
              { id: 9011, roundNumber: 1, homeProfileId: 1,
                homeUsername: 'mobile-fixture', awayProfileId: 2,
                awayUsername: 'qa-teammate', status: 'COMPLETED',
                homeScore: 3, awayScore: 1 }
            ], page: 0, hasMore: false });
          }
          if (endpoint === '/api/communities/77/tournaments/9010/standings') {
            return respond(route, 200, {
              tournamentId: 9010, status: 'COMPLETED', totalMatches: 3,
              completedMatches: 3, winPoints: 3, drawPoints: 1, lossPoints: 0,
              standings: fictionalTournamentRows
            });
          }
          if (endpoint === '/api/venues/suggest') {
            return respond(route, 200, { venues: fictionalVenues, page: 0, hasMore: false });
          }
          if (endpoint === '/api/venues/201') return respond(route, 200, fictionalVenues[0]);
          if (endpoint === '/api/venues/201/photos'
              || endpoint === '/api/venues/201/sport-conditions') return respond(route, 200, []);
          if (endpoint === '/api/venues/201/ratings/summary') return respond(route, 200, null);
          if (endpoint === '/api/sessions') return respond(route, 200, []);
          return respond(route, 404, { message: 'No fixture for read-only visual audit' });
        });

        const page = await context.newPage();
        page.on('pageerror', error => browserErrors.push(
          width + '/' + language + ': ' + error.message
        ));

        // Scope to READ-ONLY navigation. Never click submit, send, delete, save.
        // Cover every public and authenticated layout in both languages.
        // English can have longer labels than Portuguese and must pass the
        // same horizontal-overflow checks at each tested viewport.
        const scenarios = [...publicPages, ...authenticatedPages];

        // High-value authenticated detail states in four synthetic states.
        scenarios.push(
          ['/menu/venues', '.venue-directory-grid .venue-directory-card'],
          ['/menu/venues/201', '.venue-detail-page .venue-header'],
          ['/menu/venues/new', '.venue-create-form'],
          ['/menu/communities?view=explore', '.community-pitch'],
          ['/menu/communities/77?tab=home', '.community-tabs'],
          ['/menu/communities/77?tab=sessions', '.community-session-card'],
          ['/menu/communities/77?tab=stats', '.stats-table-wrap'],
          ['/menu/communities/77?tab=ranking', '.ranking-table-wrap'],
          ['/menu/communities/77?tab=tournaments', '.tournament-browser'],
          ['/menu/communities/77?tab=tournaments&tournament=9020', '.tournament-browser'],
          ['/menu/communities/77?tab=tournaments&tournament=9021', '.tournament-browser'],
          ['/menu/communities/77?tab=tournaments&tournament=9022', '.tournament-browser'],
          ['/menu/communities/77?tab=tournaments&tournament=9023', '.tournament-browser'],
          ['/menu/communities/77?tab=tournaments&tournament=9021&fixture=9221', '.tournament-browser'],
          ['/menu/communities/77?tab=tournaments&tournament=9021&teamPage=701', '.team-profile-page'],
          ['/menu/communities/77?tab=tournaments&tournament=9023&teamPage=701', '.team-profile-page'],
          ['/menu/communities/77?tab=tournaments&tournament=9023&teamPage=999', '.team-profile-page'],
          ['/menu/communities/77?tab=tournaments&tournament=9023&team=701', '.team-invite-accept'],
          ['/menu/events/901', '.jynlo-session-detail-premium .detail-card'],
          ['/menu/events/902', '.jynlo-session-detail-premium .detail-card'],
          ['/menu/events/903', '.jynlo-session-detail-premium .detail-card'],
          ['/menu/events/904', '.jynlo-session-detail-premium .detail-card']
        );

        for (const [route, selector] of scenarios) {
          await page.goto(SITE + route, { waitUntil: 'domcontentloaded', timeout: 20_000 });
          await page.locator(selector).first().waitFor({ state: 'visible', timeout: 15_000 });
          await page.evaluate(() => document.fonts && document.fonts.ready);
          // Angular and mobile viewport metadata can settle after the route host.
          // Wait for the viewport to match the device width before testing overflow.
          // A genuinely broken mobile viewport still fails rather than being ignored.
          try {
            await page.waitForFunction(
              expected => Math.abs(window.innerWidth - expected) <= 3,
              width, { timeout: 4500 }
            );
          } catch (error) {
            // Make persistent mobile viewport failures actionable instead of
            // reporting only a timeout. No user data, no network writes.
            const diagnostic = await page.evaluate(() => {
              const meta = document.querySelector('meta[name="viewport"]');
              const selectors = ['html','body','.site-nav','.site-nav__shell',
                '.create-page','.create-shell','.page-header','.header-actions',
                '.create-card','.form-actions','.form-actions button',
                'app-jynlo-select'];
              const box = name => {
                const el = document.querySelector(name);
                if (!el) return null;
                const r = el.getBoundingClientRect();
                const c = getComputedStyle(el);
                return { name, left:Math.round(r.left), right:Math.round(r.right),
                  width:Math.round(r.width), scrollWidth:el.scrollWidth,
                  minWidth:c.minWidth, maxWidth:c.maxWidth,
                  flex:c.flexDirection, flexWrap:c.flexWrap,
                  display:c.display, overflowX:c.overflowX };
              };
              const offenders = [...document.body.querySelectorAll('*')].map(el => {
                const r = el.getBoundingClientRect();
                const c = getComputedStyle(el);
                return { node:el.tagName.toLowerCase(),
                  cls:String(el.className || '').slice(0,75),
                  parent:String(el.parentElement?.className || '').slice(0,50),
                  left:Math.round(r.left),right:Math.round(r.right),
                  width:Math.round(r.width),minWidth:c.minWidth,
                  display:c.display,position:c.position };
              }).filter(x => x.right > window.visualViewport.width + 4
                && x.position !== 'fixed' && x.display !== 'none')
                .sort((a,b) => b.right - a.right).slice(0,35);
              return { meta:meta?.content, device:window.visualViewport.width,
                layout:window.innerWidth, media760:matchMedia('(max-width:760px)').matches,
                media900:matchMedia('(max-width:900px)').matches,
                elements:selectors.map(box).filter(Boolean), offenders };
            });
            console.error('AUTH_MOBILE_VIEWPORT_DIAGNOSTIC', route, JSON.stringify(diagnostic));
            throw error;
          }
          await page.waitForTimeout(250);
          const name = route.replace(/\W+/g, '-').replace(/^-/, '');
          await page.screenshot({
            path: path.join(OUT, width + '-' + language + '-' + name + '.png'),
            fullPage: false
          });
          const measure = await page.evaluate(expectedWidth => {
            const doc = document.documentElement;
            const width = expectedWidth;
            return {
              viewport: window.innerWidth, expectedWidth,
              visualViewport: window.visualViewport?.width ?? null,
              documentWidth: doc.scrollWidth,
              bodyWidth: document.body.scrollWidth,
              offenders: [...document.body.querySelectorAll('*')]
                .map(el => {
                  const r = el.getBoundingClientRect();
                  const css = getComputedStyle(el);
                  return {
                    element: el.tagName.toLowerCase(),
                    className: String(el.className || '').slice(0, 70),
                    parent: String(el.parentElement?.className || '').slice(0, 50),
                    left: Math.round(r.left), right: Math.round(r.right),
                    width: Math.round(r.width), scrollWidth: el.scrollWidth,
                    minWidth: css.minWidth, position: css.position,
                    visible: r.width > 0 && r.height > 0
                      && css.visibility !== 'hidden' && css.display !== 'none'
                  };
                })
                .filter(item => item.visible && item.right > width + 3
                  && item.left < width && item.position !== 'fixed')
                .sort((a, b) => b.right - a.right)
                .slice(0, 22)
            };
          }, width);
          const overflow = Math.max(measure.documentWidth, measure.bodyWidth, measure.viewport) - width;
          console.log('[responsive]', width, language, route,
            'documentWidth=' + measure.documentWidth, 'overflow=' + overflow);
          assert.ok(overflow <= 2,
            route + ' (' + width + 'px ' + language + ') horizontal overflow: '
            + JSON.stringify(measure));
          // A desktop flex-basis on the text column becomes a tall empty
          // box when its parent switches to a column on tablet/mobile.
          if (width <= 768 && (route === '/menu/events' || route === '/menu/communities')) {
            const panels = route === '/menu/events'
              ? ['.jynlo-activities-v3 .page-header',
                ...(width <= 390 ? ['.jynlo-activities-v3 .nearby-panel'] : [])]
              : ['.jynlo-community-main-premium:not(.community-detail-page) .page-header'];
            for (const selector of panels) {
              const trailingSpace = await page.locator(selector).evaluate(panel => {
                const copy = panel.querySelector(':scope > div:first-child');
                const lastChild = copy?.lastElementChild;
                if (!copy || !lastChild) return null;
                return Math.round(copy.getBoundingClientRect().bottom
                  - lastChild.getBoundingClientRect().bottom);
              });
              assert.ok(trailingSpace !== null && trailingSpace <= 42,
                route + ' (' + width + 'px ' + language + ') ' + selector
                + ' has excessive blank space after heading copy: ' + trailingSpace + 'px');
            }
          }
          // Desktop-first content hierarchy: search and nearby actions remain
          // real controls, but should no longer delay the first results row.
          if (width === 1366 && route.startsWith('/menu/communities/77?')) {
            const tabs = page.locator('nav.community-tabs > button');
            assert.equal(await tabs.count(), 7,
              'Synthetic community must expose all seven authorized sections');
            const current = await tabs.evaluateAll(items =>
              items.filter(el => el.getAttribute('aria-current') === 'true'));
            assert.equal(current.length, 1,
              'Exactly one community section must be selected');
            const tabBox = await page.locator('nav.community-tabs').boundingBox();
            assert.ok(tabBox && tabBox.height < 120,
              'Desktop community navigation should remain compact');
            const layout = await page.locator('nav.community-tabs').evaluate(
              el => getComputedStyle(el).display);
            assert.equal(layout, 'grid',
              'Desktop community sections must share the available width');
            const selected = new URL('http://localhost' + route).searchParams.get('tab');
            if (selected === 'ranking') {
              const table = page.locator('.ranking-table');
              await table.locator('tbody tr').first().waitFor({state:'visible'});
              assert.equal(await table.locator('thead th').count(), 7,
                'Community ranking must keep all seven actual columns');
              assert.equal(await table.locator('tbody tr.podium').count(), 3,
                'Three supplied rankings should form the podium');
              assert.ok((await table.locator('tbody').innerText()).includes('Jogador Histórico'),
                'Historical participants remain visible in the community ranking');
              await table.scrollIntoViewIfNeeded();
              await page.screenshot({
                path: path.join(OUT, width + '-' + language + '-community-ranking-results.png'),
                fullPage: false
              });
            }
            if (selected === 'tournaments') {
              const query = new URL('http://localhost' + route).searchParams;
              const teamPage = query.get('teamPage');
              const teamId = query.get('tournament');
              if (teamId === '9021' && query.get('fixture') === '9221') {
                const selected=page.locator('.team-fixture.is-direct-target');
                await selected.waitFor({state:'visible'});
                assert.equal(await selected.getAttribute('data-team-fixture-id'),'9221',
                  'The requested published fixture is selected exactly');
                assert.equal(await page.locator('.team-direct-fixture-feedback').count(),0,
                  'A found published fixture does not show a misleading search warning');
              }
              if (teamPage) {
                const detail = page.locator('.team-profile-page');
                if (teamPage === '999') {
                  await detail.locator('.notice-info').waitFor({state:'visible'});
                  assert.equal(await detail.locator('.team-page-roster').count(),0,
                    'Unknown team must not leak another team roster');
                  await detail.locator('.team-page-back').click();
                  await page.locator('.team-summary-card').first().waitFor({state:'visible'});
                } else {
                await detail.locator('.team-page-hero h2').waitFor({state:'visible'});
                assert.equal((await detail.locator('.team-page-hero h2').innerText()).trim(),
                  'Raquetes Verdes', 'Deep link opens the exact team');
                assert.equal(await detail.locator('.team-page-roster').count(),1,
                  'Team has one dedicated management card');
                assert.equal(await page.locator('.team-summary-card').count(),0,
                  'Dedicated page does not repeat the entire tournament directory');
                assert.equal(await page.locator('.team-fixture').count(),0,
                  'The team page must not duplicate tournament fixtures');
                if (teamId === '9021') {
                  const rivals=detail.locator('.team-page-rival-card');
                  await rivals.first().waitFor({state:'visible'});
                  assert.equal(await rivals.count(),2,
                    'Only real opponents in this teams loaded fixtures appear');
                  assert.equal(await detail.locator('.team-page-fixture').count(),2);
                  const sections=detail.locator('.team-page-fixture-section');
                  assert.deepEqual(await sections.evaluateAll(elements =>
                    elements.map(element => element.getAttribute('data-status'))),
                    ['PENDING','COMPLETED'],
                    'Upcoming published stages precede already completed fixtures');
                  assert.deepEqual(await sections.first().locator('.team-page-fixture').evaluateAll(
                    elements => elements.map(element => element.getAttribute('data-team-profile-fixture-id'))),
                    ['9223'], 'The pending stage contains the real scheduled fixture');
                  assert.deepEqual(await sections.last().locator('.team-page-fixture').evaluateAll(
                    elements => elements.map(element => element.getAttribute('data-team-profile-fixture-id'))),
                    ['9221'], 'The completed stage contains the real scored fixture');
                  const completed=sections.last().locator('.team-page-fixture');
                  const scheduled=sections.first().locator('.team-page-fixture');
                  assert.equal(await completed.locator('.team-page-fixture-outcome.is-win').count(),1,
                    'A completed own-team win is identified without changing the official home-away score');
                  assert.equal(await scheduled.locator('.team-page-fixture-outcome').count(),0,
                    'An unplayed match must not imply a result');
                  assert.equal(await completed.locator('.team-page-fixture-score .is-own-score').count(),1,
                    'Only the focused team score is highlighted');
                  const rivalLink=await completed.locator('.team-page-fixture-rival-link').getAttribute('href');
                  assert.ok(rivalLink.includes('teamPage=702'),
                    'Rival link leads to that existing tournament team page');
                  const tournamentLink=await completed.locator('.team-page-fixture-tournament-link').getAttribute('href');
                  assert.ok(tournamentLink.includes('tournament=9021')
                    && tournamentLink.includes('fixture=9221') && !tournamentLink.includes('teamPage='),
                    'Tournament link targets exactly this existing published fixture');
                  await rivals.first().click();
                  assert.equal(await rivals.first().getAttribute('aria-pressed'),'true');
                  assert.equal(await detail.locator('.team-page-fixture').count(),1,
                    'Opponent card filters this teams real published fixture history');
                  assert.equal(await detail.locator('.team-page-fixture-section').count(),1,
                    'Only the matching status section remains when filtering opponents');
                  await rivals.first().click();
                  assert.equal(await detail.locator('.team-page-fixture').count(),2,
                    'Toggling the same rival restores all loaded fixtures');
                }
                if (teamId === '9023') {
                  const join = detail.locator('.team-page-hero a').last();
                  assert.ok((await join.getAttribute('href')).includes('team=701'),
                    'Draft team page offers the existing invitation flow');
                }
                await page.screenshot({
                  path:path.join(OUT,width+'-'+language+'-team-profile-701.png'),fullPage:false
                });
                await detail.locator('.team-page-back').click();
                await page.locator('.team-summary-card').first().waitFor({state:'visible'});
                assert.equal(await page.locator('.team-summary-card').count(),
                  teamId === '9021' ? 4 : 3,
                  'Back returns to the same tournament team directory');
                }
              } else {
              if (query.get('fixture') === '9221') {
                const targeted=page.locator('.team-fixture.is-direct-target');
                await targeted.waitFor({state:'visible'});
                assert.equal(await targeted.getAttribute('data-team-fixture-id'),'9221',
                  'Exact match deep link focuses the real published fixture');
                assert.equal(await targeted.getAttribute('aria-current'),'location');
                assert.equal(await page.locator('.team-fixture.is-direct-target').count(),1,
                  'Only the requested fixture is highlighted');
              }
              const options = page.locator('.tournament-option');
              await options.first().waitFor({state:'visible'});
              assert.equal(await options.count(), 5,
                'Browser must show the individual, team formats and an editable draft');
              if (teamId) {
                const heading = page.locator('.tournament-detail .tournament-heading h4');
                const expected = fictionalTeamTournaments.find(t => t.id === Number(teamId));
                await heading.waitFor({state:'visible'});
                assert.equal((await heading.innerText()).trim(),expected.name,
                  'Deep-linked team tournament must remain selected');
                await page.locator('.team-summary-card').first().waitFor({state:'visible'});
                assert.equal(await page.locator('.team-roster-card').count(),0,
                  'Main tournament index must not render full team rosters');
                assert.equal(await page.locator('.team-summary-card').count(),
                  Number(teamId) === 9020 || Number(teamId) === 9023 ? 3 : 4,
                  'All teams remain reachable as compact cards');
                if (Number(teamId) === 9023) {
                  await page.locator('.team-summary-card').first().click();
                  await page.locator('.team-profile-page').waitFor({state:'visible'});
                  const occupied = page.locator('.team-page-roster');
                  const management = page.locator('.team-page-management');
                  assert.equal(await management.count(),1,
                    'Organiser actions live in a separate team management panel');

                  assert.equal(await page.locator('.team-roster-card').count(),1,
                    'Dedicated team page shows only its own roster');
                  assert.equal(await page.locator('.team-roster-readiness.is-ready').count(),0,
                    'The incomplete synthetic squad is not labelled ready');
                  assert.equal(await page.locator('.team-summary-state').count(),0,
                    'The individual team page must not show the whole directory');
                  const rawLink = management.locator('.team-link-field');
                  assert.equal(await rawLink.isVisible(),false,
                    'Full invitation URL must stay collapsed by default');
                  await management.locator('.team-link-details summary').click();
                  assert.equal(await rawLink.isVisible(),true,
                    'Organisers can reveal the original invitation URL');
                  await management.locator('.team-link-details summary').click();
                  const manual = management.locator('.team-manual-assign');
                  await manual.locator('summary').click();
                  const search = manual.locator('input[type="search"]');
                  await search.waitFor({state:'visible'});
                  await search.fill('community-member-4');
                  assert.equal(await manual.locator('select option').count(),2,
                    'Community member search limits the options to a matching profile');
                  await search.fill('not-a-real-person');
                  assert.equal(await manual.locator('select option').count(),1,
                    'No-match search must not allow a stale member choice');
                  await search.fill('');
                  await manual.locator('summary').click();
                  await occupied.locator('.player-item button').first().click();
                  await occupied.locator('.team-roster-confirm').first().waitFor({state:'visible'});
                  assert.equal(await occupied.locator('.team-roster-confirm button').count(),2,
                    'Player removal requires confirmation and allows cancellation');
                  await occupied.locator('.team-roster-confirm button').last().click();
                  assert.equal(await occupied.locator('.team-roster-confirm').count(),0);
                  await page.locator('.team-page-back').click();
                  await page.locator('.team-summary-card').last().click();
                  const emptyTeam = page.locator('.team-page-roster');
                  await emptyTeam.locator('button.t-btn-danger-outline').click();
                  await emptyTeam.locator('.team-roster-confirm').waitFor({state:'visible'});
                  assert.equal(await emptyTeam.locator('.team-roster-confirm button').count(),2,
                    'Deleting empty teams requires a separate confirmation');
                  await emptyTeam.locator('.team-roster-confirm').scrollIntoViewIfNeeded();
                  await page.screenshot({
                    path:path.join(OUT,width+'-'+language+'-team-9023-roster-confirm.png'),
                    fullPage:false
                  });
                  await emptyTeam.locator('.team-roster-confirm button').last().click();
                  assert.equal(await page.locator('.team-roster-confirm').count(),0);
                } else {
                await page.locator('.team-fixture').first().waitFor({state:'visible'});
                if (query.get('fixture') === '9221') {
                  assert.equal(await page.locator('.team-fixture').count(),1,
                    'Direct links initially show the requested published round only');
                  await page.locator('.team-phase-select select').first().selectOption('ALL');
                }
                assert.equal(await page.locator('.team-fixture').count(),
                  fictionalTeamMatches[Number(teamId)].length,
                  'Clearing a deep-link round filter restores all published fixtures');
                assert.equal(await page.locator('.team-summary-card').count(),
                  Number(teamId) === 9020 ? 3 : 4,
                  'Team directory retains every real team without full inline rosters');
                if (Number(teamId) === 9020) {
                  await page.locator('.team-standings-table tbody tr').first()
                    .waitFor({state:'visible'});
                  assert.equal(await page.locator('.team-standings-table tbody tr').count(),3);
                  assert.ok((await page.locator('.champion').innerText()).includes('Raquetes Verdes'));
                  await page.locator('.team-standings-table').scrollIntoViewIfNeeded();
                } else if (Number(teamId) === 9021) {
                  const groupTabs = page.locator('.team-group-switch');
                  assert.equal(await groupTabs.count(),2,
                    'Both independent published groups must remain selectable');
                  await page.locator('.team-standings-table').first().waitFor({state:'visible'});
                  assert.equal(await page.locator('.team-standings-table').count(),1,
                    'Compact group view displays one classification at a time');
                  assert.equal(await page.locator('.team-standings-table tbody tr').count(),2);
                  const firstGroup = await page.locator('.team-standings-table tbody th a').allTextContents();
                  await groupTabs.nth(1).click();
                  assert.equal(await groupTabs.nth(1).getAttribute('aria-pressed'),'true');
                  assert.equal(await page.locator('.team-standings-table').count(),1);
                  assert.equal(await page.locator('.team-standings-table tbody tr').count(),2);
                  const secondGroup = await page.locator('.team-standings-table tbody th a').allTextContents();
                  assert.equal(firstGroup.filter(team => secondGroup.includes(team)).length,0,
                    'Switching groups never mixes their independent rankings');
                  await groupTabs.nth(0).click();
                  assert.equal(await groupTabs.nth(0).getAttribute('aria-pressed'),'true');
                  assert.deepEqual(await page.locator('.team-standings-table tbody th a').allTextContents(),firstGroup,
                    'Returning to the first group restores its original published ranking');
                  await page.locator('.team-standings-table').scrollIntoViewIfNeeded();
                } else {
                  assert.equal(await page.locator('.team-standings-table').count(),0,
                    'Knockout-only tournaments must not invent a league table');
                  await page.locator('.team-fixture').last().scrollIntoViewIfNeeded();
                  if (Number(teamId) === 9022) {
                    const board=page.locator('.team-knockout-board');
                    await board.waitFor({state:'visible'});
                    const search=board.locator('.team-knockout-focus input[type="search"]');
                    assert.equal(await board.locator('.team-knockout-match').count(),2);
                    await search.fill('a');
                    assert.equal(await board.locator('.team-knockout-match').count(),2,
                      'Multiple published fixtures remain available to search navigation');
                    const current=board.locator('.team-knockout-match.is-search-current');
                    assert.equal(await current.count(),1,
                      'The first matching fixture is visually identified');
                    const firstId=await current.getAttribute('data-knockout-fixture-id');
                    await board.locator('.team-knockout-search-next').click();
                    const nextId=await current.getAttribute('data-knockout-fixture-id');
                    assert.notEqual(nextId,firstId,
                      'Next search result moves to another real loaded knockout fixture');
                    assert.equal(await page.evaluate(() => document.activeElement
                      ?.getAttribute('data-knockout-fixture-id')),nextId,
                      'The selected knockout result receives keyboard focus');
                    await board.locator('.team-knockout-search-previous').click();
                    assert.equal(await current.getAttribute('data-knockout-fixture-id'),firstId,
                      'Previous result returns to the first published fixture');
                    const completed=board.locator('.team-knockout-status-filter [data-status="COMPLETED"]');
                    const pending=board.locator('.team-knockout-status-filter [data-status="PENDING"]');
                    const all=board.locator('.team-knockout-status-filter [data-status="ALL"]');
                    await completed.click();
                    assert.equal(await completed.getAttribute('aria-pressed'),'true');
                    assert.equal(await board.locator('.team-knockout-match').count(),1,
                      'Only completed published knockout matches remain visible');
                    assert.equal(await board.locator('.team-knockout-empty').count(),0,
                      'The filter must not show a false no-results message');
                    await pending.click();
                    assert.equal(await board.locator('.team-knockout-match').count(),1,
                      'Only pending published knockout matches remain visible');
                    assert.equal(await board.locator('.team-knockout-empty').count(),0);
                    await all.click();
                    assert.equal(await board.locator('.team-knockout-match').count(),2,
                      'All loaded knockout matches return after clearing the status filter');
                    await search.fill('atlantico');
                    assert.equal(await board.locator('.team-knockout-match').count(),1,
                      'Team search finds a published knockout match ignoring accents');
                    assert.ok((await board.locator('.team-knockout-match').innerText())
                      .includes('Smash Atlântico'));
                    assert.equal(await board.locator('.team-knockout-match.is-search-current').count(),1);
                    assert.ok((await board.locator('.team-knockout-search-preview').innerText())
                      .includes('Smash Atlântico'), 'Search preview identifies the real selected fixture');
                    const matchId=await board.locator('.team-knockout-match.is-search-current')
                      .getAttribute('data-knockout-fixture-id');
                    await board.locator('.team-knockout-search-open').click();
                    assert.equal(await page.evaluate(() => document.activeElement
                      ?.getAttribute('data-team-fixture-id')),matchId,
                      'View fixture focuses the existing official match row');
                    await search.fill('zzz-sem-jogos');
                    assert.equal(await board.locator('.team-knockout-match').count(),0,
                      'No matches search never invents a fixture');
                    assert.equal(await board.locator('.team-knockout-empty').count(),1);
                    await board.locator('.team-knockout-focus-clear').click();
                    assert.equal(await board.locator('.team-knockout-match').count(),2,
                      'Clearing knockout search restores all published fixtures');
                  }
                }
                if (Number(teamId) === 9021) {
                  const played = page.locator('.team-fixture').first();
                  assert.equal(await played.locator('.team-score-edit').count(),0,
                    'Completed fixtures keep their editor collapsed');
                  const pending = page.locator('.team-fixture').last();
                  assert.equal(await pending.locator('.team-score-edit').count(),1,
                    'Scheduled fixtures keep their normal score entry');
                  await played.locator('.team-result-toggle').click();
                  await played.locator('.team-score-edit').waitFor({state:'visible'});
                  assert.equal(await played.locator('.team-result-toggle').getAttribute('aria-expanded'),'true');
                  await played.locator('.team-result-toggle').click();
                  assert.equal(await played.locator('.team-score-edit').count(),0);
                }
                const record = 'team-' + teamId + '-results.png';
                await page.screenshot({
                  path:path.join(OUT,width+'-'+language+'-'+record),fullPage:false
                });
                }
              } else {
              await page.locator('.tournament-detail .champion').waitFor({state:'visible'});
              const standings = page.locator('.tournament-detail .standings-table');
              assert.equal(await standings.locator('tbody tr').count(), 3,
                'Completed tournament keeps all three scored competitors');
              assert.ok((await page.locator('.tournament-detail .champion').innerText()).includes('Jogadora Fictícia'),
                'Completed tournament shows the recorded champion');
              await standings.scrollIntoViewIfNeeded();
              await page.screenshot({
                path: path.join(OUT, width + '-' + language + '-community-tournament-results.png'),
                fullPage: false
              });
              }
              }
            }
            if (selected === 'sessions') {
              assert.equal(await page.locator('a.community-session-card[href="/menu/events/901"]').count(), 1,
                'Community session must retain its real details link');
            } else if (selected === 'stats') {
              assert.equal(await page.locator('.stats-table th').count(), 9,
                'Statistics must keep their nine original columns');
            }
          }
          if (width === 1366 && route === '/menu/discover') {
            const searchBox = await page.locator('.jynlo-explore-v3 .discover-search').boundingBox();
            const copyBox = await page.locator('.jynlo-explore-v3 .search-copy').boundingBox();
            const fieldBox = await page.locator('.jynlo-explore-v3 .search-fields').boundingBox();
            const heroBox = await page.locator('.jynlo-explore-v3 .discover-header').boundingBox();
            assert.ok(searchBox && copyBox && fieldBox && heroBox,
              'Explore desktop needs visible search fields, introduction and hero');
            assert.ok(searchBox.height < 215,
              'Explore desktop search should not occupy an entire tall viewport row: '
              + Math.round(searchBox.height) + 'px');
            assert.ok(fieldBox.x > copyBox.x + copyBox.width - 5,
              'Explore search controls should sit beside the intro on desktop');
            assert.ok(Math.abs(fieldBox.y - copyBox.y) < 70,
              'Explore search introduction and controls must share a row');
            assert.ok(heroBox.height >= 140 && heroBox.height < 220,
              'Explore desktop hero should be compact but legible');
          }
          if (width === 1366 && route === '/menu/events') {
            const filters = await page.locator('.jynlo-activities-v3 .filters').boundingBox();
            const nearby = await page.locator('.jynlo-activities-v3 .nearby-panel').boundingBox();
            assert.ok(filters && nearby,
              'Activities needs both filters and the nearby finder');
            assert.ok(Math.abs(filters.y - nearby.y) <= 8,
              'Desktop Activities nearby finder and filters must share one row');
            assert.ok(filters.x + filters.width <= nearby.x + 6,
              'Desktop Activities nearby finder must not overlap filters');
            assert.ok(nearby.width >= 240,
              'Desktop nearby finder must remain large enough for its button');
          }
          if (width === 1366 && route === '/menu/communities?view=explore') {
            const pitch = await page.locator('.community-pitch').boundingBox();
            const benefits = await page.locator('.community-pitch-benefits').boundingBox();
            const copy = await page.locator('.community-pitch-copy').boundingBox();
            const heading = await page.locator('.community-discovery-heading').boundingBox();
            const filters = await page.locator('.community-discovery-filters').boundingBox();
            assert.ok(pitch && benefits && copy && heading && filters,
              'Communities desktop discovery must retain its intro, benefits and search');
            assert.ok(pitch.height <= 485,
              'Communities onboarding should remain compact on desktop: '
              + Math.round(pitch.height) + 'px');
            assert.ok(benefits.x >= copy.x + copy.width - 5,
              'Communities benefits should form a right-hand desktop column');
            assert.ok(filters.x >= heading.x + heading.width - 5,
              'Communities search fields should align to the right of the heading');
            assert.ok(Math.abs(filters.y - heading.y) <= 90,
              'Communities search and heading should share one desktop row');
            assert.equal(await page.locator('.community-discovery-filters button[type="submit"]').count(), 1,
              'Communities search retains one working submit control');
          }
          if (width === 1366 && route.startsWith('/menu/events/')) {
            const hero = await page.locator('.jynlo-session-detail-premium .detail-content > .title-row').boundingBox();
            assert.ok(hero && hero.height >= 140,
              'Session detail should present a readable, distinct desktop hero');
            assert.ok(hero.height <= 250,
              'Session detail desktop hero should remain compact: '
              + JSON.stringify(hero));
          }
          if (route === '/menu/feed' && width === 1366) {
            const stories = page.locator('.stories-panel');
            await stories.waitFor({ state: 'visible' });
            const errors = await stories.locator('.stories-status').count();
            assert.ok(errors <= 1,
              'Feed Stories must never show duplicate failure messages');
            if (errors > 0 && await stories.locator('.story-bubble').count() === 0) {
              assert.equal(await stories.locator('.stories-empty').count(), 0,
                'Unavailable Stories must not also claim there are no Stories');
              const box = await stories.boundingBox();
              assert.ok(box && box.height <= 210,
                'Unavailable desktop Stories should not monopolize the feed: '
                  + JSON.stringify(box));
            }
            const communityPanels = await page.locator('.feed-v3-community-panel').count();
            const communityPromotion = await page.locator('.feed-v3-join-card').count();
            assert.equal(communityPanels + communityPromotion, 1,
              'Community sidebar shows either membership or discovery, never both');
          }
          if (route === '/menu/venues') {
            const shell = page.locator('.venue-directory-page');
            assert.equal(await shell.locator('.venue-directory-card').count(), 3,
              'Populated synthetic catalogue shows exactly three unique venues');
            const gap = await shell.locator('.venue-directory-filters').evaluate(
              el => getComputedStyle(el).gap);
            const margin = await shell.locator('.venue-directory-result-heading').evaluate(
              el => getComputedStyle(el).marginTop);
            assert.equal(gap, '16px',
              'Catalogue filters retain readable responsive spacing');
            assert.equal(margin, '24px',
              'Catalogue results are separated from filter form');
          }
          if (route === '/menu/venues/201') {
            const shell = page.locator('.venue-detail-page');
            assert.equal(await shell.locator('.venue-hero-back').count(), 1,
              'Venue detail must offer visible return navigation');
            const back = shell.locator('.venue-hero-back');
            const backBox = await back.boundingBox();
            assert.ok(backBox && backBox.width > 80 && backBox.x >= -3
              && backBox.x + backBox.width <= width + 3,
              'Venue return control must remain visible without horizontal clipping');
            assert.equal(await shell.locator('.venue-address-map-link').count(), 1,
              'GPS-only venue has a navigation link without a fabricated street');
            assert.match(await shell.locator('.venue-address-map-link').getAttribute('href'),
              /^https:\/\/www\.google\.com\/maps\?q=38\.75,-9\.16$/,
              'Map action must use the supplied synthetic coordinates');
            const summarySpacing = await shell.locator('.venue-detail-shell').evaluate(el => {
              const header = el.querySelector('.venue-header');
              const next = header?.nextElementSibling;
              return header && next
                ? next.getBoundingClientRect().top - header.getBoundingClientRect().bottom
                : null;
            });
            assert.ok(summarySpacing !== null && summarySpacing >= 18,
              'Venue summary must have visible separation below the header: '
              + summarySpacing);
          }
          if (route === '/menu/venues/new') {
            assert.equal(await page.locator('.venue-create-form').count(), 1,
              'New venue form must render safely');
            const form = page.locator('.venue-create-form');
            const formBox = await form.boundingBox();
            assert.ok(formBox && formBox.width > 150 && formBox.x >= -3
              && formBox.x + formBox.width <= width + 3,
              'New venue form must fit inside the viewport');
          }
          if (/^\/menu\/events\/90[1-4]$/.test(route)) {
            const caseId = Number(route.slice(-3));
            const shell = page.locator('.jynlo-session-detail-premium');
            const card = shell.locator('.detail-card');
            await card.waitFor({ state: 'visible' });
            const box = await card.boundingBox();
            assert.ok(box && box.width > 50 && box.x >= -3
              && box.x + box.width <= width + 3,
              route + ': detail card extends outside viewport ' + JSON.stringify(box));
            assert.equal(await shell.locator('a.back-link[href="/menu/events"]').count(), 1,
              'session detail preserves return navigation');
            assert.equal(await shell.locator('.detail-grid').count(), 1,
              'session facts stay available');
            if (caseId === 901 || caseId === 902) {
              assert.equal(await shell.locator('#session-participation button.primary-action').count(), 1,
                'open and full sessions must show join/waitlist CTA');
              assert.equal(await shell.locator('.membership-status').count(), 0);
              if (caseId === 902) {
                assert.match(await shell.locator('#session-participation').innerText(),
                  language === 'pt' ? /lista de espera/i : /waitlist|waiting list/i,
                  'full session must explain the waiting list');
              }
            } else {
              assert.equal(await shell.locator('#session-participation button.primary-action').count(), 0,
                'already joined or finished sessions must not prompt another join');
              assert.equal(await shell.locator('.membership-status').count(), 1);
              await shell.locator('#session-participants .session-participant-list').first().waitFor();
              assert.equal(await shell.locator('.session-participant-list').first().innerText()
                .then(text => text.includes('@mobile-fixture')), true,
                'participant names are visible for a confirmed member');
              if (caseId === 903) {
                assert.equal(await shell.locator('.session-top-actions .session-inline-chat-toggle').count(), 1,
                  'future participant may open session chat');
              } else {
                assert.equal(await shell.locator('.session-top-actions .session-inline-chat-toggle').count(), 0,
                  'past session cannot reopen chat');
              }
            }
          }
          if (route === '/home') {
            assert.equal(await page.locator('.community-teaser').count(), 1,
              'Community teaser must remain in public homepage');
            assert.equal(await page.locator('.community-teaser-cta').getAttribute('href'),
              '/login/registerNewUser', 'CTA must keep registration destination');
          }
        }
        await context.close();
      }
    }
    assert.deepEqual(unexpectedWrites, [], 'Visual audit may not trigger business mutations');
    assert.deepEqual(browserErrors, [], 'Angular must not throw while rendering audited routes');
    console.log('PASS: 390px/768px/1366px PT/EN including four synthetic authenticated session states');
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
