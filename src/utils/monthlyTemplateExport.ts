import { saveAs } from 'file-saver';
import { AnnualPlanData, DocumentTemplateSample, MonthlyJournalData, MonthlyJournalTemplateSample, Student } from '../types';
import { formatAnnualPlanPeriod, normalizeAnnualPlanPeriod } from './annualPlanPeriod';
import { loadTemplateFileFromChunks } from '../services/templateFileService';
import { applyDocumentStudentOverrides } from './documentStudentOverrides';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const HWPX_MIME = 'application/vnd.hancom.hwpx';
const TEMPLATE_CACHE_NAME = 'slp-docs-monthly-template-v2';
const MAX_FIXED_SESSION_PLACEHOLDERS = 12;
const MAX_FIXED_ANNUAL_MONTH_PLACEHOLDERS = 12;
const HWPML_PARAGRAPH_NS = 'http://www.hancom.co.kr/hwpml/2011/paragraph';

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
  'month1Note',
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
type XmlParserLike = { parseFromString: (source: string, mimeType: string) => Document };
type XmlSerializerLike = { serializeToString: (node: Node) => string };

const sanitizeTemplateValue = (value: string | number | undefined | null) => (
  value === undefined || value === null ? '' : String(value)
);

const pad2 = (value: number) => String(value).padStart(2, '0');

const sanitizeTemplateDateOnly = (value: string | number | undefined | null) => (
  (() => {
    const dateText = sanitizeTemplateValue(value).split(/\n/)[0].replace(/\([^)]*\)/g, '').trim();
    const match = dateText.match(/(\d{1,2})\/(\d{1,2})/);
    return match ? `${pad2(Number(match[1]))}/${pad2(Number(match[2]))}` : dateText;
  })()
);

const escapeXml = (value: string) => (
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
);

const normalizeText = (value: string) => value.replace(/\s+/g, ' ').trim();
const compactText = (value: string) => normalizeText(value).replace(/\s/g, '');

const getLocalName = (node: Node) => (
  (node as Element).localName || node.nodeName.split(':').pop() || node.nodeName
);

const isElementNode = (node: Node): node is Element => node.nodeType === 1;

const childElementsByName = (element: Element, localName: string) => (
  Array.from(element.childNodes).filter((node): node is Element => (
    isElementNode(node) && getLocalName(node) === localName
  ))
);

const descendantElementsByName = (element: Element | Document, localName: string) => (
  Array.from(element.getElementsByTagName('*')).filter((node): node is Element => (
    getLocalName(node) === localName
  ))
);

const getNodeText = (node: Element | Node) => {
  if (!('getElementsByTagName' in node)) return '';
  return descendantElementsByName(node as Element, 't').map(textNode => textNode.textContent || '').join('');
};

const getCellText = (cell: Element) => normalizeText(getNodeText(cell));

const ensureCellTextElement = (cell: Element) => {
  const textNodes = descendantElementsByName(cell, 't');
  if (textNodes[0]) return textNodes[0];

  const run = descendantElementsByName(cell, 'run')[0];
  if (!run) return null;

  const owner = cell.ownerDocument;
  const prefix = run.prefix || 'hp';
  const textElement = owner.createElementNS(HWPML_PARAGRAPH_NS, `${prefix}:t`);
  run.appendChild(textElement);
  return textElement;
};

const setCellText = (cell: Element | undefined, value: string | undefined | null) => {
  if (!cell) return 0;
  const safeValue = sanitizeTemplateValue(value);
  const textNodes = descendantElementsByName(cell, 't');
  const firstTextNode = textNodes[0] || ensureCellTextElement(cell);
  if (!firstTextNode) return 0;

  const previous = getCellText(cell);
  firstTextNode.textContent = safeValue;
  textNodes.slice(1).forEach(textNode => {
    textNode.textContent = '';
  });

  return previous === normalizeText(safeValue) ? 0 : 1;
};

const setCellsAfter = (cells: Element[], index: number, value: string | undefined | null) => {
  let changes = setCellText(cells[index + 1], value);
  for (let nextIndex = index + 2; nextIndex < cells.length; nextIndex++) {
    changes += setCellText(cells[nextIndex], '');
  }
  return changes;
};

