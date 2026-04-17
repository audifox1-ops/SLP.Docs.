import React, { useState, useEffect, useRef } from 'react';
import { Search, Printer, Download, FileText, Calendar, Loader2, Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Sparkles, Zap, ShieldCheck, ArrowRight, Trash2, Save, Pencil, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Student, AnnualPlanData, MonthlyJournalData, StudentInfo, PaymentRecord, JournalTone } from './types';
import { generateAnnualPlan, generateMonthlyJournal } from './services/aiService';
import { AnnualPlan } from './components/AnnualPlan';
import { MonthlyJournal } from './components/MonthlyJournal';
import { ExportOptionsModal, ExportOptions } from './components/ExportOptionsModal';
import { exportMultiMonthDocs } from './utils/docxExport';
import { StudentManagement } from './components/StudentManagement';
import { uploadFile, uploadBlob, deleteFileFromStorage } from './services/storageService';
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

export default function App() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [activeTab, setActiveTab] = useState<'annual' | 'monthly'>('annual');
  const [annualData, setAnnualData] = useState<AnnualPlanData | null>(null);
  const [monthlyData, setMonthlyData] = useState<MonthlyJournalData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [currentView, setCurrentView] = useState<'docs' | 'students'>('docs');
  const [journalTone, setJournalTone] = useState<JournalTone>('expert');
  const [isEditing, setIsEditing] = useState(false);
  
  // Export Modal State
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportAction, setExportAction] = useState<'print' | 'download' | null>(null);
  const [exportMonthlyDataList, setExportMonthlyDataList] = useState<{ month: number; year: number; data: MonthlyJournalData }[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [exportIncludeAnnual, setExportIncludeAnnual] = useState(true);
  
  // Student Info Management State
  const [studentInfos, setStudentInfos] = useState<StudentInfo[]>([]);
  const [allPaymentRecords, setAllPaymentRecords] = useState<PaymentRecord[]>([]);
  const hasInitialLoaded = useRef(false);
  
  // Student List State
  const [fullStudentList, setFullStudentList] = useState<string[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<string[]>([]);

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
        // Ignore specific transient errors so they don't break the app
        if (!err.message.includes('QUIC_PEER_GOING_AWAY')) {
          handleFirestoreError(err, OperationType.LIST, 'students');
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
        if (!err.message.includes('QUIC_PEER_GOING_AWAY')) {
          handleFirestoreError(err, OperationType.LIST, 'payment_records');
        }
      }
    });

    return () => {
      unsubStudents();
      unsubPayments();
    };
  }, []);

  // Sync selected student data when studentInfos or allPaymentRecords change
  useEffect(() => {
    if (selectedStudent) {
      const updatedInfo = studentInfos.find(s => s.name === selectedStudent.name);
      if (updatedInfo) {
        const studentRecords = allPaymentRecords.filter(r => r.studentName === updatedInfo.name);
        const paymentDates = studentRecords
          .map(r => r.transactionDate)
          .filter(Boolean)
          .sort();

        setSelectedStudent(prev => {
          if (!prev) return null;
          // Only update if data actually changed to avoid unnecessary re-renders
          if (
            prev.birthDate === updatedInfo.birthDate &&
            prev.school === updatedInfo.school &&
            prev.disabilityType === updatedInfo.disabilityType &&
            prev.treatmentArea === updatedInfo.treatmentArea &&
            prev.therapistName === updatedInfo.therapistName &&
            JSON.stringify(prev.paymentDates) === JSON.stringify(paymentDates)
          ) {
            return prev;
          }

          return {
            ...prev,
            birthDate: updatedInfo.birthDate,
            school: updatedInfo.school,
            disabilityType: updatedInfo.disabilityType,
            treatmentArea: updatedInfo.treatmentArea,
            therapistName: updatedInfo.therapistName,
            paymentDates: paymentDates
          };
        });
      }
    }
  }, [studentInfos, allPaymentRecords]);

  const handleAddStudentInfo = async (info: StudentInfo) => {
    if (studentInfos.some(s => s.name === info.name)) {
      setUploadStatus({ type: 'error', message: '이미 등록된 학생 이름입니다.' });
      setTimeout(() => setUploadStatus(null), 3000);
      return;
    }
    try {
      await setDoc(doc(db, 'students', info.name), info);
      setUploadStatus({ type: 'success', message: '학생 정보가 등록되었습니다.' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'students');
    }
    setTimeout(() => setUploadStatus(null), 3000);
  };

  const handleUpdateStudentInfo = async (oldName: string, info: StudentInfo) => {
    try {
      if (oldName !== info.name) {
        await deleteDoc(doc(db, 'students', oldName));
        await setDoc(doc(db, 'students', info.name), info);
        
        // If the selected student's name was changed, update the selected student ID
        if (selectedStudent && selectedStudent.name === oldName) {
          setSelectedStudent(prev => prev ? { ...prev, id: info.name, name: info.name } : null);
        }
      } else {
        await setDoc(doc(db, 'students', info.name), info);
      }
      setUploadStatus({ type: 'success', message: '학생 정보가 수정되었습니다.' });
    } catch (err) {
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

      const batch = writeBatch(db);
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      
      await batch.commit();
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
      const reader = new FileReader();
      const extension = file.name.split('.').pop()?.toLowerCase();

      const normalizeData = (data: any[]) => {
        return data.map(row => {
          const normalized: any = {};
          Object.keys(row).forEach(key => {
            const trimmedKey = key.trim();
            normalized[trimmedKey] = typeof row[key] === 'string' ? row[key].trim() : row[key];
          });
          return normalized;
        });
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
          const obj: any = {};
          headers.forEach((header, idx) => {
            if (header) obj[header] = row[idx];
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
          complete: (results) => {
            const parsedData = findHeaderAndParse(results.data as any[][]);
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

            // Firebase Save with Duplicate Check
            saveRecordsToFirebase(processed);

            setRawRecords(processed);
            setIsDataLoaded(true);
            setUploadStatus({ type: 'success', message: `데이터가 성공적으로 로드되었습니다. 잠시 후 목록이 업데이트됩니다.` });
          },
          error: (error) => {
            setUploadStatus({ type: 'error', message: 'CSV 파싱 중 오류가 발생했습니다.' });
            setTimeout(() => setUploadStatus(null), 5000);
          }
        });
      } else if (extension === 'xlsx' || extension === 'xls') {
        reader.onload = (e) => {
          try {
            const data = new Uint8Array(e.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
            
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

            // Firebase Save with Duplicate Check
            saveRecordsToFirebase(processed);

            setRawRecords(processed);
            setIsDataLoaded(true);
            setUploadStatus({ type: 'success', message: `데이터가 성공적으로 로드되었습니다. 잠시 후 목록이 업데이트됩니다.` });
          } catch (error) {
            setUploadStatus({ type: 'error', message: '엑셀 파싱 중 오류가 발생했습니다.' });
            setTimeout(() => setUploadStatus(null), 5000);
          }
        };
        reader.readAsArrayBuffer(file);
      } else {
        setUploadStatus({ type: 'error', message: '지원하지 않는 파일 형식입니다. CSV 또는 XLSX 파일을 업로드해 주세요.' });
        setTimeout(() => setUploadStatus(null), 5000);
      }
    };

  const saveRecordsToFirebase = async (records: RawRecord[]) => {
    setIsLoading(true);
    let addedCount = 0;
    let duplicateCount = 0;

    try {
      // Use a batch for efficiency
      const batch = writeBatch(db);
      
      for (const record of records) {
        const name = String(record['학생이름'] || record['학생 이름'] || record['이름'] || record['성명'] || record['성함'] || record['대상자'] || '').trim();
        const date = String(record['거래일자'] || record['거래 일자'] || record['날짜'] || record['결제일'] || record['결제 일자'] || record['일자'] || record['Date'] || record['거래일'] || '').trim();
        const amount = record['금액'] || 0;
        const area = String(record['지원영역'] || record['지원 영역'] || record['치료영역'] || record['영역'] || record['서비스'] || '언어치료').trim();

        // Duplicate Check: name + date + amount + area
        const isDuplicate = allPaymentRecords.some(r => 
          r.studentName === name && 
          r.transactionDate === date && 
          String(r.amount) === String(amount) && 
          r.treatmentArea === area
        );

        if (isDuplicate) {
          duplicateCount++;
          continue;
        }

        const newRecordRef = doc(collection(db, 'payment_records'));
        batch.set(newRecordRef, {
          studentName: name,
          transactionDate: date,
          amount: amount,
          treatmentArea: area,
          createdAt: serverTimestamp()
        });
        addedCount++;
      }

      if (addedCount > 0) {
        await batch.commit();
      }

      setUploadStatus({ 
        type: 'success', 
        message: `총 ${addedCount}건이 업로드되었으며, ${duplicateCount}건의 중복 데이터는 제외되었습니다.` 
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
    const studentRecords = allPaymentRecords.filter(r => r.studentName === name);
    
    // Look up student info in management system
    const info = studentInfos.find(s => s.name === name);
    
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
      const dateStr = String(r.transactionDate);
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
        day: '정보 없음',
        time: '정보 없음',
        frequency: '1'
      },
      startDate: `${selectedYear}.03`,
      therapistName: info.therapistName,
      paymentDates: paymentDates,
      monthlyAreas: monthlyAreas,
      referenceData: info.referenceData,
      referenceFileName: info.referenceFileName,
      specialNotes: info.specialNotes
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

  const handleSaveDocument = async () => {
    if (!selectedStudent) return;
    
    setIsLoading(true);
    try {
      if (activeTab === 'annual' && annualData) {
        // Save Annual Plan
        await setDoc(doc(db, 'annual_plans', selectedStudent.name), annualData);
        setUploadStatus({ type: 'success', message: '연간계획서가 성공적으로 저장되었습니다.' });
      } else if (activeTab === 'monthly' && monthlyData) {
        // Save Monthly Journal
        const docId = `${selectedStudent.name}_${selectedYear}_${selectedMonth}`;
        await setDoc(doc(db, 'monthly_journals', docId), monthlyData);
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

  const handleGenerateDraft = async (toneToUse: JournalTone = journalTone) => {
    if (!selectedStudent) return;
    
    setIsLoading(true);
    try {
      // Generate 4 virtual dates for the selected month (e.g., every Wednesday)
      const virtualDates = [];
      for (let i = 1; i <= 4; i++) {
        const day = 7 * i - 3; // Roughly once a week
        virtualDates.push(`${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
      }

      const studentWithVirtualDates = { ...selectedStudent, paymentDates: virtualDates };
      
      // 1. Get goal from existing annual data if available, otherwise generate
      let currentAnnual = annualData;
      if (!currentAnnual) {
        currentAnnual = await generateAnnualPlan(selectedStudent, toneToUse, selectedStudent.referenceData);
        setAnnualData(currentAnnual);
      }
      
      const monthlyGoal = currentAnnual.monthlyGoals.find(g => g.month === selectedMonth)?.goal || "연간계획서에 목표가 설정되지 않았습니다.";
      
      const monthly = await generateMonthlyJournal(studentWithVirtualDates, selectedMonth, monthlyGoal, toneToUse, selectedStudent.referenceData);
      setMonthlyData(monthly);
      
      setUploadStatus({ type: 'success', message: '가상 일지가 생성되었습니다. (결제 내역이 없는 경우 임시로 생성됨)' });
    } catch (error: any) {
      console.error("Draft generation failed:", error);
      
      if (error.message?.includes('429') || JSON.stringify(error).includes('429')) {
        setUploadStatus({ 
          type: 'error', 
          message: 'Gemini API 할당량이 초과되었습니다. 잠시 후 다시 시도해 주세요. (무료 티어는 사용량이 제한되어 있습니다.)' 
        });
      } else {
        setUploadStatus({ type: 'error', message: '가상 일지 생성 중 오류가 발생했습니다.' });
      }
    } finally {
      setIsLoading(false);
      setTimeout(() => setUploadStatus(null), 3000);
    }
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
          const dStr = String(d).trim();
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
        if (annualDoc.exists()) {
          const savedAnnual = annualDoc.data() as AnnualPlanData;
          setAnnualData(savedAnnual);
          setIsLoading(false);
          return;
        }
      } else {
        const docId = `${student.name}_${selectedYear}_${selectedMonth}`;
        const monthlyDoc = await getDoc(doc(db, 'monthly_journals', docId));
        if (monthlyDoc.exists()) {
          const savedMonthly = monthlyDoc.data() as MonthlyJournalData;
          setMonthlyData(savedMonthly);
          
          // Also try to load annual if not present (needed for goals context)
          if (!annualData) {
            const annualDoc = await getDoc(doc(db, 'annual_plans', student.name));
            if (annualDoc.exists()) setAnnualData(annualDoc.data() as AnnualPlanData);
          }
          
          setIsLoading(false);
          return;
        }
      }

      // AI Generation with Mock Fallback
      let annual: AnnualPlanData | null = null;
      let monthly: MonthlyJournalData | null = null;

      try {
        // 1. Generate Annual Plan first to get the monthly goal context
        // Check if annualData exists in state first to avoid redundant AI calls
        let currentAnnual = annualData;
        if (!currentAnnual) {
          const annualDoc = await getDoc(doc(db, 'annual_plans', student.name));
          if (annualDoc.exists()) {
            currentAnnual = annualDoc.data() as AnnualPlanData;
          } else {
            currentAnnual = await generateAnnualPlan(student, toneToUse, student.referenceData);
          }
          setAnnualData(currentAnnual);
        }
        annual = currentAnnual;
        
        // 2. Extract the goal for the selected month
        const monthlyGoal = annual.monthlyGoals.find(g => g.month === selectedMonth)?.goal || "연간계획서에 목표가 설정되지 않았습니다.";
        
        // 3. Generate Monthly Journal using the extracted goal
        if (filteredDates.length > 0) {
          monthly = await generateMonthlyJournal(studentWithFilteredDates, selectedMonth, monthlyGoal, toneToUse, student.referenceData);
        } else {
          monthly = {
            currentLevel: "해당 월의 치료 내역이 없습니다.",
            monthlyGoal: monthlyGoal,
            sessions: [],
            result: "내역 없음"
          };
        }
      } catch (aiError: any) {
        console.warn("AI generation failed, using mock data:", aiError);
        
        // Quota check (429)
        if (aiError.message?.includes('429') || JSON.stringify(error).includes('429')) {
          setUploadStatus({ 
            type: 'error', 
            message: 'Gemini API 할당량이 초과되었습니다(일일 20회). 잠시 후 다시 시도하거나 나중에 이용해 주세요. 현재는 임시 데이터로 표시됩니다.' 
          });
          setTimeout(() => setUploadStatus(null), 10000);
        }
        // Fallback to mock data if AI fails
        annual = {
          currentLevel: ["전문적인 관찰 및 평가가 필요함.", "기초적인 의사소통 능력 탐색 중임."],
          longTermGoals: ["전반적인 치료 목표 달성을 위한 기초 다지기.", "상호작용 및 표현 능력 향상."],
          monthlyGoals: Array.from({ length: 12 }).map((_, i) => ({
            month: (i + 2) % 12 + 1,
            goal: "월간 치료 목표 수립 및 이행",
            content: "영역별 맞춤 치료 프로그램 실시"
          }))
        };
        
        const monthlyGoal = annual.monthlyGoals.find(g => g.month === selectedMonth)?.goal || "연간계획서에 목표가 설정되지 않았습니다.";
        monthly = {
          currentLevel: "현재 치료 목표에 따른 활동을 수행 중임.",
          monthlyGoal: monthlyGoal,
          sessions: generateMockSessions(filteredDates, student.treatmentArea, monthlyGoal),
          result: "긍정적인 변화가 관찰되며 지속적인 지도가 필요함."
        };
      }
      
      if (!annual || !monthly) {
        throw new Error('데이터를 생성하지 못했습니다.');
      }

      // Ensure all filtered dates are present in sessions even if AI missed some
      if (monthly && monthly.sessions) {
        const monthlyGoal = annual.monthlyGoals.find(g => g.month === selectedMonth)?.goal || "연간계획서에 목표가 설정되지 않았습니다.";
        const sessionDates = new Set(monthly.sessions.map(s => s.date));
        const missingDates = filteredDates.filter(d => !sessionDates.has(d));
        
        if (missingDates.length > 0) {
          const mockMissing = generateMockSessions(missingDates, student.treatmentArea, monthlyGoal);
          monthly.sessions = [...monthly.sessions, ...mockMissing].sort((a, b) => a.date.localeCompare(b.date));
        }
      }
      
      console.log("월별일지 전달 데이터:", monthly?.sessions);
      
      setAnnualData(annual);
      setMonthlyData(monthly);
    } catch (error) {
      console.error("Data fetch error:", error);
      alert('서류 데이터를 생성하는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedStudent) {
      fetchData(selectedStudent, journalTone);
    }
  }, [selectedMonth, selectedYear]);

  // Hook for Auto-Generation
  useEffect(() => {
    if (activeTab === 'monthly' && selectedStudent && monthlyData && monthlyData.sessions.length === 0 && !isLoading) {
      handleGenerateDraft();
    }
  }, [activeTab, monthlyData, selectedStudent, isLoading]);

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

  const executeExport = async (options: ExportOptions) => {
    if (!selectedStudent) return;
    
    setShowExportModal(false);
    setIsExporting(true);
    setExportIncludeAnnual(options.includeAnnual);
    
    try {
      // 1. Ensure Annual Data exists
      let currentAnnual = annualData;
      if (!currentAnnual) {
        currentAnnual = await generateAnnualPlan(selectedStudent);
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
              const dStr = String(d).trim();
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
        const monthlyGoal = currentAnnual.monthlyGoals.find(g => g.month === monthNum)?.goal || "연간계획서에 목표가 설정되지 않았습니다.";
        
        // [Optimization] Check Firestore first to avoid redundant AI calls
        let mData: MonthlyJournalData | null = null;
        const docId = `${selectedStudent.name}_${yearStr}_${monthNum}`;
        const monthlyDoc = await getDoc(doc(db, 'monthly_journals', docId));
        
        if (monthlyDoc.exists()) {
          mData = monthlyDoc.data() as MonthlyJournalData;
          console.log(`[Cache] Using saved journal for ${yearStr}-${monthNum}`);
        } else if (filteredDates.length > 0) {
          // No saved data, generate check
          console.log(`[AI] Generating new journal for ${yearStr}-${monthNum}`);
          mData = await generateMonthlyJournal(studentWithFilteredDates, monthNum, monthlyGoal);
        } else {
          mData = {
            currentLevel: "해당 월의 치료 내역이 없습니다.",
            monthlyGoal: monthlyGoal,
            sessions: [],
            result: "내역 없음"
          };
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
        await exportMultiMonthDocs(selectedStudent, currentAnnual, multiMonthData, options.includeAnnual, startMonth, endMonth);
        setExportAction(null);
      }
      // For print, we wait for useEffect to trigger after render
    } catch (err) {
      console.error(err);
      alert('서류 생성 중 오류가 발생했습니다.');
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
        </nav>

        <div className="flex items-center gap-4">
          {isDataLoaded && (
            <button 
              onClick={() => {
                setIsDataLoaded(false);
                setRawRecords([]);
                setSelectedStudent(null);
                setUploadStatus(null);
                setSearchTerm('');
              }}
              className="text-sm font-semibold text-text-muted hover:text-primary transition-colors flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-primary-light"
            >
              <Upload className="w-4 h-4" />
              새 파일 업로드
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
        ) : !isDataLoaded ? (
          <div className="flex-1 flex flex-col items-center px-6 py-12 md:py-20 no-print overflow-auto">
            {/* Hero Section */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center mb-12 max-w-3xl"
            >
              <h1 className="text-4xl md:text-5xl font-black text-text-main mb-6 tracking-tight leading-tight">
                복잡한 교육청 서류,<br />
                <span className="text-primary">단 10초 만에</span> 완성하세요.
              </h1>
              <p className="text-lg md:text-xl text-text-muted leading-relaxed">
                엑셀 데이터 업로드 한 번으로 연간계획서와 월별일지를<br className="hidden md:block" />
                자동 생성하고 즉시 출력합니다.
              </p>
            </motion.div>

            {/* Main Work Card */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 }}
              className="w-full max-w-2xl bg-white rounded-[2rem] shadow-2xl shadow-primary/5 border border-border-theme p-8 md:p-12 mb-16 relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-primary to-primary-dark"></div>
              
              <div 
                className="flex flex-col items-center text-center cursor-pointer group"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const file = e.dataTransfer.files?.[0];
                  if (file) processFile(file);
                }}
              >
                <div className="bg-primary-light p-8 rounded-3xl mb-8 group-hover:scale-110 group-hover:rotate-3 transition-all duration-500">
                  <FileSpreadsheet className="w-16 h-16 text-primary" />
                </div>
                <h2 className="text-2xl font-bold text-text-main mb-4">데이터 파일 업로드</h2>
                <p className="text-text-muted mb-8 leading-relaxed">
                  학생들의 결제 내역이 담긴 CSV 또는 엑셀 파일을<br />
                  드래그하여 놓거나 클릭하여 선택해 주세요.
                </p>
                <div className="flex flex-wrap justify-center gap-3 mb-8">
                  {['학생이름', '거래일자', '지원영역', '소속 학교'].map(tag => (
                    <span key={tag} className="bg-bg-theme px-4 py-1.5 rounded-full border border-border-theme text-xs font-bold text-text-muted">
                      {tag}
                    </span>
                  ))}
                </div>
                <button className="bg-primary text-white px-8 py-4 rounded-2xl font-bold flex items-center gap-2 hover:bg-primary-dark transition-all shadow-lg shadow-primary/20">
                  파일 선택하기
                  <ArrowRight className="w-5 h-5" />
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileUpload} 
                  accept=".csv, .xlsx, .xls" 
                  className="hidden" 
                />
              </div>
            </motion.div>

            {/* Feature Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl">
              {[
                { 
                  icon: Zap, 
                  title: "간편한 엑셀 연동", 
                  desc: "드래그 앤 드롭으로 결제 내역을 즉시 로드합니다." 
                },
                { 
                  icon: Sparkles, 
                  title: "AI 맞춤형 작성", 
                  desc: "학생별 치료 영역에 맞춘 목표를 자동 생성합니다." 
                },
                { 
                  icon: ShieldCheck, 
                  title: "완벽한 출력 지원", 
                  desc: "A4 용지 규격에 최적화된 인쇄 및 PDF 저장을 지원합니다." 
                }
              ].map((feature, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + i * 0.1 }}
                  className="bg-white p-8 rounded-2xl border border-border-theme shadow-sm hover:-translate-y-1 hover:shadow-xl transition-all duration-300 group"
                >
                  <div className="bg-primary-light w-12 h-12 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    <feature.icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-bold text-text-main mb-2">{feature.title}</h3>
                  <p className="text-sm text-text-muted leading-relaxed">{feature.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex overflow-hidden">
            {/* Sidebar - Student List */}
            <aside className="w-80 border-r border-border-theme bg-white flex flex-col no-print">
              <div className="p-4 border-b border-border-theme bg-bg-theme/30">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="학생 이름 검색..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-border-theme rounded-xl focus:border-primary outline-none transition-all text-sm font-medium shadow-sm"
                  />
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-4 h-4" />
                </div>
                <div className="mt-3 flex items-center justify-between text-[10px] font-bold text-text-muted uppercase tracking-wider px-1">
                  <span>학생 목록</span>
                  <span className="bg-primary-light text-primary px-2 py-0.5 rounded-full">{filteredStudents.length}명</span>
                </div>
              </div>
              
              <div className="flex-1 overflow-auto p-2 space-y-1">
                <AnimatePresence initial={false}>
                  {filteredStudents.length > 0 ? (
                    filteredStudents.map((name) => (
                      <motion.div
                        key={name}
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => handleStudentSelect(name)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            handleStudentSelect(name);
                          }
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left group cursor-pointer ${
                          selectedStudent?.name === name
                            ? 'bg-primary-light text-primary shadow-sm border border-primary/10'
                            : 'hover:bg-bg-theme text-text-main border border-transparent'
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs transition-colors ${
                          selectedStudent?.name === name ? 'bg-primary text-white' : 'bg-slate-100 text-slate-400 group-hover:bg-white'
                        }`}>
                          {name.charAt(0)}
                        </div>
                        <span className="font-semibold text-sm">{name}</span>
                        
                        <div className="ml-auto flex items-center gap-2">
                          {!studentInfos.some(s => s.name === name) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAutoRegister(name);
                              }}
                              className="px-2 py-1 bg-primary/10 text-primary text-[10px] font-bold rounded-md hover:bg-primary hover:text-white transition-all"
                            >
                              정보 등록
                            </button>
                          )}
                          {selectedStudent?.name === name && (
                            <motion.div layoutId="active-indicator" className="w-1.5 h-1.5 rounded-full bg-primary" />
                          )}
                        </div>
                      </motion.div>
                    ))
                  ) : (
                    <div className="py-12 text-center text-text-muted">
                      <Search className="w-8 h-8 mx-auto mb-2 opacity-20" />
                      <p className="text-xs">검색 결과가 없습니다.</p>
                    </div>
                  )}
                </AnimatePresence>
              </div>

              <div className="p-4 border-t border-border-theme bg-bg-theme/10">
                <button
                  onClick={handleResetAllData}
                  className="w-full flex items-center justify-center gap-2 py-2 text-[11px] font-bold text-red-500 hover:bg-red-50 rounded-lg transition-all border border-transparent hover:border-red-100"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  저장된 전체 내역 초기화
                </button>
              </div>
            </aside>

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
                      <h2 className="text-2xl font-bold text-text-main">{selectedStudent.name} 학생</h2>
                      <p className="text-sm text-text-muted">{selectedStudent.treatmentArea} · {selectedStudent.school}</p>
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
                          onChange={async (e) => {
                            const newTone = e.target.value as JournalTone;
                            setJournalTone(newTone);
                            if (activeTab === 'annual') {
                              if (selectedStudent) {
                                setIsLoading(true);
                                try {
                                  const latestAnnual = await generateAnnualPlan(selectedStudent, newTone);
                                  setAnnualData(latestAnnual);
                                  setMonthlyData(null); // Clear monthly to force sync on next view
                                  setUploadStatus({ type: 'success', message: '연간계획서 문체가 적용되어 목표가 갱신되었습니다.' });
                                } catch (error) {
                                  console.error(error);
                                  setUploadStatus({ type: 'error', message: '연간계획서 갱신 중 오류가 발생했습니다.' });
                                } finally {
                                  setIsLoading(false);
                                  setTimeout(() => setUploadStatus(null), 3000);
                                }
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
                        onClick={handleDownloadRequest}
                        className="flex items-center gap-2 px-6 py-2.5 bg-white border border-primary text-primary rounded-xl font-bold text-sm hover:bg-primary-light transition-all"
                      >
                        <Download className="w-4 h-4" />
                        워드 다운로드
                      </button>

                      <button 
                        onClick={handlePrintRequest}
                        className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary-dark transition-all shadow-lg shadow-primary/20"
                      >
                        <Printer className="w-4 h-4" />
                        인쇄하기
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
                        <button 
                          onClick={() => {
                            setActiveTab('monthly');
                            // Because of the auto-generation useEffect listening to activeTab === 'monthly',
                            // this will automatically trigger handleGenerateDraft if it's empty!
                            // But if they want to explicitly generate right now, we can call it:
                            if (!monthlyData || monthlyData.sessions.length === 0) handleGenerateDraft();
                          }}
                          className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 text-white rounded-xl font-bold text-sm hover:bg-amber-600 transition-all shadow-lg shadow-amber-500/20"
                        >
                          <Sparkles className="w-4 h-4" />
                          해당 월 일지 생성
                        </button>
                      )}

                      {activeTab === 'monthly' && (!monthlyData || monthlyData.sessions.length === 0) && (
                        <button 
                          onClick={() => handleGenerateDraft()}
                          className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 text-white rounded-xl font-bold text-sm hover:bg-amber-600 transition-all shadow-lg shadow-amber-500/20"
                        >
                          <Sparkles className="w-4 h-4" />
                          가상 일지 생성
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Document Preview Container */}
                  <div className="bg-white flex-1 rounded-3xl shadow-2xl shadow-slate-200/50 border border-border-theme p-6 md:p-12 overflow-auto relative print:hidden">
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
                          className="document-container min-h-full"
                        >
                          {activeTab === 'annual' && annualData && annualData.currentLevel ? (
                            <AnnualPlan 
                              student={selectedStudent} 
                              data={annualData} 
                              year={selectedYear} 
                              isEditing={isEditing}
                              onUpdate={(newData) => setAnnualData(newData)}
                            />
                          ) : activeTab === 'monthly' && monthlyData && monthlyData.sessions ? (
                            <MonthlyJournal 
                              student={selectedStudent} 
                              data={monthlyData} 
                              month={selectedMonth} 
                              year={selectedYear} 
                              isEditing={isEditing}
                              onUpdate={(newData) => setMonthlyData(newData)}
                            />
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
        actionType={exportAction}
      />

      {/* [CRITICAL] Direct Print Container - Only visible during window.print() */}
      {selectedStudent && (
        <div className="print-only hidden fixed inset-0 z-[9999] bg-white overflow-visible">
          <div className="export-print-container">
            {exportIncludeAnnual && annualData && (
              <div className="print-page-break">
                <AnnualPlan student={selectedStudent} data={annualData} year={exportMonthlyDataList[0]?.year || selectedYear} />
              </div>
            )}
            {exportMonthlyDataList.map((item, idx) => (
              <div key={`print-${idx}`} className="print-page-break">
                <MonthlyJournal student={selectedStudent} data={item.data} month={item.month} year={item.year} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
