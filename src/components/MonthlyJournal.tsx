import React from 'react';
import { Student, MonthlyJournalData } from '../types';

interface Props {
  student: Student;
  data: MonthlyJournalData;
  month: number;
  year: number;
}

export const MonthlyJournal: React.FC<Props> = ({ student, data, month, year }) => {
  return (
    <div className="bg-white w-full max-w-[210mm] mx-auto font-sans text-black p-4 sm:p-[10mm] md:p-[15mm] box-border document-container print:p-0">
      {/* Header Section */}
      <div className="flex justify-between items-start mb-6">
        <div className="flex-1 text-center pt-6">
          <h2 className="text-2xl font-bold tracking-[2px]">{year}. 교육청 치료지원(마중물) 대상 개별 치료 일지({month}월)</h2>
        </div>
        <table className="border-collapse border border-black text-[0.7rem] w-32">
          <tbody>
            <tr>
              <td rowSpan={2} className="border border-black p-1 text-center bg-slate-50 w-6">결<br/>재</td>
              <td className="border border-black p-1 text-center bg-slate-50">기관장</td>
              <td className="border border-black p-1 text-center bg-slate-50">치료사</td>
            </tr>
            <tr>
              <td className="border border-black h-12"></td>
              <td className="border border-black h-12"></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Basic Info Table */}
      <table className="w-full border-collapse border border-black text-[0.8rem] mb-6">
        <thead>
          <tr className="bg-slate-100">
            <th className="border border-black p-2 w-[12%]">학생명</th>
            <th className="border border-black p-2 w-[15%]">생년월일</th>
            <th className="border border-black p-2 w-[18%]">소속학교<br/>(유치원)</th>
            <th className="border border-black p-2 w-[18%]">장애 유형</th>
            <th className="border border-black p-2 w-[15%]">치료 영역</th>
            <th className="border border-black p-2 w-[22%]">치료 일정</th>
          </tr>
        </thead>
        <tbody>
          <tr className="h-28">
            <td className="border border-black p-2 text-center font-bold">{student.name}</td>
            <td className="border border-black p-2 text-center">{student.birthDate}</td>
            <td className="border border-black p-2 text-center">{student.school}</td>
            <td className="border border-black p-2 text-center">
              {student.disabilityType}
            </td>
            <td className="border border-black p-2 text-center font-bold">
              {student.monthlyAreas?.[month] || student.treatmentArea}
            </td>
            <td className="border border-black p-0">
              <table className="w-full h-full border-collapse">
                <tbody className="text-[0.7rem]">
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
        <div className="bg-slate-100 p-4 font-bold border-r border-black w-32 flex items-center justify-center text-[0.9rem]">현행 수준</div>
        <div className="p-3 text-[0.85rem] leading-relaxed flex-1 min-h-[60px]">
          {data.currentLevel}
        </div>
      </div>

      {/* 치료 목표 */}
      <div className="flex border border-black mb-6">
        <div className="bg-slate-100 p-4 font-bold border-r border-black w-32 flex items-center justify-center text-[0.9rem]">({month})월 치료 목표</div>
        <div className="p-3 text-[0.85rem] leading-relaxed flex-1 min-h-[60px]">
          {data.monthlyGoal}
        </div>
      </div>

      {/* 회기별 일지 */}
      <table className="w-full border-collapse border border-black text-[0.8rem] mb-6">
        <thead>
          <tr className="bg-slate-100">
            <th className="border border-black p-2 w-24 text-center">날짜</th>
            <th className="border border-black p-2 text-center">치료 내용</th>
            <th className="border border-black p-2 text-center">아동 반응</th>
            <th className="border border-black p-2 w-28 text-center">비고<br/>(부모 상담)</th>
          </tr>
        </thead>
        <tbody>
          {data.sessions.length > 0 ? (
            data.sessions.map((session, idx) => (
              <tr key={idx} className="h-20">
                <td className="border border-black p-2 text-center font-bold">{session.date}</td>
                <td className="border border-black p-2 leading-relaxed">{session.content}</td>
                <td className="border border-black p-2 leading-relaxed">{session.reaction}</td>
                <td className="border border-black p-2 text-[0.7rem]">{session.consultation}</td>
              </tr>
            ))
          ) : (
            <tr className="h-40">
              <td colSpan={4} className="border border-black p-4 text-center text-slate-400 font-bold text-lg">
                해당 월의 치료 내역이 없습니다.
              </td>
            </tr>
          )}
          {/* Fill empty rows if needed to maintain layout consistency */}
          {data.sessions.length > 0 && data.sessions.length < 4 && Array.from({ length: 4 - data.sessions.length }).map((_, i) => (
            <tr key={`empty-${i}`} className="h-20">
              <td className="border border-black p-2"></td>
              <td className="border border-black p-2"></td>
              <td className="border border-black p-2"></td>
              <td className="border border-black p-2"></td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 치료 결과 */}
      <div className="flex border border-black">
        <div className="bg-slate-100 p-4 font-bold border-r border-black w-32 flex items-center justify-center text-[0.9rem]">({month})월 치료 결과</div>
        <div className="p-3 text-[0.85rem] leading-relaxed flex-1 min-h-[80px]">
          {data.result}
        </div>
      </div>
    </div>
  );
};
