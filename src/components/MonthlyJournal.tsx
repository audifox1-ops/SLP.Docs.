import React, { useState, useRef, useEffect } from 'react';
import { Student, MonthlyJournalData } from '../types';

interface Props {
  student: Student;
  data: MonthlyJournalData;
  month: number;
  year: number;
  isEditing?: boolean;
  onUpdate?: (data: MonthlyJournalData) => void;
}

/** 날짜 문자열에서 월/일/시간 파싱 */
function parseDateCell(dateStr: string): { month: number; day: number; timeStr: string } {
  const dateMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})/);
  const timeMatch = dateStr.match(/(\d{1,2}:\d{2})~(\d{1,2}:\d{2})/);
  return {
    month: dateMatch ? parseInt(dateMatch[1]) : 0,
    day: dateMatch ? parseInt(dateMatch[2]) : 0,
    timeStr: timeMatch ? `${timeMatch[1]}~${timeMatch[2]}` : '',
  };
}

/** 날짜+시간 → 셀 표시 문자열 생성 */
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
function buildDateCell(year: number, month: number, day: number, timeStr: string): string {
  if (!month || !day) return '';
  const dayName = DAY_NAMES[new Date(year, month - 1, day).getDay()];
  const base = `${month}/${day}(${dayName})`;
  return timeStr ? `${base}\n${timeStr}` : base;
}

