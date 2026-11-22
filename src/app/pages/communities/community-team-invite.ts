import { appTranslate } from '../../i18n/i18n.service';
import { buildWhatsAppGroupShareUrl } from './community-group-invite';

/**
 * A shareable deep link, not an authorization token.
 * Only authenticated community members can accept a place, subject to roster limits.
 */
export function buildTournamentTeamInviteUrl(
  origin: string, communityId: number, tournamentId: number, teamId: number
): string {
  for (const id of [communityId, tournamentId, teamId]) {
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new Error('Invalid team invitation link');
    }
  }
  const url = new URL('/menu/communities/' + communityId, origin);
  url.searchParams.set('tab', 'tournaments');
  url.searchParams.set('tournament', String(tournamentId));
  url.searchParams.set('team', String(teamId));
  // New invites open the dedicated team profile. Keep `team` for older deep links.
  url.searchParams.set('teamPage', String(teamId));
  return url.toString();
}

export function teamInvitationWhatsAppUrl(
  communityName: string, tournamentName: string, teamName: string, url: string
): string {
  return buildWhatsAppGroupShareUrl(
    [appTranslate('🏆 Convido-te para a equipa "{{team}}"', {team: teamName}),
      appTranslate('Torneio: {{name}}', {name: tournamentName}),
      appTranslate('Comunidade: {{name}}', {name: communityName}),
      appTranslate('Abre o link para aceitares o convite. Se ainda não és membro, adere à comunidade primeiro.'),
      url].join('\n')
  );
}
