import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, PageBreak } from 'docx';
import { saveAs } from 'file-saver';
import { Student, AnnualPlanData, MonthlyJournalData, PaymentRecord } from '../types';
import { formatAnnualPlanPeriod } from './annualPlanPeriod';
import { applyDocumentStudentOverrides } from './documentStudentOverrides';

// 특수 문자 및 제어 문자 제거 (워드 파일 깨짐 방지)
const sanitizeText = (text: string | undefined): string => {
  if (!text) return "";
  // XML에서 허용되지 않는 제어 문자 제거 및 정규화
  return String(text)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u10000-\u10FFFF]/g, "");
};

const createBorder = () => ({
  style: BorderStyle.SINGLE,
  size: 1,
  color: "000000",
});

const borders = {
  top: createBorder(),
  bottom: createBorder(),
  left: createBorder(),
  right: createBorder(),
};

const formatScheduleFrequency = (value?: string) => {
  const text = value?.trim() || '';
  if (!text) return '';
  return text.includes('회') ? text : `주 ${text} 회`;
};

const pad2 = (value: number) => String(value).padStart(2, '0');

const formatPaymentDate = (value?: string) => {
  const text = String(value || '').trim();
  const match = text.match(/(?:(\d{2,4})[-./\s년]+)?(\d{1,2})[-./\s월]+(\d{1,2})/);
  if (!match) return sanitizeText(text || '-');
  const year = match[1] ? (match[1].length === 2 ? `20${match[1]}` : match[1]) : '';
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year) return sanitizeText(`${month}.${day}`);
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][new Date(Number(year), month - 1, day).getDay()];
  return sanitizeText(`${year}-${pad2(month)}-${pad2(day)} (${weekday})`);
};

const formatPaymentTime = (value?: string) => {
  const text = String(value || '').trim();
  const match = text.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  return sanitizeText(match ? `${match[1].padStart(2, '0')}:${match[2]}${match[3] ? `:${match[3]}` : ''}` : text || '-');
};

const formatPaymentAmount = (value: PaymentRecord['amount']) => {
  if (value === undefined || value === null || value === '') return '-';
  const numeric = typeof value === 'number' ? value : Number(String(value).replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(numeric)) return sanitizeText(String(value));
  return sanitizeText(`${new Intl.NumberFormat('ko-KR').format(numeric)}원`);
};

const formatSessionDateOnly = (value?: string) => {
  const text = String(value || '').trim();
  if (!text) return '';
  const dateText = text.split(/\n/)[0].replace(/\([^)]*\)/g, '').trim();
  const match = dateText.match(/(\d{1,2})\/(\d{1,2})/);
  return sanitizeText(match ? `${pad2(Number(match[1]))}/${pad2(Number(match[2]))}` : dateText);
};

const formatPaymentLine = (record: PaymentRecord, student: Student) => {
  const time = formatPaymentTime(record.transactionTime);
  const school = student.school ? sanitizeText(student.school) : '-';
  const studentName = student.name ? sanitizeText(student.name) : sanitizeText(record.studentName || '-');
  const area = record.treatmentArea ? sanitizeText(record.treatmentArea) : '-';
  const amount = formatPaymentAmount(record.amount);
  const therapist = student.therapistName ? sanitizeText(student.therapistName) : '-';
  return sanitizeText(`${formatPaymentDate(record.transactionDate)}\t${time}\t${school}\t${studentName}\t${amount}\t${area}\t${therapist}`);
};

