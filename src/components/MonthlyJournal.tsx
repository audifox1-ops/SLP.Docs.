import React, { useState, useRef, useEffect } from 'react';
import { Plus, RefreshCw, Rows3, Trash2, Pencil } from 'lucide-react';
import { Student, MonthlyJournalData, PaymentRecord, DocumentStudentOverrides } from '../types';
import { applyDocumentStudentOverrides } from '../utils/documentStudentOverrides';

interface Props {
  student: Student;
  data: MonthlyJournalData;
  month: number;
  year: number;
  isEditing?: boolean;
  onUpdate?: (data: MonthlyJournalData) => void;
  paymentRecords?: PaymentRecord[];
  onSyncPaymentDates?: () => void;
}

/** 날짜 문자열에서 월/일 파싱 */
function parseDateCell(dateStr: string): { month: number; day: number } {
  const dateMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})/);
  return {
    month: dateMatch ? parseInt(dateMatch[1]) : 0,
    day: dateMatch ? parseInt(dateMatch[2]) : 0,
  };
}

const pad2 = (value: number) => String(value).padStart(2, '0');

/** 날짜 → 셀 표시 문자열 생성 */
function buildDateCell(year: number, month: number, day: number): string {
  void year;
  if (!month || !day) return '';
  return `${pad2(month)}/${pad2(day)}`;
}

const formatScheduleFrequency = (value?: string) => {
  const text = value?.trim() || '';
  if (!text) return '';
  return text.includes('회') ? text : `주 ${text} 회`;
};

const DEFAULT_SESSION_COUNT = 4;
const DEFAULT_CONSULTATION = '가정 내에서의 연계 활동 및 지도 방법 안내함.';

const createEmptySession = (): MonthlyJournalData['sessions'][number] => ({
  date: '',
  content: '',
  reaction: '',
  consultation: DEFAULT_CONSULTATION,
});

const formatPaymentDate = (value?: string) => {
  const text = String(value || '').trim();
  const match = text.match(/(?:(\d{2,4})[-./\s년]+)?(\d{1,2})[-./\s월]+(\d{1,2})/);
  if (!match) return text || '-';
  const year = match[1] ? (match[1].length === 2 ? `20${match[1]}` : match[1]) : '';
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year) return `${month}.${day}`;
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][new Date(Number(year), month - 1, day).getDay()];
  return `${year}-${pad2(month)}-${pad2(day)} (${weekday})`;
};

