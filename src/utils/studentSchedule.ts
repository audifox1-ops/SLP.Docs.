export const WEEKDAY_OPTIONS = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'] as const;

const WEEKDAY_BY_INITIAL: Record<string, (typeof WEEKDAY_OPTIONS)[number]> = {
  월: '월요일',
  화: '화요일',
  수: '수요일',
  목: '목요일',
  금: '금요일',
  토: '토요일',
  일: '일요일',
};

export const normalizeScheduleDay = (value?: string) => {
  const text = String(value || '').trim();
  if (!text) return '';

  const compact = text.replace(/\s+/g, '');
  if ((WEEKDAY_OPTIONS as readonly string[]).includes(compact)) return compact;

  const initial = compact[0];
  if (compact.length === 1 && WEEKDAY_BY_INITIAL[initial]) return WEEKDAY_BY_INITIAL[initial];
  if (compact === `${initial}요일` && WEEKDAY_BY_INITIAL[initial]) return WEEKDAY_BY_INITIAL[initial];

  return text;
};

export const getScheduleDayNumber = (value?: string) => {
  const day = normalizeScheduleDay(value);
  const index = WEEKDAY_OPTIONS.findIndex(option => option === day);
  return index < 0 ? -1 : (index + 1) % 7;
};

export const normalizeScheduleTime = (value?: string) => String(value || '').trim();

export const normalizeScheduleFrequency = (value?: string) => {
  const text = String(value || '').trim();
  if (!text) return '1';
  const match = text.match(/\d+(?:\.\d+)?/);
  return match ? match[0] : text;
};