export const generateAnnualWordSection = (selectedStudent: Student, annualData: AnnualPlanData, selectedYear: number) => {
  const documentStudent = applyDocumentStudentOverrides(selectedStudent, annualData.studentOverrides);
  const therapyPeriod = formatAnnualPlanPeriod(annualData, selectedYear);

  return {
    properties: {
      page: {
        margin: {
          top: 1134,
          right: 1134,
          bottom: 1134,
          left: 1134,
        },
      },
    },
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: sanitizeText(`${selectedYear}. 교육청 치료지원(마중물) 대상 연간 계획서`),
            bold: true,
            size: 32,
          }),
        ],
        spacing: { after: 400 },
      }),
      // Basic Info Table
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: ['학생명', '생년월일', '소속 학교 (유치원)', '장애 유형', '치료 영역', '치료 일정'].map(text =>
              new TableCell({
                children: [new Paragraph({ text: sanitizeText(text), alignment: AlignmentType.CENTER })],
                shading: { fill: "F1F5F9" },
                borders,
              })
            ).flat(),
          }),
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: sanitizeText(documentStudent.name), bold: true })], alignment: AlignmentType.CENTER })], borders }),
              new TableCell({ children: [new Paragraph({ text: sanitizeText(documentStudent.birthDate), alignment: AlignmentType.CENTER })], borders }),
              new TableCell({ children: [new Paragraph({ text: sanitizeText(documentStudent.school), alignment: AlignmentType.CENTER })], borders }),
              new TableCell({ children: [new Paragraph({ text: sanitizeText(documentStudent.disabilityType), alignment: AlignmentType.CENTER })], borders }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: sanitizeText(documentStudent.treatmentArea), bold: true })], alignment: AlignmentType.CENTER })], borders }),
              new TableCell({ 
                children: [
                  new Paragraph({ text: sanitizeText(`치료 기간: ${therapyPeriod}`) }),
                  new Paragraph({ text: sanitizeText(`치료사: ${documentStudent.therapistName}`) }),
                  new Paragraph({ text: sanitizeText(`복지부 바우처 이용 영역: ${documentStudent.voucherArea || documentStudent.treatmentArea}`) }),
                  new Paragraph({ text: sanitizeText(`요일: ${documentStudent.schedule.day}`) }),
                  new Paragraph({ text: sanitizeText(`시간: ${documentStudent.schedule.time}`) }),
                  new Paragraph({ text: sanitizeText(`횟수: ${formatScheduleFrequency(documentStudent.schedule.frequency)}`) }),
                ], 
                borders 
              }),
            ],
          }),
        ],
      }),
      new Paragraph({ text: "", spacing: { before: 200 } }),
      new Paragraph({ children: [new TextRun({ text: "현행 수준 및 특성", bold: true })] }),
      ...annualData.currentLevel.map(text => new Paragraph({ text: sanitizeText(`• ${text}`), indent: { left: 240 } })),
      new Paragraph({ text: "", spacing: { before: 200 } }),
      new Paragraph({ children: [new TextRun({ text: "장기 치료 목표", bold: true })] }),
      ...annualData.longTermGoals.map(text => new Paragraph({ text: sanitizeText(`• ${text}`), indent: { left: 240 } })),
      new Paragraph({ text: "", spacing: { before: 200 } }),
      new Paragraph({ children: [new TextRun({ text: "연간 치료 계획", bold: true })] }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: ['월', '단기 목표(월 목표)', '치료 내용', '비고'].map(text =>
              new TableCell({
                children: [new Paragraph({ text: sanitizeText(text), alignment: AlignmentType.CENTER })],
                shading: { fill: "F1F5F9" },
                borders,
              })
            ),
          }),
          ...annualData.monthlyGoals.map(goal => new TableRow({
            children: [
              new TableCell({ children: [new Paragraph({ text: sanitizeText(goal.year ? `${goal.year}.${goal.month}월` : `${goal.month}월`), alignment: AlignmentType.CENTER })], borders }),
              new TableCell({ children: [new Paragraph({ text: sanitizeText(goal.goal) })], borders }),
              new TableCell({ children: [new Paragraph({ text: sanitizeText(goal.content) })], borders }),
              new TableCell({ children: [new Paragraph({ text: sanitizeText(goal.note || '') })], borders }),
            ],
          })),
        ],
      }),
    ],
  };
};

