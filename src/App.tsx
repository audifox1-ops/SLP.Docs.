import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Printer, Download, FileText, Calendar, Loader2, Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Sparkles, Zap, ShieldCheck, ArrowRight, Trash2, Save, Pencil, Check, History, RotateCcw, ClipboardCheck, Settings, Shield, Layers3, ArchiveRestore, Eye, EyeOff, Users, CreditCard, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { Student, AnnualPlanData, MonthlyJournalData, StudentInfo, PaymentRecord, JournalTone, DocumentTemplateKind, DocumentTemplateSample, MonthlyJournalTemplateSample } from './types';
import { generateAnnualPlan, generateMonthlyJournal } from './services/aiService';
import { AnnualPlan } from './components/AnnualPlan';
import { MonthlyJournal } from './components/MonthlyJournal';
import { ExportOptionsModal, ExportOptions } from './components/ExportOptionsModal';
import { PreviewModal } from './components/PreviewModal';
import { MonthlyTemplateModal } from './components/MonthlyTemplateModal';
import { ScheduleManager } from './components/ScheduleManager';
import { createAnnualDocxBlob, createMonthlyDocxBlob, exportMultiMonthDocs } from './utils/docxExport';
import { canApplyTemplateAutomatically, createAnnualPlanTemplateBlob, createCombinedJournalTemplateBlob, createMonthlyJournalTemplateBlob } from './utils/monthlyTemplateExport';
import { StudentManagement } from './components/StudentManagement';
import { uploadFile, uploadBlob, deleteFileFromStorage } from './services/storageService';
import { deleteTemplateFileChunks, loadTemplateFileFromChunks, saveTemplateFileChunks } from './services/templateFileService';
import { ensureAnnualPlanPeriod, formatAnnualPlanPeriod, getAnnualPlanPeriodMonths } from './utils/annualPlanPeriod';
import { normalizeScheduleDay, normalizeScheduleFrequency, normalizeScheduleTime } from './utils/studentSchedule';
import { db, OperationType, handleFirestoreError } from './firebase';
import {
  collection,
  addDoc,
  getDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  writeBatch
} from 'firebase/firestore';

interface RawRecord {
  '학생이름': string;
  '거래일자': string;
  '금액'?: string | number;
  '지원영역'?: string;
  '소속 학교'?: string;
  '생년월일'?: string;
  '장애유형'?: string;
  '치료사명'?: string;
  [key: string]: any;
}

interface DocumentHistoryEntry {
  id: string;
  docType: 'annual' | 'monthly';
  docKey: string;
  studentName: string;
  year?: number;
  month?: number;
  data: AnnualPlanData | MonthlyJournalData;
  createdAtMs: number;
  label?: string;
}

interface DraftItem {
  key: string;
  type: 'annual' | 'monthly';
  studentName: string;
  year?: number;
  month?: number;
}

interface PromptTemplates {
  annual: string;
  monthly: string;
}

interface BatchMonthResult {
  month: number;
  status: 'pending' | 'running' | 'saved' | 'skipped' | 'fallback' | 'error';
  message: string;
}

interface QualityIssue {
  level: 'error' | 'warning';
  label: string;
}

type DocumentStatuses = Record<string, { annual: boolean; monthly: Record<string, boolean> }>;

const getErrorMessage = (error: unknown, fallback: string) => (
  error instanceof Error && error.message ? error.message : fallback
);

const isGeminiQuotaError = (error: unknown) => (
  typeof error === 'object' &&
  error !== null &&
  ((error as { status?: number; code?: string }).status === 429 ||
    (error as { status?: number; code?: string }).code === 'GEMINI_QUOTA_EXCEEDED')
);

const logGenerationError = (label: string, error: unknown) => {
  if (isGeminiQuotaError(error)) {
    console.warn(label, getErrorMessage(error, 'Gemini API 할당량이 초과되었습니다.'));
    return;
  }
  console.error(label, error);
};

const getTemplateUploadErrorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const text = message.toLowerCase();
  if (
    text.includes('permission-denied') ||
    text.includes('missing or insufficient permissions')
  ) {
    return 'Firestore 문서 템플릿 저장 권한이 없습니다. firestore.rules를 배포한 뒤 다시 시도해 주세요.';
  }
  if (
    text.includes('cors') ||
    text.includes('network') ||
    text.includes('err_failed') ||
    text.includes('storage/unknown')
  ) {
    return '브라우저 네트워크 요청이 차단되었습니다. 최신 배포가 반영되었는지 확인하고, 기존 Storage 업로드 경로라면 storage.cors.json을 버킷에 적용해 주세요.';
  }
  return getErrorMessage(error, '문서 샘플 업로드 중 오류가 발생했습니다.');
};

const getDocumentTemplateLabel = (kind: DocumentTemplateKind) => (
  kind === 'combined_journal' ? '통합 양식' :
  kind === 'annual_plan' ? '연간계획서' :
  '월간일지'
);