const getXmlTools = async () => {
  const ParserCtor = typeof DOMParser !== 'undefined'
    ? DOMParser
    : (await import('@xmldom/xmldom')).DOMParser;
  const SerializerCtor = typeof XMLSerializer !== 'undefined'
    ? XMLSerializer
    : (await import('@xmldom/xmldom')).XMLSerializer;

  return {
    parser: new ParserCtor() as XmlParserLike,
    serializer: new SerializerCtor() as XmlSerializerLike,
  };
};

const getSelectedTemplateMonth = (data: TemplateData) => {
  const value = data.monthlyMonth || data.month;
  const month = Number(value);
  return Number.isFinite(month) && month >= 1 && month <= 12 ? month : null;
};

const hasAnnualTemplateData = (data: TemplateData) => (
  Boolean(data.annualTitle || data.currentLevelText || data.longTermGoalsText || data.monthlyGoals)
);

const hasMonthlyTemplateData = (data: TemplateData) => (
  Boolean(data.monthlyTitle || data.month || data.monthlyGoal || data.sessions)
);

const getAnnualGoals = (data: TemplateData) => {
  const goals = data.annualMonthlyGoals || data.monthlyGoals;
  return Array.isArray(goals) ? goals : [];
};

const getMonthlySessions = (data: TemplateData) => {
  const sessions = data.monthlySessions || data.sessions;
  return Array.isArray(sessions) ? sessions : [];
};

const formatScheduleFrequency = (value: string | Record<string, string>[] | undefined) => {
  const text = sanitizeTemplateValue(value as string | undefined);
  if (!text) return '';
  return text.includes('회') ? text : `주${text}회`;
};

const getAnnualLevelText = (data: TemplateData) => (
  sanitizeTemplateValue((data.annualCurrentLevelText || data.currentLevelText || data.currentLevel) as string | undefined)
);

const getMonthlyLevelText = (data: TemplateData) => (
  sanitizeTemplateValue((data.monthlyCurrentLevel || data.currentLevel) as string | undefined)
);

const getAnnualTherapyPeriod = (data: TemplateData) => (
  sanitizeTemplateValue((data.annualTherapyPeriod || data.therapyPeriod) as string | undefined)
);

const getMonthlyTherapyPeriod = (data: TemplateData) => (
  sanitizeTemplateValue((data.therapyPeriod || data.annualTherapyPeriod) as string | undefined)
);

const removeIrrelevantSlpBlocks = (document: Document, data: TemplateData) => {
  const keepAnnual = hasAnnualTemplateData(data);
  const keepMonthly = hasMonthlyTemplateData(data);
  const selectedMonth = getSelectedTemplateMonth(data);
  let changes = 0;

  descendantElementsByName(document, 'sec').forEach(section => {
    let currentBlock: 'annual' | 'monthly' | null = null;
    let currentMonth: number | null = null;
    const nodes = Array.from(section.childNodes);

    nodes.forEach(node => {
      const text = normalizeText(getNodeText(node));
      const monthlyTitleMatch = text.match(/개별\s*치료\s*일지\s*\((\d{1,2})\s*월\)/);

      if (/연간\s*계획서/.test(text)) {
        currentBlock = 'annual';
        currentMonth = null;
      } else if (monthlyTitleMatch) {
        currentBlock = 'monthly';
        currentMonth = Number(monthlyTitleMatch[1]);
      }

      const shouldRemove =
        (currentBlock === 'annual' && !keepAnnual) ||
        (currentBlock === 'monthly' && (!keepMonthly || (selectedMonth !== null && currentMonth !== selectedMonth)));

      if (shouldRemove && node.parentNode) {
        node.parentNode.removeChild(node);
        changes++;
      }
    });
  });

  return changes;
};

