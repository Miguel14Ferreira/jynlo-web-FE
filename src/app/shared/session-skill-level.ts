import { appTranslate as t } from '../i18n/i18n.service';

/** Level a session is aimed at. null/undefined = all levels welcome. */
export type SessionSkillLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
export const SESSION_SKILL_LEVELS: readonly SessionSkillLevel[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];

export function isSessionSkillLevel(value: unknown): value is SessionSkillLevel {
  return typeof value === 'string' && (SESSION_SKILL_LEVELS as readonly string[]).includes(value);
}

export function sessionSkillLevelLabel(level: string | null | undefined): string {
  return isSessionSkillLevel(level) ? t('sessionLevel.' + level) : t('sessionLevel.ALL');
}

/** Options for a select: "all levels" first (empty value). */
export function sessionSkillLevelOptions(allLabelKey = 'sessionLevel.ALL'): { value: string; label: string }[] {
  return [{ value: '', label: t(allLabelKey) }, ...SESSION_SKILL_LEVELS.map(l => ({ value: l, label: t('sessionLevel.' + l) }))];
}
