import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, PageBreak } from 'docx';
import { saveAs } from 'file-saver';
import { Student, AnnualPlanData, MonthlyJournalData } from '../types';

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

export const generateAnnualWordSection = (selectedStudent: Student, annualData: AnnualPlanData, selectedYear: number) => {
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
            text: `${selectedYear}. 교육청 치료지원(마중물) 대상 연간 계획서`,
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
            children: [
              ['학생명', '생년월일', '소속 학교', '장애 유형', '치료 영역', '치료 일정'].map(text => 
                new TableCell({
                  children: [new Paragraph({ text, alignment: AlignmentType.CENTER })],
                  shading: { fill: "F1F5F9" },
                  borders,
                })
              )
            ].flat(),
          }),
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: selectedStudent.name, bold: true })], alignment: AlignmentType.CENTER })], borders }),
              new TableCell({ children: [new Paragraph({ text: selectedStudent.birthDate, alignment: AlignmentType.CENTER })], borders }),
              new TableCell({ children: [new Paragraph({ text: selectedStudent.school, alignment: AlignmentType.CENTER })], borders }),
              new TableCell({ children: [new Paragraph({ text: selectedStudent.disabilityType, alignment: AlignmentType.CENTER })], borders }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: selectedStudent.treatmentArea, bold: true })], alignment: AlignmentType.CENTER })], borders }),
              new TableCell({ 
                children: [
                  new Paragraph({ text: `요일: ${selectedStudent.schedule.day}` }),
                  new Paragraph({ text: `시간: ${selectedStudent.schedule.time}` }),
                  new Paragraph({ text: `시작: ${selectedYear}.3.` }),
                ], 
                borders 
              }),
            ],
          }),
        ],
      }),
      new Paragraph({ text: "", spacing: { before: 200 } }),
      new Paragraph({ children: [new TextRun({ text: "현행 수준 및 특성", bold: true })] }),
      ...annualData.currentLevel.map(text => new Paragraph({ text: `• ${text}`, indent: { left: 240 } })),
      new Paragraph({ text: "", spacing: { before: 200 } }),
      new Paragraph({ children: [new TextRun({ text: "장기 치료 목표", bold: true })] }),
      ...annualData.longTermGoals.map(text => new Paragraph({ text: `• ${text}`, indent: { left: 240 } })),
      new Paragraph({ text: "", spacing: { before: 200 } }),
      new Paragraph({ children: [new TextRun({ text: "연간 치료 계획", bold: true })] }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: ['월', '치료 영역', '단기 목표', '치료 내용'].map(text => 
              new TableCell({
                children: [new Paragraph({ text, alignment: AlignmentType.CENTER })],
                shading: { fill: "F1F5F9" },
                borders,
              })
            ),
          }),
          ...annualData.monthlyGoals.map(goal => new TableRow({
            children: [
              new TableCell({ children: [new Paragraph({ text: `${goal.month}월`, alignment: AlignmentType.CENTER })], borders }),
              new TableCell({ children: [new Paragraph({ text: goal.area || selectedStudent.monthlyAreas?.[goal.month] || selectedStudent.treatmentArea, alignment: AlignmentType.CENTER })], borders }),
              new TableCell({ children: [new Paragraph({ text: goal.goal })], borders }),
              new TableCell({ children: [new Paragraph({ text: goal.content })], borders }),
            ],
          })),
        ],
      }),
    ],
  };
};

export const generateMonthlyWordSection = (selectedStudent: Student, monthlyData: MonthlyJournalData, selectedYear: number, selectedMonth: number) => {
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
            text: `${selectedYear}. 교육청 치료지원(마중물) 대상 개별 치료 일지(${selectedMonth}월)`,
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
            children: ['학생명', '생년월일', '소속학교', '장애 유형', '치료 영역', '치료 일정'].map(text => 
              new TableCell({
                children: [new Paragraph({ text, alignment: AlignmentType.CENTER })],
                shading: { fill: "F1F5F9" },
                borders,
              })
            ),
          }),
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: selectedStudent.name, bold: true })], alignment: AlignmentType.CENTER })], borders }),
              new TableCell({ children: [new Paragraph({ text: selectedStudent.birthDate, alignment: AlignmentType.CENTER })], borders }),
              new TableCell({ children: [new Paragraph({ text: selectedStudent.school, alignment: AlignmentType.CENTER })], borders }),
              new TableCell({ children: [new Paragraph({ text: selectedStudent.disabilityType, alignment: AlignmentType.CENTER })], borders }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: selectedStudent.monthlyAreas?.[selectedMonth] || selectedStudent.treatmentArea, bold: true })], alignment: AlignmentType.CENTER })], borders }),
              new TableCell({ 
                children: [
                  new Paragraph({ text: `요일: ${selectedStudent.schedule.day}` }),
                  new Paragraph({ text: `시간: ${selectedStudent.schedule.time}` }),
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
              new TableCell({ children: [new Paragraph({ text: monthlyData.currentLevel })], borders }),
            ],
          }),
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "치료 목표", bold: true })] })], shading: { fill: "F1F5F9" }, borders }),
              new TableCell({ children: [new Paragraph({ text: monthlyData.monthlyGoal })], borders }),
            ],
          }),
        ],
      }),
      new Paragraph({ text: "", spacing: { before: 200 } }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: ['날짜', '치료 내용', '아동 반응', '비고'].map(text => 
              new TableCell({
                children: [new Paragraph({ text, alignment: AlignmentType.CENTER })],
                shading: { fill: "F1F5F9" },
                borders,
              })
            ),
          }),
          ...monthlyData.sessions.map(session => new TableRow({
            children: [
              new TableCell({ children: [new Paragraph({ text: session.date, alignment: AlignmentType.CENTER })], borders }),
              new TableCell({ children: [new Paragraph({ text: session.content })], borders }),
              new TableCell({ children: [new Paragraph({ text: session.reaction })], borders }),
              new TableCell({ children: [new Paragraph({ text: session.consultation })], borders }),
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
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "치료 결과", bold: true })] })], shading: { fill: "F1F5F9" }, borders, width: { size: 20, type: WidthType.PERCENTAGE } }),
              new TableCell({ children: [new Paragraph({ text: monthlyData.result })], borders }),
            ],
          }),
        ],
      }),
    ],
  };
};

export const exportMultiMonthDocs = async (
  selectedStudent: Student, 
  annualData: AnnualPlanData | null, 
  multiMonthData: { month: number; year: number; data: MonthlyJournalData }[], 
  includeAnnual: boolean,
  startMonth: number,
  endMonth: number
) => {
  const sections = [];

  if (includeAnnual && annualData) {
    sections.push(generateAnnualWordSection(selectedStudent, annualData, multiMonthData[0]?.year || new Date().getFullYear()));
  }

  for (const item of multiMonthData) {
    sections.push(generateMonthlyWordSection(selectedStudent, item.data, item.year, item.month));
  }

  const doc = new Document({ sections });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${selectedStudent.name}_일지_${startMonth}월-${endMonth}월.docx`);
};