const removeSamplePaymentLedgerParagraphs = (document: Document) => {
  let changes = 0;
  descendantElementsByName(document, 'sec').forEach(section => {
    Array.from(section.childNodes).forEach(node => {
      const text = normalizeText(getNodeText(node));
      if (/^\d{4}-\d{2}-\d{2}\s*\([^)]+\)\s*\/.*원\s*\/.*치료/.test(text) && node.parentNode) {
        node.parentNode.removeChild(node);
        changes++;
      }
    });
  });
  return changes;
};

const replaceSlpTitles = (document: Document, data: TemplateData) => {
  const annualTitle = sanitizeTemplateValue((data.annualTitle || data.title) as string | undefined);
  const monthlyTitle = sanitizeTemplateValue((data.monthlyTitle || data.title) as string | undefined);
  let changes = 0;

  descendantElementsByName(document, 't').forEach(textNode => {
    const text = normalizeText(textNode.textContent || '');
    if (annualTitle && /연간\s*계획서/.test(text)) {
      textNode.textContent = annualTitle;
      changes++;
    } else if (monthlyTitle && /개별\s*치료\s*일지\s*\(\d{1,2}\s*월\)/.test(text)) {
      textNode.textContent = monthlyTitle;
      changes++;
    }
  });

  return changes;
};

const fillStudentInfoTable = (rows: Element[][], tableText: string, data: TemplateData) => {
  const headerIndex = rows.findIndex(cells => (
    cells.some(cell => compactText(getCellText(cell)).includes('학생명')) &&
    cells.some(cell => compactText(getCellText(cell)).includes('생년월일'))
  ));
  if (headerIndex < 0) return 0;

  const isAnnualInfoTable = tableText.includes('복지부바우처') || tableText.includes('장기치료목표');
  let changes = 0;

  rows.slice(headerIndex + 1).forEach(cells => {
    if (cells.length >= 5) {
      changes += setCellText(cells[0], data.studentName as string);
      changes += setCellText(cells[1], data.birthDate as string);
      changes += setCellText(cells[2], data.school as string);
      changes += setCellText(cells[3], data.disabilityType as string);
      changes += setCellText(cells[4], data.treatmentArea as string);
    }

    cells.forEach((cell, index) => {
      const label = compactText(getCellText(cell));
      if (label === '치료기간') {
        changes += setCellText(cells[index + 1], isAnnualInfoTable ? getAnnualTherapyPeriod(data) : getMonthlyTherapyPeriod(data));
      } else if (label === '치료사') {
        changes += setCellText(cells[index + 1], data.therapistName as string);
      } else if (label === '요일') {
        changes += setCellText(cells[index + 1], data.scheduleDay as string);
      } else if (label === '시간') {
        changes += setCellText(cells[index + 1], data.scheduleTime as string);
      } else if (label === '횟수') {
        changes += setCellText(cells[index + 1], formatScheduleFrequency(data.scheduleFrequency));
      }
    });
  });

  return changes;
};

const fillDescriptionRows = (rows: Element[][], data: TemplateData) => {
  const selectedMonth = getSelectedTemplateMonth(data);
  let changes = 0;

  rows.forEach(cells => {
    if (cells.length < 2) return;
    const label = compactText(getCellText(cells[0]));

    if (label.includes('현행수준및특성')) {
      changes += setCellsAfter(cells, 0, getAnnualLevelText(data));
    } else if (label === '현행수준') {
      changes += setCellsAfter(cells, 0, getMonthlyLevelText(data));
    } else if (label.includes('장기치료목표')) {
      changes += setCellsAfter(cells, 0, data.annualLongTermGoalsText as string || data.longTermGoalsText as string);
    } else if (label.includes('월치료목표')) {
      if (selectedMonth) changes += setCellText(cells[0], `(${pad2(selectedMonth)})월 치료목표`);
      changes += setCellsAfter(cells, 0, data.monthlyGoal as string);
    } else if (label.includes('월치료결과')) {
      if (selectedMonth) changes += setCellText(cells[0], `(${pad2(selectedMonth)})월 치료결과`);
      changes += setCellsAfter(cells, 0, data.monthlyResult as string || data.result as string);
    }
  });

  return changes;
};

