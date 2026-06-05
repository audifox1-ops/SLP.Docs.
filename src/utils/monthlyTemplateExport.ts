import { saveAs } from 'file-saver';
import { MonthlyJournalData, MonthlyJournalTemplateSample, Student } from '../types';
import { loadTemplateFileFromChunks } from '../services/templateFileService';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const HWPX_MIME = 'application/vnd.hancom.hwpx';
const TEMPLATE_CACHE_NAME = 'slp-docs-monthly-template-v2';
const MAX_FIXED_SESSION_PLACEHOLDERS = 12;

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

export const MONTHLY_FIXED_SESSION_PLACEHOLDER_EXAMPLES = [
  'session1Date',
  'session1Content',
  'session1Reaction',
  'session1Consultation',
] as const;

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

const fetchTemplateArrayBuffer = async (template: MonthlyJournalTemplateSample) => {
  if (template.storageMode === 'firestore-chunks') {
    return loadTemplateFileFromChunks('monthly_journal', template.chunkUploadId);
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

const renderHwpxTemplate = async (
  arrayBuffer: ArrayBuffer,
  data: ReturnType<typeof createMonthlyTemplateData>
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

export const exportMonthlyJournalFromTemplate = async (
  template: MonthlyJournalTemplateSample,
  student: Student,
  monthlyData: MonthlyJournalData,
  selectedYear: number,
  selectedMonth: number
) => {
  if (template.fileType === 'hwp') {
    throw new Error('HWP 원본(.hwp)은 샘플 양식의 주 형식으로 보관합니다. 자동 내용 치환은 한글에서 HWPX로 저장한 샘플(.hwpx)에서 지원됩니다.');
  }

  const arrayBuffer = await fetchTemplateArrayBuffer(template);

  if (template.fileType === 'hwpx') {
    const blob = await renderHwpxTemplate(
      arrayBuffer,
      createMonthlyTemplateData(student, monthlyData, selectedYear, selectedMonth)
    );
    saveAs(blob, `${student.name}_${selectedMonth}월_샘플양식_치료일지.hwpx`);
    return;
  }

  if (template.fileType !== 'docx') {
    throw new Error('자동 치환은 HWPX 또는 DOCX 샘플 양식에서 지원됩니다.');
  }

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
