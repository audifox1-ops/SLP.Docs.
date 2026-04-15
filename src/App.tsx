import React, { useState, useEffect, useRef } from 'react';
import { Search, Printer, Download, FileText, Calendar, Loader2, Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Sparkles, Zap, ShieldCheck, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Student, AnnualPlanData, MonthlyJournalData, StudentInfo, PaymentRecord } from './types';
import { generateAnnualPlan, generateMonthlyJournal } from './services/aiService';
import { AnnualPlan } from './components/AnnualPlan';
import { MonthlyJournal } from './components/MonthlyJournal';
import { StudentManagement } from './components/StudentManagement';
import { db, OperationType, handleFirestoreError } from './firebase';
import { 
  collection, 
  addDoc, 
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
  
  // Student Info Management State
  const [studentInfos, setStudentInfos] = useState<StudentInfo[]>([]);
  const [allPaymentRecords, setAllPaymentRecords] = useState<PaymentRecord[]>([]);

  // Firestore Listeners
  useEffect(() => {
    const qStudents = collection(db, 'students');
    const unsubStudents = onSnapshot(qStudents, (snapshot) => {
      const infos = snapshot.docs.map(doc => doc.data() as StudentInfo);
      setStudentInfos(infos);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'students'));

    const qPayments = collection(db, 'payment_records');
    const unsubPayments = onSnapshot(qPayments, (snapshot) => {
      const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PaymentRecord));
      setAllPaymentRecords(records);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'payment_records'));

    return () => {
      unsubStudents();
      unsubPayments();
    };
  }, []);

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
  const [uniqueStudents, setUniqueStudents] = useState<string[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<string[]>([]);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

            const names = Array.from(new Set(processed.map(r => 
              String(r['학생이름'] || r['학생 이름'] || r['이름'] || r['성명'] || r['성함'] || r['대상자'] || r['대상자명'] || '').trim()
            ))).filter(Boolean);

            setRawRecords(processed);
            setUniqueStudents(names);
            setFilteredStudents(names);
            setIsDataLoaded(true);
            setUploadStatus({ type: 'success', message: `데이터가 성공적으로 로드되었습니다 (총 ${processed.length}건, 학생 ${names.length}명)` });
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

            const names = Array.from(new Set(processed.map(r => 
              String(r['학생이름'] || r['학생 이름'] || r['이름'] || r['성명'] || r['성함'] || r['대상자'] || r['대상자명'] || '').trim()
            ))).filter(Boolean);

            setRawRecords(processed);
            setUniqueStudents(names);
            setFilteredStudents(names);
            setIsDataLoaded(true);
            setUploadStatus({ type: 'success', message: `데이터가 성공적으로 로드되었습니다 (총 ${processed.length}건, 학생 ${names.length}명)` });
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
    ]));
    
    setUniqueStudents(allNames);
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
      paymentDates: paymentDates
    };

    setSelectedStudent(student);
    await fetchData(student);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const term = searchTerm.trim().toLowerCase();
    if (!term) return;

    const name = uniqueStudents.find(n => n.toLowerCase().includes(term));
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

  const fetchData = async (student: Student) => {
    setIsLoading(true);
    setAnnualData(null);
    setMonthlyData(null);
    
    try {
      // More robust date filtering by year and month
      const yearStr = selectedYear.toString();
      const monthStr = selectedMonth.toString();
      const paddedMonthStr = monthStr.padStart(2, '0');
      
      // FIX: Ensure we handle various date formats correctly for filtering
      const filteredDates = student.paymentDates.filter(d => {
        const dStr = String(d).replace(/\s/g, '');
        if (!dStr.includes(yearStr)) return false;

        // Check for month match in YYYY-MM-DD or YYYY.MM.DD or YYYY/MM/DD
        const parts = dStr.split(/[-./]/);
        // Usually [YYYY, MM, DD] or [MM, DD, YYYY]
        return parts.some(p => p === monthStr || p === paddedMonthStr);
      });

      const studentWithFilteredDates = { ...student, paymentDates: filteredDates };

      const [annual, monthly] = await Promise.all([
        generateAnnualPlan(student),
        filteredDates.length > 0 
          ? generateMonthlyJournal(studentWithFilteredDates, selectedMonth)
          : Promise.resolve({
              currentLevel: "해당 월의 치료 내역이 없습니다.",
              monthlyGoal: `${selectedMonth}월 치료 목표`,
              sessions: [],
              result: "내역 없음"
            } as MonthlyJournalData)
      ]);
      
      if (!annual || !monthly) {
        throw new Error('AI 서비스로부터 데이터를 받아오지 못했습니다.');
      }
      
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
      fetchData(selectedStudent);
    }
  }, [selectedMonth, selectedYear]);

  const [showPrintWarning, setShowPrintWarning] = useState(false);
  
  const handlePrint = () => {
    const printContent = document.querySelector('.document-container');
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('팝업 차단이 설정되어 있을 수 있습니다. 팝업을 허용해 주세요.');
      return;
    }

    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map(style => style.outerHTML)
      .join('\n');

    printWindow.document.write(`
      <html>
        <head>
          <title>${selectedStudent?.name || '치료서류'}_인쇄</title>
          ${styles}
          <style>
            @media print {
              body { margin: 0; padding: 0; }
              .no-print { display: none !important; }
              .document-container { 
                width: 210mm; 
                min-height: 297mm; 
                padding: 15mm !important; 
                margin: 0 auto;
                box-shadow: none !important;
                border: none !important;
              }
            }
            body { 
              background-color: white; 
              margin: 0; 
              padding: 20px;
              display: flex;
              justify-content: center;
            }
          </style>
        </head>
        <body>
          <div class="print-wrapper">
            ${printContent.innerHTML}
          </div>
          <script>
            window.onload = () => {
              setTimeout(() => {
                window.print();
                // window.close(); // Optional: close after print
              }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleDownloadWord = async () => {
    if (!selectedStudent || (!annualData && !monthlyData)) return;

    const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle } = await import('docx');
    const { saveAs } = await import('file-saver');

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

    const sections = [];

    if (activeTab === 'annual' && annualData) {
      // Annual Plan Word Generation
      sections.push({
        properties: {},
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
          new Paragraph({ children: [new TextRun({ text: "[현행 수준 및 특성]", bold: true })] }),
          ...annualData.currentLevel.map(text => new Paragraph({ text: `• ${text}`, indent: { left: 240 } })),
          new Paragraph({ text: "", spacing: { before: 200 } }),
          new Paragraph({ children: [new TextRun({ text: "[장기 치료 목표]", bold: true })] }),
          ...annualData.longTermGoals.map(text => new Paragraph({ text: `• ${text}`, indent: { left: 240 } })),
          new Paragraph({ text: "", spacing: { before: 200 } }),
          new Paragraph({ children: [new TextRun({ text: "[연간 치료 계획]", bold: true })] }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: ['월', '단기 목표', '치료 내용'].map(text => 
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
                  new TableCell({ children: [new Paragraph({ text: goal.goal })], borders }),
                  new TableCell({ children: [new Paragraph({ text: goal.content })], borders }),
                ],
              })),
            ],
          }),
        ],
      });
    } else if (activeTab === 'monthly' && monthlyData) {
      // Monthly Journal Word Generation
      sections.push({
        properties: {},
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
                  new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: selectedStudent.treatmentArea, bold: true })], alignment: AlignmentType.CENTER })], borders }),
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
      });
    }

    const doc = new Document({ sections });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${selectedStudent.name}_${selectedYear}년_${selectedMonth}월_치료서류.docx`);
  };

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
            </aside>

            {/* Content Area - Document Preview */}
            <div className="flex-1 flex flex-col overflow-hidden bg-bg-theme/50">
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
                        onClick={handleDownloadWord}
                        className="flex items-center gap-2 px-6 py-2.5 bg-white border border-primary text-primary rounded-xl font-bold text-sm hover:bg-primary-light transition-all"
                      >
                        <Download className="w-4 h-4" />
                        워드 다운로드
                      </button>

                      <button 
                        onClick={handlePrint}
                        className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary-dark transition-all shadow-lg shadow-primary/20"
                      >
                        <Printer className="w-4 h-4" />
                        인쇄하기
                      </button>
                    </div>
                  </div>

                  {/* Document Preview Container */}
                  <div className="bg-white flex-1 rounded-3xl shadow-2xl shadow-slate-200/50 border border-border-theme p-6 md:p-12 overflow-auto relative print:p-0 print:shadow-none print:border-none print:overflow-visible">
                    <AnimatePresence mode="wait">
                      {isLoading ? (
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
                            <AnnualPlan student={selectedStudent} data={annualData} year={selectedYear} />
                          ) : activeTab === 'monthly' && monthlyData && monthlyData.sessions ? (
                            <MonthlyJournal student={selectedStudent} data={monthlyData} month={selectedMonth} year={selectedYear} />
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
    </div>
  );
}