const fillAnnualGoalRows = (rows: Element[][], data: TemplateData) => {
  const goals = getAnnualGoals(data);
  if (goals.length === 0) return 0;

  const headerIndex = rows.findIndex(cells => {
    const labels = cells.map(cell => compactText(getCellText(cell)));
    return labels[0] === '월' && labels.some(label => label.includes('단기목표') || label.includes('월목표'));
  });
  if (headerIndex < 0) return 0;

  let changes = 0;
  rows.slice(headerIndex + 1).forEach(cells => {
    const monthMatch = getCellText(cells[0]).match(/(\d{1,2})\s*월/);
    if (!monthMatch) return;
    const month = Number(monthMatch[1]);
    const goal = goals.find(item => Number(item.monthNumber || item.month) === month);
    if (!goal) return;

    changes += setCellText(cells[0], `${month}월`);
    changes += setCellText(cells[1], goal.goal);
    changes += setCellText(cells[2], goal.content);
    if (cells[3]) changes += setCellText(cells[3], goal.note || '');
  });

  return changes;
};

const fillMonthlySessionRows = (rows: Element[][], data: TemplateData) => {
  const sessions = getMonthlySessions(data);
  if (sessions.length === 0) return 0;

  const headerIndex = rows.findIndex(cells => {
    const labels = cells.map(cell => compactText(getCellText(cell)));
    return labels.includes('날짜') && labels.includes('치료내용') && labels.includes('아동반응');
  });
  if (headerIndex < 0) return 0;

  let changes = 0;
  rows.slice(headerIndex + 1).forEach((cells, index) => {
    if (cells.length < 4) return;
    const session = sessions[index];
    changes += setCellText(cells[0], sanitizeTemplateDateOnly(session?.date));
    changes += setCellText(cells[1], session?.content || '');
    changes += setCellText(cells[2], session?.reaction || '');
    changes += setCellText(cells[3], session?.consultation || '');
  });

  return changes;
};

const applySemanticSlpTemplateData = async (xml: string, data: TemplateData) => {
  const { parser, serializer } = await getXmlTools();
  const document = parser.parseFromString(xml, 'application/xml');
  let changes = 0;

  changes += removeIrrelevantSlpBlocks(document, data);
  changes += removeSamplePaymentLedgerParagraphs(document);
  changes += replaceSlpTitles(document, data);

  descendantElementsByName(document, 'tbl').forEach(table => {
    const rows = childElementsByName(table, 'tr').map(row => childElementsByName(row, 'tc'));
    const tableText = compactText(getNodeText(table));
    changes += fillStudentInfoTable(rows, tableText, data);
    changes += fillDescriptionRows(rows, data);
    changes += fillAnnualGoalRows(rows, data);
    changes += fillMonthlySessionRows(rows, data);
  });

  return {
    xml: changes > 0 ? serializer.serializeToString(document) : xml,
    changes,
  };
};

const countOccurrences = (source: string, needle: string) => {
  if (!needle) return 0;
  return source.split(needle).length - 1;
};

const createPreviewText = (data: TemplateData) => {
  const lines: string[] = [];
  const annualTitle = sanitizeTemplateValue((data.annualTitle || data.title) as string | undefined);
  const monthlyTitle = sanitizeTemplateValue((data.monthlyTitle || data.title) as string | undefined);

  if (hasAnnualTemplateData(data)) {
    lines.push(annualTitle, sanitizeTemplateValue(data.studentName as string), getAnnualTherapyPeriod(data));
    const annualLevel = getAnnualLevelText(data);
    const longTermGoals = sanitizeTemplateValue((data.annualLongTermGoalsText || data.longTermGoalsText) as string | undefined);
    if (annualLevel) lines.push(annualLevel);
    if (longTermGoals) lines.push(longTermGoals);
    getAnnualGoals(data).forEach(goal => {
      const monthText = sanitizeTemplateValue(goal.month || goal.monthNumber);
      lines.push(`${monthText.includes('월') ? monthText : `${monthText}월`} ${goal.goal || ''} ${goal.content || ''}`.trim());
    });
  }

  if (hasMonthlyTemplateData(data)) {
    lines.push(monthlyTitle, sanitizeTemplateValue(data.studentName as string), getMonthlyTherapyPeriod(data));
    const monthlyLevel = getMonthlyLevelText(data);
    if (monthlyLevel) lines.push(monthlyLevel);
    if (data.monthlyGoal) lines.push(sanitizeTemplateValue(data.monthlyGoal as string));
    getMonthlySessions(data).forEach(session => {
      lines.push(`${session.date || ''} ${session.content || ''} ${session.reaction || ''} ${session.consultation || ''}`.trim());
    });
    const monthlyResult = sanitizeTemplateValue((data.monthlyResult || data.result) as string | undefined);
    if (monthlyResult) lines.push(monthlyResult);
  }

  return lines.filter(Boolean).join('\r\n');
};

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
  template?.applyMode === 'hwp-template' || template?.applyMode === 'hwpx-template' || template?.applyMode === 'docx-template'
);

