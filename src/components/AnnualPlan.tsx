import React from 'react';
import { Student, AnnualPlanData } from '../types';

interface Props {
  student: Student;
  data: AnnualPlanData;
  year: number;
  isEditing?: boolean;
  onUpdate?: (data: AnnualPlanData) => void;
}

export const AnnualPlan: React.FC<Props> = ({ student, data, year, isEditing, onUpdate }) => {
  const handleChange = (field: keyof AnnualPlanData, value: any) => {
    if (onUpdate) onUpdate({ ...data, [field]: value });
  };

  const handleMonthlyChange = (idx: number, field: string, value: any) => {
    if (onUpdate) {
      const newMonthlyGoals = [...data.monthlyGoals];
      newMonthlyGoals[idx] = { ...newMonthlyGoals[idx], [field]: value };
      onUpdate({ ...data, monthlyGoals: newMonthlyGoals });
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
                {year}. 교육청 치료지원(마중물) 대상 연간 계획서
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
            <th className="border border-black p-1 w-[15%]">학생명</th>
            <th className="border border-black p-1 w-[17%]">생년월일</th>
            <th className="border border-black p-1 w-[22%]">소속 학교<br/>(유치원)</th>
            <th className="border border-black p-1 w-[20%]">장애 유형</th>
            <th className="border border-black p-1 w-[26%]">치료 일정</th>
          </tr>
        </thead>
        <tbody>
          <tr className="h-12">
            <td className="border border-black p-1 text-center font-bold">{student.name}</td>
            <td className="border border-black p-1 text-center">{student.birthDate}</td>
            <td className="border border-black p-1 text-center">{student.school}</td>
            <td className="border border-black p-1 text-center">{student.disabilityType}</td>
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
                    <td className="p-1 border-r border-black bg-slate-50">시간</td>
                    <td className="p-1 font-bold">{student.schedule.time}</td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      {/* 현행 수준 */}
      <div className="mb-2 border border-black">
        <div className="bg-slate-100 p-0.5 px-2 font-bold border-b border-black text-[0.8rem]">현행 수준 및 특성</div>
        <div className="p-1.5 px-3 text-[0.75rem] leading-tight min-h-[30px]">
          {isEditing ? (
            <textarea
              className="w-full h-20 border border-indigo-200 rounded p-1 outline-none text-[0.75rem]"
              value={data.currentLevel.join('\n')}
              onChange={(e) => handleChange('currentLevel', e.target.value.split('\n'))}
            />
          ) : (
            <ul className="list-disc list-inside space-y-0.5">
              {data.currentLevel.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 장기 목표 */}
      <div className="mb-2 border border-black">
        <div className="bg-slate-100 p-0.5 px-2 font-bold border-b border-black text-[0.8rem]">장기 치료 목표</div>
        <div className="p-1.5 px-3 text-[0.75rem] leading-tight min-h-[30px]">
          {isEditing ? (
            <textarea
              className="w-full h-20 border border-indigo-200 rounded p-1 outline-none text-[0.75rem]"
              value={data.longTermGoals.join('\n')}
              onChange={(e) => handleChange('longTermGoals', e.target.value.split('\n'))}
            />
          ) : (
            <ul className="list-disc list-inside space-y-0.5">
              {data.longTermGoals.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 연간 계획 */}
      <div className="border border-black">
        <div className="bg-slate-100 p-0.5 px-2 font-bold border-b border-black text-[0.8rem]">연간 치료 계획</div>
        <table className="w-full border-collapse text-[0.75rem]">
          <thead>
            <tr className="bg-slate-50">
              <th className="border-b border-r border-black p-1 w-10 text-center">월</th>
              <th className="border-b border-r border-black p-1 text-center">단기 목표(월 목표)</th>
              <th className="border-b border-r border-black p-1 text-center">치료 내용</th>
              <th className="border-b border-black p-1 w-14 text-center">비고</th>
            </tr>
          </thead>
          <tbody>
            {data.monthlyGoals.map((goal, idx) => (
              <tr key={idx} className="h-8">
                <td className="border-b border-r border-black p-1 text-center font-bold">{goal.month}월</td>
                <td className="border-b border-r border-black p-1 px-2">
                  {isEditing ? (
                    <textarea
                      className="w-full h-full min-h-[30px] border-none bg-indigo-50/30 p-1 text-[0.7rem] outline-none"
                      value={goal.goal}
                      onChange={(e) => handleMonthlyChange(idx, 'goal', e.target.value)}
                    />
                  ) : goal.goal}
                </td>
                <td className="border-b border-r border-black p-1 px-2">
                  {isEditing ? (
                    <textarea
                      className="w-full h-full min-h-[30px] border-none bg-indigo-50/30 p-1 text-[0.7rem] outline-none"
                      value={goal.content}
                      onChange={(e) => handleMonthlyChange(idx, 'content', e.target.value)}
                    />
                  ) : goal.content}
                </td>
                <td className="border-b border-black p-1"></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