export const generateMonthlyWordSection = (
  selectedStudent: Student,
  monthlyData: MonthlyJournalData,
  selectedYear: number,
  selectedMonth: number,
  paymentRecords: PaymentRecord[] = []
) => {
  const monthlyTreatmentArea = selectedStudent.monthlyAreas?.[selectedMonth] || selectedStudent.treatmentArea;
  const documentStudent = applyDocumentStudentOverrides(selectedStudent, monthlyData.studentOverrides, monthlyTreatmentArea);
  const therapyPeriod = monthlyData.therapyPeriod || `${selectedYear}.3.~`;
  const selectedMonthLabel = pad2(selectedMonth);

  return {
    properties: {
      page: {
        margin: {
          top: 1134,
          right: 1134,
          bottom: 1134,
          left: 1134,
        },
      },
    },
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: sanitizeText(`${selectedYear}. 교육청 치료지원 대상 개별 치료 일지(${selectedMonthLabel}월)`),
            bold: true,
            size: 32,
          }),
        ],
        spacing: { after: 400 },
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: ['학생명', '생년월일', '소속학교 (유치원)', '장애 유형', '치료 영역', '치료 일정'].map(text =>
              new TableCell({
                children: [new Paragraph({ text: sanitizeText(text), alignment: AlignmentType.CENTER })],
                shading: { fill: "F1F5F9" },
                borders,
              })
            ),
          }),
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: sanitizeText(documentStudent.name), bold: true })], alignment: AlignmentType.CENTER })], borders }),
              new TableCell({ children: [new Paragraph({ text: sanitizeText(documentStudent.birthDate), alignment: AlignmentType.CENTER })], borders }),
              new TableCell({ children: [new Paragraph({ text: sanitizeText(documentStudent.school), alignment: AlignmentType.CENTER })], borders }),
              new TableCell({ children: [new Paragraph({ text: sanitizeText(documentStudent.disabilityType), alignment: AlignmentType.CENTER })], borders }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: sanitizeText(documentStudent.treatmentArea), bold: true })], alignment: AlignmentType.CENTER })], borders }),
              new TableCell({ 
                children: [
                  new Paragraph({ text: sanitizeText(`치료 기간: ${therapyPeriod}`) }),
                  new Paragraph({ text: sanitizeText(`치료사: ${documentStudent.therapistName}`) }),
                  new Paragraph({ text: sanitizeText(`요일: ${documentStudent.schedule.day}`) }),
                  new Paragraph({ text: sanitizeText(`시간: ${documentStudent.schedule.time}`) }),
                  new Paragraph({ text: sanitizeText(`횟수: ${formatScheduleFrequency(documentStudent.schedule.frequency)}`) }),
                ], 
                borders 
              }),
            ],
          }),
        ],
      }),
      new Paragraph({ text: "", spacing: { before: 200 } }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "현행 수준", bold: true })] })], shading: { fill: "F1F5F9" }, borders, width: { size: 20, type: WidthType.PERCENTAGE } }),
              new TableCell({ children: [new Paragraph({ text: sanitizeText(monthlyData.currentLevel) })], borders }),
            ],
          }),
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `(${selectedMonthLabel})월 치료목표`, bold: true })] })], shading: { fill: "F1F5F9" }, borders }),
              new TableCell({ children: [new Paragraph({ text: sanitizeText(monthlyData.monthlyGoal) })], borders }),
            ],
          }),
        ],
      }),
      new Paragraph({ text: "", spacing: { before: 200 } }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: ['날짜', '치료 내용', '아동 반응', '비고(부모 상담)'].map(text =>
              new TableCell({
                children: [new Paragraph({ text: sanitizeText(text), alignment: AlignmentType.CENTER })],
                shading: { fill: "F1F5F9" },
                borders,
              })
            ),
          }),
          ...monthlyData.sessions.map(session => new TableRow({
            children: [
              new TableCell({ children: [new Paragraph({ text: formatSessionDateOnly(session.date), alignment: AlignmentType.CENTER })], borders }),
              new TableCell({ children: [new Paragraph({ text: sanitizeText(session.content) })], borders }),
              new TableCell({ children: [new Paragraph({ text: sanitizeText(session.reaction) })], borders }),
              new TableCell({ children: [new Paragraph({ text: sanitizeText(session.consultation) })], borders }),
            ],
          })),
        ],
      }),
      new Paragraph({ text: "", spacing: { before: 200 } }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `(${selectedMonthLabel})월 치료결과`, bold: true })] })], shading: { fill: "F1F5F9" }, borders, width: { size: 20, type: WidthType.PERCENTAGE } }),
              new TableCell({ children: [new Paragraph({ text: sanitizeText(monthlyData.result) })], borders }),
            ],
          }),
        ],
      }),
      new Paragraph({ text: "", spacing: { before: 200 } }),
      new Paragraph({
        children: [new TextRun({ text: "결제 내역", bold: true })],
        spacing: { after: 80 },
      }),
      ...(paymentRecords.length > 0
        ? [
          new Paragraph({
            children: [new TextRun({ text: "결제일\t시간\t소속\t학생명\t금액\t영역\t치료사", bold: true })],
            spacing: { after: 40 },
          }),
          ...paymentRecords.map(record => new Paragraph({
            text: formatPaymentLine(record, documentStudent),
            spacing: { after: 40 },
          })),
        ]
        : [
          new Paragraph({
            text: "선택한 월에 업로드된 결제 이력이 없습니다.",
            spacing: { after: 40 },
          }),
        ]),
    ],
  };
};

