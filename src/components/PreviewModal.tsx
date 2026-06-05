import React, { useEffect, useRef, useState } from 'react';
import { saveAs } from 'file-saver';
import { Student, AnnualPlanData, DocumentTemplateSample, MonthlyJournalData, PaymentRecord } from '../types';
import { AnnualPlan } from './AnnualPlan';
import { MonthlyJournal } from './MonthlyJournal';
import { canApplyTemplateAutomatically, exportAnnualPlanFromTemplate, exportCombinedJournalFromTemplate, exportMonthlyJournalFromTemplate } from '../utils/monthlyTemplateExport';
import { createAnnualDocxBlob, createCombinedAnnualMonthlyDocxBlob, createMonthlyDocxBlob } from '../utils/docxExport';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  activeTab: 'annual' | 'monthly';
  student: Student;
  annualData: AnnualPlanData | null;
  monthlyData: MonthlyJournalData | null;
  combinedTemplate?: DocumentTemplateSample | null;
  annualTemplate?: DocumentTemplateSample | null;
  monthlyTemplate?: DocumentTemplateSample | null;
  selectedYear: number;
  selectedMonth: number;
  paymentRecords?: PaymentRecord[];
}

export const PreviewModal: React.FC<Props> = ({
  isOpen,
  onClose,
  activeTab,
  student,
  annualData,
  monthlyData,
  combinedTemplate,
  annualTemplate,
  monthlyTemplate,
  selectedYear,
  selectedMonth,
  paymentRecords = []
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const annualPageRef = useRef<HTMLDivElement>(null);
  const monthlyPageRef = useRef<HTMLDivElement>(null);
  const canPreviewCombined = Boolean(annualData && monthlyData);
  const [previewMode, setPreviewMode] = useState<'single' | 'combined'>('single');

  useEffect(() => {
    if (!isOpen) return;
    setPreviewMode(canPreviewCombined ? 'combined' : 'single');
  }, [isOpen, canPreviewCombined, activeTab]);

  if (!isOpen) return null;

  const showCombinedPreview = previewMode === 'combined' && canPreviewCombined;
  const annualTemplateForDownload = annualTemplate || combinedTemplate;
  const monthlyTemplateForDownload = monthlyTemplate || combinedTemplate;
  const pageStyle = {
    width: '210mm',
    minHeight: '297mm',
    padding: '20mm',
    margin: '0 auto'
  };

  const handlePrint = () => {
    window.print();
  };

  const scrollToPreviewPage = (page: 'annual' | 'monthly') => {
    const target = page === 'annual' ? annualPageRef.current : monthlyPageRef.current;
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleDocxDownload = async () => {
    try {
      if (await downloadFromTemplateIfAvailable()) return;
      await downloadDefaultDocx();
    } catch (error) {
      alert(error instanceof Error ? error.message : '샘플 양식 문서 생성 중 오류가 발생했습니다.');
    }
  };

  const handleHwpDownload = async () => {
    try {
      if (await downloadFromTemplateIfAvailable()) return;
      await downloadDefaultDocx();
      alert('새 HWP 원본 파일은 브라우저에서 안전하게 생성할 수 없어, 깨짐 방지를 위해 DOCX로 저장했습니다. 샘플과 같은 한글 양식이 필요하면 HWP/HWPX/DOCX 샘플을 업로드해 주세요.');
    } catch (error) {
      alert(error instanceof Error ? error.message : '샘플 양식 문서 생성 중 오류가 발생했습니다.');
    }
  };

  const downloadFromTemplateIfAvailable = async () => {
    const combinedTemplateForExport = combinedTemplate || (!annualTemplate ? monthlyTemplate : null);
    if (annualData && monthlyData && canApplyTemplateAutomatically(combinedTemplateForExport)) {
      await exportCombinedJournalFromTemplate(combinedTemplateForExport, student, annualData, monthlyData, selectedYear, selectedMonth);
      return true;
    }

    if (activeTab === 'annual' && annualData && canApplyTemplateAutomatically(annualTemplateForDownload)) {
      await exportAnnualPlanFromTemplate(annualTemplateForDownload, student, annualData, selectedYear);
      return true;
    }

    if (activeTab === 'monthly' && monthlyData && canApplyTemplateAutomatically(monthlyTemplateForDownload)) {
      await exportMonthlyJournalFromTemplate(monthlyTemplateForDownload, student, monthlyData, selectedYear, selectedMonth);
      return true;
    }

    return false;
  };

  const downloadDefaultDocx = async () => {
    if (showCombinedPreview && annualData && monthlyData) {
      const blob = await createCombinedAnnualMonthlyDocxBlob(student, annualData, monthlyData, selectedYear, selectedMonth, paymentRecords);
      saveAs(blob, `${student.name}_${selectedMonth}월_연간월간.docx`);
      return;
    }

    if (activeTab === 'annual' && annualData) {
      const blob = await createAnnualDocxBlob(student, annualData, selectedYear);
      saveAs(blob, `${student.name}_연간계획서.docx`);
      return;
    }

    if (activeTab === 'monthly' && monthlyData) {
      const blob = await createMonthlyDocxBlob(student, monthlyData, selectedYear, selectedMonth, paymentRecords);
      saveAs(blob, `${student.name}_${selectedMonth}월_치료일지.docx`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 print:bg-transparent">
      {/* 팝업 컨테이너 (인쇄 시 이 부분의 테두리와 그림자 등은 감춤) */}
      <div className="bg-white w-[900px] max-h-[90vh] flex flex-col rounded-xl shadow-2xl overflow-hidden print:w-full print:max-h-none print:shadow-none print:rounded-none">
        
        {/* 헤더 바 (인쇄 시 숨김) */}
        <div className="flex justify-between items-center p-4 border-b bg-slate-50 print:hidden">
          <div>
            <h2 className="text-lg font-bold text-slate-800">
              문서 미리보기 및 출력
            </h2>
            {canPreviewCombined && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <div className="flex rounded-lg bg-slate-200/70 p-1">
                  <button
                    onClick={() => setPreviewMode('single')}
                    className={`px-3 py-1.5 rounded-md font-bold ${previewMode === 'single' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    현재 문서
                  </button>
                  <button
                    onClick={() => setPreviewMode('combined')}
                    className={`px-3 py-1.5 rounded-md font-bold ${previewMode === 'combined' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    연간+월간
                  </button>
                </div>
                {showCombinedPreview && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => scrollToPreviewPage('annual')}
                      className="px-2.5 py-1.5 rounded-md border border-slate-200 bg-white font-bold text-slate-700 hover:bg-slate-50"
                    >
                      연간계획서
                    </button>
                    <button
                      onClick={() => scrollToPreviewPage('monthly')}
                      className="px-2.5 py-1.5 rounded-md border border-slate-200 bg-white font-bold text-slate-700 hover:bg-slate-50"
                    >
                      {selectedMonth}월 일지
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleHwpDownload}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded hover:bg-blue-700 transition-colors flex items-center gap-1"
            >
              ⬇️ 한글(HWPX) 다운로드
            </button>
            <button
              onClick={handleDocxDownload}
              className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded hover:bg-green-700 transition-colors flex items-center gap-1"
            >
              ⬇️ DOCX(워드) 다운로드
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
          <div
            id="printable-area"
            ref={contentRef}
            className={showCombinedPreview ? 'space-y-8 print:space-y-0' : 'bg-white mx-auto shadow-lg print:shadow-none'}
            style={showCombinedPreview ? undefined : pageStyle}
          >
            {showCombinedPreview && annualData && monthlyData ? (
              <>
                <div ref={annualPageRef} className="preview-page bg-white mx-auto shadow-lg print:shadow-none" style={pageStyle}>
                  <AnnualPlan
                    student={student}
                    data={annualData}
                    year={selectedYear}
                    isEditing={false}
                  />
                </div>
                <div ref={monthlyPageRef} className="preview-page bg-white mx-auto shadow-lg print:shadow-none" style={pageStyle}>
                  <MonthlyJournal
                    student={student}
                    data={monthlyData}
                    month={selectedMonth}
                    year={selectedYear}
                    isEditing={false}
                    paymentRecords={paymentRecords}
                  />
                </div>
              </>
            ) : (
              <>
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
                    paymentRecords={paymentRecords}
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
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
