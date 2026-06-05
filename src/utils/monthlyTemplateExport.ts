import { saveAs } from 'file-saver';
import { AnnualPlanData, DocumentTemplateSample, MonthlyJournalData, MonthlyJournalTemplateSample, Student } from '../types';
import { formatAnnualPlanPeriod, normalizeAnnualPlanPeriod } from './annualPlanPeriod';
import { loadTemplateFileFromChunks } from '../services/templateFileService';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const HWPX_MIME = 'application/vnd.hancom.hwpx';
const TEMPLATE_CACHE_NAME = 'slp-docs-monthly-template-v2';
const MAX_FIXED_SESSION_PLACEHOLDERS = 12;
const MAX_FIXED_ANNUAL_MONTH_PLACEHOLDERS = 12;

export const MONTHLY_TEMPLATE_PLACEHOLDERS = [
  'title',
  'year',
  'month',
  'studentName',
  'birthDate',
  'school',
  'disabilityType',
  'treatmentArea',
  'therapyPeriod',
  'startYear',
  'startMonth',
  'endYear',
  'endMonth',
  'therapistName',
  'scheduleDay',
  'scheduleTime',
  'scheduleFrequency',
  'currentLevel',
  'monthlyGoal',
  'result',
  'sessionsText',
  'sessions',
] as const;

export const MONTHLY_FIXED_SESSION_PLACEHOLDER_EXAMPLES = [
  'session1Date',
  'session1Content',
  'session1Reaction',
  'session1Consultation',
] as const;

export const ANNUAL_TEMPLATE_PLACEHOLDERS = [
  'title',
  'year',
  'studentName',
  'birthDate',
  'school',
  'disabilityType',
  'treatmentArea',
  'therapyPeriod',
  'therapistName',
  'scheduleDay',
  'scheduleTime',
  'scheduleFrequency',
  'currentLevelText',
  'longTermGoalsText',
  'monthlyGoalsText',
  'monthlyGoals',
] as const;

export const ANNUAL_FIXED_MONTH_PLACEHOLDER_EXAMPLES = [
  'month1Year',
  'month1Goal',
  'month1Content',
  'month1Area',
] as const;

export const COMBINED_TEMPLATE_PLACEHOLDERS = [
  'studentName',
  'birthDate',
  'school',
  'disabilityType',
  'treatmentArea',
  'therapistName',
  'scheduleDay',
  'scheduleTime',
  'scheduleFrequency',
  'annualTitle',
  'annualYear',
  'annualTherapyPeriod',
  'annualStartYear',
  'annualStartMonth',
  'annualEndYear',
  'annualEndMonth',
  'annualCurrentLevelText',
  'annualLongTermGoalsText',
  'annualMonthlyGoalsText',
  'monthlyTitle',
  'monthlyYear',
  'monthlyMonth',
  'monthlyCurrentLevel',
  'monthlyGoal',
  'monthlyResult',
  'sessionsText',
  'sessions',
  'monthlyGoals',
] as const;

export const COMBINED_FIXED_PLACEHOLDER_EXAMPLES = [
  'month1Goal',
  'month1Content',
  'session1Date',
  'session1Content',
] as const;

type TemplateData = Record<string, string | Record<string, string>[]>;

const sanitizeTemplateValue = (value: string | number | undefined | null) => (
  value === undefined || value === null ? '' : String(value)
);

const escapeXml = (value: string) => (
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
);

const getCache = async () => {
  if (typeof window === 'undefined' || !('caches' in window)) return null;
  return window.caches.open(TEMPLATE_CACHE_NAME);
};

export const cacheMonthlyTemplateFile = async (fileUrl: string, file: File) => {
  const cache = await getCache();
  if (!cache) return;

  await cache.put(
    fileUrl,
    new Response(file, {
      headers: { 'Content-Type': file.type || DOCX_MIME },
    })
  );
};