export const createMonthlyTemplateData = (
  student: Student,
  monthlyData: MonthlyJournalData,
  selectedYear: number,
  selectedMonth: number
) => {
  const treatmentArea = student.monthlyAreas?.[selectedMonth] || student.treatmentArea;
  const documentStudent = applyDocumentStudentOverrides(student, monthlyData.studentOverrides, treatmentArea);
  const selectedMonthLabel = pad2(selectedMonth);
  const sessions = monthlyData.sessions.map((session, index) => ({
    index: String(index + 1),
    date: sanitizeTemplateDateOnly(session.date),
    content: sanitizeTemplateValue(session.content),
    reaction: sanitizeTemplateValue(session.reaction),
    consultation: sanitizeTemplateValue(session.consultation),
  }));

  const data: Record<string, string | typeof sessions> = {
    title: `${selectedYear}. 교육청 치료지원 대상 개별 치료 일지(${selectedMonthLabel}월)`,
    year: String(selectedYear),
    month: selectedMonthLabel,
    studentName: sanitizeTemplateValue(documentStudent.name),
    birthDate: sanitizeTemplateValue(documentStudent.birthDate),
    school: sanitizeTemplateValue(documentStudent.school),
    disabilityType: sanitizeTemplateValue(documentStudent.disabilityType),
    treatmentArea: sanitizeTemplateValue(documentStudent.treatmentArea),
    therapyPeriod: sanitizeTemplateValue(monthlyData.therapyPeriod ?? `${selectedYear}.3.~`),
    therapistName: sanitizeTemplateValue(documentStudent.therapistName),
    scheduleDay: sanitizeTemplateValue(documentStudent.schedule.day),
    scheduleTime: sanitizeTemplateValue(documentStudent.schedule.time),
    scheduleFrequency: sanitizeTemplateValue(documentStudent.schedule.frequency),
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
  const documentStudent = applyDocumentStudentOverrides(student, annualData.studentOverrides);
  const annualPeriod = normalizeAnnualPlanPeriod(annualData, selectedYear);
  const monthlyGoals = annualData.monthlyGoals.map(goal => ({
    year: String(goal.year || selectedYear),
    month: `${goal.month}월`,
    monthNumber: String(goal.month),
    yearMonth: `${goal.year || selectedYear}.${goal.month}월`,
    goal: sanitizeTemplateValue(goal.goal),
    content: sanitizeTemplateValue(goal.content),
    area: sanitizeTemplateValue(goal.area || documentStudent.monthlyAreas?.[goal.month] || documentStudent.treatmentArea),
    note: sanitizeTemplateValue(goal.note),
  }));

  const data: TemplateData = {
    title: `${selectedYear}. 교육청 치료지원(마중물) 대상 연간 계획서`,
    year: String(selectedYear),
    studentName: sanitizeTemplateValue(documentStudent.name),
    birthDate: sanitizeTemplateValue(documentStudent.birthDate),
    school: sanitizeTemplateValue(documentStudent.school),
    disabilityType: sanitizeTemplateValue(documentStudent.disabilityType),
    treatmentArea: sanitizeTemplateValue(documentStudent.treatmentArea),
    therapyPeriod: formatAnnualPlanPeriod(annualData, selectedYear),
    startYear: String(annualPeriod.startYear),
    startMonth: String(annualPeriod.startMonth),
    endYear: String(annualPeriod.endYear),
    endMonth: String(annualPeriod.endMonth),
    therapistName: sanitizeTemplateValue(documentStudent.therapistName),
    scheduleDay: sanitizeTemplateValue(documentStudent.schedule.day),
    scheduleTime: sanitizeTemplateValue(documentStudent.schedule.time),
    scheduleFrequency: sanitizeTemplateValue(documentStudent.schedule.frequency),
    currentLevelText: annualData.currentLevel.map(sanitizeTemplateValue).join('\n'),
    longTermGoalsText: annualData.longTermGoals.map(sanitizeTemplateValue).join('\n'),
    monthlyGoals,
    monthlyGoalsText: monthlyGoals
      .map(goal => `${goal.month} ${goal.area}\n목표: ${goal.goal}\n내용: ${goal.content}${goal.note ? `\n비고: ${goal.note}` : ''}`)
      .join('\n\n'),
  };

  Array.from({ length: MAX_FIXED_ANNUAL_MONTH_PLACEHOLDERS }).forEach((_, index) => {
    const monthNumber = index + 1;
    const goal = annualData.monthlyGoals.find(item => item.month === monthNumber);
    data[`month${monthNumber}Year`] = goal?.year ? String(goal.year) : String(selectedYear);
    data[`month${monthNumber}YearMonth`] = goal ? `${goal.year || selectedYear}.${goal.month}월` : '';
    data[`month${monthNumber}Goal`] = goal?.goal || '';
    data[`month${monthNumber}Content`] = goal?.content || '';
    data[`month${monthNumber}Area`] = goal?.area || documentStudent.monthlyAreas?.[monthNumber] || documentStudent.treatmentArea || '';
    data[`month${monthNumber}Note`] = goal?.note || '';
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
  let replacementCount = 0;
  let semanticChangeCount = 0;

  for (const file of files) {
    const original = file.asText();
    let next = original;

    Object.entries(data).forEach(([key, value]) => {
      if (Array.isArray(value)) return;
      const placeholder = `{{${key}}}`;
      replacementCount += countOccurrences(next, placeholder);
      next = next.split(placeholder).join(escapeXml(value));
    });

    if (/^Contents\/section.*\.xml$/i.test(file.name)) {
      const semanticResult = await applySemanticSlpTemplateData(next, data);
      next = semanticResult.xml;
      semanticChangeCount += semanticResult.changes;
    }

    if (next !== original) {
      zip.file(file.name, next);
    }
  }

  if (replacementCount === 0 && semanticChangeCount === 0) {
    throw new Error('샘플 양식에서 자동으로 바꿀 수 있는 placeholder 또는 치료 서류 표 구조를 찾지 못했습니다.');
  }

  const previewTextFile = zip.file('Preview/PrvText.txt');
  if (previewTextFile) {
    zip.file('Preview/PrvText.txt', createPreviewText(data));
  }

  return zip.generate({
    type: 'blob',
    mimeType: HWPX_MIME,
  });
};

const convertHwpToHwpx = async (arrayBuffer: ArrayBuffer, fileName: string) => {
  const { hwpToHwpx } = await import('@ssabrojs/hwpxjs/browser');
  const bytes = new Uint8Array(arrayBuffer);
  const converted = await hwpToHwpx(bytes, {
    title: fileName.replace(/\.hwp$/i, ''),
    creator: 'SLP Docs',
  });

  return converted.buffer.slice(converted.byteOffset, converted.byteOffset + converted.byteLength);
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
  const arrayBuffer = await fetchTemplateArrayBuffer(template);

  if (template.fileType === 'hwp') {
    return {
      blob: await renderHwpxTemplate(await convertHwpToHwpx(arrayBuffer, template.fileName), data),
      extension: 'hwpx',
    };
  }

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

  throw new Error('자동 치환은 HWP, HWPX 또는 DOCX 샘플 양식에서 지원됩니다.');
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