export const exportMultiMonthDocs = async (
  selectedStudent: Student, 
  annualData: AnnualPlanData | null, 
  multiMonthData: { month: number; year: number; data: MonthlyJournalData }[], 
  includeAnnual: boolean,
  startMonth: number,
  endMonth: number,
  paymentRecordsByMonth: Record<string, PaymentRecord[]> = {}
) => {
  const sections = [];

  if (includeAnnual && annualData) {
    sections.push(generateAnnualWordSection(selectedStudent, annualData, multiMonthData[0]?.year || new Date().getFullYear()));
  }

  for (const item of multiMonthData) {
    sections.push(generateMonthlyWordSection(
      selectedStudent,
      item.data,
      item.year,
      item.month,
      paymentRecordsByMonth[`${item.year}_${item.month}`] || []
    ));
  }

  const doc = new Document({ sections });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${selectedStudent.name}_일지_${startMonth}월-${endMonth}월.docx`);
};

export const createAnnualDocxBlob = async (
  selectedStudent: Student,
  annualData: AnnualPlanData,
  selectedYear: number
) => {
  const doc = new Document({
    sections: [generateAnnualWordSection(selectedStudent, annualData, selectedYear)],
  });
  return Packer.toBlob(doc);
};

export const createMonthlyDocxBlob = async (
  selectedStudent: Student,
  monthlyData: MonthlyJournalData,
  selectedYear: number,
  selectedMonth: number,
  paymentRecords: PaymentRecord[] = []
) => {
  const doc = new Document({
    sections: [generateMonthlyWordSection(selectedStudent, monthlyData, selectedYear, selectedMonth, paymentRecords)],
  });
  return Packer.toBlob(doc);
};

export const createCombinedAnnualMonthlyDocxBlob = async (
  selectedStudent: Student,
  annualData: AnnualPlanData,
  monthlyData: MonthlyJournalData,
  selectedYear: number,
  selectedMonth: number,
  paymentRecords: PaymentRecord[] = []
) => {
  const doc = new Document({
    sections: [
      generateAnnualWordSection(selectedStudent, annualData, selectedYear),
      generateMonthlyWordSection(selectedStudent, monthlyData, selectedYear, selectedMonth, paymentRecords),
    ],
  });
  return Packer.toBlob(doc);
};