const fetchTemplateArrayBuffer = async (template: DocumentTemplateSample) => {
  if (template.storageMode === 'firestore-chunks') {
    return loadTemplateFileFromChunks(template.templateKind || 'monthly_journal', template.chunkUploadId);
  }

  const cache = await getCache();
  const cached = cache ? await cache.match(template.fileUrl) : null;
  if (cached) return cached.arrayBuffer();

  const response = await fetch(template.fileUrl);
  if (!response.ok) {
    throw new Error(`샘플 양식 파일을 불러오지 못했습니다. (${response.status})`);
  }

  if (cache) await cache.put(template.fileUrl, response.clone());
  return response.arrayBuffer();
};

export const canApplyTemplateAutomatically = (template: DocumentTemplateSample | null | undefined) => (
  template?.applyMode === 'hwpx-template' || template?.applyMode === 'docx-template'
);

export const createMonthlyTemplateData = (
  student: Student,
  monthlyData: MonthlyJournalData,
  selectedYear: number,
  selectedMonth: number
) => {
  const treatmentArea = student.monthlyAreas?.[selectedMonth] || student.treatmentArea;
  const sessions = monthlyData.sessions.map((session, index) => ({
    index: String(index + 1),
    date: sanitizeTemplateValue(session.date),
    content: sanitizeTemplateValue(session.content),
    reaction: sanitizeTemplateValue(session.reaction),
    consultation: sanitizeTemplateValue(session.consultation),
  }));

  const data: Record<string, string | typeof sessions> = {
    title: `${selectedYear}. 교육청 치료지원(마중물) 대상 개별 치료 일지(${selectedMonth}월)`,
    year: String(selectedYear),
    month: String(selectedMonth),
    studentName: sanitizeTemplateValue(student.name),
    birthDate: sanitizeTemplateValue(student.birthDate),
    school: sanitizeTemplateValue(student.school),
    disabilityType: sanitizeTemplateValue(student.disabilityType),
    treatmentArea: sanitizeTemplateValue(treatmentArea),
    therapyPeriod: sanitizeTemplateValue(monthlyData.therapyPeriod ?? `${selectedYear}.3.~`),
    therapistName: sanitizeTemplateValue(student.therapistName),
    scheduleDay: sanitizeTemplateValue(student.schedule.day),
    scheduleTime: sanitizeTemplateValue(student.schedule.time),
    scheduleFrequency: sanitizeTemplateValue(student.schedule.frequency),
    currentLevel: sanitizeTemplateValue(monthlyData.currentLevel),
    monthlyGoal: sanitizeTemplateValue(monthlyData.monthlyGoal),
    result: sanitizeTemplateValue(monthlyData.result),
    sessions,
    sessionsText: sessions
      .map(session => `${session.date}\n치료 내용: ${session.content}\n아동 반응: ${session.reaction}\n비고: ${session.consultation}`)
      .join('\n\n'),
  };

  Array.from({ length: MAX_FIXED_SESSION_PLACEHOLDERS }).forEach((_, index) => {
    const session = sessions[index];
    const num = index + 1;
    data[`session${num}Date`] = session?.date || '';
    data[`session${num}Content`] = session?.content || '';
    data[`session${num}Reaction`] = session?.reaction || '';
    data[`session${num}Consultation`] = session?.consultation || '';
  });

  return data;
};

