export interface PaymentRecord {
  id?: string;
  studentName: string;
  transactionDate: string;
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
}

export type JournalTone = 'normal' | 'academic' | 'expert';
