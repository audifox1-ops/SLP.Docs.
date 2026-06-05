import { saveAs } from 'file-saver';
import { MonthlyJournalData, MonthlyJournalTemplateSample, Student } from '../types';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const TEMPLATE_CACHE_NAME = 'slp-docs-monthly-template-v1';

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

const sanitizeTemplateValue = (value: string | number | undefined | null) => (
  value === undefined || value === null ? '' : String(value)
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

const fetchTemplateArrayBuffer = async (template: MonthlyJournalTemplateSample) => {
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

  return {
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
};

export const exportMonthlyJournalFromTemplate = async (
  template: MonthlyJournalTemplateSample,
  student: Student,
  monthlyData: MonthlyJournalData,
  selectedYear: number,
  selectedMonth: number
) => {
  if (template.fileType !== 'docx') {
    throw new Error('표와 제목을 100% 보존하는 자동 치환은 DOCX 샘플 양식에서만 지원됩니다.');
  }

  const arrayBuffer = await fetchTemplateArrayBuffer(template);
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

  doc.render(createMonthlyTemplateData(student, monthlyData, selectedYear, selectedMonth));

  const blob = doc.getZip().generate({
    type: 'blob',
    mimeType: DOCX_MIME,
  });

  saveAs(blob, `${student.name}_${selectedMonth}월_샘플양식_치료일지.docx`);
};
