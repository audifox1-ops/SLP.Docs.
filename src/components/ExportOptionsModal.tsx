import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Calendar, FileText } from 'lucide-react';

export interface ExportOptions {
  includeAnnual: boolean;
  startYear: number;
  startMonth: number;
  endYear: number;
  endMonth: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onExecute: (options: ExportOptions) => void;
  defaultYear: number;
  defaultMonth: number;
  actionType: 'print' | 'download' | null;
}

export const ExportOptionsModal: React.FC<Props> = ({ 
  isOpen, 
  onClose, 
  onExecute, 
  defaultYear, 
  defaultMonth,
  actionType
}) => {
  const [includeAnnual, setIncludeAnnual] = useState(true);
  const [startYear, setStartYear] = useState(defaultYear);
  const [startMonth, setStartMonth] = useState(defaultMonth);
  const [endYear, setEndYear] = useState(defaultYear);
  const [endMonth, setEndMonth] = useState(defaultMonth);

  if (!isOpen) return null;

  const handleExecute = () => {
    // Validate range
    if (
      endYear < startYear || 
      (endYear === startYear && endMonth < startMonth)
    ) {
      alert('종료 날짜는 시작 날짜 이후여야 합니다.');
      return;
    }

    onExecute({ includeAnnual, startYear, startMonth, endYear, endMonth });
  };

  const currentYear = new Date().getFullYear();
  const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Content */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative bg-white w-full max-w-md p-6 rounded-[2rem] shadow-2xl border border-slate-100 flex flex-col gap-6"
      >
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-800 flex items-center gap-2">
            {actionType === 'download' ? '워드 내보내기 설정' : '문서 인쇄 설정'}
          </h2>
          <p className="text-sm text-slate-500 mt-2">출력하실 서류의 종류와 월별일지 기간을 선택해 주세요.</p>
        </div>

        <div className="flex flex-col gap-5">
          {/* Include Annual Plan */}
          <label className="flex items-center gap-3 p-4 border border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-50 transition-colors group">
            <input 
              type="checkbox" 
              checked={includeAnnual}
              onChange={(e) => setIncludeAnnual(e.target.checked)}
              className="w-5 h-5 rounded text-primary focus:ring-primary border-slate-300"
            />
            <div className="flex flex-col">
              <span className="font-bold text-slate-700 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-slate-400 group-hover:text-primary transition-colors" />
                연간계획서 포함하기
              </span>
              <span className="text-xs text-slate-500 mt-0.5">체크 시 다중 월간일지에 연간계획서를 함께 출력합니다.</span>
            </div>
          </label>

          {/* Date Range */}
          <div className="flex flex-col gap-3 p-4 border border-slate-200 rounded-2xl">
            <span className="font-bold text-slate-700 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-slate-400" />
              월별 일지 기간 선택
            </span>
            
            <div className="flex flex-col gap-3 mt-1">
              {/* Start Date */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-500 w-16">시작월</span>
                <div className="flex gap-2">
                  <select 
                    value={startYear}
                    onChange={(e) => setStartYear(Number(e.target.value))}
                    className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-primary"
                  >
                    {years.map(y => <option key={y} value={y}>{y}년</option>)}
                  </select>
                  <select 
                    value={startMonth}
                    onChange={(e) => setStartMonth(Number(e.target.value))}
                    className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-primary"
                  >
                    {months.map(m => <option key={m} value={m}>{m}월</option>)}
                  </select>
                </div>
              </div>

              {/* End Date */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-500 w-16">종료월</span>
                <div className="flex gap-2">
                  <select 
                    value={endYear}
                    onChange={(e) => setEndYear(Number(e.target.value))}
                    className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-primary"
                  >
                    {years.map(y => <option key={y} value={y}>{y}년</option>)}
                  </select>
                  <select 
                    value={endMonth}
                    onChange={(e) => setEndMonth(Number(e.target.value))}
                    className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-primary"
                  >
                    {months.map(m => <option key={m} value={m}>{m}월</option>)}
                  </select>
                </div>
              </div>
            </div>
            
            <p className="text-[11px] text-slate-400 leading-tight bg-blue-50/50 p-2 rounded-lg mt-1 border border-blue-100/50">
              * 설정된 기간 내의 월간일지를 순차적으로 모두 수집하여 함께 내보냅니다. 여러 달 포함 시 AI 생성 대기시간이 소요될 수 있습니다.
            </p>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button 
            onClick={onClose}
            className="flex-1 py-3 px-4 rounded-xl font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
          >
            취소
          </button>
          <button 
            onClick={handleExecute}
            className="flex-1 py-3 px-4 rounded-xl font-bold bg-primary text-white hover:bg-primary-dark transition-all shadow-md shadow-primary/20"
          >
            {actionType === 'download' ? '워드 생성하기' : '미리보기 준비'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