const getTemplateBlobMimeType = (fileType: string) => {
  if (fileType === 'hwpx') return 'application/vnd.hancom.hwpx';
  if (fileType === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (fileType === 'hwp') return 'application/x-hwp';
  return 'application/octet-stream';
};

const getTemplateApplyLabel = (template: DocumentTemplateSample) => (
  template.applyMode === 'hwpx-template'
    ? 'HWPX 자동 적용'
    : template.applyMode === 'hwp-template'
      ? 'HWP→HWPX 자동 적용'
      : template.applyMode === 'docx-template'
        ? 'DOCX 자동 적용'
        : '참조용'
);

interface ExportFile {
  fileName: string;
  blob: Blob;
}

const saveExportFiles = async (files: ExportFile[], zipFileName: string) => {
  if (files.length === 0) return;

  if (files.length === 1) {
    saveAs(files[0].blob, files[0].fileName);
    return;
  }

  const { default: PizZip } = await import('pizzip');
  const zip = new PizZip();
  for (const file of files) {
    zip.file(file.fileName, await file.blob.arrayBuffer());
  }

  const blob = zip.generate({
    type: 'blob',
    mimeType: 'application/zip',
  });
  saveAs(blob, zipFileName);
};

const createDefaultPromptTemplates = (): PromptTemplates => ({
  annual: '현행 수준은 관찰 가능한 행동 중심으로 작성하고, 월별 목표는 실제 치료 영역과 연결해 간결하게 작성한다.',
  monthly: '치료 내용과 아동 반응은 회기별로 겹치지 않게 작성하고, 공식 문서에 맞는 간결한 종결어미를 사용한다.'
});

const PAYMENT_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
const PAYMENT_UPLOAD_MAX_ROWS = 10000;
const PAYMENT_UPLOAD_MAX_COLUMNS = 80;
const BLOCKED_PAYMENT_FIELD_NAMES = new Set(['__proto__', 'constructor', 'prototype']);

const isSafePaymentFieldName = (field: string) => (
  !BLOCKED_PAYMENT_FIELD_NAMES.has(field.trim().toLowerCase())
);

type EditableStudentInfoPayload = Pick<
  StudentInfo,
  | 'name'
  | 'birthDate'
  | 'school'
  | 'disabilityType'
  | 'treatmentArea'
  | 'therapistName'
  | 'scheduleDay'
  | 'scheduleTime'
  | 'scheduleFrequency'
  | 'specialNotes'
>;

const buildEditableStudentInfoPayload = (info: StudentInfo): EditableStudentInfoPayload => ({
  name: String(info.name || '').trim(),
  birthDate: String(info.birthDate || '').trim(),
  school: String(info.school || '').trim(),
  disabilityType: String(info.disabilityType || '').trim(),
  treatmentArea: String(info.treatmentArea || '').trim(),
  therapistName: String(info.therapistName || '').trim(),
  scheduleDay: normalizeScheduleDay(info.scheduleDay),
  scheduleTime: normalizeScheduleTime(info.scheduleTime),
  scheduleFrequency: normalizeScheduleFrequency(info.scheduleFrequency),
  specialNotes: info.specialNotes || ''
});

const mergeEditableStudentInfo = (
  current: StudentInfo | undefined,
  payload: EditableStudentInfoPayload
): StudentInfo => ({
  ...(current || {}),
  ...payload
} as StudentInfo);

const applyStudentInfoToSelectedStudent = (student: Student, info: StudentInfo): Student => ({
  ...student,
  id: info.name,
  name: info.name,
  birthDate: info.birthDate,
  school: info.school,
  disabilityType: info.disabilityType,
  treatmentArea: info.treatmentArea,
  therapistName: info.therapistName,
  schedule: {
    day: info.scheduleDay || '정보 없음',
    time: info.scheduleTime || '정보 없음',
    frequency: info.scheduleFrequency || '1'
  },
  referenceData: info.referenceData,
  referenceFileName: info.referenceFileName,
  specialNotes: info.specialNotes,
  attachments: info.attachments
});

export default function App() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [activeTab, setActiveTab] = useState<'annual' | 'monthly'>('annual');
  const [annualData, setAnnualData] = useState<AnnualPlanData | null>(null);
  const [monthlyData, setMonthlyData] = useState<MonthlyJournalData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [currentView, setCurrentView] = useState<'docs' | 'students' | 'schedule'>('docs');
  const [journalTone, setJournalTone] = useState<JournalTone>('expert');
  const [isEditing, setIsEditing] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // Export Modal State
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportAction, setExportAction] = useState<'print' | 'download' | null>(null);
  const [exportMonthlyDataList, setExportMonthlyDataList] = useState<{ month: number; year: number; data: MonthlyJournalData }[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [exportIncludeAnnual, setExportIncludeAnnual] = useState(true);

  // Student Info Management State
  const [studentInfos, setStudentInfos] = useState<StudentInfo[]>([]);
  const [allPaymentRecords, setAllPaymentRecords] = useState<PaymentRecord[]>([]);
  const studentInfoByName = useMemo(() => new Map(studentInfos.map(info => [info.name, info])), [studentInfos]);
  const paymentRecordsByStudentName = useMemo(() => {
    const recordsByName = new Map<string, PaymentRecord[]>();
    allPaymentRecords.forEach(record => {
      const name = record.studentName;
      if (!name) return;
      const records = recordsByName.get(name) || [];
      records.push(record);
      recordsByName.set(name, records);
    });
    return recordsByName;
  }, [allPaymentRecords]);
  const hasInitialLoaded = useRef(false);
  const skipNextFetchRef = useRef(false);

  // Student List State
  const [fullStudentList, setFullStudentList] = useState<string[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<string[]>([]);
  const [documentStatuses, setDocumentStatuses] = useState<DocumentStatuses>({});
  const [historyEntries, setHistoryEntries] = useState<DocumentHistoryEntry[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [activeTemplateKind, setActiveTemplateKind] = useState<DocumentTemplateKind>('combined_journal');
  const [combinedTemplateSample, setCombinedTemplateSample] = useState<DocumentTemplateSample | null>(null);
  const [annualTemplateSample, setAnnualTemplateSample] = useState<DocumentTemplateSample | null>(null);
  const [monthlyTemplateSample, setMonthlyTemplateSample] = useState<MonthlyJournalTemplateSample | null>(null);
  const [isTemplateUploading, setIsTemplateUploading] = useState(false);
  const [templateUploadProgress, setTemplateUploadProgress] = useState<number | null>(null);
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplates>(() => {
    try {
      const stored = localStorage.getItem('prompt_templates');
      return stored ? { ...createDefaultPromptTemplates(), ...JSON.parse(stored) } : createDefaultPromptTemplates();
    } catch {
      return createDefaultPromptTemplates();
    }
  });
  const [privacyMode, setPrivacyMode] = useState(() => localStorage.getItem('privacy_mode') === 'true');
  const [showBatchPanel, setShowBatchPanel] = useState(false);
  const [batchResults, setBatchResults] = useState<BatchMonthResult[]>([]);
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [preflightIssues, setPreflightIssues] = useState<string[]>([]);

  // Firestore Listeners
  useEffect(() => {
    const qStudents = collection(db, 'students');
    const unsubStudents = onSnapshot(qStudents, {
      next: (snapshot) => {
        const infos = snapshot.docs.map(doc => doc.data() as StudentInfo);
        setStudentInfos(infos);
      },
      error: (err) => {
        console.error("Firebase students listener error:", err);
        const message = err instanceof Error ? err.message : String(err);
        // Ignore specific transient errors so they don't break the app
        if (!message.includes('QUIC_PEER_GOING_AWAY')) {
          setUploadStatus({ type: 'error', message: '학생 정보 동기화 중 오류가 발생했습니다.' });
          setTimeout(() => setUploadStatus(null), 5000);
        }
      }
    });

    const qPayments = collection(db, 'payment_records');
    const unsubPayments = onSnapshot(qPayments, {
      next: (snapshot) => {
        const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PaymentRecord));
        setAllPaymentRecords(records);

        // Auto-Load Notification
        if (!hasInitialLoaded.current && records.length > 0) {
          setUploadStatus({
            type: 'success',
            message: `기존 치료/결제 내역 ${records.length}건을 불러왔습니다.`
          });
          hasInitialLoaded.current = true;
          setTimeout(() => setUploadStatus(null), 4000);
        } else if (!hasInitialLoaded.current && snapshot.metadata.fromCache === false) {
          // Even if 0 records, mark as loaded once we get a fresh response
          hasInitialLoaded.current = true;
        }
      },
      error: (err) => {
        console.error("Firebase payments listener error:", err);
        const message = err instanceof Error ? err.message : String(err);
        if (!message.includes('QUIC_PEER_GOING_AWAY')) {
          setUploadStatus({ type: 'error', message: '결제/치료 내역 동기화 중 오류가 발생했습니다.' });
          setTimeout(() => setUploadStatus(null), 5000);
        }
      }
    });

    const unsubAnnualDocs = onSnapshot(collection(db, 'annual_plans'), {
      next: (snapshot) => {
        setDocumentStatuses(prev => {
          const next: DocumentStatuses = {};
          Object.entries(prev as DocumentStatuses).forEach(([name, status]) => {
            next[name] = { annual: false, monthly: { ...status.monthly } };
          });
          snapshot.docs.forEach(docSnap => {
            const studentName = docSnap.id;
            next[studentName] = next[studentName] || { annual: false, monthly: {} };
            next[studentName].annual = true;
          });
          return next;
        });
      },
      error: (err) => console.error('Annual plan status listener error:', err)
    });

    const unsubMonthlyDocs = onSnapshot(collection(db, 'monthly_journals'), {
      next: (snapshot) => {
        setDocumentStatuses(prev => {
          const next: DocumentStatuses = {};
          Object.entries(prev as DocumentStatuses).forEach(([name, status]) => {
            next[name] = { annual: status.annual, monthly: {} };
          });
          snapshot.docs.forEach(docSnap => {
            const match = docSnap.id.match(/^(.+)_(\d{4})_(\d{1,2})$/);
            if (!match) return;
            const [, studentName, year, month] = match;
            next[studentName] = next[studentName] || { annual: false, monthly: {} };
            next[studentName].monthly[`${year}_${month}`] = true;
          });
          return next;
        });
      },
      error: (err) => console.error('Monthly journal status listener error:', err)
    });

    const unsubCombinedTemplate = onSnapshot(doc(db, 'document_templates', 'combined_journal'), {
      next: (snapshot) => {
        setCombinedTemplateSample(snapshot.exists() ? (snapshot.data() as DocumentTemplateSample) : null);
      },
      error: (err) => console.error('Combined template listener error:', err)
    });

    const unsubAnnualTemplate = onSnapshot(doc(db, 'document_templates', 'annual_plan'), {
      next: (snapshot) => {
        setAnnualTemplateSample(snapshot.exists() ? (snapshot.data() as DocumentTemplateSample) : null);
      },
      error: (err) => console.error('Annual template listener error:', err)
    });

    const unsubMonthlyTemplate = onSnapshot(doc(db, 'document_templates', 'monthly_journal'), {
      next: (snapshot) => {
        setMonthlyTemplateSample(snapshot.exists() ? (snapshot.data() as MonthlyJournalTemplateSample) : null);
      },
      error: (err) => console.error('Monthly template listener error:', err)
    });

    return () => {
      unsubStudents();
      unsubPayments();
      unsubAnnualDocs();
      unsubMonthlyDocs();
      unsubCombinedTemplate();
      unsubAnnualTemplate();
      unsubMonthlyTemplate();
    };
  }, []);

  // Sync selected student data when studentInfos or allPaymentRecords change
  useEffect(() => {
    if (selectedStudent) {
      const updatedInfo = studentInfoByName.get(selectedStudent.name);
      if (updatedInfo) {
        const studentRecords = paymentRecordsByStudentName.get(updatedInfo.name) || [];
        const paymentDates = studentRecords
          .map(r => r.transactionDate)
          .filter(Boolean)
          .sort();
        const monthlyAreas: Record<number, string> = {};
        studentRecords.forEach(r => {
          const dateStr = normalizeDateStr(String(r.transactionDate));
          const match = dateStr.match(/(\d{4})[-./\s년]+(\d{1,2})/);
          if (match) {
            monthlyAreas[parseInt(match[2], 10)] = String(r.treatmentArea);
          }
        });

        setSelectedStudent(prev => {
          if (!prev) return null;
          // Only update if data actually changed to avoid unnecessary re-renders
          if (
            prev.birthDate === updatedInfo.birthDate &&
            prev.school === updatedInfo.school &&
            prev.disabilityType === updatedInfo.disabilityType &&
            prev.treatmentArea === updatedInfo.treatmentArea &&
            prev.therapistName === updatedInfo.therapistName &&
            prev.schedule.day === (updatedInfo.scheduleDay || '정보 없음') &&
            prev.schedule.time === (updatedInfo.scheduleTime || '정보 없음') &&
            prev.schedule.frequency === (updatedInfo.scheduleFrequency || '1') &&
            prev.referenceData === updatedInfo.referenceData &&
            prev.referenceFileName === updatedInfo.referenceFileName &&
            prev.specialNotes === updatedInfo.specialNotes &&
            JSON.stringify(prev.attachments || []) === JSON.stringify(updatedInfo.attachments || []) &&
            JSON.stringify(prev.paymentDates) === JSON.stringify(paymentDates) &&
            JSON.stringify(prev.monthlyAreas || {}) === JSON.stringify(monthlyAreas)
          ) {
            return prev;
          }

          return {
            ...applyStudentInfoToSelectedStudent(prev, updatedInfo),
            paymentDates: paymentDates,
            monthlyAreas
          };
        });
      }
    }
  }, [studentInfoByName, paymentRecordsByStudentName, selectedStudent?.name]);

  // 로컬 스토리지 임시 자동 저장 (isEditing 상태일 때 변경사항 저장)
  useEffect(() => {
    if (selectedStudent && isEditing) {
      if (activeTab === 'annual' && annualData) {
        localStorage.setItem(`draft_annual_${selectedStudent.name}`, JSON.stringify(annualData));
      } else if (activeTab === 'monthly' && monthlyData) {
        const docId = `${selectedStudent.name}_${selectedYear}_${selectedMonth}`;
        localStorage.setItem(`draft_monthly_${docId}`, JSON.stringify(monthlyData));
      }
    }
  }, [annualData, monthlyData, activeTab, selectedStudent, isEditing, selectedYear, selectedMonth]);

  useEffect(() => {
    localStorage.setItem('prompt_templates', JSON.stringify(promptTemplates));
  }, [promptTemplates]);

  useEffect(() => {
    localStorage.setItem('privacy_mode', String(privacyMode));
  }, [privacyMode]);

  const refreshDraftItems = () => {
    const drafts: DraftItem[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.startsWith('draft_annual_')) {
        drafts.push({
          key,
          type: 'annual',
          studentName: key.replace('draft_annual_', '')
        });
      } else if (key.startsWith('draft_monthly_')) {
        const raw = key.replace('draft_monthly_', '');
        const match = raw.match(/^(.+)_(\d{4})_(\d{1,2})$/);
        if (match) {
          drafts.push({
            key,
            type: 'monthly',
            studentName: match[1],
            year: Number(match[2]),
            month: Number(match[3])
          });
        }
      }
    }
    setDraftItems(drafts.sort((a, b) => a.studentName.localeCompare(b.studentName) || (a.month || 0) - (b.month || 0)));
  };

  useEffect(() => {
    refreshDraftItems();
  }, [annualData, monthlyData, isEditing, selectedStudent]);

  const handleAddStudentInfo = async (info: StudentInfo) => {
    const payload = buildEditableStudentInfoPayload(info);
    if (!payload.name) return;
    if (studentInfoByName.has(payload.name)) {
      setUploadStatus({ type: 'error', message: '이미 등록된 학생 이름입니다.' });
      setTimeout(() => setUploadStatus(null), 3000);
      return;
    }
    const nextInfo = mergeEditableStudentInfo(undefined, payload);
    setStudentInfos(prev => prev.some(s => s.name === nextInfo.name) ? prev : [...prev, nextInfo]);
    try {
      await setDoc(doc(db, 'students', nextInfo.name), nextInfo, { merge: true });
      setUploadStatus({ type: 'success', message: '학생 정보가 등록되었습니다.' });
    } catch (err) {
      setStudentInfos(prev => prev.filter(s => s.name !== nextInfo.name));
      handleFirestoreError(err, OperationType.CREATE, 'students');
    }
    setTimeout(() => setUploadStatus(null), 3000);
  };

  const handleUpdateStudentInfo = async (oldName: string, info: StudentInfo) => {
    const payload = buildEditableStudentInfoPayload(info);
    if (!payload.name) return;
    if (oldName !== payload.name && studentInfoByName.has(payload.name)) {
      setUploadStatus({ type: 'error', message: '이미 등록된 학생 이름입니다.' });
      setTimeout(() => setUploadStatus(null), 3000);
      return;
    }

    const previousInfo = studentInfoByName.get(oldName);
    const nextInfo = mergeEditableStudentInfo(previousInfo || info, payload);
    setStudentInfos(prev => {
      if (oldName !== nextInfo.name) {
        return [...prev.filter(s => s.name !== oldName && s.name !== nextInfo.name), nextInfo];
      }
      return prev.map(s => s.name === oldName ? mergeEditableStudentInfo(s, payload) : s);
    });

    if (selectedStudent && selectedStudent.name === oldName) {
      setSelectedStudent(prev => prev ? applyStudentInfoToSelectedStudent(prev, nextInfo) : null);
    }

    try {
      if (oldName !== nextInfo.name) {
        const batch = writeBatch(db);
        batch.set(doc(db, 'students', nextInfo.name), nextInfo);
        batch.delete(doc(db, 'students', oldName));
        await batch.commit();

        // If the selected student's name was changed, update the selected student ID
        if (selectedStudent && selectedStudent.name === oldName) {
          setSelectedStudent(prev => prev ? { ...prev, id: nextInfo.name, name: nextInfo.name } : null);
        }
      } else {
        await setDoc(doc(db, 'students', nextInfo.name), payload, { merge: true });
      }
      setUploadStatus({ type: 'success', message: '학생 정보가 수정되었습니다.' });
    } catch (err) {
      setStudentInfos(prev => {
        if (oldName !== nextInfo.name) {
          const restored = prev.filter(s => s.name !== oldName && s.name !== nextInfo.name);
          return previousInfo ? [...restored, previousInfo] : restored;
        }
        return previousInfo ? prev.map(s => s.name === oldName ? previousInfo : s) : prev;
      });
      if (selectedStudent && selectedStudent.name === oldName) {
        setSelectedStudent(prev => previousInfo && prev ? applyStudentInfoToSelectedStudent(prev, previousInfo) : prev);
      }
      handleFirestoreError(err, OperationType.UPDATE, 'students');
    }
    setTimeout(() => setUploadStatus(null), 3000);
  };

  const handleDeleteStudentInfo = async (name: string) => {
    if (window.confirm(`${name} 학생의 정보를 삭제하시겠습니까?`)) {
      try {
        await deleteDoc(doc(db, 'students', name));
        setUploadStatus({ type: 'success', message: '학생 정보가 삭제되었습니다.' });
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, 'students');
      }
      setTimeout(() => setUploadStatus(null), 3000);
    }
  };

  const handleGenerateFromManagement = (name: string) => {
    setIsDataLoaded(true);
    setCurrentView('docs');
    handleStudentSelect(name);
  };

  const handleAutoRegister = async (name: string) => {
    if (studentInfos.some(s => s.name === name)) {
      setUploadStatus({ type: 'error', message: '이미 등록된 학생입니다.' });
      setTimeout(() => setUploadStatus(null), 3000);
      return;
    }

    const studentRecords = rawRecords.filter(r => {
      const rName = String(
        r['학생이름'] || r['학생 이름'] || r['이름'] || r['성명'] || r['성함'] || r['대상자'] || r['대상자명'] || ''
      ).trim();
      return rName === name;
    });

    if (studentRecords.length > 0) {
      const first = studentRecords[0];
      const newInfo: StudentInfo = {
        name: name,
        birthDate: String(first['생년월일'] || first['생년 월일'] || first['생년'] || first['생일'] || ''),
        school: String(first['소속 학교'] || first['소속학교'] || first['학교'] || first['소속'] || first['기관'] || ''),
        disabilityType: String(first['장애유형'] || first['장애 유형'] || first['장애'] || first['진단명'] || ''),
        treatmentArea: String(first['지원영역'] || first['지원 영역'] || first['치료영역'] || first['영역'] || first['서비스'] || '언어치료'),
        therapistName: String(first['치료사명'] || first['치료사'] || first['담당자'] || first['재활사'] || '')
      };

      try {
        await setDoc(doc(db, 'students', name), newInfo);
        setUploadStatus({
          type: 'success',
          message: '학생 정보가 등록되었습니다. [학생 정보 관리] 탭에서 나머지 정보를 수정해 주세요.'
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'students');
      }
      setTimeout(() => setUploadStatus(null), 5000);
    }
  };

  // File Upload State
  const [rawRecords, setRawRecords] = useState<RawRecord[]>([]);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleResetAllData = async () => {
    if (!window.confirm("정말 모든 데이터를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) return;

    setIsLoading(true);
    try {
      const q = collection(db, 'payment_records');
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        setUploadStatus({ type: 'error', message: '삭제할 데이터가 없습니다.' });
        return;
      }

      const BATCH_LIMIT = 450;
      let batch = writeBatch(db);
      let pendingDeletes = 0;

      for (const docSnap of snapshot.docs) {
        batch.delete(docSnap.ref);
        pendingDeletes++;

        if (pendingDeletes >= BATCH_LIMIT) {
          await batch.commit();
          batch = writeBatch(db);
          pendingDeletes = 0;
        }
      }

      if (pendingDeletes > 0) {
        await batch.commit();
      }
      setUploadStatus({ type: 'success', message: '모든 데이터가 초기화되었습니다.' });
    } catch (err) {
      console.error("Reset failed:", err);
      setUploadStatus({ type: 'error', message: '데이터 초기화 중 오류가 발생했습니다.' });
    } finally {
      setIsLoading(false);
      setTimeout(() => setUploadStatus(null), 3000);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
  };

    const processFile = (file: File) => {
      const extension = file.name.split('.').pop()?.toLowerCase();

      if (file.size > PAYMENT_UPLOAD_MAX_BYTES) {
        setUploadStatus({ type: 'error', message: '결제 내역 파일은 10MB 이하로 업로드해 주세요.' });
        setTimeout(() => setUploadStatus(null), 5000);
        return;
      }

      const reader = new FileReader();

      const normalizeData = (data: any[]) => {
        return data.map(row => {
          const normalized: any = Object.create(null);
          Object.keys(row).forEach(key => {
            const trimmedKey = key.trim();
            if (!isSafePaymentFieldName(trimmedKey)) return;
            normalized[trimmedKey] = typeof row[key] === 'string' ? row[key].trim() : row[key];
          });
          return normalized;
        });
      };

      const validateUploadRows = (rows: any[][]) => {
        if (rows.length > PAYMENT_UPLOAD_MAX_ROWS) {
          return `결제 내역은 최대 ${PAYMENT_UPLOAD_MAX_ROWS.toLocaleString()}행까지만 업로드할 수 있습니다.`;
        }
        const hasTooManyColumns = rows.some(row => Array.isArray(row) && row.length > PAYMENT_UPLOAD_MAX_COLUMNS);
        if (hasTooManyColumns) {
          return `결제 내역은 최대 ${PAYMENT_UPLOAD_MAX_COLUMNS}개 컬럼까지만 업로드할 수 있습니다.`;
        }
        return '';
      };

      const findHeaderAndParse = (rows: any[][]) => {
        const nameKeys = ['학생이름', '학생 이름', '이름', '성명', '성함', '대상자', '대상자명'];
        const dateKeys = ['거래일자', '거래 일자', '날짜', '결제일', '결제 일자', '일자', 'Date', '거래일'];

        let headerRowIndex = -1;
        for (let i = 0; i < Math.min(rows.length, 10); i++) {
          const row = rows[i];
          if (!row || !Array.isArray(row)) continue;
          const hasName = row.some(cell => nameKeys.includes(String(cell || '').trim()));
          const hasDate = row.some(cell => dateKeys.includes(String(cell || '').trim()));
          if (hasName && hasDate) {
            headerRowIndex = i;
            break;
          }
        }

        if (headerRowIndex === -1) return null;

        const headers = rows[headerRowIndex].map(h => String(h || '').trim());
        const dataRows = rows.slice(headerRowIndex + 1);

        return dataRows.filter(row => row.some(cell => cell !== null && cell !== undefined && cell !== '')).map(row => {
          const obj: any = Object.create(null);
          headers.forEach((header, idx) => {
            if (header && isSafePaymentFieldName(header)) obj[header] = row[idx];
          });
          return obj;
        });
      };

      const validateData = (data: any[]) => {
        if (!data || data.length === 0) return { valid: false, message: '파일에 데이터가 없습니다.' };

        const firstRow = data[0];
        const keys = Object.keys(firstRow);

        const nameKeys = ['학생이름', '학생 이름', '이름', '성명', '성함', '대상자', '대상자명'];
        const dateKeys = ['거래일자', '거래 일자', '날짜', '결제일', '결제 일자', '일자', 'Date', '거래일'];

        const hasName = keys.some(k => nameKeys.includes(k));
        const hasDate = keys.some(k => dateKeys.includes(k));

        if (!hasName) return { valid: false, message: "필수 항목인 '학생이름' 컬럼을 찾을 수 없습니다. (학생이름, 이름, 성명 등)" };
        if (!hasDate) return { valid: false, message: "필수 항목인 '거래일자' 컬럼을 찾을 수 없습니다. (거래일자, 날짜, 결제일 등)" };

        return { valid: true };
      };

      if (extension === 'csv') {
        Papa.parse(file, {
          header: false,
          skipEmptyLines: true,
          complete: async (results) => {
            const rows = results.data as any[][];
            const rowValidationMessage = validateUploadRows(rows);
            if (rowValidationMessage) {
              setUploadStatus({ type: 'error', message: rowValidationMessage });
              setTimeout(() => setUploadStatus(null), 5000);
              return;
            }

            const parsedData = findHeaderAndParse(rows);
            if (!parsedData) {
              setUploadStatus({ type: 'error', message: '필수 컬럼(학생이름, 거래일자)을 찾을 수 없습니다. 파일 형식을 확인해 주세요.' });
              setTimeout(() => setUploadStatus(null), 5000);
              return;
            }

            const processed = normalizeData(parsedData) as RawRecord[];
            const validation = validateData(processed);

            if (!validation.valid) {
              setUploadStatus({ type: 'error', message: validation.message });
              setTimeout(() => setUploadStatus(null), 5000);
              return;
            }

            try {
              // Firebase Save with Duplicate Check
              await saveRecordsToFirebase(processed);
              setRawRecords(processed);
              setIsDataLoaded(true);
            } catch (saveError) {
              console.error('CSV 저장 실패:', saveError);
              setUploadStatus({ type: 'error', message: '데이터 저장 중 오류가 발생했습니다.' });
              setTimeout(() => setUploadStatus(null), 5000);
            }
          },
          error: (error) => {
            setUploadStatus({ type: 'error', message: 'CSV 파싱 중 오류가 발생했습니다.' });
            setTimeout(() => setUploadStatus(null), 5000);
          }
        });
      } else if (extension === 'xlsx' || extension === 'xls') {
        reader.onload = async (e) => {
          try {
            const data = new Uint8Array(e.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false }) as any[][];
            const rowValidationMessage = validateUploadRows(rows);
            if (rowValidationMessage) {
              setUploadStatus({ type: 'error', message: rowValidationMessage });
              setTimeout(() => setUploadStatus(null), 5000);
              return;
            }

            const parsedData = findHeaderAndParse(rows);
            if (!parsedData) {
              setUploadStatus({ type: 'error', message: '필수 컬럼(학생이름, 거래일자)을 찾을 수 없습니다. 파일 형식을 확인해 주세요.' });
              setTimeout(() => setUploadStatus(null), 5000);
              return;
            }

            // 취소 거래 필터링 (취소여부 = 'Y')
            const cancelKeys = ['취소여부', '취소', 'cancel', 'Cancel'];
            const filtered = parsedData.filter(row => {
              const cancelVal = cancelKeys.map(k => String(row[k] || '')).find(v => v !== '');
              return cancelVal !== 'Y' && cancelVal !== 'y';
            });
            const canceledCount = parsedData.length - filtered.length;

            const processed = normalizeData(filtered) as RawRecord[];
            const validation = validateData(processed);

            if (!validation.valid) {
              setUploadStatus({ type: 'error', message: validation.message });
              setTimeout(() => setUploadStatus(null), 5000);
              return;
            }

            // Firebase Storage에 원본 파일 저장
            try {
              const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
              const storagePath = `payment_files/${timestamp}_${file.name}`;
              await uploadBlob(new Blob([data], { type: file.type }), storagePath);
            } catch (storageErr) {
              console.warn('Storage 저장 실패(무시):', storageErr);
            }

            // Firebase Firestore에 거래 데이터 저장
            await saveRecordsToFirebase(processed, canceledCount);
            setRawRecords(processed);
            setIsDataLoaded(true);
          } catch (error) {
            setUploadStatus({ type: 'error', message: '엑셀 처리 또는 데이터 저장 중 오류가 발생했습니다.' });
            setTimeout(() => setUploadStatus(null), 5000);
          }
        };
        reader.readAsArrayBuffer(file);
      } else {
        setUploadStatus({ type: 'error', message: '지원하지 않는 파일 형식입니다. CSV 또는 XLSX 파일을 업로드해 주세요.' });
        setTimeout(() => setUploadStatus(null), 5000);
      }
    };

  const saveRecordsToFirebase = async (records: RawRecord[], canceledCount: number = 0) => {
    setIsLoading(true);
    let addedCount = 0;
    let duplicateCount = 0;

    try {
      const BATCH_LIMIT = 450;
      const seenDocIds = new Set<string>();
      let batch = writeBatch(db);
      let pendingWrites = 0;

      const getDateKey = (dateValue: string) => {
        const normalized = normalizeDateStr(String(dateValue));
        const match = normalized.match(/(\d{2,4})[-./\s년]+(\d{1,2})[-./\s월]+(\d{1,2})/);
        if (match) {
          const year = match[1].length === 2 ? `20${match[1]}` : match[1];
          return `${year}${match[2].padStart(2, '0')}${match[3].padStart(2, '0')}`;
        }
        return normalized.replace(/[^0-9]/g, '');
      };

      const commitPending = async () => {
        if (pendingWrites === 0) return;
        await batch.commit();
        batch = writeBatch(db);
        pendingWrites = 0;
      };

      for (const record of records) {
        const name = String(record['학생이름'] || record['학생 이름'] || record['이름'] || record['성명'] || record['성함'] || record['대상자'] || '').trim();
        const date = String(record['거래일자'] || record['거래 일자'] || record['날짜'] || record['결제일'] || record['결제 일자'] || record['일자'] || record['Date'] || record['거래일'] || '').trim();
        const time = String(record['거래시간'] || record['시간'] || record['결제시간'] || '').trim();
        const amount = record['금액'] || 0;
        const area = String(record['지원영역'] || record['지원 영역'] || record['치료영역'] || record['영역'] || record['서비스'] || '언어치료').trim();
        const cancelVal = String(record['취소여부'] || record['취소'] || '').trim();

        // 취소 거래 스킵
        if (cancelVal === 'Y' || cancelVal === 'y') continue;
        if (!name || !date) continue;

        const timeStr = time ? time.substring(0, 5) : '';
        // 고유 ID 생성 (이름_날짜_시간) - Firestore ID 규칙에 맞게 특수문자 제거
        const safeName = name.replace(/[^a-zA-Z0-9가-힣]/g, '');
        const safeDate = getDateKey(date);
        const safeTime = timeStr ? timeStr.replace(/[^0-9]/g, '') : 'notime';
        const existingRecord = allPaymentRecords.find(r =>
          r.studentName === name &&
          getDateKey(String(r.transactionDate)) === safeDate &&
          (r.transactionTime || '') === timeStr
        );
        const docId = existingRecord?.id || `pay_${safeName}_${safeDate}_${safeTime}`;

        if (seenDocIds.has(docId)) {
          duplicateCount++;
          continue;
        }
        seenDocIds.add(docId);

        const isDuplicate = Boolean(existingRecord);

        if (isDuplicate) {
          duplicateCount++; // 중복(덮어쓰기) 건수로 카운트
        } else {
          addedCount++;
        }

        const newRecordRef = doc(db, 'payment_records', docId); // 직접 지정된 doc ID 사용
        const recordData: any = {
          studentName: name,
          transactionDate: date,
          amount: amount,
          treatmentArea: area,
          updatedAt: serverTimestamp()
        };
        if (!isDuplicate) {
          recordData.createdAt = serverTimestamp();
        }
        // 거래시간이 있으면 HH:MM 앞 5자리만 저장
        if (timeStr) recordData.transactionTime = timeStr;

        batch.set(newRecordRef, recordData, { merge: true }); // 기존 데이터 덮어쓰기(병합)
        pendingWrites++;

        if (pendingWrites >= BATCH_LIMIT) {
          await commitPending();
        }
      }

      await commitPending();

      const cancelMsg = canceledCount > 0 ? ` (취소건 ${canceledCount}건 제외)` : '';
      setUploadStatus({
        type: 'success',
        message: `총 ${addedCount}건 신규 업로드, ${duplicateCount}건 덮어쓰기(업데이트) 완료.${cancelMsg}`
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'payment_records');
    } finally {
      setIsLoading(false);
      setTimeout(() => setUploadStatus(null), 5000);
    }
  };

  useEffect(() => {
    const term = searchTerm.toLowerCase();
    // Use student names from payment records if available, otherwise from studentInfos
    const allNames = Array.from(new Set([
      ...allPaymentRecords.map(r => r.studentName),
      ...studentInfos.map(s => s.name)
    ])).filter(Boolean).sort();

    setFullStudentList(allNames);
    setFilteredStudents(
      allNames.filter(name => name.toLowerCase().includes(term))
    );
  }, [searchTerm, allPaymentRecords, studentInfos]);

  const handleStudentSelect = async (name: string) => {
    // Reset previous state
    setSelectedStudent(null);
    setAnnualData(null);
    setMonthlyData(null);

    // Get records from Firestore state
    const studentRecords = paymentRecordsByStudentName.get(name) || [];

    // Look up student info in management system
    const info = studentInfoByName.get(name);

    if (!info) {
      setUploadStatus({
        type: 'error',
        message: `'${name}' 학생의 기본 정보가 없습니다. [학생 정보 관리] 메뉴에서 먼저 정보를 등록해 주세요.`
      });
      setTimeout(() => setUploadStatus(null), 5000);
      return;
    }

    const paymentDates = studentRecords
      .map(r => r.transactionDate)
      .filter(Boolean)
      .sort();

    const monthlyAreas: Record<number, string> = {};
    studentRecords.forEach(r => {
      const dateStr = normalizeDateStr(String(r.transactionDate));
      const match = dateStr.match(/(\d{4})[-./\s년]+(\d{1,2})/);
      if (match) {
        const m = parseInt(match[2]);
        monthlyAreas[m] = String(r.treatmentArea);
      }
    });

    const student: Student = {
      id: name,
      name: name,
      birthDate: info.birthDate,
      school: info.school,
      disabilityType: info.disabilityType,
      treatmentArea: info.treatmentArea,
      schedule: {
        day: info.scheduleDay || '정보 없음',
        time: info.scheduleTime || '정보 없음',
        frequency: info.scheduleFrequency || '1'
      },
      startDate: `${selectedYear}.03`,
      therapistName: info.therapistName,
      paymentDates: paymentDates,
      monthlyAreas: monthlyAreas,
      referenceData: info.referenceData,
      referenceFileName: info.referenceFileName,
      specialNotes: info.specialNotes,
      attachments: info.attachments
    };

    setSelectedStudent(student);
    await fetchData(student);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const term = searchTerm.trim().toLowerCase();
    if (!term) return;

    const name = fullStudentList.find(n => n.toLowerCase().includes(term));
    if (name) {
      handleStudentSelect(name);
    } else {
      setUploadStatus({
        type: 'error',
        message: `'${searchTerm}' 학생을 찾을 수 없습니다.`
      });
      setTimeout(() => setUploadStatus(null), 5000);
    }
  };

  // Mock data generator for monthly journal sessions
  const generateMockSessions = (dates: string[], treatmentArea: string, monthlyGoal?: string) => {
    const mockContents: Record<string, string[]> = {
      '언어치료': [
        "조음점 지시법을 활용한 'ㅅ' 음소 산출 유도 및 반복 훈련 실시함.",
        "상황 카드 제시를 통한 화용적 의사소통 전략 모델링 및 역할극 수행함.",
        "언어적 촉구(Prompting)를 활용한 2어조합 문장 산출 유도함.",
        "시각적 비계(Scaffolding)를 제공하여 이야기 순서 나열 및 설명하기 활동함.",
        "자발화에서의 명료도 향상을 위한 피드백 제공 및 수정 발화 유도함.",
        "청각적 변별력 강화를 위한 유사 음소 대조 및 듣기 활동 실시함."
      ],
      '미술치료': [
        "이완 훈련을 위한 점토 탐색 및 자유로운 형태 만들기 활동함.",
        "내면 감정 표출을 위한 '감정 온도계' 그리기 및 색채 심리 활동함.",
        "자아 정체성 확립을 위한 '나의 강점 나무' 꾸미기 및 콜라주 작업함.",
        "사회성 기술 향상을 위한 협동화 그리기 및 역할 분담 활동 실시함.",
        "정서적 안정을 위한 만다라 채색 및 호흡 조절 연습함.",
        "문제 해결 능력 배양을 위한 입체 구조물 만들기 및 계획 세우기 활동함."
      ],
      'default': [
        "주의 집중력 유지를 위한 과제 수행 및 정적 강화 제공함.",
        "기초 학습 능력 향상을 위한 인지 자극 활동 및 반복 학습 실시함.",
        "일상생활 적응을 위한 모의 상황 연습 및 모델링 제공함.",
        "정서 조절을 위한 이완 기법 습득 및 자기 진정 활동 수행함.",
        "대인 관계 기술 향상을 위한 그룹 게임 및 규칙 준수 연습함."
      ]
    };

    const mockReactions: string[] = [
      "목표 음소 산출 시 조음점 위치를 스스로 수정하려는 시도가 관찰됨.",
      "치료사의 모델링에 주의를 집중하며 자발적인 모방 발화 빈도가 증가함.",
      "과제 수행 중 어려움이 발생했을 때 적절한 도움을 요청하는 모습보임.",
      "자신의 감정을 어휘로 구체화하여 표현하려는 태도 변화가 나타남.",
      "활동에 대한 흥미도가 높으며 과제 완수 후 성취감을 표현함.",
      "비언어적 의사소통(시선 접촉, 미소)이 이전 회기 대비 자연스러워짐.",
      "규칙이 있는 활동에서 순서를 기다리며 자기 조절 능력을 유지함.",
      "새로운 매체 탐색 시 조심스러운 태도를 보였으나 점차 적극적으로 참여함.",
      "학습된 기술을 다른 상황에 적용해 보려는 일반화 시도가 관찰됨."
    ];

    const area = mockContents[treatmentArea] ? treatmentArea : 'default';
    const contents = mockContents[area];

    return dates.map((date, i) => {
      const baseContent = contents[i % contents.length];
      const baseReaction = mockReactions[i % mockReactions.length];

      const hasGoal = monthlyGoal && monthlyGoal !== "연간계획서에 목표가 설정되지 않았습니다.";

      // If monthlyGoal is provided, try to blend it in
      const content = hasGoal
        ? `${monthlyGoal!.replace(/[함임다.]$/, "")} 목표 달성을 위해 ${baseContent}`
        : baseContent;

      const reaction = hasGoal
        ? `${monthlyGoal!.replace(/[함임다.]$/, "")} 과정에서 ${baseReaction}`
        : baseReaction;

      return {
        date,
        content,
        reaction,
        consultation: "가정 내에서의 연계 활동 및 지도 방법 안내함."
      };
    });
  };

  const normalizeAnnualPlanData = (data: AnnualPlanData, student: Student | null = selectedStudent) => (
    ensureAnnualPlanPeriod(data, selectedYear, student || undefined)
  );

  const createEmptyAnnualPlan = (student: Student): AnnualPlanData => (
    ensureAnnualPlanPeriod({
      startYear: selectedYear,
      startMonth: 3,
      endYear: selectedYear + 1,
      endMonth: 2,
      currentLevel: ['', ''],
      longTermGoals: ['', ''],
      monthlyGoals: []
    }, selectedYear, student)
  );

  const getTherapyPeriodForMonthly = (annual: AnnualPlanData | null = annualData) => (
    annual ? formatAnnualPlanPeriod(annual, selectedYear) : `${selectedYear}.3.~`
  );

  const buildFallbackAnnualPlan = (student: Student): AnnualPlanData => {
    const period = {
      startYear: selectedYear,
      startMonth: 3,
      endYear: selectedYear + 1,
      endMonth: 2
    };

    return ensureAnnualPlanPeriod({
      ...period,
      currentLevel: [
        `${student.disabilityType} 특성을 고려한 기초 기능 및 참여 수준 점검이 필요함.`,
        `${student.treatmentArea} 영역에서 단계적 촉구와 반복 중재를 통해 기능 향상을 도모함.`
      ],
      longTermGoals: [
        `${student.treatmentArea} 활동 참여와 과제 수행 지속 시간을 향상함.`,
        `치료 상황에서 습득한 기능을 일상 및 학교 장면으로 일반화함.`
      ],
      monthlyGoals: getAnnualPlanPeriodMonths(period, selectedYear).map(({ year, month }) => {
        const area = student.monthlyAreas?.[month] || student.treatmentArea;
        return {
          year,
          month,
          area,
          goal: `${area} 기초 기능 향상 및 안정적 참여 태도 형성함.`,
          content: `${area} 관련 과제를 단계화하여 모델링, 촉구, 반복 연습을 실시함.`
        };
      })
    }, selectedYear, student);
  };

  const buildFallbackMonthlyJournal = (
    student: Student,
    month: number,
    paymentRecords: PaymentRecord[],
    promptDates: string[],
    monthlyGoal: string
  ): MonthlyJournalData => {
    const area = student.monthlyAreas?.[month] || student.treatmentArea;
    const sessionCount = paymentRecords.length > 0 ? Math.max(paymentRecords.length, 4) : Math.max(promptDates.length, 4);
    const mockSessions = generateMockSessions(Array.from({ length: sessionCount }, () => ''), area, monthlyGoal);

    return {
      currentLevel: `${student.disabilityType} 특성으로 과제 참여와 반응 양상에 변동이 있어 구조화된 치료 환경에서 중재를 진행함.`,
      monthlyGoal,
      therapyPeriod: `${selectedYear}.3.~`,
      sessions: mockSessions.map((session, idx) => {
        const record = paymentRecords[idx];
        const fallbackDate = promptDates[idx];
        const date = record
          ? formatSessionDate(record.transactionDate, record.transactionTime || '', student.name)
          : fallbackDate
            ? formatSessionDate(fallbackDate, '', student.name)
            : '';

        return {
          ...session,
          date
        };
      }),
      result: `${month}월에는 ${area} 목표에 따라 구조화된 과제를 수행하며 참여도와 반응 양상을 관찰함.`
    };
  };

  const getDateKey = (dateStr: string, fallbackYear: number = selectedYear) => {
    const normalized = normalizeDateStr(String(dateStr || ''));
    const match = normalized.match(/(?:(\d{2,4})[-./\s년]+)?(\d{1,2})[-./\s월]+(\d{1,2})/);
    if (!match) return '';

    const year = match[1]
      ? match[1].length === 2 ? `20${match[1]}` : match[1]
      : String(fallbackYear);
    return `${year}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  };

  const getMonthlyPaymentRecords = (studentName: string) => {
    const monthKey = String(selectedMonth).padStart(2, '0');
    return allPaymentRecords
      .filter(record => {
        if (record.studentName !== studentName) return false;
        const dateKey = getDateKey(String(record.transactionDate));
        return dateKey.startsWith(`${selectedYear}-${monthKey}-`);
      })
      .sort((a, b) => {
        const aKey = `${getDateKey(String(a.transactionDate))}_${a.transactionTime || ''}`;
        const bKey = `${getDateKey(String(b.transactionDate))}_${b.transactionTime || ''}`;
        return aKey.localeCompare(bKey);
      });
  };

  const buildMonthlyDateCheck = () => {
    if (!selectedStudent || !monthlyData) {
      return { rows: [], mismatchCount: 0, paymentCount: 0, sessionCount: 0 };
    }

    const payRecords = getMonthlyPaymentRecords(selectedStudent.name);
    const sessions = monthlyData.sessions || [];
    const rowCount = Math.max(payRecords.length, sessions.length);

    const rows = Array.from({ length: rowCount }).map((_, idx) => {
      const payment = payRecords[idx];
      const session = sessions[idx];
      const paymentKey = payment ? getDateKey(String(payment.transactionDate)) : '';
      const sessionKey = session?.date ? getDateKey(session.date) : '';

      let status: 'match' | 'mismatch' | 'missing-journal' | 'extra-journal' = 'mismatch';
      if (paymentKey && sessionKey && paymentKey === sessionKey) status = 'match';
      else if (paymentKey && !sessionKey) status = 'missing-journal';
      else if (!paymentKey && sessionKey) status = 'extra-journal';

      const paymentLabel = payment
        ? formatSessionDate(payment.transactionDate, payment.transactionTime || '', selectedStudent.name).replace('\n', ' · ')
        : '-';
      const sessionLabel = session?.date
        ? session.date.split('\n')[0].replace(/\([^)]*\)/g, '').trim()
        : '-';

      return {
        index: idx + 1,
        paymentLabel,
        sessionLabel,
        status,
        statusLabel:
          status === 'match'
            ? '일치'
            : status === 'missing-journal'
              ? '일지 누락'
              : status === 'extra-journal'
                ? '추가 일지'
                : '불일치'
      };
    });

    const mismatchCount = rows.filter(row => row.status !== 'match').length;
    return { rows, mismatchCount, paymentCount: payRecords.length, sessionCount: sessions.length };
  };

  const createBlankMonthlySession = (): MonthlyJournalData['sessions'][number] => ({
    date: '',
    content: '',
    reaction: '',
    consultation: '가정 내에서의 연계 활동 및 지도 방법 안내함.'
  });

  const syncMonthlySessionsToPaymentRecords = () => {
    if (!selectedStudent || !monthlyData) return;

    const paymentRecords = getMonthlyPaymentRecords(selectedStudent.name);
    const currentSessions = monthlyData.sessions || [];
    const nextCount = Math.max(paymentRecords.length, currentSessions.length, 4);
    const nextSessions = Array.from({ length: nextCount }, (_, idx) => {
      const paymentRecord = paymentRecords[idx];
      const currentSession = currentSessions[idx] || createBlankMonthlySession();

      return {
        ...currentSession,
        date: paymentRecord
          ? formatSessionDate(paymentRecord.transactionDate, paymentRecord.transactionTime || '', selectedStudent.name)
          : currentSession.date || ''
      };
    });

    setMonthlyData({ ...monthlyData, sessions: nextSessions });
    setIsEditing(true);
    setUploadStatus({
      type: 'success',
      message: paymentRecords.length > 0
        ? `월간일지 날짜를 결제 기록 ${paymentRecords.length}건 기준으로 맞췄습니다.`
        : '선택한 월의 결제 기록이 없어 기본 4회 행을 준비했습니다. 날짜는 직접 입력해 주세요.'
    });
    setTimeout(() => setUploadStatus(null), 4000);
  };

  const getDocumentKey = (type: 'annual' | 'monthly' = activeTab) => {
    if (!selectedStudent) return '';
    return type === 'annual'
      ? selectedStudent.name
      : `${selectedStudent.name}_${selectedYear}_${selectedMonth}`;
  };

  const getGenericMonthlyPaymentRecords = (studentName: string, year: number, month: number) => {
    const monthKey = String(month).padStart(2, '0');
    return allPaymentRecords
      .filter(record => {
        if (record.studentName !== studentName) return false;
        const dateKey = getDateKey(String(record.transactionDate), year);
        return dateKey.startsWith(`${year}-${monthKey}-`);
      })
      .sort((a, b) => {
        const aKey = `${getDateKey(String(a.transactionDate), year)}_${a.transactionTime || ''}`;
        const bKey = `${getDateKey(String(b.transactionDate), year)}_${b.transactionTime || ''}`;
        return aKey.localeCompare(bKey);
      });
  };

  const saveDocumentHistory = async (
    docType: 'annual' | 'monthly',
    docKey: string,
    data: AnnualPlanData | MonthlyJournalData,
    meta: { year?: number; month?: number; label?: string } = {}
  ) => {
    if (!selectedStudent) return;
    await addDoc(collection(db, 'document_history'), {
      docType,
      docKey,
      studentName: selectedStudent.name,
      year: meta.year ?? selectedYear,
      month: meta.month ?? (docType === 'monthly' ? selectedMonth : null),
      label: meta.label || '저장 전 버전',
      data,
      createdAtMs: Date.now(),
      createdAt: serverTimestamp()
    });
  };

  const loadDocumentHistory = async () => {
    if (!selectedStudent) return;
    const docType = activeTab;
    const docKey = getDocumentKey(docType);
    setIsLoading(true);
    try {
      const snapshot = await getDocs(query(collection(db, 'document_history'), where('docKey', '==', docKey)));
      const entries = snapshot.docs
        .map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as DocumentHistoryEntry))
        .filter(entry => entry.docType === docType)
        .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
      setHistoryEntries(entries);
      setShowHistoryModal(true);
    } catch (error) {
      console.error('History load error:', error);
      setUploadStatus({ type: 'error', message: '이전 버전을 불러오는 중 오류가 발생했습니다.' });
      setTimeout(() => setUploadStatus(null), 4000);
    } finally {
      setIsLoading(false);
    }
  };

  const restoreHistoryEntry = (entry: DocumentHistoryEntry) => {
    if (entry.docType === 'annual') {
      setAnnualData(normalizeAnnualPlanData(entry.data as AnnualPlanData));
      setActiveTab('annual');
    } else {
      skipNextFetchRef.current = true;
      setMonthlyData(entry.data as MonthlyJournalData);
      if (entry.year) setSelectedYear(entry.year);
      if (entry.month) setSelectedMonth(entry.month);
      setActiveTab('monthly');
    }
    setIsEditing(true);
    setShowHistoryModal(false);
    setUploadStatus({ type: 'success', message: '이전 버전을 현재 편집본으로 복구했습니다. 저장해야 최종 반영됩니다.' });
    setTimeout(() => setUploadStatus(null), 5000);
  };

  const getQualityIssues = (): QualityIssue[] => {
    const issues: QualityIssue[] = [];

    if (activeTab === 'annual') {
      if (!annualData) return [{ level: 'error', label: '연간계획서 데이터가 없습니다.' }];
      if (annualData.currentLevel.every(item => !item.trim())) issues.push({ level: 'warning', label: '현행 수준이 비어 있습니다.' });
      if (annualData.longTermGoals.every(item => !item.trim())) issues.push({ level: 'warning', label: '장기 목표가 비어 있습니다.' });
      const expectedAnnualMonths = getAnnualPlanPeriodMonths(annualData, selectedYear).length;
      if (annualData.monthlyGoals.length < expectedAnnualMonths) issues.push({ level: 'error', label: `월별 목표가 설정 기간(${expectedAnnualMonths}개월)보다 적습니다.` });
      const blankMonths = annualData.monthlyGoals.filter(goal => !goal.goal.trim() || !goal.content.trim()).map(goal => goal.month);
      if (blankMonths.length > 0) issues.push({ level: 'warning', label: `목표 또는 치료 내용이 빈 월: ${blankMonths.join(', ')}월` });
      const longItems = [...annualData.currentLevel, ...annualData.longTermGoals, ...annualData.monthlyGoals.flatMap(goal => [goal.goal, goal.content])].filter(text => text.length > 160);
      if (longItems.length > 0) issues.push({ level: 'warning', label: '긴 문장이 있어 A4 출력 시 넘칠 수 있습니다.' });
    } else {
      if (!monthlyData) return [{ level: 'error', label: '월별일지 데이터가 없습니다.' }];
      if (!monthlyData.currentLevel.trim()) issues.push({ level: 'warning', label: '현행 수준이 비어 있습니다.' });
      if (!monthlyData.monthlyGoal.trim()) issues.push({ level: 'warning', label: '월 치료 목표가 비어 있습니다.' });
      if (!monthlyData.result.trim()) issues.push({ level: 'warning', label: '월 치료 결과가 비어 있습니다.' });
      if (monthlyData.sessions.length === 0) issues.push({ level: 'error', label: '회기별 일지가 없습니다.' });
      const missingSessionRows = monthlyData.sessions
        .map((session, idx) => ({ session, idx }))
        .filter(({ session }) => !session.date.trim() || !session.content.trim() || !session.reaction.trim())
        .map(({ idx }) => idx + 1);
      if (missingSessionRows.length > 0) issues.push({ level: 'warning', label: `날짜/내용/반응 누락 회기: ${missingSessionRows.join(', ')}회차` });
      if (monthlyDateCheck && monthlyDateCheck.mismatchCount > 0) issues.push({ level: 'warning', label: `결제 기록과 일지 날짜 불일치 ${monthlyDateCheck.mismatchCount}건` });
      if (monthlyData.sessions.some(session => session.content.length > 180 || session.reaction.length > 180)) {
        issues.push({ level: 'warning', label: '회기별 문장이 길어 출력 시 넘칠 수 있습니다.' });
      }
    }

    return issues;
  };

  const runPreflightChecks = async (): Promise<string[]> => {
    const issues: string[] = [];
    if (!selectedStudent) return ['학생이 선택되지 않았습니다.'];
    if (!selectedStudent.school || selectedStudent.school === '정보 없음') issues.push('소속 학교 정보가 비어 있습니다.');
    if (!selectedStudent.disabilityType) issues.push('장애 유형 정보가 비어 있습니다.');
    if (!selectedStudent.treatmentArea) issues.push('치료 영역 정보가 비어 있습니다.');
    if (!selectedStudent.therapistName) issues.push('치료사명이 비어 있습니다.');
    if (activeTab === 'monthly' && getMonthlyPaymentRecords(selectedStudent.name).length === 0) {
      issues.push(`${selectedYear}년 ${selectedMonth}월 결제/치료 기록이 없습니다. 가상 날짜가 사용될 수 있습니다.`);
    }
    if (activeTab === 'monthly' && annualData) {
      const goal = annualData.monthlyGoals.find(g => g.month === selectedMonth)?.goal;
      if (!goal) issues.push(`${selectedMonth}월 연간계획 목표가 비어 있습니다.`);
    }

    try {
      const response = await fetch('/api/ai/status');
      const status = await response.json();
      if (!status.ok) {
        issues.push(status.error?.userMessage || 'AI 상태 점검에 실패했습니다. 임시 초안 생성으로 대체될 수 있습니다.');
      }
    } catch (error) {
      issues.push('AI 서버 상태를 확인하지 못했습니다. 임시 초안 생성으로 대체될 수 있습니다.');
    }

    setPreflightIssues(issues);
    return issues;
  };

  const loadDraftItem = async (item: DraftItem) => {
    const raw = localStorage.getItem(item.key);
    if (!raw) return;
    const info = studentInfos.find(s => s.name === item.studentName);
    if (info) {
      skipNextFetchRef.current = true;
      await handleStudentSelect(item.studentName);
    }
    try {
      const parsed = JSON.parse(raw);
      if (item.type === 'annual') {
        const draftStudent = selectedStudent?.name === item.studentName ? selectedStudent : null;
        setActiveTab('annual');
        setAnnualData(normalizeAnnualPlanData(parsed as AnnualPlanData, draftStudent));
      } else {
        skipNextFetchRef.current = true;
        setActiveTab('monthly');
        if (item.year) setSelectedYear(item.year);
        if (item.month) setSelectedMonth(item.month);
        setMonthlyData(parsed);
      }
      setIsEditing(true);
      setShowDraftModal(false);
      setUploadStatus({ type: 'success', message: '임시저장 문서를 불러왔습니다.' });
      setTimeout(() => setUploadStatus(null), 3000);
    } catch (error) {
      setUploadStatus({ type: 'error', message: '임시저장 문서 형식이 올바르지 않습니다.' });
      setTimeout(() => setUploadStatus(null), 3000);
    }
  };

  const deleteDraftItem = (item: DraftItem) => {
    localStorage.removeItem(item.key);
    refreshDraftItems();
  };

  const maskValue = (value: string) => {
    if (!value) return value;
    if (value.length <= 1) return '*';
    return `${value[0]}${'*'.repeat(Math.min(value.length - 1, 4))}`;
  };

  const buildDisplayStudent = (student: Student): Student => {
    if (!privacyMode) return student;
    return {
      ...student,
      name: maskValue(student.name),
      birthDate: student.birthDate ? `${student.birthDate.slice(0, 4)}-**-**` : '',
      school: maskValue(student.school),
      therapistName: maskValue(student.therapistName)
    };
  };

  const handleSaveDocument = async () => {
    if (!selectedStudent) return;

    const qualityIssues = getQualityIssues();
    if (qualityIssues.length > 0) {
      const confirmed = window.confirm(
        `문서 품질 점검에서 ${qualityIssues.length}개 항목이 확인되었습니다.\n\n` +
        qualityIssues.map(issue => `- ${issue.label}`).join('\n') +
        `\n\n그래도 저장하시겠습니까?`
      );
      if (!confirmed) return;
    }

    // ── 저장 권한 강화: 월간일지 날짜 검증 ──
    if (activeTab === 'monthly' && monthlyData) {
      const yearStr = selectedYear.toString();
      const payRecords = allPaymentRecords
        .filter(r => {
          if (r.studentName !== selectedStudent.name) return false;
          const dStr = normalizeDateStr(String(r.transactionDate));
          const m = dStr.match(/(\d{2,4})[-./\s년]+(\d{1,2})/);
          if (m) {
            const yearMatch = m[1].length === 2 ? yearStr.endsWith(m[1]) : m[1] === yearStr;
            return yearMatch && parseInt(m[2], 10) === selectedMonth;
          }
          return false;
        })
        .sort((a, b) => a.transactionDate.localeCompare(b.transactionDate));

      if (payRecords.length > 0) {
        // 저장될 날짜 추출
        const savingDays = monthlyData.sessions
          .map(s => { const m = s.date.match(/(\d{1,2})\/(\d{1,2})/); return m ? parseInt(m[2]) : null; })
          .filter(Boolean);
        const correctDays = payRecords.map(r => {
          const m = normalizeDateStr(String(r.transactionDate)).match(/\d{4}-\d{2}-(\d{2})/);
          return m ? parseInt(m[1]) : null;
        }).filter(Boolean);

        const isMismatch = savingDays.join(',') !== correctDays.join(',');
        if (isMismatch) {
          const confirmed = window.confirm(
            `⚠️ 날짜 불일치 경고\n\n` +
            `저장하려는 날짜: ${savingDays.join('일, ')}일\n` +
            `결제 기록의 날짜: ${correctDays.join('일, ')}일\n\n` +
            `날짜가 결제 기록과 다릅니다. 그래도 저장하시겠습니까?\n` +
            `(취소 시 날짜를 확인 후 다시 저장해 주세요)`
          );
          if (!confirmed) return;
        }
      }
    }

    setIsLoading(true);
    try {
      if (activeTab === 'annual' && annualData) {
        // Save Annual Plan
        const annualRef = doc(db, 'annual_plans', selectedStudent.name);
        const previous = await getDoc(annualRef);
        if (previous.exists()) {
          await saveDocumentHistory('annual', selectedStudent.name, previous.data() as AnnualPlanData, { year: selectedYear });
        }
        await setDoc(annualRef, annualData);
        localStorage.removeItem(`draft_annual_${selectedStudent.name}`); // 저장 후 임시저장 삭제
        refreshDraftItems();
        setUploadStatus({ type: 'success', message: '연간계획서가 성공적으로 저장되었습니다.' });
      } else if (activeTab === 'monthly' && monthlyData) {
        // Save Monthly Journal
        const docId = `${selectedStudent.name}_${selectedYear}_${selectedMonth}`;
        const monthlyRef = doc(db, 'monthly_journals', docId);
        const previous = await getDoc(monthlyRef);
        if (previous.exists()) {
          await saveDocumentHistory('monthly', docId, previous.data() as MonthlyJournalData, { year: selectedYear, month: selectedMonth });
        }
        await setDoc(monthlyRef, monthlyData);
        localStorage.removeItem(`draft_monthly_${docId}`); // 저장 후 임시저장 삭제
        refreshDraftItems();
        setUploadStatus({ type: 'success', message: `${selectedMonth}월 치료일지가 성공적으로 저장되었습니다.` });
      }
      setIsEditing(false); // Exit editing mode after saving
    } catch (error) {
      console.error("Save Error:", error);
      handleFirestoreError(error, OperationType.UPDATE, activeTab === 'annual' ? 'annual_plans' : 'monthly_journals');
    } finally {
      setIsLoading(false);
      setTimeout(() => setUploadStatus(null), 3000);
    }
  };

  const handleUploadReference = async (studentName: string, referenceData: string, fileName: string) => {
    try {
      // 1. Firestore students 컬렉션 업데이트
      await updateDoc(doc(db, 'students', studentName), {
        referenceData: referenceData,
        referenceFileName: fileName
      });
      // 2. 로컬 상태 동기화
      setStudentInfos(prev => prev.map(s =>
        s.name === studentName
          ? { ...s, referenceData, referenceFileName: fileName }
          : s
      ));
      setUploadStatus({ type: 'success', message: `'${studentName}' 학생의 과거 자료가 성공적으로 등록되었습니다. (${fileName})` });
      setTimeout(() => setUploadStatus(null), 3000);
    } catch (error) {
      console.error('Reference upload error:', error);
      setUploadStatus({ type: 'error', message: `과거 자료 저장 중 오류가 발생했습니다.` });
      setTimeout(() => setUploadStatus(null), 5000);
    }
  };

  const handleUploadAttachment = async (studentName: string, file: File | Blob, name: string, type: 'image' | 'file') => {
    try {
      const path = `students/${studentName}/attachments/${new Date().getTime()}_${name}`;
      let url = '';
      if (file instanceof File) {
        url = await uploadFile(file, path);
      } else {
        url = await uploadBlob(file, path);
      }

      const newAttachment = {
        url,
        name,
        type,
        createdAt: new Date().getTime()
      };

      // Firestore 업데이트
      const studentDocRef = doc(db, 'students', studentName);
      const studentDoc = await getDoc(studentDocRef);
      if (studentDoc.exists()) {
        const currentAttachments = studentDoc.data().attachments || [];
        await updateDoc(studentDocRef, {
          attachments: [...currentAttachments, newAttachment]
        });

        // 로컬 상태 동기화
        setStudentInfos(prev => prev.map(s =>
          s.name === studentName
            ? { ...s, attachments: [...(s.attachments || []), newAttachment] }
            : s
        ));

        // 만약 선택된 학생이면 즉시 반영
        if (selectedStudent?.name === studentName) {
          setSelectedStudent(prev => prev ? {
            ...prev,
            attachments: [...(prev.attachments || []), newAttachment]
          } : null);
        }
      }

      setUploadStatus({ type: 'success', message: '첨부파일이 성공적으로 업로드되었습니다.' });
      setTimeout(() => setUploadStatus(null), 3000);
    } catch (error) {
      console.error('Attachment upload error:', error);
      setUploadStatus({ type: 'error', message: '첨부파일 업로드 중 오류가 발생했습니다.' });
      setTimeout(() => setUploadStatus(null), 5000);
    }
  };

  const handleDeleteAttachment = async (studentName: string, attachmentUrl: string) => {
    try {
      // 1. Storage에서 삭제 (URL에서 경로 추출이 어려울 경우 에러 방지를 위해 try-catch 내부 수행)
      try {
        await deleteFileFromStorage(attachmentUrl);
      } catch (storageErr) {
        console.warn('Storage deletion failed or file not found:', storageErr);
      }

      // 2. Firestore 업데이트
      const studentDocRef = doc(db, 'students', studentName);
      const studentDoc = await getDoc(studentDocRef);
      if (studentDoc.exists()) {
        const currentAttachments = studentDoc.data().attachments || [];
        const updatedAttachments = currentAttachments.filter((att: any) => att.url !== attachmentUrl);
        await updateDoc(studentDocRef, {
          attachments: updatedAttachments
        });

        // 3. 로컬 상태 동기화
        setStudentInfos(prev => prev.map(s =>
          s.name === studentName
            ? { ...s, attachments: updatedAttachments }
            : s
        ));

        if (selectedStudent?.name === studentName) {
          setSelectedStudent(prev => prev ? {
            ...prev,
            attachments: updatedAttachments
          } : null);
        }
      }

      setUploadStatus({ type: 'success', message: '첨부파일이 삭제되었습니다.' });
      setTimeout(() => setUploadStatus(null), 3000);
    } catch (error) {
      console.error('Attachment delete error:', error);
      setUploadStatus({ type: 'error', message: '첨부파일 삭제 중 오류가 발생했습니다.' });
      setTimeout(() => setUploadStatus(null), 5000);
    }
  };

  const handleUploadDocumentTemplate = async (kind: DocumentTemplateKind, file: File) => {
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    const allowedExtensions = ['hwp', 'hwpx', 'docx', 'doc', 'pdf', 'png', 'jpg', 'jpeg'];
    const maxSize = 20 * 1024 * 1024;
    const label = getDocumentTemplateLabel(kind);
    const currentTemplate =
      kind === 'combined_journal' ? combinedTemplateSample :
      kind === 'annual_plan' ? annualTemplateSample :
      monthlyTemplateSample;

    if (!allowedExtensions.includes(extension)) {
      setUploadStatus({ type: 'error', message: `${label} 샘플은 HWP, HWPX, DOCX, PDF, 이미지 파일만 업로드할 수 있습니다.` });
      setTimeout(() => setUploadStatus(null), 5000);
      return;
    }

    if (file.size > maxSize) {
      setUploadStatus({ type: 'error', message: '샘플 파일은 20MB 이하로 업로드해 주세요.' });
      setTimeout(() => setUploadStatus(null), 5000);
      return;
    }

    setIsTemplateUploading(true);
    setTemplateUploadProgress(0);
    try {
      const previousChunkUploadId = currentTemplate?.storageMode === 'firestore-chunks'
        ? currentTemplate.chunkUploadId
        : undefined;
      const chunkResult = await saveTemplateFileChunks(kind, file, setTemplateUploadProgress);

      const applyMode: DocumentTemplateSample['applyMode'] =
        extension === 'hwp' ? 'hwp-template' :
        extension === 'hwpx' ? 'hwpx-template' :
        extension === 'docx' ? 'docx-template' :
        'sample-reference';

      const templateData: DocumentTemplateSample = {
        templateKind: kind,
        fileName: file.name,
        fileUrl: chunkResult.fileUrl,
        fileType: extension,
        fileSize: file.size,
        uploadedAtMs: Date.now(),
        storageMode: 'firestore-chunks',
        chunkUploadId: chunkResult.uploadId,
        chunkCount: chunkResult.chunkCount,
        chunkSize: chunkResult.chunkSize,
        applyMode,
        updatedAt: serverTimestamp()
      };

      await setDoc(doc(db, 'document_templates', kind), templateData);
      if (previousChunkUploadId) {
        void deleteTemplateFileChunks(kind, previousChunkUploadId).catch((cleanupError) => {
          console.warn('Previous template chunk cleanup failed:', cleanupError);
        });
      }
      if (kind === 'combined_journal') {
        setCombinedTemplateSample(templateData);
      } else if (kind === 'annual_plan') {
        setAnnualTemplateSample(templateData);
      } else {
        setMonthlyTemplateSample(templateData);
      }
      setUploadStatus({
        type: 'success',
        message: applyMode === 'hwpx-template'
          ? `${label} HWPX 샘플 양식이 업로드되었습니다. 다운로드 시 표와 제목을 유지해 자동 치환합니다.`
          : applyMode === 'hwp-template'
            ? `${label} HWP 샘플 양식이 업로드되었습니다. 다운로드 시 HWPX로 변환해 표와 제목을 유지하고 자동 치환합니다.`
            : applyMode === 'docx-template'
              ? `${label} DOCX 샘플 양식이 자동 치환 양식으로 업로드되었습니다.`
              : `${label} 샘플 양식이 참조용으로 업로드되었습니다. 자동 치환은 HWP, HWPX 또는 DOCX 파일에서 지원됩니다.`
      });
      setTimeout(() => setUploadStatus(null), 3000);
    } catch (error) {
      console.error('Monthly template upload error:', error);
      setUploadStatus({ type: 'error', message: getTemplateUploadErrorMessage(error) });
      setTimeout(() => setUploadStatus(null), 5000);
    } finally {
      setIsTemplateUploading(false);
      setTemplateUploadProgress(null);
    }
  };

  const handleDeleteDocumentTemplate = async (kind: DocumentTemplateKind) => {
    const currentTemplate =
      kind === 'combined_journal' ? combinedTemplateSample :
      kind === 'annual_plan' ? annualTemplateSample :
      monthlyTemplateSample;
    if (!currentTemplate) return;
    const label = getDocumentTemplateLabel(kind);
    if (!window.confirm(`저장된 ${label} 샘플 양식을 삭제하시겠습니까?`)) return;

    setIsTemplateUploading(true);
    try {
      try {
        if (currentTemplate.storageMode === 'firestore-chunks') {
          await deleteTemplateFileChunks(kind, currentTemplate.chunkUploadId);
        } else {
          await deleteFileFromStorage(currentTemplate.fileUrl);
        }
      } catch (storageErr) {
        console.warn('Template storage deletion failed or file not found:', storageErr);
      }
      await deleteDoc(doc(db, 'document_templates', kind));
      if (kind === 'combined_journal') {
        setCombinedTemplateSample(null);
      } else if (kind === 'annual_plan') {
        setAnnualTemplateSample(null);
      } else {
        setMonthlyTemplateSample(null);
      }
      setUploadStatus({ type: 'success', message: `${label} 샘플 양식이 삭제되었습니다.` });
      setTimeout(() => setUploadStatus(null), 3000);
    } catch (error) {
      console.error('Monthly template delete error:', error);
      setUploadStatus({ type: 'error', message: getErrorMessage(error, `${label} 샘플 삭제 중 오류가 발생했습니다.`) });
      setTimeout(() => setUploadStatus(null), 5000);
    } finally {
      setIsTemplateUploading(false);
    }
  };

  const handleOpenDocumentTemplate = async (kind: DocumentTemplateKind) => {
    const currentTemplate =
      kind === 'combined_journal' ? combinedTemplateSample :
      kind === 'annual_plan' ? annualTemplateSample :
      monthlyTemplateSample;
    if (!currentTemplate) return;

    try {
      if (currentTemplate.storageMode === 'firestore-chunks') {
        const arrayBuffer = await loadTemplateFileFromChunks(kind, currentTemplate.chunkUploadId);
        const blob = new Blob([arrayBuffer], { type: getTemplateBlobMimeType(currentTemplate.fileType) });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = currentTemplate.fileName;
        link.click();
        URL.revokeObjectURL(url);
        return;
      }
      window.open(currentTemplate.fileUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error('Template open error:', error);
      setUploadStatus({ type: 'error', message: '샘플 양식 파일을 여는 중 오류가 발생했습니다.' });
      setTimeout(() => setUploadStatus(null), 5000);
    }
  };

  const handleGenerateAnnualPlanDraft = async (
    toneToUse: JournalTone = journalTone,
    successMessage = '연간계획서가 AI로 자동 생성되었습니다.'
  ) => {
    if (!selectedStudent || isLoading) return;

    setIsLoading(true);
    try {
      await runPreflightChecks();
      const latestAnnual = await generateAnnualPlan(
        selectedStudent,
        toneToUse,
        selectedStudent.referenceData,
        promptTemplates.annual
      );
      const annualWithPeriod = normalizeAnnualPlanData(latestAnnual, selectedStudent);
      setActiveTab('annual');
      setAnnualData(annualWithPeriod);
      setMonthlyData(null);
      setUploadStatus({ type: 'success', message: successMessage });
    } catch (error) {
      logGenerationError('Annual plan generation failed:', error);
      const fallbackAnnual = buildFallbackAnnualPlan(selectedStudent);
      setActiveTab('annual');
      setAnnualData(fallbackAnnual);
      setMonthlyData(null);
      setIsEditing(true);
      setUploadStatus({
        type: 'error',
        message: `${getErrorMessage(error, '연간계획서 자동 생성 중 오류가 발생했습니다.')} 임시 연간계획서 초안을 생성했습니다.`
      });
    } finally {
      setIsLoading(false);
      setTimeout(() => setUploadStatus(null), 5000);
    }
  };

  const handleGenerateDraft = async (toneToUse: JournalTone = journalTone) => {
    if (!selectedStudent || isLoading) return;

    setIsLoading(true);
    await runPreflightChecks();
    const yearStr = selectedYear.toString();
    const monthlyPayRecords = allPaymentRecords
      .filter(r => {
        if (r.studentName !== selectedStudent.name) return false;
        const dStr = normalizeDateStr(String(r.transactionDate));
        const m = dStr.match(/(\d{2,4})[-./\s년]+(\d{1,2})/);
        if (m) {
          const y = m[1];
          const mo = m[2];
          const yearMatch = y.length === 2 ? yearStr.endsWith(y) : y === yearStr;
          return yearMatch && parseInt(mo, 10) === selectedMonth;
        }
        return false;
      })
      .sort((a, b) => a.transactionDate.localeCompare(b.transactionDate));

    let paymentDates: string[];
    if (monthlyPayRecords.length > 0) {
      paymentDates = monthlyPayRecords.map(r => r.transactionDate);
      let fallbackDay = 28;
      while (paymentDates.length < 4) {
        paymentDates.push(`${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(fallbackDay).padStart(2, '0')}`);
        fallbackDay--;
      }
    } else {
      paymentDates = [];
      for (let i = 1; i <= 4; i++) {
        const day = 7 * i - 3;
        paymentDates.push(`${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
      }
    }

    try {
      const studentWithDates = { ...selectedStudent, paymentDates };

      // 1. 연간계획서 목표 조회
      let currentAnnual = annualData;
      if (!currentAnnual) {
        currentAnnual = normalizeAnnualPlanData(
          await generateAnnualPlan(selectedStudent, toneToUse, selectedStudent.referenceData, promptTemplates.annual),
          selectedStudent
        );
        setAnnualData(currentAnnual);
      }

      const monthlyGoal = currentAnnual.monthlyGoals.find(g => g.month === selectedMonth)?.goal || "연간계획서에 목표가 설정되지 않았습니다.";

      const monthly = await generateMonthlyJournal(studentWithDates, selectedMonth, monthlyGoal, toneToUse, selectedStudent.referenceData, promptTemplates.monthly);
      monthly.therapyPeriod = getTherapyPeriodForMonthly(currentAnnual);

      // AI가 반환한 세션 날짜를 반드시 실제 결제 날짜로 교체
      const currentStudentInfo = studentInfos.find(info => info.name === selectedStudent.name);

      if (monthlyPayRecords.length > 0) {
        // 실제 결제 기록이 있으면 날짜를 100% 결제 기록 기준으로 설정
        // 단, 결제 기록이 3회여도 4주차 내용이 있다면 날짜를 빈칸으로 두고 내용은 유지
        const mergedSessions = [];
        const maxSessions = Math.max(monthlyPayRecords.length, 4);

        for (let i = 0; i < maxSessions; i++) {
          const r = monthlyPayRecords[i];
          const aiSession = monthly.sessions[i] || { content: '', reaction: '', consultation: '' };

          let dateStr = '';
          if (r) {
            dateStr = formatSessionDate(r.transactionDate, r.transactionTime || '', selectedStudent.name);
          }

          mergedSessions.push({
            date: dateStr, // 결제 기록 없으면 빈칸 (사용자가 직접 클릭해서 날짜 입력 가능)
            content: aiSession.content,
            reaction: aiSession.reaction,
            consultation: aiSession.consultation || "가정 내에서의 연계 활동 및 지도 방법 안내함."
          });
        }
        monthly.sessions = mergedSessions;
      } else {
        // 결제 기록 없으면 AI 날짜를 월간일지 날짜 형식으로 정리
        monthly.sessions = monthly.sessions.map(session => {
          if (!session.date) return session;
          if (session.date.includes('(')) return session;
          const record = allPaymentRecords.find(r => {
            if (r.studentName !== selectedStudent.name) return false;
            const dStr = normalizeDateStr(r.transactionDate);
            const dm = dStr.match(/(\d{4})[-./\s년]+(\d{1,2})[-./\s월]+(\d{1,2})/);
            const sd = normalizeDateStr(session.date);
            const sm = sd.match(/(\d{4})[-./\s년]+(\d{1,2})[-./\s월]+(\d{1,2})/);
            if (dm && sm) {
              return dm[1] === sm[1] && parseInt(dm[2]) === parseInt(sm[2]) && parseInt(dm[3]) === parseInt(sm[3]);
            }
            return false;
          });
          const txTime = record?.transactionTime || '';
          const fullDate = record?.transactionDate || session.date;
          return { ...session, date: formatSessionDate(fullDate, txTime, selectedStudent.name) };
        });
      }

      setMonthlyData(monthly);

      const msg = monthlyPayRecords.length > 0
        ? `AI 일지가 생성되었습니다. (실제 수업날짜 ${monthlyPayRecords.length}회 기준)`
        : '가상 일지가 생성되었습니다. (결제 내역 없음 - 날짜 확인 후 저장하세요)';
      setUploadStatus({ type: monthlyPayRecords.length > 0 ? 'success' : 'error', message: msg });
    } catch (error: any) {
      logGenerationError("Draft generation failed:", error);
      const fallbackAnnual = annualData ? normalizeAnnualPlanData(annualData, selectedStudent) : buildFallbackAnnualPlan(selectedStudent);
      const fallbackGoal = fallbackAnnual.monthlyGoals.find(g => g.month === selectedMonth)?.goal || "연간계획서에 목표가 설정되지 않았습니다.";
      const fallbackMonthly = buildFallbackMonthlyJournal(selectedStudent, selectedMonth, monthlyPayRecords, paymentDates, fallbackGoal);
      fallbackMonthly.therapyPeriod = getTherapyPeriodForMonthly(fallbackAnnual);

      if (!annualData) {
        setAnnualData(fallbackAnnual);
      }
      setMonthlyData(fallbackMonthly);
      setIsEditing(true);
      setUploadStatus({
        type: 'error',
        message: `${getErrorMessage(error, '가상 일지 생성 중 오류가 발생했습니다.')} Gemini 응답 대신 임시 일지 초안을 생성했습니다.`
      });
    } finally {
      setIsLoading(false);
      setTimeout(() => setUploadStatus(null), 5000);
    }
  };

  const handleBatchGenerateMonthly = async () => {
    if (!selectedStudent || isBatchGenerating || isLoading) return;
    setIsBatchGenerating(true);
    setShowBatchPanel(true);

    const months = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2];
    setBatchResults(months.map(month => ({ month, status: 'pending', message: '대기 중' })));

    try {
      let currentAnnual = annualData;
      if (!currentAnnual) {
        currentAnnual = normalizeAnnualPlanData(
          await generateAnnualPlan(selectedStudent, journalTone, selectedStudent.referenceData, promptTemplates.annual),
          selectedStudent
        );
        setAnnualData(currentAnnual);
      }

      for (const month of months) {
        setBatchResults(prev => prev.map(item => item.month === month ? { ...item, status: 'running', message: '생성 중' } : item));
        const docId = `${selectedStudent.name}_${selectedYear}_${month}`;
        const existing = await getDoc(doc(db, 'monthly_journals', docId));
        if (existing.exists()) {
          setBatchResults(prev => prev.map(item => item.month === month ? { ...item, status: 'skipped', message: '저장본 있음' } : item));
          continue;
        }

        const records = getGenericMonthlyPaymentRecords(selectedStudent.name, selectedYear, month);
        if (records.length === 0) {
          setBatchResults(prev => prev.map(item => item.month === month ? { ...item, status: 'skipped', message: '결제 기록 없음' } : item));
          continue;
        }

        const promptDates = records.map(record => record.transactionDate);
        let paddedDates = [...promptDates];
        let fallbackDay = 28;
        while (paddedDates.length < 4) {
          paddedDates.push(`${selectedYear}-${String(month).padStart(2, '0')}-${String(fallbackDay).padStart(2, '0')}`);
          fallbackDay--;
        }

        const monthlyGoal = currentAnnual.monthlyGoals.find(goal => goal.month === month)?.goal || "연간계획서에 목표가 설정되지 않았습니다.";
        const studentWithDates = { ...selectedStudent, paymentDates: paddedDates };
        let monthly: MonthlyJournalData;
        let usedFallback = false;

        try {
          monthly = await generateMonthlyJournal(studentWithDates, month, monthlyGoal, journalTone, selectedStudent.referenceData, promptTemplates.monthly);
        } catch (error) {
          logGenerationError(`Batch monthly generation failed for ${month}:`, error);
          monthly = buildFallbackMonthlyJournal(selectedStudent, month, records, paddedDates, monthlyGoal);
          usedFallback = true;
        }
        monthly.therapyPeriod = getTherapyPeriodForMonthly(currentAnnual);

        const maxSessions = Math.max(records.length, monthly.sessions.length, 4);
        monthly.sessions = Array.from({ length: maxSessions }).map((_, idx) => {
          const record = records[idx];
          const session = monthly.sessions[idx] || { date: '', content: '', reaction: '', consultation: '' };
          return {
            date: record ? formatSessionDate(record.transactionDate, record.transactionTime || '', selectedStudent.name) : '',
            content: session.content,
            reaction: session.reaction,
            consultation: session.consultation || '가정 내에서의 연계 활동 및 지도 방법 안내함.'
          };
        });

        await setDoc(doc(db, 'monthly_journals', docId), monthly);
        setBatchResults(prev => prev.map(item => item.month === month ? {
          ...item,
          status: usedFallback ? 'fallback' : 'saved',
          message: usedFallback ? '임시 초안 저장' : 'AI 생성 저장'
        } : item));
      }

      setUploadStatus({ type: 'success', message: '월별일지 일괄 생성이 완료되었습니다.' });
    } catch (error) {
      logGenerationError('Batch generation error:', error);
      setUploadStatus({ type: 'error', message: getErrorMessage(error, '월별일지 일괄 생성 중 오류가 발생했습니다.') });
    } finally {
      setIsBatchGenerating(false);
      setTimeout(() => setUploadStatus(null), 5000);
    }
  };



  const normalizeDateStr = (dStr: string) => {
    const str = String(dStr).trim();
    if (/^\d{5}$/.test(str)) {
      const serial = parseInt(str, 10);
      const dateObj = new Date((serial - 25569) * 86400 * 1000);
      const y = dateObj.getUTCFullYear();
      const m = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
      const d = String(dateObj.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return str;
  };

  const getSessionTime = (info: any, dateStr: string, txTime: string): string => {
    // txTime이 없으면 등록된 scheduleTime 반환
    if (!txTime) return info?.scheduleTime || '';

    const parts = String(txTime).split(':');
    if (parts.length < 2) return '';
    const txMin = parseInt(parts[0]) * 60 + parseInt(parts[1]);

    // 1순위: scheduleTimeHistory 또는 scheduleTime이 등록된 경우 → 해당 시간대가 결제시간과 일치하는지 검증
    let fixedTime = '';
    if (info?.scheduleTimeHistory?.length > 0) {
      const m = String(dateStr).match(/(\d{4})[-./\s년]+(\d{1,2})[-./\s월]+(\d{1,2})/);
      if (m) {
        const y = parseInt(m[1]);
        const mo = parseInt(m[2]);
        const matched = info.scheduleTimeHistory.find((h: any) => {
          const from = h.fromYear * 100 + h.fromMonth;
          const cur = y * 100 + mo;
          if (h.toYear && h.toMonth) return cur >= from && cur <= (h.toYear * 100 + h.toMonth);
          return cur >= from;
        });
        if (matched) fixedTime = matched.time;
      }
    }
    if (!fixedTime) fixedTime = info?.scheduleTime || '';

    // 등록된 scheduleTime이 있고 결제시간과 합리적으로 일치하면 그대로 반환
    // 실제 패턴: 결제는 수업 시작 후 20분(수업 중)~70분(종료 후 30분) 범위에서 발생
    if (fixedTime && fixedTime !== '정보 없음') {
      const [start] = fixedTime.split('~');
      if (start) {
        const sParts = start.split(':');
        if (sParts.length >= 2) {
          const startMin = parseInt(sParts[0]) * 60 + parseInt(sParts[1]);
          // 결제는 수업시작 후 20분 ~ 수업시작 후 70분 사이 (수업 중 결제 포함)
          if (txMin >= startMin + 20 && txMin <= startMin + 70) {
            return fixedTime;
          }
        }
      }
    }

    // 2순위: 결제시간에서 수업시작 역산
    // 실제 패턴: 수업은 10분 단위 시작(9:00, 9:10 ... 18:30), 40분 수업
    // 결제는 수업 종료(시작+40분) 후 0~20분 이내에 발생
    const fmt = (min: number) => `${Math.floor(min/60).toString().padStart(2, '0')}:${(min%60).toString().padStart(2, '0')}`;

    let bestSlot: number | null = null;
    let minDiff = 9999;

    // 9:00 ~ 18:30까지 10분 단위 슬롯
    for (let slotStart = 9 * 60; slotStart <= 18 * 60 + 30; slotStart += 10) {
      const sessionEnd = slotStart + 40; // 수업 종료 = 시작 + 40분
      // 결제는 종료 후 0~25분 이내
      if (txMin >= sessionEnd && txMin <= sessionEnd + 25) {
        const diff = txMin - sessionEnd;
        if (diff < minDiff) {
          minDiff = diff;
          bestSlot = slotStart;
        }
      }
    }

    // 범위 내 슬롯을 못 찾으면 가장 가까운 슬롯 사용 (범위 30분으로 확장)
    if (bestSlot === null) {
      for (let slotStart = 9 * 60; slotStart <= 18 * 60 + 30; slotStart += 10) {
        const sessionEnd = slotStart + 40;
        const diff = Math.abs(txMin - sessionEnd);
        if (diff < minDiff) {
          minDiff = diff;
          bestSlot = slotStart;
        }
      }
    }

    if (bestSlot === null) return '';
    return `${fmt(bestSlot)}~${fmt(bestSlot + 40)}`;
  };

  // 월간일지 날짜 셀 포맷: MM/DD
  const formatSessionDate = (dateStr: string, _txTime?: string, _studentName?: string): string => {
    const normDateStr = normalizeDateStr(dateStr);
    const match = normDateStr.match(/(\d{4})[-./\s년]+(\d{1,2})[-./\s월]+(\d{1,2})/);
    if (match) {
      const month = String(parseInt(match[2])).padStart(2, '0');
      const day = String(parseInt(match[3])).padStart(2, '0');
      return `${month}/${day}`;
    }
    return normDateStr.replace(/\([^)]*\)/g, '').trim();
  };

  const fetchData = async (student: Student, toneToUse: JournalTone = journalTone) => {
    setIsLoading(true);
    setAnnualData(null);
    setMonthlyData(null);
    setIsEditing(false); // Reset edit mode on student/tab change

    try {
      // More robust date filtering by year and month
      const yearStr = selectedYear.toString();
      const monthStr = selectedMonth.toString();
      const paddedMonthStr = monthStr.padStart(2, '0');

      // FIX: Ensure we handle various date formats correctly for filtering
      const filteredDates = student.paymentDates.filter(d => {
        try {
          const dStr = normalizeDateStr(String(d));
          // Match YYYY or YY followed by separator (including Korean chars) and then MM or M
          const match = dStr.match(/(\d{2,4})[-./\s년]+(\d{1,2})[-./\s월]+(\d{1,2})/);
          if (match) {
            const y = match[1];
            const m = match[2];

            // Check year (handle 2-digit year if necessary, but usually 4)
            const yearMatch = y.length === 2 ? yearStr.endsWith(y) : y === yearStr;
            // Check month
            const monthMatch = parseInt(m, 10) === selectedMonth;

            return yearMatch && monthMatch;
          }

          // Fallback for other formats
          const parts = dStr.split(/[-./\s년월일]+/).filter(Boolean);
          if (parts.length >= 2) {
            const y = parts[0];
            const m = parts[1];
            const yearMatch = y.length === 2 ? yearStr.endsWith(y) : y === yearStr;
            const monthMatch = parseInt(m, 10) === selectedMonth;
            return yearMatch && monthMatch;
          }

          return false;
        } catch (e) {
          return false;
        }
      });

      const studentWithFilteredDates = { ...student, paymentDates: filteredDates };

      // 0. Check for existing documents in Firestore first
      if (activeTab === 'annual') {
        const annualDoc = await getDoc(doc(db, 'annual_plans', student.name));
        let savedAnnual = annualDoc.exists() ? (annualDoc.data() as AnnualPlanData) : null;

        // 로컬 스토리지 임시저장 데이터 확인
        const localDraft = localStorage.getItem(`draft_annual_${student.name}`);
        if (localDraft) {
          try {
            const parsedDraft = JSON.parse(localDraft);
            if (window.confirm('작성 중이던 연간계획서가 있습니다. 이어서 작성하시겠습니까?\n(취소 시 저장된 버전 또는 새 양식을 불러옵니다)')) {
              setAnnualData(normalizeAnnualPlanData(parsedDraft as AnnualPlanData, student));
              setIsEditing(true); // 바로 편집 모드로 전환
              setIsLoading(false);
              return;
            } else {
              localStorage.removeItem(`draft_annual_${student.name}`);
            }
          } catch (e) {
            console.error("Local draft parse error", e);
          }
        }

        if (savedAnnual) {
          setAnnualData(normalizeAnnualPlanData(savedAnnual, student));
          setIsLoading(false);
          return;
        }
      } else {
        const docId = `${student.name}_${selectedYear}_${selectedMonth}`;
        const monthlyDoc = await getDoc(doc(db, 'monthly_journals', docId));
        let savedMonthly = monthlyDoc.exists() ? (monthlyDoc.data() as MonthlyJournalData) : null;

        // 로컬 스토리지 임시저장 데이터 확인
        const localDraft = localStorage.getItem(`draft_monthly_${docId}`);
        if (localDraft) {
          try {
            const parsedDraft = JSON.parse(localDraft);
            if (window.confirm('작성 중이던 월간일지가 있습니다. 이어서 작성하시겠습니까?\n(취소 시 저장된 버전 또는 새 양식을 불러옵니다)')) {
              setMonthlyData(parsedDraft);
              setIsEditing(true); // 바로 편집 모드로 전환
              setIsLoading(false);
              return;
            } else {
              localStorage.removeItem(`draft_monthly_${docId}`);
            }
          } catch (e) {
            console.error("Local draft parse error", e);
          }
        }

        if (savedMonthly) {
          setMonthlyData(savedMonthly);

          // Also try to load annual if not present (needed for goals context)
          if (!annualData) {
            const annualDoc = await getDoc(doc(db, 'annual_plans', student.name));
            if (annualDoc.exists()) setAnnualData(normalizeAnnualPlanData(annualDoc.data() as AnnualPlanData, student));
          }

          setIsLoading(false);
          return;
        }
      }

      // Firebase에 저장된 데이터가 없는 경우 → 빈 양식을 바로 표시 (AI 자동 생성 안 함)
      if (activeTab === 'annual') {
        setAnnualData(createEmptyAnnualPlan(student));
        setIsEditing(true);
      } else {
        // formatSessionDate 는 컴포넌트 레벨에서 공유 (student.name 전달)

        // 해당 월 결제 기록 필터링
        const monthlyRecords = allPaymentRecords
          .filter(r => {
            if (r.studentName !== student.name) return false;
            const dStr = normalizeDateStr(r.transactionDate);
            const m = dStr.match(/(\d{2,4})[-./\s년]+(\d{1,2})/);
            if (m) {
              const y = m[1];
              const mo = m[2];
              const yearMatch = y.length === 2 ? yearStr.endsWith(y) : y === yearStr;
              return yearMatch && parseInt(mo, 10) === selectedMonth;
            }
            return false;
          })
          .sort((a, b) => a.transactionDate.localeCompare(b.transactionDate));

        const emptyMonthly: MonthlyJournalData = {
          currentLevel: '',
          monthlyGoal: '',
          therapyPeriod: getTherapyPeriodForMonthly(annualData),
          sessions: monthlyRecords.length > 0
            ? monthlyRecords.map(r => ({
                date: formatSessionDate(r.transactionDate, r.transactionTime, student.name),
                content: '',
                reaction: '',
                consultation: ''
              }))
            : filteredDates.length > 0
              ? filteredDates.map(date => ({
                  date: formatSessionDate(date, '', student.name),
                  content: '',
                  reaction: '',
                  consultation: ''
                }))
              : [{ date: '', content: '', reaction: '', consultation: '' }],
          result: ''
        };
        setMonthlyData(emptyMonthly);
        setIsEditing(true);
      }

    } catch (error) {
      console.error("Data fetch error:", error);
      alert(getErrorMessage(error, '서류 데이터를 생성하는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (skipNextFetchRef.current) {
      skipNextFetchRef.current = false;
      return;
    }
    if (selectedStudent) {
      fetchData(selectedStudent, journalTone);
    }
  }, [selectedMonth, selectedYear]);

  const [showPrintWarning, setShowPrintWarning] = useState(false);

  const handlePrintRequest = () => {
    setExportAction('print');
    setShowExportModal(true);
  };

  const handleDownloadRequest = () => {
    if (!annualData && !monthlyData) {
      alert('현재 선택된 학생의 데이터가 없습니다.');
      return;
    }
    setExportAction('download');
    setShowExportModal(true);
  };

  const handleOpenPreview = async () => {
    if (!selectedStudent) return;

    try {
      let annualForPreview = annualData ? normalizeAnnualPlanData(annualData, selectedStudent) : null;
      if (!annualData) {
        const annualDoc = await getDoc(doc(db, 'annual_plans', selectedStudent.name));
        if (annualDoc.exists()) {
          annualForPreview = normalizeAnnualPlanData(annualDoc.data() as AnnualPlanData, selectedStudent);
          setAnnualData(annualForPreview);
        }
      }

      if (!monthlyData) {
        const monthlyDocId = `${selectedStudent.name}_${selectedYear}_${selectedMonth}`;
        const monthlyDoc = await getDoc(doc(db, 'monthly_journals', monthlyDocId));
        if (monthlyDoc.exists()) {
          const loadedMonthly = monthlyDoc.data() as MonthlyJournalData;
          loadedMonthly.therapyPeriod = loadedMonthly.therapyPeriod || getTherapyPeriodForMonthly(annualForPreview);
          setMonthlyData(loadedMonthly);
        }
      }
    } catch (error) {
      console.error('Preview companion document load error:', error);
      setUploadStatus({ type: 'error', message: '통합 미리보기에 필요한 저장 문서를 불러오는 중 오류가 발생했습니다.' });
      setTimeout(() => setUploadStatus(null), 4000);
    } finally {
      setIsPreviewOpen(true);
    }
  };

  const executeExport = async (options: ExportOptions) => {
    if (!selectedStudent) return;

    setShowExportModal(false);
    setIsExporting(true);
    setExportIncludeAnnual(options.includeAnnual);

    try {
      // 1. Ensure Annual Data exists only when the output actually includes it.
      let currentAnnual = annualData ? normalizeAnnualPlanData(annualData, selectedStudent) : null;
      if (options.includeAnnual && !currentAnnual) {
        currentAnnual = normalizeAnnualPlanData(
          await generateAnnualPlan(selectedStudent, journalTone, selectedStudent.referenceData, promptTemplates.annual),
          selectedStudent
        );
        setAnnualData(currentAnnual);
      }

      // 2. Fetch Multi-month Data
      const multiMonthData: { month: number; year: number; data: MonthlyJournalData }[] = [];
      const { startYear, startMonth, endYear, endMonth } = options;

      let sy = startYear;
      let sm = startMonth;

      while (sy < endYear || (sy === endYear && sm <= endMonth)) {
        const yearStr = sy.toString();
        const monthNum = sm;
        const monthStr = sm.toString().padStart(2, '0');

        // Robust Date Filtering
        const filteredDates = selectedStudent.paymentDates.filter(d => {
            try {
              const dStr = normalizeDateStr(String(d));
              // 지원하는 형식: 2026.04.17, 2026-04-17, 26/04/17, 2026년 4월 17일, 4/17 등
              const match = dStr.match(/(\d{2,4})?[-./\s년]*(\d{1,2})[-./\s월]+(\d{1,2})/);

              if (match) {
                const y = match[1];
                const m = parseInt(match[2], 10);

                // 연도가 없는 경우(4/17 등)는 선택된 연도로 간주, 있는 경우는 일치 여부 확인
                const yearMatch = !y || (y.length === 2 ? yearStr.endsWith(y) : y === yearStr);
                return yearMatch && m === monthNum;
              }

              // 숫자만 있는 경우나 기타 구분자 처리
              const parts = dStr.split(/[-./\s년월일]+/).filter(Boolean);
              if (parts.length >= 2) {
                const y = parts.length >= 3 ? parts[0] : null;
                const m = parseInt(parts[parts.length === 2 ? 0 : 1], 10);
                const yearMatch = !y || (y.length === 2 ? yearStr.endsWith(y) : y === yearStr);
                return yearMatch && m === monthNum;
              }
              return false;
            } catch (e) { return false; }
        });

        const studentWithFilteredDates = { ...selectedStudent, paymentDates: filteredDates };
        const monthlyGoal =
          currentAnnual?.monthlyGoals.find(g => g.month === monthNum)?.goal ||
          (sy === selectedYear && monthNum === selectedMonth ? monthlyData?.monthlyGoal : '') ||
          "연간계획서에 목표가 설정되지 않았습니다.";

        // [Optimization] Check Firestore first to avoid redundant AI calls
        let mData: MonthlyJournalData | null = null;
        const docId = `${selectedStudent.name}_${yearStr}_${monthNum}`;
        const canUseCurrentMonthlyData = sy === selectedYear && monthNum === selectedMonth && Boolean(monthlyData?.sessions);

        if (canUseCurrentMonthlyData) {
          mData = monthlyData;
          console.log(`[Current] Using on-screen journal for ${yearStr}-${monthNum}`);
        } else {
          const monthlyDoc = await getDoc(doc(db, 'monthly_journals', docId));
          if (monthlyDoc.exists()) {
            mData = monthlyDoc.data() as MonthlyJournalData;
            console.log(`[Cache] Using saved journal for ${yearStr}-${monthNum}`);
          } else if (filteredDates.length > 0) {
            // No saved data, generate check
            console.log(`[AI] Generating new journal for ${yearStr}-${monthNum}`);
            mData = await generateMonthlyJournal(studentWithFilteredDates, monthNum, monthlyGoal, journalTone, selectedStudent.referenceData, promptTemplates.monthly);
          } else {
            mData = {
              currentLevel: "해당 월의 치료 내역이 없습니다.",
              monthlyGoal: monthlyGoal,
              sessions: [],
              result: "내역 없음"
            };
          }
        }

        if (mData) {
          mData.therapyPeriod = mData.therapyPeriod || getTherapyPeriodForMonthly(currentAnnual);
        }

        if (mData && mData.sessions) {
          const sessionDates = new Set(mData.sessions.map(s => s.date));
          const missingDates = filteredDates.filter(d => !sessionDates.has(d));
          if (missingDates.length > 0) {
            const mockMissing = generateMockSessions(missingDates, studentWithFilteredDates.treatmentArea, monthlyGoal);
            mData.sessions = [...mData.sessions, ...mockMissing].sort((a, b) => a.date.localeCompare(b.date));
          }
        }

        multiMonthData.push({ month: monthNum, year: sy, data: mData });

        sm++;
        if (sm > 12) {
          sm = 1;
          sy++;
        }
      }

      setExportMonthlyDataList(multiMonthData);

      // Validate if we actually collected any sessions
      const hasValidSessions = multiMonthData.some(item => item.data && item.data.sessions.length > 0);
      if (!hasValidSessions) {
        alert(`${startYear}년 ${startMonth}월부터 ${endYear}년 ${endMonth}월 사이의 결제/치료 내역이 0건입니다.\n날짜 필터링을 다시 확인해 주세요.`);
        setIsExporting(false);
        setExportAction(null);
        return;
      }

      // 3. Document Output Logic
      if (exportAction === 'download') {
        const combinedTemplateForExport = combinedTemplateSample || (!annualTemplateSample ? monthlyTemplateSample : null);
        const canUseCombinedTemplate = options.includeAnnual && currentAnnual && canApplyTemplateAutomatically(combinedTemplateForExport);
        const annualTemplateForExport = annualTemplateSample || combinedTemplateSample;
        const monthlyTemplateForExport = monthlyTemplateSample || combinedTemplateSample;
        const canUseAnnualTemplate = options.includeAnnual && currentAnnual && canApplyTemplateAutomatically(annualTemplateForExport);
        const canUseMonthlyTemplate = canApplyTemplateAutomatically(monthlyTemplateForExport);

        if (canUseCombinedTemplate && combinedTemplateForExport && currentAnnual) {
          const files: ExportFile[] = [];
          for (const item of multiMonthData) {
            const { blob, extension } = await createCombinedJournalTemplateBlob(
              combinedTemplateForExport,
              selectedStudent,
              currentAnnual,
              item.data,
              item.year,
              item.month
            );
            files.push({
              fileName: `${selectedStudent.name}_${item.year}_${item.month}월_샘플양식_연간월간.${extension}`,
              blob,
            });
          }
          await saveExportFiles(files, `${selectedStudent.name}_통합일지_${startMonth}월-${endMonth}월.zip`);
          setUploadStatus({ type: 'success', message: '통합 샘플 양식에 연간계획서와 월간일지를 함께 반영해 생성했습니다.' });
          setTimeout(() => setUploadStatus(null), 3000);
        } else if (canUseAnnualTemplate || canUseMonthlyTemplate) {
          const files: ExportFile[] = [];
          const notices = new Set<string>();

          if (options.includeAnnual && currentAnnual) {
            if (canUseAnnualTemplate && annualTemplateForExport) {
              const { blob, extension } = await createAnnualPlanTemplateBlob(
                annualTemplateForExport,
                selectedStudent,
                currentAnnual,
                startYear
              );
              files.push({
                fileName: `${selectedStudent.name}_${startYear}_샘플양식_연간계획서.${extension}`,
                blob,
              });
            } else {
              if (annualTemplateForExport?.applyMode === 'hwp-template') {
                notices.add('연간계획서 HWP 샘플을 HWPX로 변환하지 못해 기본 DOCX 양식으로 생성했습니다.');
              }
              files.push({
                fileName: `${selectedStudent.name}_${startYear}_연간계획서.docx`,
                blob: await createAnnualDocxBlob(selectedStudent, currentAnnual, startYear),
              });
            }
          }

          for (const item of multiMonthData) {
            if (canUseMonthlyTemplate && monthlyTemplateForExport) {
              const { blob, extension } = await createMonthlyJournalTemplateBlob(
                monthlyTemplateForExport,
                selectedStudent,
                item.data,
                item.year,
                item.month
              );
              files.push({
                fileName: `${selectedStudent.name}_${item.year}_${item.month}월_샘플양식_치료일지.${extension}`,
                blob,
              });
            } else {
              if (monthlyTemplateForExport?.applyMode === 'hwp-template') {
                notices.add('월간일지 HWP 샘플을 HWPX로 변환하지 못해 기본 DOCX 양식으로 생성했습니다.');
              }
              files.push({
                fileName: `${selectedStudent.name}_${item.year}_${item.month}월_치료일지.docx`,
                blob: await createMonthlyDocxBlob(
                  selectedStudent,
                  item.data,
                  item.year,
                  item.month,
                  getGenericMonthlyPaymentRecords(selectedStudent.name, item.year, item.month)
                ),
              });
            }
          }

          await saveExportFiles(files, `${selectedStudent.name}_일지_${startMonth}월-${endMonth}월.zip`);
          if (notices.size > 0) {
            setUploadStatus({ type: 'error', message: Array.from(notices).join(' ') });
            setTimeout(() => setUploadStatus(null), 7000);
          } else {
            setUploadStatus({ type: 'success', message: '등록된 샘플 양식을 반영해 문서를 생성했습니다.' });
            setTimeout(() => setUploadStatus(null), 3000);
          }
        } else {
          if (
            combinedTemplateSample?.applyMode === 'hwp-template' ||
            annualTemplateSample?.applyMode === 'hwp-template' ||
            monthlyTemplateSample?.applyMode === 'hwp-template'
          ) {
            setUploadStatus({
              type: 'error',
              message: '등록된 HWP 샘플을 HWPX로 변환하지 못해 기본 워드 양식으로 생성했습니다.'
            });
            setTimeout(() => setUploadStatus(null), 5000);
          }
          const paymentRecordsByMonth = Object.fromEntries(
            multiMonthData.map(item => [
              `${item.year}_${item.month}`,
              getGenericMonthlyPaymentRecords(selectedStudent.name, item.year, item.month)
            ])
          );
          await exportMultiMonthDocs(selectedStudent, currentAnnual, multiMonthData, options.includeAnnual, startMonth, endMonth, paymentRecordsByMonth);
        }
        setExportAction(null);
      }
      // For print, we wait for useEffect to trigger after render
    } catch (err) {
      console.error(err);
      alert(getErrorMessage(err, '서류 생성 중 오류가 발생했습니다.'));
      setExportAction(null);
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    if (!isExporting && exportMonthlyDataList.length > 0 && exportAction === 'print') {
      const timer = setTimeout(() => {
        // [Direct Print Strategy] 메인 창에서 직접 인쇄하여 테두리/폰트 유실 방지
        window.print();

        // 인쇄 호출 후 상태 정리 (약간의 지연 필요)
        setTimeout(() => {
          setExportMonthlyDataList([]);
          setExportAction(null);
        }, 500);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isExporting, exportMonthlyDataList, exportAction]);

  const monthlyDateCheck = activeTab === 'monthly' && selectedStudent && monthlyData
    ? buildMonthlyDateCheck()
    : null;
  const selectedMonthlyPaymentRecords = activeTab === 'monthly' && selectedStudent
    ? getMonthlyPaymentRecords(selectedStudent.name)
    : [];

  const getDateCheckStatusClass = (status: string) => {
    if (status === 'match') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (status === 'mismatch') return 'bg-red-50 text-red-700 border-red-200';
    return 'bg-amber-50 text-amber-700 border-amber-200';
  };

  const qualityIssues = selectedStudent ? getQualityIssues() : [];
  const displayStudent = selectedStudent ? buildDisplayStudent(selectedStudent) : null;
  const selectedDocStatus = selectedStudent ? documentStatuses[selectedStudent.name] : null;
  const selectedMonthlySaved = Boolean(selectedDocStatus?.monthly?.[`${selectedYear}_${selectedMonth}`]);
  const selectedAnnualSaved = Boolean(selectedDocStatus?.annual);
  const getStudentDisplayName = (name: string) => privacyMode ? maskValue(name) : name;
  const effectiveAnnualTemplate = annualTemplateSample || combinedTemplateSample;
  const effectiveAnnualTemplateKind: DocumentTemplateKind = annualTemplateSample ? 'annual_plan' : 'combined_journal';
  const effectiveMonthlyTemplate = monthlyTemplateSample || combinedTemplateSample;
  const effectiveMonthlyTemplateKind: DocumentTemplateKind = monthlyTemplateSample ? 'monthly_journal' : 'combined_journal';
  const hasWorkspaceSidebar = isDataLoaded || studentInfos.length > 0 || fullStudentList.length > 0;
  const selectedStudentInfo = selectedStudent ? studentInfoByName.get(selectedStudent.name) : null;
  const selectedStudentDraftCount = selectedStudent
    ? draftItems.filter(item => item.studentName === selectedStudent.name).length
    : 0;
  const documentStatusList = Object.values(documentStatuses as DocumentStatuses);
  const annualSavedCount = documentStatusList.filter(status => status.annual).length;
  const selectedMonthSavedCount = documentStatusList.filter(status => status.monthly?.[`${selectedYear}_${selectedMonth}`]).length;
  const selectedStudentPaymentCount = selectedStudent ? getMonthlyPaymentRecords(selectedStudent.name).length : 0;
  const selectedScheduleLabel = selectedStudent
    ? `${selectedStudent.schedule.day || '요일 미정'} · ${selectedStudent.schedule.time || '시간 미정'}`
    : '학생 선택 필요';
  const selectedMessageText = selectedStudent
    ? [
        `안녕하세요. ${getStudentDisplayName(selectedStudent.name)} 학생 ${selectedYear}년 ${selectedMonth}월 수업 안내드립니다.`,
        `수업 일정: ${selectedScheduleLabel}`,
        `결제 기록: ${selectedStudentPaymentCount}건`,
        `작성 문서: 연간계획서 ${selectedAnnualSaved ? '저장됨' : '미저장'}, ${selectedMonth}월 일지 ${selectedMonthlySaved ? '저장됨' : '미저장'}`,
        '확인 부탁드립니다.'
      ].join('\n')
    : [
        `${selectedYear}년 ${selectedMonth}월 수업 및 결제 안내드립니다.`,
        '학생을 선택하면 수업 일정, 결제 기록, 문서 작성 상태가 자동으로 포함됩니다.',
        '확인 부탁드립니다.'
      ].join('\n');

  const copySelectedMessage = async () => {
    try {
      await navigator.clipboard.writeText(selectedMessageText);
      setUploadStatus({ type: 'success', message: '메시지 내용을 클립보드에 복사했습니다.' });
    } catch {
      setUploadStatus({ type: 'error', message: '클립보드 복사 권한이 없어 메시지를 직접 선택해 복사해 주세요.' });
    }
    setTimeout(() => setUploadStatus(null), 3000);
  };

  const openSmsDraft = () => {
    window.location.href = `sms:?body=${encodeURIComponent(selectedMessageText)}`;
  };

  const handleSidebarStudentSelect = (name: string) => {
    setIsDataLoaded(true);
    setCurrentView('docs');
    void handleStudentSelect(name);
  };

  const openStudentDocsFromSidebar = (tab?: 'annual' | 'monthly') => {
    setIsDataLoaded(true);
    setCurrentView('docs');
    if (tab) setActiveTab(tab);
  };

  const handleSidebarFreshUpload = () => {
    setIsDataLoaded(false);
    setRawRecords([]);
    setSelectedStudent(null);
    setUploadStatus(null);
    setSearchTerm('');
    setCurrentView('docs');
  };

  const studentWorkspaceSidebar = hasWorkspaceSidebar ? (
    <aside className="hidden lg:flex w-80 shrink-0 flex-col border-r border-border-theme bg-white no-print">
      <div className="p-4 border-b border-border-theme">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <div className="text-[11px] font-black uppercase tracking-wider text-primary">학생별 관리</div>
            <div className="text-lg font-black text-text-main">워크스페이스</div>
          </div>
          <span className="rounded-full bg-primary-light px-2.5 py-1 text-[11px] font-black text-primary">
            {filteredStudents.length}명
          </span>
        </div>
        <div className="relative">
          <input
            type="text"
            placeholder="학생 이름 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-bg-theme border border-border-theme rounded-xl focus:border-primary outline-none transition-all text-sm font-medium"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-4 h-4" />
        </div>
      </div>

      <div className="border-b border-border-theme p-4 bg-bg-theme/40">
        <div className="text-[11px] font-black uppercase tracking-wider text-text-muted mb-2">선택 학생</div>
        {selectedStudent ? (
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center text-sm font-black">
                {getStudentDisplayName(selectedStudent.name).charAt(0)}
              </div>
              <div className="min-w-0">
                <div className="font-black text-text-main truncate">{getStudentDisplayName(selectedStudent.name)}</div>
                <div className="text-xs font-semibold text-text-muted truncate">
                  {selectedStudentInfo?.treatmentArea || selectedStudent.treatmentArea || '치료 영역 미정'}
                </div>
                <div className="text-xs text-text-muted truncate">
                  {selectedStudentInfo?.school || selectedStudent.school || '소속 미정'}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <span className={`rounded-lg border px-2 py-1 text-center text-[10px] font-black ${selectedAnnualSaved ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-white text-slate-500 border-slate-200'}`}>
                연간
              </span>
              <span className={`rounded-lg border px-2 py-1 text-center text-[10px] font-black ${selectedMonthlySaved ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-white text-slate-500 border-slate-200'}`}>
                {selectedMonth}월
              </span>
              <span className={`rounded-lg border px-2 py-1 text-center text-[10px] font-black ${selectedStudentDraftCount > 0 ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-white text-slate-500 border-slate-200'}`}>
                임시 {selectedStudentDraftCount}
              </span>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-4 text-center text-xs font-semibold text-text-muted">
            학생을 선택하면 문서와 관리 기능이 이곳에 묶입니다.
          </div>
        )}
      </div>

      <div className="border-b border-border-theme p-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => openStudentDocsFromSidebar('annual')}
            className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-black transition-all ${
              currentView === 'docs' && activeTab === 'annual' ? 'bg-primary text-white' : 'bg-primary-light text-primary hover:bg-blue-100'
            }`}
          >
            <FileText className="h-4 w-4" />
            연간계획서
          </button>
          <button
            onClick={() => openStudentDocsFromSidebar('monthly')}
            className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-black transition-all ${
              currentView === 'docs' && activeTab === 'monthly' ? 'bg-primary text-white' : 'bg-primary-light text-primary hover:bg-blue-100'
            }`}
          >
            <Calendar className="h-4 w-4" />
            월간일지
          </button>
          <button
            onClick={() => setCurrentView('students')}
            className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-black transition-all ${
              currentView === 'students' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Pencil className="h-4 w-4" />
            학생정보
          </button>
          <button
            onClick={() => setCurrentView('schedule')}
            className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-black transition-all ${
              currentView === 'schedule' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Calendar className="h-4 w-4" />
            시간표
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-2">
        <AnimatePresence initial={false}>
          {filteredStudents.length > 0 ? (
            filteredStudents.map((name) => {
              const status = documentStatuses[name];
              const hasAnnual = Boolean(status?.annual);
              const hasMonthly = Boolean(status?.monthly?.[`${selectedYear}_${selectedMonth}`]);
              const hasDraft = draftItems.some(item => item.studentName === name);

              return (
                <motion.div
                  key={name}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => handleSidebarStudentSelect(name)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      handleSidebarStudentSelect(name);
                    }
                  }}
                  className={`mb-1 flex w-full cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-all ${
                    selectedStudent?.name === name
                      ? 'border-primary/20 bg-primary-light text-primary shadow-sm'
                      : 'border-transparent text-text-main hover:bg-bg-theme'
                  }`}
                >
                  <div className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg text-xs font-black transition-colors ${
                    selectedStudent?.name === name ? 'bg-primary text-white' : 'bg-slate-100 text-slate-400'
                  }`}>
                    {getStudentDisplayName(name).charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{getStudentDisplayName(name)}</span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <span className={`rounded border px-1.5 py-0.5 text-[9px] font-black ${hasAnnual ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-white text-slate-400 border-slate-100'}`}>연간</span>
                      <span className={`rounded border px-1.5 py-0.5 text-[9px] font-black ${hasMonthly ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-white text-slate-400 border-slate-100'}`}>{selectedMonth}월</span>
                      {hasDraft && <span className="rounded border border-amber-100 bg-amber-50 px-1.5 py-0.5 text-[9px] font-black text-amber-700">임시</span>}
                    </div>
                  </div>
                  {!studentInfos.some(s => s.name === name) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAutoRegister(name);
                      }}
                      className="mt-1 rounded-md bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary transition-all hover:bg-primary hover:text-white"
                    >
                      등록
                    </button>
                  )}
                </motion.div>
              );
            })
          ) : (
            <div className="py-10 text-center text-text-muted">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-20" />
              <p className="text-xs font-semibold">검색 결과가 없습니다.</p>
            </div>
          )}
        </AnimatePresence>
      </div>

      <div className="border-t border-border-theme p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => {
              refreshDraftItems();
              setShowDraftModal(true);
            }}
            className="flex items-center justify-center gap-2 rounded-xl bg-white border border-border-theme px-3 py-2 text-[11px] font-black text-text-main hover:bg-bg-theme"
          >
            <ArchiveRestore className="h-3.5 w-3.5" />
            임시저장
          </button>
          <button
            onClick={() => {
              setActiveTemplateKind('combined_journal');
              setShowTemplateModal(true);
            }}
            className="flex items-center justify-center gap-2 rounded-xl bg-white border border-border-theme px-3 py-2 text-[11px] font-black text-text-main hover:bg-bg-theme"
          >
            <FileText className="h-3.5 w-3.5" />
            양식
          </button>
          <button
            onClick={() => setShowPromptModal(true)}
            className="flex items-center justify-center gap-2 rounded-xl bg-white border border-border-theme px-3 py-2 text-[11px] font-black text-text-main hover:bg-bg-theme"
          >
            <Settings className="h-3.5 w-3.5" />
            프롬프트
          </button>
          <button
            onClick={() => setShowMessageModal(true)}
            className="flex items-center justify-center gap-2 rounded-xl bg-white border border-border-theme px-3 py-2 text-[11px] font-black text-text-main hover:bg-bg-theme"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            메시지
          </button>
          <button
            onClick={handleSidebarFreshUpload}
            className="flex items-center justify-center gap-2 rounded-xl bg-white border border-border-theme px-3 py-2 text-[11px] font-black text-text-main hover:bg-bg-theme"
          >
            <Upload className="h-3.5 w-3.5" />
            파일
          </button>
        </div>
        <button
          onClick={handleResetAllData}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-transparent py-2 text-[11px] font-bold text-red-500 transition-all hover:border-red-100 hover:bg-red-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          저장된 전체 내역 초기화
        </button>
      </div>
    </aside>
  ) : null;
  const studentWorkspaceMobileBar = hasWorkspaceSidebar ? (
    <div className="lg:hidden no-print border-b border-border-theme bg-white p-3 space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <select
            value={selectedStudent?.name || ''}
            onChange={(e) => {
              if (e.target.value) handleSidebarStudentSelect(e.target.value);
            }}
            className="w-full appearance-none rounded-xl border border-border-theme bg-bg-theme px-3 py-2.5 pr-8 text-sm font-bold text-text-main outline-none focus:border-primary"
          >
            <option value="">학생 선택</option>
            {filteredStudents.map(name => (
              <option key={name} value={name}>{getStudentDisplayName(name)}</option>
            ))}
          </select>
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        </div>
        <button
          onClick={() => setCurrentView('students')}
          className={`rounded-xl px-3 py-2 text-xs font-black ${currentView === 'students' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
        >
          학생정보
        </button>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        <button
          onClick={() => openStudentDocsFromSidebar('annual')}
          className={`rounded-lg px-2 py-2 text-[11px] font-black ${currentView === 'docs' && activeTab === 'annual' ? 'bg-primary text-white' : 'bg-primary-light text-primary'}`}
        >
          연간
        </button>
        <button
          onClick={() => openStudentDocsFromSidebar('monthly')}
          className={`rounded-lg px-2 py-2 text-[11px] font-black ${currentView === 'docs' && activeTab === 'monthly' ? 'bg-primary text-white' : 'bg-primary-light text-primary'}`}
        >
          월간
        </button>
        <button
          onClick={() => setCurrentView('schedule')}
          className={`rounded-lg px-2 py-2 text-[11px] font-black ${currentView === 'schedule' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
        >
          시간표
        </button>
        <button
          onClick={() => {
            refreshDraftItems();
            setShowDraftModal(true);
          }}
          className="rounded-lg bg-slate-100 px-2 py-2 text-[11px] font-black text-slate-700"
        >
          임시
        </button>
        <button
          onClick={() => setShowMessageModal(true)}
          className="rounded-lg bg-slate-100 px-2 py-2 text-[11px] font-black text-slate-700"
        >
          메시지
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div className="min-h-screen flex flex-col bg-bg-theme selection:bg-primary/10">
      {/* Header - Hidden on Print */}
      <header className="bg-white/80 backdrop-blur-md border-b border-border-theme h-[72px] px-6 md:px-10 flex items-center justify-between no-print sticky top-0 z-40 flex-shrink-0">
        <div className="flex items-center gap-2 font-extrabold text-xl text-primary tracking-tight">
          <div className="bg-primary p-1.5 rounded-lg">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <span>SLP.Docs</span>
        </div>

        <nav className="hidden md:flex items-center gap-1 bg-slate-100 p-1 rounded-xl no-print">
          <button
            onClick={() => setCurrentView('docs')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              currentView === 'docs' ? 'bg-white text-primary shadow-sm' : 'text-text-muted hover:text-text-main'
            }`}
          >
            서류 생성
          </button>
          <button
            onClick={() => setCurrentView('students')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              currentView === 'students' ? 'bg-white text-primary shadow-sm' : 'text-text-muted hover:text-text-main'
            }`}
          >
            학생 정보 관리
          </button>
          <button
            onClick={() => setCurrentView('schedule')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              currentView === 'schedule' ? 'bg-white text-primary shadow-sm' : 'text-text-muted hover:text-text-main'
            }`}
          >
            시간표 관리
          </button>
        </nav>

        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              refreshDraftItems();
              setShowDraftModal(true);
            }}
            className="text-sm font-semibold text-text-muted hover:text-primary transition-colors flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-primary-light"
          >
            <ArchiveRestore className="w-4 h-4" />
            임시저장함
            {draftItems.length > 0 && (
              <span className="bg-amber-100 text-amber-700 text-[10px] font-black px-1.5 py-0.5 rounded-full">{draftItems.length}</span>
            )}
          </button>
          <button
            onClick={() => setShowPromptModal(true)}
            className="text-sm font-semibold text-text-muted hover:text-primary transition-colors flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-primary-light"
          >
            <Settings className="w-4 h-4" />
            프롬프트
          </button>
          <button
            onClick={() => {
              setActiveTemplateKind('combined_journal');
              setShowTemplateModal(true);
            }}
            className="text-sm font-semibold text-text-muted hover:text-primary transition-colors flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-primary-light"
            title="문서 샘플 양식"
          >
            <FileText className="w-4 h-4" />
            <span className="hidden xl:inline">양식 샘플</span>
            {(combinedTemplateSample || annualTemplateSample || monthlyTemplateSample) && (
              <span className="hidden xl:inline-flex bg-primary-light text-primary text-[10px] font-black px-1.5 py-0.5 rounded-full">저장됨</span>
            )}
          </button>
          <button
            onClick={() => setPrivacyMode(prev => !prev)}
            className={`text-sm font-semibold transition-colors flex items-center gap-2 px-3 py-2 rounded-lg ${
              privacyMode ? 'bg-slate-900 text-white' : 'text-text-muted hover:text-primary hover:bg-primary-light'
            }`}
          >
            {privacyMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            개인정보
          </button>
          {isDataLoaded && (
            <button
              onClick={handleSidebarFreshUpload}
              className="text-sm font-semibold text-text-muted hover:text-primary transition-colors flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-primary-light"
            >
              <Upload className="w-4 h-4" />
              결제내역 업로드
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col relative overflow-hidden">
        {/* Global Notification Area */}
        <AnimatePresence>
          {showPrintWarning && (
            <motion.div
              initial={{ opacity: 0, y: -20, x: '-50%' }}
              animate={{ opacity: 1, y: 0, x: '-50%' }}
              exit={{ opacity: 0, y: -20, x: '-50%' }}
              className="fixed top-20 left-1/2 z-[60] flex flex-col gap-2 px-6 py-4 rounded-2xl shadow-2xl border bg-white text-sm border-primary/20 max-w-md"
            >
              <div className="flex items-center gap-3 text-primary font-bold">
                <AlertCircle className="w-5 h-5" />
                <span>인쇄 안내</span>
              </div>
              <p className="text-text-muted leading-relaxed">
                현재 미리보기 화면(iframe)에서는 브라우저 보안 정책으로 인해 인쇄 창이 뜨지 않을 수 있습니다.
                <br /><br />
                상단 메뉴의 <strong>'새 탭에서 열기'</strong> 버튼을 눌러 새 창에서 인쇄를 진행해 주세요.
              </p>
              <button
                onClick={() => setShowPrintWarning(false)}
                className="mt-2 bg-primary text-white py-2 rounded-xl font-bold hover:bg-primary-dark transition-all"
              >
                확인했습니다
              </button>
            </motion.div>
          )}
          {uploadStatus && (
            <motion.div
              initial={{ opacity: 0, y: -20, x: '-50%' }}
              animate={{ opacity: 1, y: 0, x: '-50%' }}
              exit={{ opacity: 0, y: -20, x: '-50%' }}
              className={`fixed top-20 left-1/2 z-50 flex items-center gap-3 px-6 py-3 rounded-2xl shadow-xl border text-sm font-semibold backdrop-blur-md ${
                uploadStatus.type === 'success'
                  ? 'bg-green-50/90 text-green-700 border-green-100'
                  : 'bg-red-50/90 text-red-700 border-red-100'
              }`}
            >
              {uploadStatus.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
              {uploadStatus.message}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 flex min-h-0 overflow-hidden">
          {studentWorkspaceSidebar}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
            {studentWorkspaceMobileBar}
            {currentView === 'students' ? (
              <StudentManagement
                studentInfos={studentInfos}
                onAdd={handleAddStudentInfo}
                onUpdate={handleUpdateStudentInfo}
                onDelete={handleDeleteStudentInfo}
                onGenerateDocument={handleGenerateFromManagement}
                onUploadReference={handleUploadReference}
                onUploadAttachment={handleUploadAttachment}
                onDeleteAttachment={handleDeleteAttachment}
              />
            ) : currentView === 'schedule' ? (
              <ScheduleManager
                studentInfos={studentInfos}
                paymentRecords={allPaymentRecords}
              />
            ) : !isDataLoaded ? (
              <div className="flex-1 overflow-auto bg-bg-theme no-print">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".csv, .xlsx, .xls"
                  className="hidden"
                />
                <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-6 md:px-8 md:py-8">
                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col gap-4 border-b border-border-theme pb-5 md:flex-row md:items-end md:justify-between"
                  >
                    <div>
                      <div className="mb-2 inline-flex items-center gap-2 rounded-lg border border-primary/15 bg-primary-light px-3 py-1 text-[11px] font-black uppercase tracking-wider text-primary">
                        <Users className="h-3.5 w-3.5" />
                        Student Operations
                      </div>
                      <h1 className="text-3xl font-black tracking-tight text-text-main md:text-4xl">
                        학생 수업과 치료지원 서류를 한 화면에서 관리
                      </h1>
                      <p className="mt-3 max-w-3xl text-sm font-medium leading-relaxed text-text-muted md:text-base">
                        학생 정보, 시간표, 수업료 결제일, 교육청 제출 서류, 메시지 업무를 학생별 워크스페이스로 묶었습니다.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setCurrentView('students')}
                        className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-black text-white hover:bg-slate-800"
                      >
                        <Users className="h-4 w-4" />
                        학생관리 열기
                      </button>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center gap-2 rounded-lg border border-primary bg-white px-4 py-2.5 text-sm font-black text-primary hover:bg-primary-light"
                      >
                        <Upload className="h-4 w-4" />
                        결제내역 업로드
                      </button>
                    </div>
                  </motion.div>

                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {[
                      { label: '등록 학생', value: `${studentInfos.length}명`, icon: Users, tone: 'text-primary bg-primary-light' },
                      { label: '결제 기록', value: `${allPaymentRecords.length}건`, icon: CreditCard, tone: 'text-emerald-700 bg-emerald-50' },
                      { label: '저장 문서', value: `${annualSavedCount + selectedMonthSavedCount}건`, icon: FileText, tone: 'text-amber-700 bg-amber-50' },
                      { label: '임시저장', value: `${draftItems.length}건`, icon: ArchiveRestore, tone: 'text-slate-700 bg-slate-100' },
                    ].map(item => (
                      <div key={item.label} className="rounded-lg border border-border-theme bg-white p-4 shadow-sm">
                        <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg ${item.tone}`}>
                          <item.icon className="h-4 w-4" />
                        </div>
                        <div className="text-2xl font-black text-text-main">{item.value}</div>
                        <div className="mt-1 text-xs font-bold text-text-muted">{item.label}</div>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.25fr_0.75fr]">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="rounded-lg border border-border-theme bg-white p-5 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-black text-text-main">학생관리</div>
                            <div className="mt-1 text-xs font-semibold text-text-muted">기본정보, 치료 일정, 과거 자료, 첨부파일</div>
                          </div>
                          <Users className="h-5 w-5 text-primary" />
                        </div>
                        <button
                          onClick={() => setCurrentView('students')}
                          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-black text-white hover:bg-primary-dark"
                        >
                          학생정보 관리
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="rounded-lg border border-border-theme bg-white p-5 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-black text-text-main">수업관리</div>
                            <div className="mt-1 text-xs font-semibold text-text-muted">요일별 시간표와 결제/출석 기록 비교</div>
                          </div>
                          <Calendar className="h-5 w-5 text-emerald-700" />
                        </div>
                        <button
                          onClick={() => setCurrentView('schedule')}
                          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-black text-white hover:bg-emerald-700"
                        >
                          시간표 보기
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="rounded-lg border border-border-theme bg-white p-5 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-black text-text-main">서류작성</div>
                            <div className="mt-1 text-xs font-semibold text-text-muted">연간계획서, 월간일지, 샘플 양식 출력</div>
                          </div>
                          <FileText className="h-5 w-5 text-amber-700" />
                        </div>
                        <div className="mt-5 flex flex-wrap gap-2">
                          <button
                            onClick={() => openStudentDocsFromSidebar('annual')}
                            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-xs font-black text-white hover:bg-amber-600"
                          >
                            연간계획서
                          </button>
                          <button
                            onClick={() => openStudentDocsFromSidebar('monthly')}
                            className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-white px-4 py-2 text-xs font-black text-amber-700 hover:bg-amber-50"
                          >
                            월간일지
                          </button>
                        </div>
                      </div>

                      <div className="rounded-lg border border-border-theme bg-white p-5 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-black text-text-main">메시지 발신</div>
                            <div className="mt-1 text-xs font-semibold text-text-muted">수업 일정, 결제 기록, 문서 상태 안내문 생성</div>
                          </div>
                          <MessageSquare className="h-5 w-5 text-slate-700" />
                        </div>
                        <button
                          onClick={() => setShowMessageModal(true)}
                          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-xs font-black text-white hover:bg-slate-900"
                        >
                          메시지 작성
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div
                      className="rounded-lg border border-dashed border-primary/30 bg-white p-5 shadow-sm"
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const file = e.dataTransfer.files?.[0];
                        if (file) processFile(file);
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-black text-text-main">결제내역 업로드</div>
                          <div className="mt-1 text-xs font-semibold text-text-muted">CSV/XLSX 결제 내역을 학생별 수업료 기록으로 저장</div>
                        </div>
                        <FileSpreadsheet className="h-5 w-5 text-primary" />
                      </div>
                      <div className="mt-6 flex min-h-28 flex-col items-center justify-center rounded-lg bg-bg-theme px-4 py-6 text-center">
                        <Upload className="mb-3 h-7 w-7 text-primary" />
                        <div className="text-sm font-black text-text-main">파일 선택 또는 드래그</div>
                        <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                          {['학생이름', '거래일자', '결제일', '지원영역'].map(tag => (
                            <span key={tag} className="rounded-md border border-border-theme bg-white px-2 py-1 text-[10px] font-bold text-text-muted">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                    <div className="rounded-lg border border-border-theme bg-white p-5">
                      <div className="flex items-center gap-2 text-sm font-black text-text-main">
                        <CreditCard className="h-4 w-4 text-emerald-700" />
                        수업료 결제일 자동설정
                      </div>
                      <p className="mt-2 text-xs font-semibold leading-relaxed text-text-muted">
                        선택 월 결제 기록을 월간일지 회기 날짜에 반영합니다.
                      </p>
                      <button
                        onClick={() => {
                          if (selectedStudent && monthlyData) {
                            syncMonthlySessionsToPaymentRecords();
                          } else {
                            openStudentDocsFromSidebar('monthly');
                            setUploadStatus({ type: 'error', message: '학생을 선택하고 월간일지를 연 뒤 결제일 기준 맞추기를 실행해 주세요.' });
                            setTimeout(() => setUploadStatus(null), 3500);
                          }
                        }}
                        className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-black text-white hover:bg-emerald-700"
                      >
                        결제일 기준 맞추기
                      </button>
                    </div>

                    <div className="rounded-lg border border-border-theme bg-white p-5">
                      <div className="flex items-center gap-2 text-sm font-black text-text-main">
                        <ShieldCheck className="h-4 w-4 text-primary" />
                        교육청 및 기타 서류
                      </div>
                      <p className="mt-2 text-xs font-semibold leading-relaxed text-text-muted">
                        샘플 양식, AI 점검, 워드/PDF 출력 흐름을 유지합니다.
                      </p>
                      <button
                        onClick={() => {
                          setActiveTemplateKind('combined_journal');
                          setShowTemplateModal(true);
                        }}
                        className="mt-4 rounded-lg border border-primary px-4 py-2 text-xs font-black text-primary hover:bg-primary-light"
                      >
                        양식 관리
                      </button>
                    </div>

                    <div className="rounded-lg border border-border-theme bg-white p-5">
                      <div className="flex items-center gap-2 text-sm font-black text-text-main">
                        <ArchiveRestore className="h-4 w-4 text-amber-700" />
                        복구함
                      </div>
                      <p className="mt-2 text-xs font-semibold leading-relaxed text-text-muted">
                        작성 중 문서와 이전 저장본을 학생별로 복구합니다.
                      </p>
                      <button
                        onClick={() => {
                          refreshDraftItems();
                          setShowDraftModal(true);
                        }}
                        className="mt-4 rounded-lg bg-slate-100 px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-200"
                      >
                        임시저장 열기
                      </button>
                    </div>
                  </div>
                </div>
              </div>
        ) : (
          <div className="flex-1 flex overflow-hidden">
            {/* Content Area - Document Preview */}
            <div className="flex-1 flex flex-col overflow-hidden bg-bg-theme/50 min-h-0">
              {!selectedStudent ? (
                <div className="flex-1 flex flex-col items-center justify-center text-text-muted p-10">
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center max-w-sm"
                  >
                    <div className="bg-white p-8 rounded-[2.5rem] mb-6 shadow-xl shadow-slate-200/50 border border-border-theme inline-block">
                      <Sparkles className="w-12 h-12 text-primary/30" />
                    </div>
                    <h3 className="text-xl font-bold text-text-main mb-2">학생을 선택해 주세요</h3>
                    <p className="text-sm leading-relaxed">
                      좌측 목록에서 학생의 이름을 클릭하면<br />
                      AI가 자동으로 서류를 생성합니다.
                    </p>
                  </motion.div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col p-6 md:p-10 gap-6 overflow-auto">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 no-print">
                    <div>
                      <h2 className="text-2xl font-bold text-text-main">{displayStudent?.name} 학생</h2>
                      <p className="text-sm text-text-muted">{displayStudent?.treatmentArea} · {displayStudent?.school}</p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-black border ${selectedAnnualSaved ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>
                          연간 {selectedAnnualSaved ? '저장됨' : '미저장'}
                        </span>
                        <span className={`px-2 py-1 rounded-full text-[10px] font-black border ${selectedMonthlySaved ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>
                          {selectedMonth}월 {selectedMonthlySaved ? '저장됨' : '미저장'}
                        </span>
                        {privacyMode && (
                          <span className="px-2 py-1 rounded-full text-[10px] font-black border bg-slate-900 text-white border-slate-900">보호 모드</span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3 w-full md:w-auto">
                      <div className="flex gap-1 bg-slate-200/50 p-1 rounded-xl">
                        <button
                          onClick={() => setActiveTab('annual')}
                          className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${
                            activeTab === 'annual'
                              ? 'bg-white text-primary shadow-md'
                              : 'text-text-muted hover:text-text-main'
                          }`}
                        >
                          연간계획서
                        </button>
                        <button
                          onClick={() => setActiveTab('monthly')}
                          className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${
                            activeTab === 'monthly'
                              ? 'bg-white text-primary shadow-md'
                              : 'text-text-muted hover:text-text-main'
                          }`}
                        >
                          월별일지
                        </button>
                      </div>

                      {/* Tone Setup */}
                      <div className="flex items-center px-3 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl shadow-sm mr-2">
                        <label className="text-xs font-bold text-blue-700 mr-2 uppercase tracking-wider">Tone</label>
                        <select
                          value={journalTone}
                          disabled={isLoading || isBatchGenerating || isExporting}
                          onChange={async (e) => {
                            const newTone = e.target.value as JournalTone;
                            setJournalTone(newTone);
                            if (activeTab === 'annual') {
                              if (selectedStudent) {
                                handleGenerateAnnualPlanDraft(newTone, '연간계획서 문체가 적용되어 목표가 갱신되었습니다.');
                              }
                            } else {
                              if (monthlyData) handleGenerateDraft(newTone);
                            }
                          }}
                          className="bg-transparent text-sm font-bold outline-none cursor-pointer text-slate-800"
                        >
                          <option value="normal">일반 임상 모드</option>
                          <option value="academic">학술 논문 모드</option>
                          <option value="expert">수석 샘플 모드</option>
                        </select>
                      </div>

                      <div className="flex items-center gap-2 px-4 bg-white border border-border-theme rounded-xl h-11 shadow-sm">
                        <Calendar className="w-4 h-4 text-text-muted" />
                        <select
                          value={selectedYear}
                          onChange={(e) => setSelectedYear(Number(e.target.value))}
                          className="bg-transparent text-sm font-bold outline-none cursor-pointer"
                        >
                          {[2024, 2025, 2026].map(y => (
                            <option key={y} value={y}>{y}년</option>
                          ))}
                        </select>
                        <div className="w-px h-4 bg-border-theme mx-1"></div>
                        <select
                          value={selectedMonth}
                          onChange={(e) => setSelectedMonth(Number(e.target.value))}
                          className="bg-transparent text-sm font-bold outline-none cursor-pointer"
                        >
                          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                            <option key={m} value={m}>{m}월</option>
                          ))}
                        </select>
                      </div>

                      <button
                        className={`flex items-center gap-2 px-4 py-2 rounded font-bold transition-all ${
                          isEditing
                            ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                            : 'bg-indigo-600 text-white shadow-md shadow-indigo-200 hover:bg-indigo-700 hover:shadow-lg active:scale-95'
                        }`}
                        onClick={handleOpenPreview}
                        disabled={isEditing}
                        title={isEditing ? '저장 후 미리보기가 가능합니다.' : ''}
                      >
                        <Printer size={16} />
                        미리보기 및 출력
                      </button>

                      <button
                        onClick={loadDocumentHistory}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white border border-border-theme text-text-main rounded-xl font-bold text-sm hover:bg-bg-theme transition-all"
                      >
                        <History className="w-4 h-4" />
                        이전 버전
                      </button>

                      <button
                        onClick={async () => {
                          const issues = await runPreflightChecks();
                          setUploadStatus({
                            type: issues.length ? 'error' : 'success',
                            message: issues.length ? `생성 전 확인 필요 ${issues.length}건` : 'AI 생성 전 점검을 통과했습니다.'
                          });
                          setTimeout(() => setUploadStatus(null), 3000);
                        }}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white border border-border-theme text-text-main rounded-xl font-bold text-sm hover:bg-bg-theme transition-all"
                      >
                        <ClipboardCheck className="w-4 h-4" />
                        AI 점검
                      </button>

                      <button
                        onClick={handleDownloadRequest}
                        className="flex items-center gap-2 px-6 py-2.5 bg-white border border-primary text-primary rounded-xl font-bold text-sm hover:bg-primary-light transition-all"
                      >
                        <Download className="w-4 h-4" />
                        워드 다운로드
                      </button>

                      <button
                        onClick={isEditing ? handleSaveDocument : () => setIsEditing(true)}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg ${
                          ((activeTab === 'annual' && annualData) || (activeTab === 'monthly' && monthlyData))
                            ? isEditing ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-emerald-500 text-white hover:bg-emerald-600'
                            : 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none border border-slate-200'
                        }`}
                        disabled={!((activeTab === 'annual' && annualData) || (activeTab === 'monthly' && monthlyData))}
                      >
                        {isEditing ? (
                          <>
                            <Check className="w-4 h-4" />
                            수정 완료 및 저장
                          </>
                        ) : (
                          <>
                            <Pencil className="w-4 h-4" />
                            내용 수정하기
                          </>
                        )}
                      </button>

                      <button
                        onClick={handleSaveDocument}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg ${
                          (activeTab === 'annual' && annualData) || (activeTab === 'monthly' && monthlyData)
                            ? 'bg-slate-800 text-white hover:bg-slate-900 shadow-slate-800/20'
                            : 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none border border-slate-200'
                        }`}
                        disabled={!((activeTab === 'annual' && annualData) || (activeTab === 'monthly' && monthlyData))}
                      >
                        <Save className="w-4 h-4" />
                        단순 저장
                      </button>

                      {activeTab === 'annual' && (
                        <>
                          <button
                            onClick={() => handleGenerateAnnualPlanDraft()}
                            disabled={isLoading}
                            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg ${
                              isLoading
                                ? 'bg-slate-200 text-slate-500 cursor-not-allowed shadow-none'
                                : 'bg-amber-500 text-white hover:bg-amber-600 shadow-amber-500/20'
                            }`}
                          >
                            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                            연간계획서 AI 생성
                          </button>
                          <button
                            onClick={() => {
                              setActiveTab('monthly');
                              if (!monthlyData || monthlyData.sessions.length === 0) handleGenerateDraft();
                            }}
                            disabled={isLoading}
                            className={`flex items-center gap-2 px-6 py-2.5 bg-white border border-amber-300 text-amber-700 rounded-xl font-bold text-sm transition-all ${
                              isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-amber-50'
                            }`}
                          >
                            <Sparkles className="w-4 h-4" />
                            해당 월 일지 생성
                          </button>
                        </>
                      )}

                      {activeTab === 'monthly' && (
                        <button
                          onClick={() => handleGenerateDraft()}
                          disabled={isLoading}
                          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg ${
                            isLoading
                              ? 'bg-slate-200 text-slate-500 cursor-not-allowed shadow-none'
                              : 'bg-amber-500 text-white hover:bg-amber-600 shadow-amber-500/20'
                          }`}
                        >
                          <Sparkles className="w-4 h-4" />
                          AI로 자동 생성
                        </button>
                      )}

                      <button
                        onClick={() => setShowBatchPanel(prev => !prev)}
                        disabled={isLoading || isBatchGenerating}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg ${
                          isLoading || isBatchGenerating
                            ? 'bg-slate-200 text-slate-500 cursor-not-allowed shadow-none'
                            : 'bg-purple-600 text-white hover:bg-purple-700 shadow-purple-500/20'
                        }`}
                      >
                        <Layers3 className="w-4 h-4" />
                        월별 일괄 생성
                      </button>
                    </div>
                  </div>

                  {(preflightIssues.length > 0 || qualityIssues.length > 0 || showBatchPanel) && (
                    <div className="no-print grid grid-cols-1 xl:grid-cols-3 gap-3">
                      {qualityIssues.length > 0 && (
                        <div className="bg-white border border-border-theme rounded-xl p-4">
                          <div className="flex items-center gap-2 mb-2 font-black text-sm text-text-main">
                            <ClipboardCheck className="w-4 h-4 text-primary" />
                            문서 품질 검사
                          </div>
                          <div className="space-y-1">
                            {qualityIssues.slice(0, 5).map((issue, idx) => (
                              <div key={idx} className={`text-xs font-semibold ${issue.level === 'error' ? 'text-red-600' : 'text-amber-700'}`}>- {issue.label}</div>
                            ))}
                            {qualityIssues.length > 5 && <div className="text-xs text-text-muted">외 {qualityIssues.length - 5}건</div>}
                          </div>
                        </div>
                      )}

                      {preflightIssues.length > 0 && (
                        <div className="bg-white border border-border-theme rounded-xl p-4">
                          <div className="flex items-center gap-2 mb-2 font-black text-sm text-text-main">
                            <AlertCircle className="w-4 h-4 text-amber-500" />
                            AI 생성 전 점검
                          </div>
                          <div className="space-y-1">
                            {preflightIssues.slice(0, 5).map((issue, idx) => (
                              <div key={idx} className="text-xs font-semibold text-amber-700">- {issue}</div>
                            ))}
                            {preflightIssues.length > 5 && <div className="text-xs text-text-muted">외 {preflightIssues.length - 5}건</div>}
                          </div>
                        </div>
                      )}

                      {showBatchPanel && (
                        <div className="bg-white border border-border-theme rounded-xl p-4">
                          <div className="flex items-center justify-between gap-2 mb-3">
                            <div className="flex items-center gap-2 font-black text-sm text-text-main">
                              <Layers3 className="w-4 h-4 text-purple-600" />
                              {selectedYear}년 월별 일괄 생성
                            </div>
                            <button
                              onClick={handleBatchGenerateMonthly}
                              disabled={isBatchGenerating}
                              className="px-3 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-black disabled:bg-slate-200 disabled:text-slate-400"
                            >
                              {isBatchGenerating ? '진행 중' : '시작'}
                            </button>
                          </div>
                          <div className="grid grid-cols-3 gap-1">
                            {([3,4,5,6,7,8,9,10,11,12,1,2]).map(month => {
                              const item = batchResults.find(result => result.month === month);
                              return (
                                <div key={month} className="border border-slate-100 rounded-lg px-2 py-1.5">
                                  <div className="text-xs font-black">{month}월</div>
                                  <div className={`text-[10px] font-bold ${
                                    item?.status === 'saved' ? 'text-emerald-600' :
                                    item?.status === 'fallback' ? 'text-amber-600' :
                                    item?.status === 'error' ? 'text-red-600' :
                                    item?.status === 'running' ? 'text-purple-600' : 'text-slate-400'
                                  }`}>{item?.message || '대기'}</div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Document Preview Container */}
                  <div className={`bg-white flex-1 rounded-3xl shadow-2xl shadow-slate-200/50 border border-border-theme overflow-auto relative print:hidden ${isEditing ? 'p-2 md:p-4' : 'p-6 md:p-12'}`}>
                    <AnimatePresence mode="wait">
                      {isLoading || isExporting ? (
                        <motion.div
                          key="loader"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="absolute inset-0 flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm z-10"
                        >
                          <div className="relative">
                            <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                            <Sparkles className="w-6 h-6 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
                          </div>
                          <p className="text-text-main font-bold mt-6 text-lg tracking-tight">AI가 전문적인 서류를 작성 중입니다...</p>
                          <p className="text-text-muted text-sm mt-2">잠시만 기다려 주세요.</p>
                        </motion.div>
                      ) : (
                        <motion.div
                          key={activeTab + (selectedStudent?.id || '')}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`document-container min-h-full ${isEditing ? 'w-full max-w-none' : ''}`}
                        >
                          {activeTab === 'annual' && annualData && annualData.currentLevel ? (
                            <>
                              {effectiveAnnualTemplate && (
                                <div className={`no-print mb-5 bg-white border border-border-theme rounded-2xl shadow-sm mx-auto px-5 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 ${isEditing ? 'max-w-none' : 'max-w-[210mm]'}`}>
                                  <div className="flex items-start gap-3 min-w-0">
                                    <div className="w-10 h-10 rounded-xl bg-primary-light flex items-center justify-center flex-shrink-0">
                                      <FileText className="w-5 h-5 text-primary" />
                                    </div>
                                    <div className="min-w-0">
                                      <div className="text-sm font-black text-text-main">
                                        {effectiveAnnualTemplateKind === 'combined_journal' ? '통합 샘플 양식 · 연간 폼 적용' : '연간계획서 샘플 양식'}
                                      </div>
                                      <div className="text-xs text-text-muted truncate">
                                        {effectiveAnnualTemplate.fileName} · {getTemplateApplyLabel(effectiveAnnualTemplate)}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex gap-2 flex-shrink-0">
                                    <button
                                      onClick={() => handleOpenDocumentTemplate(effectiveAnnualTemplateKind)}
                                      className="px-3 py-2 rounded-xl bg-white border border-border-theme text-xs font-bold text-text-main hover:bg-bg-theme"
                                    >
                                      파일 열기
                                    </button>
                                    <button
                                      onClick={() => {
                                        setActiveTemplateKind(effectiveAnnualTemplateKind);
                                        setShowTemplateModal(true);
                                      }}
                                      className="px-3 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark"
                                    >
                                      교체
                                    </button>
                                  </div>
                                </div>
                              )}
                              <AnnualPlan
                                student={displayStudent || selectedStudent}
                                data={annualData}
                                year={selectedYear}
                                isEditing={isEditing}
                                onUpdate={(newData) => setAnnualData(newData)}
                              />
                            </>
                          ) : activeTab === 'monthly' && monthlyData && monthlyData.sessions ? (
                            <>
                              {effectiveMonthlyTemplate && (
                                <div className={`no-print mb-5 bg-white border border-border-theme rounded-2xl shadow-sm mx-auto px-5 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 ${isEditing ? 'max-w-none' : 'max-w-[210mm]'}`}>
                                  <div className="flex items-start gap-3 min-w-0">
                                    <div className="w-10 h-10 rounded-xl bg-primary-light flex items-center justify-center flex-shrink-0">
                                      <FileText className="w-5 h-5 text-primary" />
                                    </div>
                                    <div className="min-w-0">
                                      <div className="text-sm font-black text-text-main">
                                        {effectiveMonthlyTemplateKind === 'combined_journal' ? '통합 샘플 양식 · 월간 폼 적용' : '월간일지 샘플 양식'}
                                      </div>
                                      <div className="text-xs text-text-muted truncate">
                                        {effectiveMonthlyTemplate.fileName} · {getTemplateApplyLabel(effectiveMonthlyTemplate)}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex gap-2 flex-shrink-0">
                                    <button
                                      onClick={() => handleOpenDocumentTemplate(effectiveMonthlyTemplateKind)}
                                      className="px-3 py-2 rounded-xl bg-white border border-border-theme text-xs font-bold text-text-main hover:bg-bg-theme"
                                    >
                                      파일 열기
                                    </button>
                                    <button
                                      onClick={() => {
                                        setActiveTemplateKind(effectiveMonthlyTemplateKind);
                                        setShowTemplateModal(true);
                                      }}
                                      className="px-3 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark"
                                    >
                                      교체
                                    </button>
                                  </div>
                                </div>
                              )}
                              {monthlyDateCheck && (
                                <div className={`no-print mb-5 bg-white border border-border-theme rounded-2xl shadow-sm overflow-hidden mx-auto ${isEditing ? 'max-w-none' : 'max-w-[210mm]'}`}>
                                  <div className="px-5 py-4 border-b border-border-theme bg-slate-50 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                      {monthlyDateCheck.mismatchCount === 0 ? (
                                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                      ) : (
                                        <AlertCircle className="w-5 h-5 text-amber-500" />
                                      )}
                                      <div>
                                        <div className="text-sm font-black text-text-main">월별일지 날짜 점검</div>
                                        <div className="text-xs text-text-muted">
                                          결제 {monthlyDateCheck.paymentCount}건 · 일지 {monthlyDateCheck.sessionCount}회 · 확인 필요 {monthlyDateCheck.mismatchCount}건
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  {monthlyDateCheck.rows.length > 0 ? (
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-xs border-collapse">
                                        <thead>
                                          <tr className="bg-white text-text-muted">
                                            <th className="text-left px-4 py-2 font-bold border-b border-border-theme w-16">회차</th>
                                            <th className="text-left px-4 py-2 font-bold border-b border-border-theme">결제 기록</th>
                                            <th className="text-left px-4 py-2 font-bold border-b border-border-theme">일지 날짜</th>
                                            <th className="text-left px-4 py-2 font-bold border-b border-border-theme w-28">상태</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {monthlyDateCheck.rows.map(row => (
                                            <tr key={row.index} className="border-b border-border-theme/60 last:border-b-0">
                                              <td className="px-4 py-2 font-bold text-text-muted">{row.index}</td>
                                              <td className="px-4 py-2 font-semibold text-text-main whitespace-nowrap">{row.paymentLabel}</td>
                                              <td className="px-4 py-2 font-semibold text-text-main whitespace-nowrap">{row.sessionLabel}</td>
                                              <td className="px-4 py-2">
                                                <span className={`inline-flex px-2 py-1 rounded-full border text-[11px] font-bold ${getDateCheckStatusClass(row.status)}`}>
                                                  {row.statusLabel}
                                                </span>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  ) : (
                                    <div className="px-5 py-4 text-sm text-text-muted">선택한 월의 결제 기록과 일지 회기가 없습니다.</div>
                                  )}
                                </div>
                              )}
                              <MonthlyJournal
                                student={displayStudent || selectedStudent}
                                data={monthlyData}
                                month={selectedMonth}
                                year={selectedYear}
                                isEditing={isEditing}
                                onUpdate={(newData) => setMonthlyData(newData)}
                                paymentRecords={selectedMonthlyPaymentRecords}
                                onSyncPaymentDates={syncMonthlySessionsToPaymentRecords}
                              />
                            </>
                          ) : (
                            <div className="flex flex-col items-center justify-center h-full py-20 text-text-muted opacity-50">
                              <FileText className="w-16 h-16 mb-4" />
                              <p className="text-lg font-bold">
                                {monthlyData && monthlyData.sessions.length === 0
                                  ? "해당 월의 치료 내역이 없습니다."
                                  : "서류 데이터를 생성할 수 없습니다."}
                              </p>
                              <p className="text-sm">데이터 형식이 올바른지 확인해 주세요.</p>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              )}
            </div>
          </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer - Hidden on Print */}
      <footer className="py-8 text-center text-text-muted text-xs no-print border-t border-border-theme bg-white">
        <div className="flex items-center justify-center gap-2 mb-2 font-bold text-slate-400">
          <FileText className="w-4 h-4" />
          <span>SLP.Docs Professional</span>
        </div>
        <p>© 2026 치료 서류 자동 생성 시스템. All rights reserved.</p>
      </footer>

      <ExportOptionsModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        onExecute={executeExport}
        defaultYear={selectedYear}
        defaultMonth={selectedMonth}
        defaultIncludeAnnual={activeTab === 'annual'}
        actionType={exportAction}
      />

      <PreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        activeTab={activeTab}
        student={displayStudent}
        annualData={annualData}
        monthlyData={monthlyData}
        combinedTemplate={combinedTemplateSample}
        annualTemplate={annualTemplateSample}
        monthlyTemplate={monthlyTemplateSample}
        selectedYear={selectedYear}
        selectedMonth={selectedMonth}
        paymentRecords={selectedMonthlyPaymentRecords}
      />

      <MonthlyTemplateModal
        isOpen={showTemplateModal}
        activeKind={activeTemplateKind}
        combinedTemplate={combinedTemplateSample}
        annualTemplate={annualTemplateSample}
        monthlyTemplate={monthlyTemplateSample}
        isUploading={isTemplateUploading}
        uploadProgress={templateUploadProgress}
        onClose={() => setShowTemplateModal(false)}
        onKindChange={setActiveTemplateKind}
        onUpload={handleUploadDocumentTemplate}
        onOpen={handleOpenDocumentTemplate}
        onDelete={handleDeleteDocumentTemplate}
      />

      {showHistoryModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 no-print">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowHistoryModal(false)} />
          <div className="relative bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-border-theme p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-xl font-black text-text-main flex items-center gap-2">
                  <History className="w-5 h-5 text-primary" />
                  이전 버전 복구
                </h3>
                <p className="text-sm text-text-muted mt-1">저장 전 자동 백업된 문서를 현재 편집본으로 불러옵니다.</p>
              </div>
              <button onClick={() => setShowHistoryModal(false)} className="text-text-muted hover:text-text-main">닫기</button>
            </div>

            <div className="max-h-[60vh] overflow-auto space-y-2">
              {historyEntries.length > 0 ? historyEntries.map(entry => (
                <div key={entry.id} className="border border-border-theme rounded-xl p-4 flex items-center justify-between gap-4">
                  <div>
                    <div className="font-bold text-text-main">
                      {entry.docType === 'annual' ? '연간계획서' : `${entry.month}월 월별일지`}
                    </div>
                    <div className="text-xs text-text-muted mt-1">
                      {entry.createdAtMs ? new Date(entry.createdAtMs).toLocaleString() : '저장 시각 정보 없음'}
                    </div>
                  </div>
                  <button
                    onClick={() => restoreHistoryEntry(entry)}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary-dark"
                  >
                    <RotateCcw className="w-4 h-4" />
                    복구
                  </button>
                </div>
              )) : (
                <div className="py-12 text-center text-text-muted font-semibold">저장된 이전 버전이 없습니다.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {showDraftModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 no-print">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowDraftModal(false)} />
          <div className="relative bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-border-theme p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-xl font-black text-text-main flex items-center gap-2">
                  <ArchiveRestore className="w-5 h-5 text-primary" />
                  자동 저장 복구함
                </h3>
                <p className="text-sm text-text-muted mt-1">저장하지 않고 남은 작성 중 문서를 불러오거나 삭제합니다.</p>
              </div>
              <button onClick={() => setShowDraftModal(false)} className="text-text-muted hover:text-text-main">닫기</button>
            </div>

            <div className="max-h-[60vh] overflow-auto space-y-2">
              {draftItems.length > 0 ? draftItems.map(item => (
                <div key={item.key} className="border border-border-theme rounded-xl p-4 flex items-center justify-between gap-4">
                  <div>
                    <div className="font-bold text-text-main">
                      {getStudentDisplayName(item.studentName)} · {item.type === 'annual' ? '연간계획서' : `${item.year}년 ${item.month}월 월별일지`}
                    </div>
                    <div className="text-xs text-text-muted mt-1">{item.key}</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => loadDraftItem(item)}
                      className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary-dark"
                    >
                      불러오기
                    </button>
                    <button
                      onClick={() => deleteDraftItem(item)}
                      className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-red-50 hover:text-red-600"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              )) : (
                <div className="py-12 text-center text-text-muted font-semibold">복구할 임시저장 문서가 없습니다.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {showMessageModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 no-print">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowMessageModal(false)} />
          <div className="relative bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-border-theme p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-xl font-black text-text-main flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-primary" />
                  메시지 발신
                </h3>
                <p className="text-sm text-text-muted mt-1">
                  {selectedStudent ? `${getStudentDisplayName(selectedStudent.name)} 학생 기준` : '학생 선택 전 기본 안내문'}
                </p>
              </div>
              <button onClick={() => setShowMessageModal(false)} className="text-text-muted hover:text-text-main">닫기</button>
            </div>

            <textarea
              readOnly
              value={selectedMessageText}
              className="min-h-[220px] w-full resize-y rounded-xl border border-border-theme bg-bg-theme p-4 text-sm font-semibold leading-relaxed text-text-main outline-none"
            />

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                onClick={copySelectedMessage}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-200"
              >
                <ClipboardCheck className="w-4 h-4" />
                내용 복사
              </button>
              <button
                onClick={openSmsDraft}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-black text-white hover:bg-primary-dark"
              >
                <MessageSquare className="w-4 h-4" />
                문자앱 열기
              </button>
            </div>
          </div>
        </div>
      )}

      {showPromptModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 no-print">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowPromptModal(false)} />
          <div className="relative bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-border-theme p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-xl font-black text-text-main flex items-center gap-2">
                  <Settings className="w-5 h-5 text-primary" />
                  AI 프롬프트 템플릿
                </h3>
                <p className="text-sm text-text-muted mt-1">생성 프롬프트에 추가로 반영할 기관별 작성 지침입니다.</p>
              </div>
              <button onClick={() => setShowPromptModal(false)} className="text-text-muted hover:text-text-main">닫기</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-black text-text-main">연간계획서 추가 지침</span>
                <textarea
                  className="min-h-[220px] border border-border-theme rounded-xl p-3 text-sm outline-none focus:border-primary"
                  value={promptTemplates.annual}
                  onChange={(e) => setPromptTemplates(prev => ({ ...prev, annual: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-black text-text-main">월별일지 추가 지침</span>
                <textarea
                  className="min-h-[220px] border border-border-theme rounded-xl p-3 text-sm outline-none focus:border-primary"
                  value={promptTemplates.monthly}
                  onChange={(e) => setPromptTemplates(prev => ({ ...prev, monthly: e.target.value }))}
                />
              </label>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setPromptTemplates(createDefaultPromptTemplates())}
                className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200"
              >
                기본값 복원
              </button>
              <button
                onClick={() => {
                  setShowPromptModal(false);
                  setUploadStatus({ type: 'success', message: '프롬프트 템플릿이 저장되었습니다.' });
                  setTimeout(() => setUploadStatus(null), 3000);
                }}
                className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary-dark"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* [CRITICAL] Direct Print Container - Only visible during window.print() */}
      {selectedStudent && !isPreviewOpen && (
        <div className="print-only hidden fixed inset-0 z-[9999] bg-white overflow-visible">
          <div className="export-print-container">
            {exportIncludeAnnual && annualData && (
              <div className="print-page-break">
                <AnnualPlan student={displayStudent || selectedStudent} data={annualData} year={exportMonthlyDataList[0]?.year || selectedYear} />
              </div>
            )}
            {exportMonthlyDataList.map((item, idx) => (
              <div key={`print-${idx}`} className="print-page-break">
                <MonthlyJournal
                  student={displayStudent || selectedStudent}
                  data={item.data}
                  month={item.month}
                  year={item.year}
                  paymentRecords={getGenericMonthlyPaymentRecords(selectedStudent.name, item.year, item.month)}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