export const createAnnualTemplateData = (
  student: Student,
  annualData: AnnualPlanData,
  selectedYear: number
) => {
  const annualPeriod = normalizeAnnualPlanPeriod(annualData, selectedYear);
  const monthlyGoals = annualData.monthlyGoals.map(goal => ({
    year: String(goal.year || selectedYear),
    month: `${goal.month}월`,
    monthNumber: String(goal.month),
    yearMonth: `${goal.year || selectedYear}.${goal.month}월`,
    goal: sanitizeTemplateValue(goal.goal),
    content: sanitizeTemplateValue(goal.content),
    area: sanitizeTemplateValue(goal.area || student.monthlyAreas?.[goal.month] || student.treatmentArea),
  }));

  const data: TemplateData = {
    title: `${selectedYear}. 교육청 치료지원(마중물) 대상 연간 계획서`,
    year: String(selectedYear),
    studentName: sanitizeTemplateValue(student.name),
    birthDate: sanitizeTemplateValue(student.birthDate),
    school: sanitizeTemplateValue(student.school),
    disabilityType: sanitizeTemplateValue(student.disabilityType),
    treatmentArea: sanitizeTemplateValue(student.treatmentArea),
    therapyPeriod: formatAnnualPlanPeriod(annualData, selectedYear),
    startYear: String(annualPeriod.startYear),
    startMonth: String(annualPeriod.startMonth),
    endYear: String(annualPeriod.endYear),
    endMonth: String(annualPeriod.endMonth),
    therapistName: sanitizeTemplateValue(student.therapistName),
    scheduleDay: sanitizeTemplateValue(student.schedule.day),
    scheduleTime: sanitizeTemplateValue(student.schedule.time),
    scheduleFrequency: sanitizeTemplateValue(student.schedule.frequency),
    currentLevelText: annualData.currentLevel.map(sanitizeTemplateValue).join('\n'),
    longTermGoalsText: annualData.longTermGoals.map(sanitizeTemplateValue).join('\n'),
    monthlyGoals,
    monthlyGoalsText: monthlyGoals
      .map(goal => `${goal.month} ${goal.area}\n목표: ${goal.goal}\n내용: ${goal.content}`)
      .join('\n\n'),
  };

  Array.from({ length: MAX_FIXED_ANNUAL_MONTH_PLACEHOLDERS }).forEach((_, index) => {
    const monthNumber = index + 1;
    const goal = annualData.monthlyGoals.find(item => item.month === monthNumber);
    data[`month${monthNumber}Year`] = goal?.year ? String(goal.year) : String(selectedYear);
    data[`month${monthNumber}YearMonth`] = goal ? `${goal.year || selectedYear}.${goal.month}월` : '';
    data[`month${monthNumber}Goal`] = goal?.goal || '';
    data[`month${monthNumber}Content`] = goal?.content || '';
    data[`month${monthNumber}Area`] = goal?.area || student.monthlyAreas?.[monthNumber] || student.treatmentArea || '';
  });

  return data;
};

export const createCombinedTemplateData = (
  student: Student,
  annualData: AnnualPlanData,
  monthlyData: MonthlyJournalData,
  selectedYear: number,
  selectedMonth: number
) => {
  const annualDataMap = createAnnualTemplateData(student, annualData, selectedYear);
  const monthlyDataMap = createMonthlyTemplateData(student, monthlyData, selectedYear, selectedMonth);

  return {
    ...annualDataMap,
    ...monthlyDataMap,
    annualTitle: String(annualDataMap.title || ''),
    annualYear: String(annualDataMap.year || ''),
    annualCurrentLevelText: String(annualDataMap.currentLevelText || ''),
    annualLongTermGoalsText: String(annualDataMap.longTermGoalsText || ''),
    annualMonthlyGoalsText: String(annualDataMap.monthlyGoalsText || ''),
    annualMonthlyGoals: annualDataMap.monthlyGoals as Record<string, string>[],
    annualTherapyPeriod: String(annualDataMap.therapyPeriod || ''),
    annualStartYear: String(annualDataMap.startYear || ''),
    annualStartMonth: String(annualDataMap.startMonth || ''),
    annualEndYear: String(annualDataMap.endYear || ''),
    annualEndMonth: String(annualDataMap.endMonth || ''),
    monthlyTitle: String(monthlyDataMap.title || ''),
    monthlyYear: String(monthlyDataMap.year || ''),
    monthlyMonth: String(monthlyDataMap.month || ''),
    monthlyCurrentLevel: String(monthlyDataMap.currentLevel || ''),
    monthlyGoal: String(monthlyDataMap.monthlyGoal || ''),
    monthlyResult: String(monthlyDataMap.result || ''),
    monthlySessions: monthlyDataMap.sessions as Record<string, string>[],
  } satisfies TemplateData;
};

const renderHwpxTemplate = async (
  arrayBuffer: ArrayBuffer,
  data: TemplateData
) => {
  const { default: PizZip } = await import('pizzip');
  const zip = new PizZip(arrayBuffer);
  const files = zip.file(/\.(xml|rels)$/i);

  files.forEach(file => {
    const original = file.asText();
    let next = original;

    Object.entries(data).forEach(([key, value]) => {
      if (Array.isArray(value)) return;
      next = next.split(`{{${key}}}`).join(escapeXml(value));
    });

    if (next !== original) {
      zip.file(file.name, next);
    }
  });

  return zip.generate({
    type: 'blob',
    mimeType: HWPX_MIME,
  });
};