const formatPaymentTime = (value?: string) => {
  const text = String(value || '').trim();
  const match = text.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}${match[3] ? `:${match[3]}` : ''}` : text || '-';
};

const formatPaymentAmount = (value: PaymentRecord['amount']) => {
  if (value === undefined || value === null || value === '') return '-';
  const numeric = typeof value === 'number' ? value : Number(String(value).replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(numeric)) return String(value);
  return `${new Intl.NumberFormat('ko-KR').format(numeric)}원`;
};

const formatSessionDateOnly = (value?: string) => {
  const text = String(value || '').trim();
  if (!text) return '';
  const dateText = text.split(/\n/)[0].replace(/\([^)]*\)/g, '').trim();
  const match = dateText.match(/(\d{1,2})\/(\d{1,2})/);
  return match ? `${pad2(Number(match[1]))}/${pad2(Number(match[2]))}` : dateText;
};

const formatPaymentParts = (record: PaymentRecord, student: Student) => ({
  date: formatPaymentDate(record.transactionDate),
  time: formatPaymentTime(record.transactionTime),
  school: student.school || '-',
  studentName: student.name || record.studentName || '-',
  amount: formatPaymentAmount(record.amount),
  area: record.treatmentArea || student.treatmentArea || '-',
  therapist: student.therapistName || '-',
});

/** 날짜 인라인 편집 팝업 */
interface DateEditorProps {
  year: number;
  dateStr: string;
  onSave: (newDateStr: string) => void;
  onClose: () => void;
}
const DateEditor: React.FC<DateEditorProps> = ({ year, dateStr, onSave, onClose }) => {
  const parsed = parseDateCell(dateStr);
  const [selMonth, setSelMonth] = useState(parsed.month || new Date().getMonth() + 1);
  const [selDay, setSelDay] = useState(parsed.day || new Date().getDate());
  const ref = useRef<HTMLDivElement>(null);

  // 외부 클릭 시 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // 해당 월의 마지막 날
  const daysInMonth = new Date(year, selMonth, 0).getDate();

  const handleSave = () => {
    onSave(buildDateCell(year, selMonth, selDay));
    onClose();
  };

  return (
    <div
      ref={ref}
      className="absolute z-50 bg-white border border-indigo-300 rounded-lg shadow-xl p-3 text-[0.78rem] w-52"
      style={{ top: '110%', left: '50%', transform: 'translateX(-50%)' }}
    >
      <div className="font-bold text-indigo-700 mb-2 text-center">날짜 수정</div>

      {/* 월 선택 */}
      <div className="flex items-center gap-1 mb-1.5">
        <span className="w-8 text-slate-500">월</span>
        <select
          className="flex-1 border border-slate-200 rounded px-1 py-0.5 outline-none"
          value={selMonth}
          onChange={e => { setSelMonth(parseInt(e.target.value)); setSelDay(1); }}
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
            <option key={m} value={m}>{m}월</option>
          ))}
        </select>
      </div>

      {/* 일 선택 */}
      <div className="flex items-center gap-1 mb-1.5">
        <span className="w-8 text-slate-500">일</span>
        <select
          className="flex-1 border border-slate-200 rounded px-1 py-0.5 outline-none"
          value={selDay}
          onChange={e => setSelDay(parseInt(e.target.value))}
        >
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => (
            <option key={d} value={d}>{d}일</option>
          ))}
        </select>
      </div>

      {/* 미리보기 */}
      <div className="bg-slate-50 rounded p-1.5 text-center text-[0.72rem] font-bold mb-2 whitespace-pre-line text-indigo-700">
        {buildDateCell(year, selMonth, selDay) || '—'}
      </div>

      <div className="flex gap-1.5">
        <button
          className="flex-1 bg-indigo-500 text-white rounded py-1 text-[0.75rem] hover:bg-indigo-600 transition-colors"
          onClick={handleSave}
        >
          저장
        </button>
        <button
          className="flex-1 bg-slate-100 text-slate-600 rounded py-1 text-[0.75rem] hover:bg-slate-200 transition-colors"
          onClick={onClose}
        >
          취소
        </button>
      </div>
    </div>
  );
};

export const MonthlyJournal: React.FC<Props> = ({
  student,
  data,
  month,
  year,
  isEditing,
  onUpdate,
  paymentRecords = [],
  onSyncPaymentDates,
}) => {
  const [editingDateIdx, setEditingDateIdx] = useState<number | null>(null);
  const monthLabel = pad2(month);
  const monthlyTreatmentArea = student.monthlyAreas?.[month] || student.treatmentArea;
  const effectiveStudent = applyDocumentStudentOverrides(student, data.studentOverrides, monthlyTreatmentArea);

  const handleChange = (field: keyof MonthlyJournalData, value: any) => {
    if (onUpdate) onUpdate({ ...data, [field]: value });
  };

  const handleStudentOverrideChange = (field: keyof DocumentStudentOverrides, value: string) => {
    if (!onUpdate) return;
    onUpdate({
      ...data,
      studentOverrides: {
        ...data.studentOverrides,
        [field]: value
      }
    });
  };

  const renderOverrideInput = (field: keyof DocumentStudentOverrides, value: string, className = '') => (
    isEditing ? (
      <input
        type="text"
        className={`w-full bg-indigo-50/30 border-none outline-none text-center font-bold ${className}`}
        value={value}
        onChange={(e) => handleStudentOverrideChange(field, e.target.value)}
      />
    ) : value
  );

  const handleSessionChange = (idx: number, field: string, value: any) => {
    if (onUpdate) {
      const newSessions = [...data.sessions];
      newSessions[idx] = { ...newSessions[idx], [field]: value };
      onUpdate({ ...data, sessions: newSessions });
    }
  };

  const handleDateSave = (idx: number, newDateStr: string) => {
    handleSessionChange(idx, 'date', newDateStr);
    setEditingDateIdx(null);
  };

  const updateSessions = (sessions: MonthlyJournalData['sessions']) => {
    if (onUpdate) onUpdate({ ...data, sessions });
  };

  const handleAddSession = () => {
    updateSessions([...(data.sessions || []), createEmptySession()]);
  };

  const handleRemoveSession = (idx: number) => {
    updateSessions((data.sessions || []).filter((_, sessionIdx) => sessionIdx !== idx));
  };

  const handleEnsureDefaultSessions = () => {
    const currentSessions = data.sessions || [];
    const nextCount = Math.max(DEFAULT_SESSION_COUNT, paymentRecords.length, currentSessions.length);
    const nextSessions = Array.from({ length: nextCount }, (_, idx) => currentSessions[idx] || createEmptySession());
    updateSessions(nextSessions);
  };

  return (
    <div className={`bg-white w-full ${isEditing ? 'max-w-none' : 'max-w-[210mm]'} mx-auto font-sans text-black p-2 sm:p-[5mm] md:p-[8mm] box-border document-container print:p-0`}>
      {/* Header Section */}
      <table className="w-full border-none mb-2">
        <tbody>
          <tr>
            <td className="text-center align-bottom pb-2">
              <h2 className="text-xl font-bold tracking-[1px] inline-block">
                {year}. 교육청 치료지원 대상 개별 치료 일지({monthLabel}월)
              </h2>
            </td>
            <td className="w-32 align-top">
              <table className="border-collapse border border-black text-[0.65rem] w-full">
                <tbody>
                  <tr>
                    <td rowSpan={2} className="border border-black p-1 text-center  w-6">결<br/>재</td>
                    <td className="border border-black p-1 text-center ">기관장</td>
                    <td className="border border-black p-1 text-center ">치료사</td>
                  </tr>
                  <tr>
                    <td className="border border-black h-10"></td>
                    <td className="border border-black h-10"></td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Basic Info Table */}
      <table className="w-full border-collapse border border-black text-[0.75rem] mb-2">
        <thead>
          <tr className="">
            <th className="border border-black p-1 w-[12%]">학생명</th>
            <th className="border border-black p-1 w-[15%]">생년월일</th>
            <th className="border border-black p-1 w-[18%]">소속학교<br/>(유치원)</th>
            <th className="border border-black p-1 w-[18%]">장애 유형</th>
            <th className="border border-black p-1 w-[15%]">치료 영역</th>
            <th className="border border-black p-1 w-[22%]">치료 일정</th>
          </tr>
        </thead>
        <tbody>
          <tr className="h-12">
            <td className="border border-black p-1 text-center font-bold">
              {renderOverrideInput('name', effectiveStudent.name)}
            </td>
            <td className="border border-black p-1 text-center">
              {renderOverrideInput('birthDate', effectiveStudent.birthDate, 'font-normal')}
            </td>
            <td className="border border-black p-1 text-center">
              {renderOverrideInput('school', effectiveStudent.school, 'font-normal')}
            </td>
            <td className="border border-black p-1 text-center">
              {renderOverrideInput('disabilityType', effectiveStudent.disabilityType, 'font-normal')}
            </td>
            <td className="border border-black p-1 text-center font-bold">
              {renderOverrideInput('treatmentArea', effectiveStudent.treatmentArea)}
            </td>
            <td className="border border-black p-0">
              <table className="w-full h-full border-collapse">
                <tbody className="text-[0.65rem]">
                  <tr>
                    <td className="p-1 border-b border-r border-black  w-16">치료 기간</td>
                    <td className="p-1 border-b border-black font-bold">
                      {isEditing ? (
                        <input
                          type="text"
                          className="w-full bg-indigo-50/30 border-none outline-none font-bold text-[0.65rem]"
                          value={data.therapyPeriod ?? `${year}.3.~`}
                          onChange={(e) => handleChange('therapyPeriod', e.target.value)}
                        />
                      ) : (
                        data.therapyPeriod ?? `${year}.3.~`
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="p-1 border-b border-r border-black ">치료사</td>
                    <td className="p-1 border-b border-black font-bold">
                      {renderOverrideInput('therapistName', effectiveStudent.therapistName, 'text-left')}
                    </td>
                  </tr>
                  <tr>
                    <td className="p-1 border-b border-r border-black ">요일</td>
                    <td className="p-1 border-b border-black font-bold">
                      {renderOverrideInput('scheduleDay', effectiveStudent.schedule.day, 'text-left')}
                    </td>
                  </tr>
                  <tr>
                    <td className="p-1 border-b border-r border-black ">시간</td>
                    <td className="p-1 border-b border-black font-bold">
                      {renderOverrideInput('scheduleTime', effectiveStudent.schedule.time, 'text-left')}
                    </td>
                  </tr>
                  <tr>
                    <td className="p-1 border-r border-black ">횟수</td>
                    <td className="p-1 font-bold">
                      {isEditing ? renderOverrideInput('scheduleFrequency', effectiveStudent.schedule.frequency, 'text-left') : formatScheduleFrequency(effectiveStudent.schedule.frequency)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      {/* 현행 수준 */}
      <div className="flex border border-black border-b-0">
        <div className=" p-1 font-bold border-r border-black w-24 flex items-center justify-center text-[0.8rem]">현행 수준</div>
        <div className={`p-1.5 px-3 text-[0.75rem] leading-tight flex-1 ${isEditing ? 'min-h-[130px]' : 'min-h-[30px]'}`}>
          {isEditing ? (
            <textarea
              className="w-full min-h-[110px] resize-y border border-indigo-200 rounded p-2 outline-none text-[0.75rem] leading-relaxed"
              value={data.currentLevel}
              onChange={(e) => handleChange('currentLevel', e.target.value)}
            />
          ) : (
            <div className="whitespace-pre-wrap break-words w-full">{data.currentLevel}</div>
          )}
        </div>
      </div>

      {/* 치료 목표 */}
      <div className="flex border border-black mb-2">
        <div className=" p-1 font-bold border-r border-black w-24 flex items-center justify-center text-[0.8rem]">({monthLabel})월 치료목표</div>
        <div className={`p-1.5 px-3 text-[0.75rem] leading-tight flex-1 ${isEditing ? 'min-h-[130px]' : 'min-h-[30px]'}`}>
          {isEditing ? (
            <textarea
              className="w-full min-h-[110px] resize-y border border-indigo-200 rounded p-2 outline-none text-[0.75rem] leading-relaxed"
              value={data.monthlyGoal}
              onChange={(e) => handleChange('monthlyGoal', e.target.value)}
            />
          ) : (
            <div className="whitespace-pre-wrap break-words w-full">{data.monthlyGoal}</div>
          )}
        </div>
      </div>

      {/* 회기별 일지 */}
      {isEditing && onUpdate && (
        <div className="no-print mb-2 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onSyncPaymentDates}
            disabled={!onSyncPaymentDates || paymentRecords.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            결제일 기준 맞추기
          </button>
          <button
            type="button"
            onClick={handleEnsureDefaultSessions}
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 transition-colors hover:bg-indigo-100"
          >
            <Rows3 className="h-3.5 w-3.5" />
            기본 4회 채우기
          </button>
          <button
            type="button"
            onClick={handleAddSession}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50"
          >
            <Plus className="h-3.5 w-3.5" />
            회기 추가
          </button>
        </div>
      )}
      <table className="w-full border-collapse border border-black text-[0.75rem] mb-2">
        <thead>
          <tr className="">
            <th className="border border-black p-1 w-20 text-center">날짜</th>
            <th className="border border-black p-1 text-center">치료 내용</th>
            <th className="border border-black p-1 text-center">아동 반응</th>
            <th className="border border-black p-1 w-24 text-center">비고<br/>(부모 상담)</th>
          </tr>
        </thead>
        <tbody>
          {data.sessions.length > 0 ? (
            data.sessions.map((session, idx) => (
              <tr key={idx} className={isEditing ? 'align-top' : 'h-14'}>
                {/* 날짜 셀: 항상 클릭 편집 가능 */}
                <td className="border border-black p-1 text-center font-bold text-[0.72rem] leading-snug relative">
                  {editingDateIdx === idx ? (
                    <DateEditor
                      year={year}
                      dateStr={session.date}
                      onSave={(newDate) => handleDateSave(idx, newDate)}
                      onClose={() => setEditingDateIdx(null)}
                    />
                  ) : null}
                  {isEditing ? (
                    /* 편집 모드: textarea + 수정 버튼 */
                    <div className="relative">
                      <span
                        className="whitespace-pre-line block cursor-pointer hover:bg-indigo-50 rounded transition-colors px-1 print:hidden"
                        title="클릭하여 날짜 수정"
                        onClick={() => setEditingDateIdx(idx)}
                      >
                        {formatSessionDateOnly(session.date) || <span className="text-slate-300">날짜 클릭</span>}
                      </span>
                      <button
                        type="button"
                        className="mt-0.5 inline-flex items-center justify-center gap-0.5 text-[0.6rem] text-indigo-500 hover:text-indigo-700 print:hidden"
                        onClick={() => setEditingDateIdx(idx)}
                      >
                        <Pencil className="h-2.5 w-2.5" />
                        수정
                      </button>
                      <button
                        type="button"
                        className="mt-0.5 inline-flex items-center justify-center gap-0.5 text-[0.6rem] text-red-500 hover:text-red-700 print:hidden"
                        onClick={() => handleRemoveSession(idx)}
                      >
                        <Trash2 className="h-2.5 w-2.5" />
                        삭제
                      </button>
                    </div>
                  ) : (
                    /* 뷰 모드: 단순 텍스트 표시 */
                    <div className="relative">
                      <span>{formatSessionDateOnly(session.date)}</span>
                    </div>
                  )}
                </td>
                <td className="border border-black p-1 px-2 leading-tight">
                  {isEditing ? (
                    <textarea
                      className="w-full min-h-[96px] resize-y bg-indigo-50/30 border-none outline-none p-2 text-[0.7rem] leading-relaxed"
                      value={session.content}
                      onChange={(e) => handleSessionChange(idx, 'content', e.target.value)}
                    />
                  ) : (
                    <div className="whitespace-pre-wrap break-words">{session.content}</div>
                  )}
                </td>
                <td className="border border-black p-1 px-2 leading-tight">
                  {isEditing ? (
                    <textarea
                      className="w-full min-h-[96px] resize-y bg-indigo-50/30 border-none outline-none p-2 text-[0.7rem] leading-relaxed"
                      value={session.reaction}
                      onChange={(e) => handleSessionChange(idx, 'reaction', e.target.value)}
                    />
                  ) : (
                    <div className="whitespace-pre-wrap break-words">{session.reaction}</div>
                  )}
                </td>
                <td className="border border-black p-1 px-2 text-[0.65rem] leading-tight">
                  {isEditing ? (
                    <textarea
                      className="w-full min-h-[96px] resize-y bg-indigo-50/30 border-none outline-none p-2 text-[0.65rem] leading-relaxed"
                      value={session.consultation}
                      onChange={(e) => handleSessionChange(idx, 'consultation', e.target.value)}
                    />
                  ) : (
                    <div className="whitespace-pre-wrap break-words">{session.consultation}</div>
                  )}
                </td>
              </tr>
            ))
          ) : (
            <tr className="h-32">
              <td colSpan={4} className="border border-black p-4 text-center text-slate-400 font-bold">
                해당 월의 치료 내역이 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* 치료 결과 */}
      <div className="flex border border-black">
        <div className=" p-1 font-bold border-r border-black w-24 flex items-center justify-center text-[0.8rem]">({monthLabel})월 치료결과</div>
        <div className={`p-1.5 px-3 text-[0.75rem] leading-tight flex-1 ${isEditing ? 'min-h-[130px]' : 'min-h-[30px]'}`}>
          {isEditing ? (
            <textarea
              className="w-full min-h-[110px] resize-y border border-indigo-200 rounded p-2 outline-none text-[0.75rem] leading-relaxed"
              value={data.result}
              onChange={(e) => handleChange('result', e.target.value)}
            />
          ) : data.result}
        </div>
      </div>

      {/* 결제 내역 */}
      <div className="mt-2 text-[0.7rem] leading-relaxed">
        <div className="font-bold">결제 내역</div>
        {paymentRecords.length > 0 ? (
          <div className="space-y-0.5">
            <div className="grid grid-cols-[6.8rem_4.4rem_minmax(5.3rem,1fr)_4.4rem_5.5rem_minmax(5rem,1fr)_4.4rem] gap-x-1.5 border-b border-black/20 pb-0.5 font-bold">
              <span>결제일</span>
              <span>시간</span>
              <span>소속</span>
              <span>학생명</span>
              <span className="text-right">금액</span>
              <span>영역</span>
              <span>치료사</span>
            </div>
            {paymentRecords.map((record, idx) => {
              const parts = formatPaymentParts(record, effectiveStudent);
              return (
                <div
                  key={record.id || `${record.studentName}-${record.transactionDate}-${idx}`}
                  className="grid grid-cols-[6.8rem_4.4rem_minmax(5.3rem,1fr)_4.4rem_5.5rem_minmax(5rem,1fr)_4.4rem] gap-x-1.5"
                >
                  <span>{parts.date}</span>
                  <span>{parts.time}</span>
                  <span>{parts.school}</span>
                  <span>{parts.studentName}</span>
                  <span className="text-right">{parts.amount}</span>
                  <span>{parts.area}</span>
                  <span>{parts.therapist}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-slate-500">선택한 월에 업로드된 결제 이력이 없습니다.</div>
        )}
      </div>
    </div>
  );
};
