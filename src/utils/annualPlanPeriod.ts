import { AnnualPlanData, Student } from '../types';

export interface AnnualPlanPeriod {
  startYear: number;
  startMonth: number;
  endYear: number;
  endMonth: number;
}

const DEFAULT_START_MONTH = 3;
const DEFAULT_END_MONTH = 2;
const MAX_PERIOD_MONTHS = 24;

const monthIndex = (year: number, month: number) => year * 12 + month;

export const normalizeAnnualPlanPeriod = (
  annualData: Partial<AnnualPlanData> | null | undefined,
  fallbackYear: number
): AnnualPlanPeriod => {
  const startYear = annualData?.startYear ?? fallbackYear;
  const startMonth = annualData?.startMonth ?? DEFAULT_START_MONTH;
  let endYear = annualData?.endYear ?? fallbackYear + 1;
  let endMonth = annualData?.endMonth ?? DEFAULT_END_MONTH;

  if (monthIndex(endYear, endMonth) < monthIndex(startYear, startMonth)) {
    endYear = startYear;
    endMonth = startMonth;
  }

  return { startYear, startMonth, endYear, endMonth };
};

export const formatAnnualPlanPeriod = (
  annualData: Partial<AnnualPlanData> | null | undefined,
  fallbackYear: number
) => {
  const period = normalizeAnnualPlanPeriod(annualData, fallbackYear);
  return `${period.startYear}.${period.startMonth}.~${period.endYear}.${period.endMonth}.`;
};

export const getAnnualPlanPeriodMonths = (
  annualData: Partial<AnnualPlanData> | null | undefined,
  fallbackYear: number
) => {
  const period = normalizeAnnualPlanPeriod(annualData, fallbackYear);
  const months: { year: number; month: number }[] = [];
  let currentYear = period.startYear;
  let currentMonth = period.startMonth;

  while (
    monthIndex(currentYear, currentMonth) <= monthIndex(period.endYear, period.endMonth) &&
    months.length < MAX_PERIOD_MONTHS
  ) {
    months.push({ year: currentYear, month: currentMonth });
    currentMonth += 1;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear += 1;
    }
  }

  return months;
};

export const ensureAnnualPlanPeriod = (
  annualData: AnnualPlanData,
  fallbackYear: number,
  student?: Student | null
): AnnualPlanData => {
  const period = normalizeAnnualPlanPeriod(annualData, fallbackYear);
  const periodMonths = getAnnualPlanPeriodMonths(period, fallbackYear);
  const monthlyGoals = periodMonths.map(({ year, month }) => {
    const exact = annualData.monthlyGoals.find(goal => goal.year === year && goal.month === month);
    const unscoped = annualData.monthlyGoals.find(goal => goal.year == null && goal.month === month);
    const existing = exact || unscoped;
    return {
      year,
      month,
      goal: existing?.goal || '',
      content: existing?.content || '',
      area: existing?.area || student?.monthlyAreas?.[month] || student?.treatmentArea || '',
      note: existing?.note || ''
    };
  });

  return {
    ...annualData,
    ...period,
    therapyPeriod: formatAnnualPlanPeriod(period, fallbackYear),
    monthlyGoals
  };
};

export const updateAnnualPlanPeriod = (
  annualData: AnnualPlanData,
  fallbackYear: number,
  student: Student,
  updates: Partial<AnnualPlanPeriod>
) => ensureAnnualPlanPeriod({ ...annualData, ...updates }, fallbackYear, student);