const renderDocxTemplate = async (
  arrayBuffer: ArrayBuffer,
  data: TemplateData
) => {
  const [{ default: Docxtemplater }, { default: PizZip }] = await Promise.all([
    import('docxtemplater'),
    import('pizzip'),
  ]);
  const zip = new PizZip(arrayBuffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{{', end: '}}' },
    nullGetter: () => '',
  });

  doc.render(data);

  return doc.getZip().generate({
    type: 'blob',
    mimeType: DOCX_MIME,
  });
};

const createTemplateBlob = async (
  template: DocumentTemplateSample,
  data: TemplateData
) => {
  if (template.fileType === 'hwp') {
    throw new Error('HWP 원본(.hwp)은 샘플로 보관되지만 자동 내용 치환은 지원되지 않습니다. 한글에서 HWPX로 저장한 샘플(.hwpx)을 업로드해 주세요.');
  }

  const arrayBuffer = await fetchTemplateArrayBuffer(template);

  if (template.fileType === 'hwpx') {
    return {
      blob: await renderHwpxTemplate(arrayBuffer, data),
      extension: 'hwpx',
    };
  }

  if (template.fileType === 'docx') {
    return {
      blob: await renderDocxTemplate(arrayBuffer, data),
      extension: 'docx',
    };
  }

  throw new Error('자동 치환은 HWPX 또는 DOCX 샘플 양식에서 지원됩니다.');
};

export const createAnnualPlanTemplateBlob = async (
  template: DocumentTemplateSample,
  student: Student,
  annualData: AnnualPlanData,
  selectedYear: number
) => (
  createTemplateBlob(template, createAnnualTemplateData(student, annualData, selectedYear))
);

export const createMonthlyJournalTemplateBlob = async (
  template: MonthlyJournalTemplateSample,
  student: Student,
  monthlyData: MonthlyJournalData,
  selectedYear: number,
  selectedMonth: number
) => (
  createTemplateBlob(template, createMonthlyTemplateData(student, monthlyData, selectedYear, selectedMonth))
);

export const createCombinedJournalTemplateBlob = async (
  template: DocumentTemplateSample,
  student: Student,
  annualData: AnnualPlanData,
  monthlyData: MonthlyJournalData,
  selectedYear: number,
  selectedMonth: number
) => (
  createTemplateBlob(
    template,
    createCombinedTemplateData(student, annualData, monthlyData, selectedYear, selectedMonth)
  )
);

export const exportAnnualPlanFromTemplate = async (
  template: DocumentTemplateSample,
  student: Student,
  annualData: AnnualPlanData,
  selectedYear: number
) => {
  const { blob, extension } = await createAnnualPlanTemplateBlob(template, student, annualData, selectedYear);
  saveAs(blob, `${student.name}_샘플양식_연간계획서.${extension}`);
};

export const exportMonthlyJournalFromTemplate = async (
  template: MonthlyJournalTemplateSample,
  student: Student,
  monthlyData: MonthlyJournalData,
  selectedYear: number,
  selectedMonth: number
) => {
  const { blob, extension } = await createMonthlyJournalTemplateBlob(
    template,
    student,
    monthlyData,
    selectedYear,
    selectedMonth
  );

  saveAs(blob, `${student.name}_${selectedMonth}월_샘플양식_치료일지.${extension}`);
};

export const exportCombinedJournalFromTemplate = async (
  template: DocumentTemplateSample,
  student: Student,
  annualData: AnnualPlanData,
  monthlyData: MonthlyJournalData,
  selectedYear: number,
  selectedMonth: number
) => {
  const { blob, extension } = await createCombinedJournalTemplateBlob(
    template,
    student,
    annualData,
    monthlyData,
    selectedYear,
    selectedMonth
  );

  saveAs(blob, `${student.name}_${selectedMonth}월_샘플양식_연간월간.${extension}`);
};
