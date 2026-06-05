export interface PaymentRecord {
  id?: string;
  studentName: string;
  transactionDate: string;
  transactionTime?: string;  // 거래시간 (HH:MM:SS 형식)
  amount: number | string;
  treatmentArea: string;
  createdAt: any;
}

export interface StudentInfo {
  name: string;
  birthDate: string;
  school: string;
  disabilityType: string;
  treatmentArea: string;
  therapistName: string;
  scheduleTime?: string;       // 현재 수업 시간 (예: 17:40~18:20)
  scheduleDay?: string;        // 요일 (예: 목요일)
  scheduleFrequency?: string;  // 횟수 (예: 주 1 회)
  // 기간별 수업 시간 이력 (기간마다 시간·영역이 다른 학생용)
  scheduleTimeHistory?: {
    fromYear: number;   // 시작 연도
    fromMonth: number;  // 시작 월
    toYear?: number;    // 종료 연도 (없으면 현재까지)
    toMonth?: number;   // 종료 월 (없으면 현재까지)
    time: string;       // 수업 시간 (예: 17:20~18:00)
    treatmentArea?: string; // 해당 기간 영역 (예: 미술치료)
  }[];
  referenceData?: string;      // 과거 치료 기록 텍스트
  referenceFileName?: string;  // 업로드된 파일명
  specialNotes?: string;       // 치료 관찰 및 특이사항
  attachments?: {              // 추가된 첨부파일 (이미지 등)
    url: string;
    name: string;
    type: 'image' | 'file';
    createdAt: number;
  }[];
}

export interface Student {
  id: string;
  name: string;
  birthDate: string;
  school: string;
  disabilityType: string;
  treatmentArea: string;
  schedule: {
    day: string;
    time: string;
    frequency: string;
  };
  startDate: string;
  therapistName: string;
  voucherArea?: string;
  paymentDates: string[]; // List of dates for the monthly journal
  monthlyAreas?: Record<number, string>; // month (1-12) -> area
  referenceData?: string;      // 과거 치료 기록 텍스트
  referenceFileName?: string;  // 업로드된 파일명
  specialNotes?: string;       // 치료 관찰 및 특이사항
  attachments?: {              // 추가된 첨부파일 (이미지 등)
    url: string;
    name: string;
    type: 'image' | 'file';
    createdAt: number;
  }[];
}

export interface AnnualPlanData {
  currentLevel: string[];
  longTermGoals: string[];
  monthlyGoals: {
    month: number;
    goal: string;
    content: string;
    area?: string;
  }[];
}

export interface MonthlyJournalData {
  currentLevel: string;
  monthlyGoal: string;
  sessions: {
    date: string;
    content: string;
    reaction: string;
    consultation: string;
  }[];
  result: string;
  therapyPeriod?: string;
}

export type DocumentTemplateKind = 'annual_plan' | 'monthly_journal';

export type DocumentTemplateApplyMode = 'sample-reference' | 'hwp-template' | 'hwpx-template' | 'docx-template';

export interface DocumentTemplateSample {
  templateKind?: DocumentTemplateKind;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  uploadedAtMs: number;
  storageMode?: 'firestore-chunks' | 'firebase-storage';
  chunkUploadId?: string;
  chunkCount?: number;
  chunkSize?: number;
  applyMode: DocumentTemplateApplyMode;
  notes?: string;
  updatedAt?: any;
}

export type MonthlyJournalTemplateSample = DocumentTemplateSample;

export type JournalTone = 'normal' | 'academic' | 'expert';
