import React from 'react';
import { Student, AnnualPlanData, DocumentStudentOverrides } from '../types';
import { formatAnnualPlanPeriod, normalizeAnnualPlanPeriod, updateAnnualPlanPeriod } from '../utils/annualPlanPeriod';
import { applyDocumentStudentOverrides } from '../utils/documentStudentOverrides';

interface Props {
  student: Student;
  data: AnnualPlanData;
  year: number;
  isEditing?: boolean;
  onUpdate?: (data: AnnualPlanData) => void;
}

const formatScheduleFrequency = (value?: string) => {
  const text = value?.trim() || '';
  if (!text) return '';
  return text.includes('회') ? text : `주 ${text} 회`;
};

export const AnnualPlan: React.FC<Props> = ({ student, data, year, isEditing, onUpdate }) => {
  const effectiveStudent = applyDocumentStudentOverrides(student, data.studentOverrides);
  const annualPeriod = normalizeAnnualPlanPeriod(data, year);
  const yearOptions = Array.from(new Set([
    year - 1,
    year,
    year + 1,
    year + 2,
    annualPeriod.startYear,
    annualPeriod.endYear
  ])).sort((a, b) => a - b);
  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);

  const handleChange = (field: keyof AnnualPlanData, value: any) => {
    if (onUpdate) onUpdate({ ...data, [field]: value });
  };

  const handlePeriodChange = (field: 'startYear' | 'startMonth' | 'endYear' | 'endMonth', value: number) => {
    if (onUpdate) onUpdate(updateAnnualPlanPeriod(data, year, effectiveStudent, { [field]: value }));
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

  const handleMonthlyChange = (idx: number, field: string, value: any) => {
    if (onUpdate) {
      const newMonthlyGoals = [...data.monthlyGoals];
      newMonthlyGoals[idx] = { ...newMonthlyGoals[idx], [field]: value };
      onUpdate({ ...data, monthlyGoals: newMonthlyGoals });
    }
  };
  return (
    <div className={`bg-white w-full ${isEditing ? 'max-w-none' : 'max-w-[210mm]'} mx-auto font-sans text-black p-2 sm:p-[5mm] md:p-[8mm] box-border document-container print:p-0`}>
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
                    <td rowSpan={2} className="border border-black p-1 text-center w-6">결<br/>재</td>
                    <td className="border border-black p-1 text-center">기관장</td>
                    <td className="border border-black p-1 text-center">치료사</td>
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
          <tr>
            <th className="border border-black p-1 w-[12%]">학생명</th>
            <th className="border border-black p-1 w-[15%]">생년월일</th>
            <th className="border border-black p-1 w-[18%]">소속 학교<br/>(유치원)</th>
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
                    <td className="p-1 border-b border-r border-black w-28">치료 기간</td>
                    <td className="p-1 border-b border-black font-bold">
                      {formatAnnualPlanPeriod(data, year)}
                    </td>
                  </tr>
                  <tr>
                    <td className="p-1 border-b border-r border-black">치료사</td>
                    <td className="p-1 border-b border-black font-bold">
                      {renderOverrideInput('therapistName', effectiveStudent.therapistName, 'text-left')}
                    </td>
                  </tr>
                  <tr>
                    <td className="p-1 border-b border-r border-black">복지부 바우처 이용 영역</td>
                    <td className="p-1 border-b border-black font-bold">
                      {renderOverrideInput('voucherArea', effectiveStudent.voucherArea || effectiveStudent.treatmentArea, 'text-left')}
                    </td>
                  </tr>
                  <tr>
                    <td className="p-1 border-b border-r border-black">요일</td>
                    <td className="p-1 border-b border-black font-bold">
                      {renderOverrideInput('scheduleDay', effectiveStudent.schedule.day, 'text-left')}
                    </td>
                  </tr>
                  <tr>
                    <td className="p-1 border-b border-r border-black">시간</td>
                    <td className="p-1 border-b border-black font-bold">
                      {renderOverrideInput('scheduleTime', effectiveStudent.schedule.time, 'text-left')}
                    </td>
                  </tr>
                  <tr>
                    <td className="p-1 border-r border-black">횟수</td>
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
      <div className="mb-2 border border-black">
        <div className="p-0.5 px-2 font-bold border-b border-black text-[0.8rem]">현행 수준 및 특성</div>
        <div className={`p-1.5 px-3 text-[0.75rem] leading-tight ${isEditing ? 'min-h-[160px]' : 'min-h-[30px]'}`}>
          {isEditing ? (
            <textarea
              className="w-full min-h-[140px] resize-y border border-indigo-200 rounded p-2 outline-none text-[0.75rem] leading-relaxed"
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
        <div className="p-0.5 px-2 font-bold border-b border-black text-[0.8rem]">장기 치료 목표</div>
        <div className={`p-1.5 px-3 text-[0.75rem] leading-tight ${isEditing ? 'min-h-[160px]' : 'min-h-[30px]'}`}>
          {isEditing ? (
            <textarea
              className="w-full min-h-[140px] resize-y border border-indigo-200 rounded p-2 outline-none text-[0.75rem] leading-relaxed"
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
      {isEditing && (
        <div className="no-print mb-2 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3 text-xs">
          <div className="mb-2 font-black text-indigo-700">연간계획서 년월 설정</div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1">
              <span className="font-bold text-slate-600">시작</span>
              <select
                className="border border-indigo-200 rounded px-2 py-1 bg-white outline-none"
                value={annualPeriod.startYear}
                onChange={(e) => handlePeriodChange('startYear', Number(e.target.value))}
              >
                {yearOptions.map(option => <option key={option} value={option}>{option}년</option>)}
              </select>
              <select
                className="border border-indigo-200 rounded px-2 py-1 bg-white outline-none"
                value={annualPeriod.startMonth}
                onChange={(e) => handlePeriodChange('startMonth', Number(e.target.value))}
              >
                {monthOptions.map(option => <option key={option} value={option}>{option}월</option>)}
              </select>
            </label>
            <span className="font-bold text-slate-400">~</span>
            <label className="flex items-center gap-1">
              <span className="font-bold text-slate-600">종료</span>
              <select
                className="border border-indigo-200 rounded px-2 py-1 bg-white outline-none"
                value={annualPeriod.endYear}
                onChange={(e) => handlePeriodChange('endYear', Number(e.target.value))}
              >
                {yearOptions.map(option => <option key={option} value={option}>{option}년</option>)}
              </select>
              <select
                className="border border-indigo-200 rounded px-2 py-1 bg-white outline-none"
                value={annualPeriod.endMonth}
                onChange={(e) => handlePeriodChange('endMonth', Number(e.target.value))}
              >
                {monthOptions.map(option => <option key={option} value={option}>{option}월</option>)}
              </select>
            </label>
            <span className="font-bold text-slate-600">표시: {formatAnnualPlanPeriod(data, year)}</span>
          </div>
        </div>
      )}
      <div className="border border-black">
        <div className="p-0.5 px-2 font-bold border-b border-black text-[0.8rem]">연간 치료 계획</div>
        <table className="w-full border-collapse text-[0.75rem]">
          <thead>
            <tr>
              <th className="border-b border-r border-black p-1 w-16 text-center">월</th>
              <th className="border-b border-r border-black p-1 text-center">단기 목표(월 목표)</th>
              <th className="border-b border-r border-black p-1 text-center">치료 내용</th>
              <th className="border-b border-black p-1 w-14 text-center">비고</th>
            </tr>
          </thead>
          <tbody>
            {data.monthlyGoals.map((goal, idx) => (
              <tr key={idx} className={isEditing ? 'align-top' : 'h-8'}>
                <td className="border-b border-r border-black p-1 text-center font-bold">
                  {goal.year ? `${goal.year}.${goal.month}월` : `${goal.month}월`}
                </td>
                <td className="border-b border-r border-black p-1 px-2">
                  {isEditing ? (
                    <textarea
                      className="w-full min-h-[88px] resize-y border-none bg-indigo-50/30 p-2 text-[0.7rem] leading-relaxed outline-none"
                      value={goal.goal}
                      onChange={(e) => handleMonthlyChange(idx, 'goal', e.target.value)}
                    />
                  ) : (
                    <div className="whitespace-pre-wrap break-words">{goal.goal}</div>
                  )}
                </td>
                <td className="border-b border-r border-black p-1 px-2">
                  {isEditing ? (
                    <textarea
                      className="w-full min-h-[88px] resize-y border-none bg-indigo-50/30 p-2 text-[0.7rem] leading-relaxed outline-none"
                      value={goal.content}
                      onChange={(e) => handleMonthlyChange(idx, 'content', e.target.value)}
                    />
                  ) : (
                    <div className="whitespace-pre-wrap break-words">{goal.content}</div>
                  )}
                </td>
                <td className="border-b border-black p-1">
                  {isEditing ? (
                    <textarea
                      className="w-full min-h-[88px] resize-y border-none bg-indigo-50/30 p-2 text-[0.7rem] leading-relaxed outline-none"
                      value={goal.note || ''}
                      onChange={(e) => handleMonthlyChange(idx, 'note', e.target.value)}
                    />
                  ) : (
                    <div className="whitespace-pre-wrap break-words">{goal.note || ''}</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
