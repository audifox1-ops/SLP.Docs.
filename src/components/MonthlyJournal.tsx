import React from 'react';
import { Student, MonthlyJournalData } from '../types';

interface Props {
  student: Student;
  data: MonthlyJournalData;
  month: number;
  year: number;
  isEditing?: boolean;
  onUpdate?: (data: MonthlyJournalData) => void;
}

export const MonthlyJournal: React.FC<Props> = ({ student, data, month, year, isEditing, onUpdate }) => {
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
  return (
    <div className="bg-white w-full max-w-[210mm] mx-auto font-sans text-black p-2 sm:p-[5mm] md:p-[8mm] box-border document-container print:p-0">
      {/* Header Section - Using table for rigid layout in print */}
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
                    <td rowSpan={2} className="border border-black p-1 text-center bg-slate-50 w-6">결<br/>재</td>
                    <td className="border border-black p-1 text-center bg-slate-50">기관장</td>
                    <td className="border border-black p-1 text-center bg-slate-50">치료사</td>
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
          <tr className="bg-slate-100">
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
                    <td className="p-1 border-b border-r border-black bg-slate-50 w-16">치료 기간</td>
                    <td className="p-1 border-b border-black font-bold">{year}.3.~</td>
                  </tr>
                  <tr>
                    <td className="p-1 border-b border-r border-black bg-slate-50">치료사</td>
                    <td className="p-1 border-b border-black font-bold">{student.therapistName}</td>
                  </tr>
                  <tr>
                    <td className="p-1 border-b border-r border-black bg-slate-50">요일</td>
                    <td className="p-1 border-b border-black font-bold">{student.schedule.day}</td>
                  </tr>
                  <tr>
                    <td className="p-1 border-b border-r border-black bg-slate-50">시간</td>
                    <td className="p-1 border-b border-black font-bold">{student.schedule.time}</td>
                  </tr>
                  <tr>
                    <td className="p-1 border-r border-black bg-slate-50">횟수</td>
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
        <div className="bg-slate-100 p-1 font-bold border-r border-black w-24 flex items-center justify-center text-[0.8rem]">현행 수준</div>
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
        <div className="bg-slate-100 p-1 font-bold border-r border-black w-24 flex items-center justify-center text-[0.8rem]">({month})월 치료 목표</div>
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
          <tr className="bg-slate-100">
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
                <td className="border border-black p-1 text-center font-bold">
                  {isEditing ? (
                    <input
                      type="text"
                      className="w-full bg-indigo-50/30 border-none text-center outline-none"
                      value={session.date}
                      onChange={(e) => handleSessionChange(idx, 'date', e.target.value)}
                    />
                  ) : session.date}
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
          {/* Fill empty rows if needed to maintain layout consistency */}
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
        <div className="bg-slate-100 p-1 font-bold border-r border-black w-24 flex items-center justify-center text-[0.8rem]">({month})월 치료 결과</div>
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
