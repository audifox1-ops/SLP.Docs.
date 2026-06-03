import React, { useRef } from 'react';
import { Student, AnnualPlanData, MonthlyJournalData } from '../types';
import { AnnualPlan } from './AnnualPlan';
import { MonthlyJournal } from './MonthlyJournal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  activeTab: 'annual' | 'monthly';
  student: Student;
  annualData: AnnualPlanData | null;
  monthlyData: MonthlyJournalData | null;
  selectedYear: number;
  selectedMonth: number;
}

export const PreviewModal: React.FC<Props> = ({
  isOpen,
  onClose,
  activeTab,
  student,
  annualData,
  monthlyData,
  selectedYear,
  selectedMonth
}) => {
  const contentRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleDocxDownload = () => {
    if (!contentRef.current) return;
    
    // HTML을 MS Word 포맷으로 감싸서 추출
    const contentHtml = contentRef.current.innerHTML;
    const header = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <style>
          table { border-collapse: collapse; width: 100%; }
          table, th, td { border: 1px solid black; }
          th, td { padding: 4px; font-size: 11pt; }
        </style>
      </head><body>`;
    const footer = "</body></html>";
    const sourceHTML = header + contentHtml + footer;
    
    const source = 'data:application/vnd.ms-word;charset=utf-8,' + encodeURIComponent(sourceHTML);
    const fileDownload = document.createElement("a");
    document.body.appendChild(fileDownload);
    fileDownload.href = source;
    
    const docName = activeTab === 'annual' 
      ? `${student.name}_연간계획서.doc`
      : `${student.name}_${selectedMonth}월_치료일지.doc`;
      
    fileDownload.download = docName;
    fileDownload.click();
    document.body.removeChild(fileDownload);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 print:bg-transparent">
      {/* 팝업 컨테이너 (인쇄 시 이 부분의 테두리와 그림자 등은 감춤) */}
      <div className="bg-white w-[900px] max-h-[90vh] flex flex-col rounded-xl shadow-2xl overflow-hidden print:w-full print:max-h-none print:shadow-none print:rounded-none">
        
        {/* 헤더 바 (인쇄 시 숨김) */}
        <div className="flex justify-between items-center p-4 border-b bg-slate-50 print:hidden">
          <h2 className="text-lg font-bold text-slate-800">
            문서 미리보기 및 출력
          </h2>
          <div className="flex gap-2">
            <button
              onClick={handleDocxDownload}
              className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded hover:bg-green-700 transition-colors flex items-center gap-1"
            >
              ⬇️ DOC(워드/한글) 다운로드
            </button>
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded hover:bg-indigo-700 transition-colors flex items-center gap-1"
            >
              🖨️ PDF 저장 / 인쇄하기
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 text-slate-700 text-sm font-semibold rounded hover:bg-slate-300 transition-colors ml-2"
            >
              닫기
            </button>
          </div>
        </div>

        {/* 본문 영역 */}
        <div className="p-8 overflow-y-auto bg-slate-100 print:p-0 print:bg-white print:overflow-visible">
          {/* A4 용지 스타일 컨테이너 */}
          <div 
            id="printable-area"
            ref={contentRef}
            className="bg-white mx-auto shadow-lg print:shadow-none"
            style={{ 
              width: '210mm', 
              minHeight: '297mm', 
              padding: '20mm',
              margin: '0 auto'
            }}
          >
            {activeTab === 'annual' && annualData && (
              <AnnualPlan
                student={student}
                data={annualData}
                year={selectedYear}
                isEditing={false}
              />
            )}
            
            {activeTab === 'monthly' && monthlyData && (
              <MonthlyJournal
                student={student}
                data={monthlyData}
                month={selectedMonth}
                year={selectedYear}
                isEditing={false}
              />
            )}

            {activeTab === 'annual' && !annualData && (
              <div className="text-center text-slate-500 py-20">
                연간계획서 데이터가 없습니다. 먼저 생성해주세요.
              </div>
            )}
            {activeTab === 'monthly' && !monthlyData && (
              <div className="text-center text-slate-500 py-20">
                월간일지 데이터가 없습니다. 먼저 생성해주세요.
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