/** 날짜/시간 인라인 편집 팝업 */
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
  const [selTime, setSelTime] = useState(parsed.timeStr);
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
    onSave(buildDateCell(year, selMonth, selDay, selTime));
    onClose();
  };

  return (
    <div
      ref={ref}
      className="absolute z-50 bg-white border border-indigo-300 rounded-lg shadow-xl p-3 text-[0.78rem] w-52"
      style={{ top: '110%', left: '50%', transform: 'translateX(-50%)' }}
    >
      <div className="font-bold text-indigo-700 mb-2 text-center">날짜 / 시간 수정</div>

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

      {/* 시간 입력 */}
      <div className="flex items-center gap-1 mb-2.5">
        <span className="w-8 text-slate-500">시간</span>
        <input
          type="text"
          className="flex-1 border border-slate-200 rounded px-1 py-0.5 outline-none"
          placeholder="예: 16:50~17:30"
          value={selTime}
          onChange={e => setSelTime(e.target.value)}
        />
      </div>

      {/* 시간 빠른 선택 */}
      <div className="flex flex-wrap gap-1 mb-2.5">
        {['09:00~09:40','10:00~10:40','11:00~11:40','13:00~13:40','14:00~14:40',
          '14:50~15:30','15:40~16:20','16:30~17:10','16:50~17:30','17:20~18:00','17:40~18:20','18:00~18:40'].map(t => (
          <button
            key={t}
            className={`px-1 py-0.5 rounded text-[0.65rem] border transition-colors ${
              selTime === t ? 'bg-indigo-500 text-white border-indigo-500' : 'border-slate-200 hover:bg-indigo-50'
            }`}
            onClick={() => setSelTime(t)}
          >
            {t}
          </button>
        ))}
        <button
          className="px-1 py-0.5 rounded text-[0.65rem] border border-slate-200 hover:bg-red-50 text-red-400"
          onClick={() => setSelTime('')}
        >
          시간 삭제
        </button>
      </div>

      {/* 미리보기 */}
      <div className="bg-slate-50 rounded p-1.5 text-center text-[0.72rem] font-bold mb-2 whitespace-pre-line text-indigo-700">
        {buildDateCell(year, selMonth, selDay, selTime) || '—'}
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

export const MonthlyJournal: React.FC<Props> = ({ student, data, month, year, isEditing, onUpdate }) => {
  const [editingDateIdx, setEditingDateIdx] = useState<number | null>(null);

  const handleChange = (field: keyof MonthlyJournalData, value: any) => {
    if (onUpdate) onUpdate({ ...data, [field]: value });
  };

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

  return (
    <div className="bg-white w-full max-w-[210mm] mx-auto font-sans text-black p-2 sm:p-[5mm] md:p-[8mm] box-border document-container print:p-0">
      {/* Header Section */}
      <table className="w-full border-none mb-2">
        <tbody>
          <tr>
            <td className="text-center align-bottom pb-2">
              <h2 className="text-xl font-bold tracking-[1px] inline-block border-b-2 border-black pb-1">
                {year}. 교육청 치료지원(마중물) 대상 개별 치료 일지({month}월)
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
            <td className="border border-black p-1 text-center font-bold">{student.name}</td>
            <td className="border border-black p-1 text-center">{student.birthDate}</td>
            <td className="border border-black p-1 text-center">{student.school}</td>
            <td className="border border-black p-1 text-center">{student.disabilityType}</td>
            <td className="border border-black p-1 text-center font-bold">
              {student.monthlyAreas?.[month] || student.treatmentArea}
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
                    <td className="p-1 border-b border-black font-bold">{student.therapistName}</td>
                  </tr>
                  <tr>
                    <td className="p-1 border-b border-r border-black ">요일</td>
                    <td className="p-1 border-b border-black font-bold">{student.schedule.day}</td>
                  </tr>
                  <tr>
                    <td className="p-1 border-b border-r border-black ">시간</td>
                    <td className="p-1 border-b border-black font-bold">{student.schedule.time}</td>
                  </tr>
                  <tr>
                    <td className="p-1 border-r border-black ">횟수</td>
                    <td className="p-1 font-bold">주 {student.schedule.frequency} 회</td>
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
        <div className="p-1.5 px-3 text-[0.75rem] leading-tight flex-1 min-h-[30px]">
          {isEditing ? (
            <textarea
              className="w-full h-12 border border-indigo-200 rounded p-1 outline-none text-[0.75rem]"
              value={data.currentLevel}
              onChange={(e) => handleChange('currentLevel', e.target.value)}
            />
          ) : data.currentLevel}
        </div>
      </div>

      {/* 치료 목표 */}
      <div className="flex border border-black mb-2">
        <div className=" p-1 font-bold border-r border-black w-24 flex items-center justify-center text-[0.8rem]">({month})월 치료 목표</div>
        <div className="p-1.5 px-3 text-[0.75rem] leading-tight flex-1 min-h-[30px]">
          {isEditing ? (
            <textarea
              className="w-full h-12 border border-indigo-200 rounded p-1 outline-none text-[0.75rem]"
              value={data.monthlyGoal}
              onChange={(e) => handleChange('monthlyGoal', e.target.value)}
            />
          ) : data.monthlyGoal}
        </div>
      </div>

      {/* 회기별 일지 */}
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
              <tr key={idx} className="h-14">
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
                        title="클릭하여 날짜/시간 수정"
                        onClick={() => setEditingDateIdx(idx)}
                      >
                        {session.date || <span className="text-slate-300">날짜 클릭</span>}
                      </span>
                      <button
                        className="mt-0.5 text-[0.6rem] text-indigo-400 hover:text-indigo-600 underline print:hidden"
                        onClick={() => setEditingDateIdx(idx)}
                      >
                        ✏️ 수정
                      </button>
                    </div>
                  ) : (
                    /* 뷰 모드: 클릭 시 팝업 */
                    <div
                      className="cursor-pointer hover:bg-indigo-50 rounded transition-colors group relative print:cursor-default print:hover:bg-transparent"
                      title="클릭하여 날짜/시간 수정"
                      onClick={() => setEditingDateIdx(idx)}
                    >
                      <span className="whitespace-pre-line">{session.date}</span>
                      <span className="block text-[0.58rem] text-indigo-300 group-hover:text-indigo-500 transition-colors print:hidden">
                        ✏️
                      </span>
                    </div>
                  )}
                </td>
                <td className="border border-black p-1 px-2 leading-tight">
                  {isEditing ? (
                    <textarea
                      className="w-full h-full min-h-[40px] bg-indigo-50/30 border-none outline-none p-1 text-[0.7rem]"
                      value={session.content}
                      onChange={(e) => handleSessionChange(idx, 'content', e.target.value)}
                    />
                  ) : session.content}
                </td>
                <td className="border border-black p-1 px-2 leading-tight">
                  {isEditing ? (
                    <textarea
                      className="w-full h-full min-h-[40px] bg-indigo-50/30 border-none outline-none p-1 text-[0.7rem]"
                      value={session.reaction}
                      onChange={(e) => handleSessionChange(idx, 'reaction', e.target.value)}
                    />
                  ) : session.reaction}
                </td>
                <td className="border border-black p-1 px-2 text-[0.65rem] leading-tight">
                  {isEditing ? (
                    <textarea
                      className="w-full h-full min-h-[40px] bg-indigo-50/30 border-none outline-none p-1 text-[0.65rem]"
                      value={session.consultation}
                      onChange={(e) => handleSessionChange(idx, 'consultation', e.target.value)}
                    />
                  ) : session.consultation}
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
          {data.sessions.length > 0 && data.sessions.length < 4 && Array.from({ length: 4 - data.sessions.length }).map((_, i) => (
            <tr key={`empty-${i}`} className="h-12">
              <td className="border border-black p-1"></td>
              <td className="border border-black p-1"></td>
              <td className="border border-black p-1"></td>
              <td className="border border-black p-1"></td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 치료 결과 */}
      <div className="flex border border-black">
        <div className=" p-1 font-bold border-r border-black w-24 flex items-center justify-center text-[0.8rem]">({month})월 치료 결과</div>
        <div className="p-1.5 px-3 text-[0.75rem] leading-tight flex-1 min-h-[30px]">
          {isEditing ? (
            <textarea
              className="w-full h-12 border border-indigo-200 rounded p-1 outline-none text-[0.75rem]"
              value={data.result}
              onChange={(e) => handleChange('result', e.target.value)}
            />
          ) : data.result}
        </div>
      </div>
    </div>
  );
};
