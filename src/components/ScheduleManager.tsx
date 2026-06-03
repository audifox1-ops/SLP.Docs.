import React, { useState, useMemo } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, User, CheckCircle2, CircleDashed } from 'lucide-react';
import { StudentInfo, PaymentRecord } from '../types';

interface Props {
  studentInfos: StudentInfo[];
  paymentRecords: PaymentRecord[];
}

type ViewMode = 'month' | 'week' | 'day';

export const ScheduleManager: React.FC<Props> = ({ studentInfos, paymentRecords }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');

  // Helper functions for dates
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-11
  
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 (Sun) to 6 (Sat)
  
  const handlePrev = () => {
    if (viewMode === 'month') {
      setCurrentDate(new Date(year, month - 1, 1));
    } else if (viewMode === 'week') {
      setCurrentDate(new Date(currentDate.getTime() - 7 * 24 * 60 * 60 * 1000));
    } else {
      setCurrentDate(new Date(currentDate.getTime() - 24 * 60 * 60 * 1000));
    }
  };

  const handleNext = () => {
    if (viewMode === 'month') {
      setCurrentDate(new Date(year, month + 1, 1));
    } else if (viewMode === 'week') {
      setCurrentDate(new Date(currentDate.getTime() + 7 * 24 * 60 * 60 * 1000));
    } else {
      setCurrentDate(new Date(currentDate.getTime() + 24 * 60 * 60 * 1000));
    }
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Convert 'YYYY. MM. DD.' to a comparable date string 'YYYY-MM-DD'
  const parsePaymentDate = (dateStr: string) => {
    const parts = dateStr.split('.').map(p => p.trim());
    if (parts.length >= 3) {
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
    return '';
  };

  // Match day string to number (0-6)
  const getDayNumber = (dayStr?: string) => {
    if (!dayStr) return -1;
    if (dayStr.includes('일')) return 0;
    if (dayStr.includes('월')) return 1;
    if (dayStr.includes('화')) return 2;
    if (dayStr.includes('수')) return 3;
    if (dayStr.includes('목')) return 4;
    if (dayStr.includes('금')) return 5;
    if (dayStr.includes('토')) return 6;
    return -1;
  };

  const getWeekDays = (date: Date) => {
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    const startOfWeek = new Date(date.setDate(diff));
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(startOfWeek);
      d.setDate(d.getDate() + i);
      return d;
    });
  };

  const weekDays = getWeekDays(new Date(currentDate));

  // Build a map of dates to scheduled students & actual payments
  // Record structure: YYYY-MM-DD
  const scheduleMap = useMemo(() => {
    const map = new Map<string, {
      expected: StudentInfo[];
      actual: PaymentRecord[];
    }>();

    // Fill expected schedules for the current viewed range (buffer by month)
    const startD = new Date(year, month - 1, 1);
    const endD = new Date(year, month + 2, 0);
    
    for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const dayOfWeek = d.getDay();
      
      const expected = studentInfos.filter(s => getDayNumber(s.scheduleDay) === dayOfWeek);
      map.set(dateStr, { expected, actual: [] });
    }

    // Map actual payments
    paymentRecords.forEach(record => {
      if (!record.transactionDate) return;
      const dateStr = parsePaymentDate(record.transactionDate);
      if (map.has(dateStr)) {
        map.get(dateStr)!.actual.push(record);
      } else {
        map.set(dateStr, { expected: [], actual: [record] });
      }
    });

    return map;
  }, [studentInfos, paymentRecords, year, month]);

  const renderMonthView = () => {
    const days = [];
    const totalCells = Math.ceil((daysInMonth + firstDayOfMonth) / 7) * 7;

    for (let i = 0; i < totalCells; i++) {
      const dayNumber = i - firstDayOfMonth + 1;
      const isCurrentMonth = dayNumber > 0 && dayNumber <= daysInMonth;
      const d = new Date(year, month, dayNumber);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const isToday = new Date().toDateString() === d.toDateString();
      
      const dayData = isCurrentMonth ? scheduleMap.get(dateStr) : null;
      
      // Combine expected and actual to a unified list
      const eventList: { name: string, time: string, isActual: boolean }[] = [];
      
      if (dayData) {
        dayData.actual.forEach(a => {
          eventList.push({
            name: a.studentName,
            time: a.transactionTime || '시간미상',
            isActual: true
          });
        });
        
        dayData.expected.forEach(e => {
          // If already in actual, skip showing expected to avoid duplicates if you want. 
          // For now, let's show expected only if there is no actual payment for this student on this day
          if (!dayData.actual.some(a => a.studentName === e.name)) {
            eventList.push({
              name: e.name,
              time: e.scheduleTime || '미정',
              isActual: false
            });
          }
        });
      }

      eventList.sort((a, b) => a.time.localeCompare(b.time));

      days.push(
        <div key={i} className={`min-h-[120px] bg-white border border-border-theme/50 p-2 ${!isCurrentMonth ? 'bg-slate-50 opacity-50' : ''} ${isToday ? 'ring-2 ring-primary inset-0 z-10' : ''}`}>
          <div className={`text-xs font-bold mb-2 ${isToday ? 'text-primary' : 'text-slate-500'}`}>
            {dayNumber > 0 && dayNumber <= daysInMonth ? dayNumber : ''}
          </div>
          <div className="flex flex-col gap-1 overflow-y-auto max-h-[90px]">
            {isCurrentMonth && eventList.map((ev, idx) => (
              <div 
                key={idx} 
                className={`text-[10px] px-1.5 py-1 rounded truncate border flex items-center gap-1
                  ${ev.isActual 
                    ? 'bg-blue-50 text-blue-700 border-blue-200 font-medium' 
                    : 'bg-slate-50 text-slate-500 border-slate-200 border-dashed'
                  }`}
                title={`${ev.time} - ${ev.name}`}
              >
                {ev.isActual ? <CheckCircle2 className="w-3 h-3 flex-shrink-0" /> : <CircleDashed className="w-3 h-3 flex-shrink-0" />}
                <span className="truncate">{ev.time.split('~')[0]} {ev.name}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="flex-1 bg-white rounded-2xl shadow-sm border border-border-theme overflow-hidden flex flex-col">
        <div className="grid grid-cols-7 bg-slate-50 border-b border-border-theme">
          {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
            <div key={d} className={`text-center py-3 text-xs font-bold ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-slate-600'}`}>
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 flex-1">
          {days}
        </div>
      </div>
    );
  };

  const renderTimelineView = (daysToRender: Date[]) => {
    // Generate time slots from 09:00 to 20:00
    const hours = Array.from({ length: 12 }).map((_, i) => i + 9);
    
    return (
      <div className="flex-1 bg-white rounded-2xl shadow-sm border border-border-theme overflow-auto flex">
        <div className="flex flex-col min-w-[800px] w-full">
          {/* Header */}
          <div className="flex border-b border-border-theme bg-slate-50 sticky top-0 z-20">
            <div className="w-20 flex-shrink-0 border-r border-border-theme"></div>
            {daysToRender.map((d, i) => {
              const isToday = new Date().toDateString() === d.toDateString();
              return (
                <div key={i} className={`flex-1 text-center py-3 border-r border-border-theme ${isToday ? 'bg-primary/10' : ''}`}>
                  <div className="text-xs text-slate-500 font-medium">
                    {['일', '월', '화', '수', '목', '금', '토'][d.getDay()]}
                  </div>
                  <div className={`text-lg font-bold ${isToday ? 'text-primary' : 'text-slate-800'}`}>
                    {d.getDate()}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Grid */}
          <div className="flex flex-1 relative">
            {/* Time Axis */}
            <div className="w-20 flex-shrink-0 flex flex-col border-r border-border-theme bg-slate-50 sticky left-0 z-10">
              {hours.map(h => (
                <div key={h} className="h-20 border-b border-border-theme/50 relative">
                  <span className="absolute -top-2.5 left-2 text-xs font-bold text-slate-400">{String(h).padStart(2, '0')}:00</span>
                </div>
              ))}
            </div>

            {/* Days Columns */}
            {daysToRender.map((d, colIdx) => {
              const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
              const dayData = scheduleMap.get(dateStr);
              
              const eventList: { name: string, time: string, isActual: boolean }[] = [];
              if (dayData) {
                dayData.actual.forEach(a => eventList.push({ name: a.studentName, time: a.transactionTime || '09:00:00', isActual: true }));
                dayData.expected.forEach(e => {
                  if (!dayData.actual.some(a => a.studentName === e.name)) {
                    eventList.push({ name: e.name, time: e.scheduleTime || '09:00', isActual: false });
                  }
                });
              }

              return (
                <div key={colIdx} className="flex-1 border-r border-border-theme/50 relative">
                  {hours.map(h => (
                    <div key={h} className="h-20 border-b border-border-theme/50"></div>
                  ))}
                  
                  {/* Events Overlay */}
                  {eventList.map((ev, idx) => {
                    // Extract hour and minute to calculate position
                    let startHour = 9;
                    let startMin = 0;
                    
                    const timeMatch = ev.time.match(/(\d{1,2})[:시]\s*(\d{0,2})/);
                    if (timeMatch) {
                      startHour = parseInt(timeMatch[1], 10);
                      startMin = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
                    }

                    // If time is outside 9-20, clamp it or ignore it. For simplicity, just render.
                    if (startHour < 9) startHour = 9;
                    if (startHour > 20) startHour = 20;

                    const topPx = ((startHour - 9) * 80) + ((startMin / 60) * 80);
                    // Fixed height of 40 mins by default (approx 53px)
                    const heightPx = 50; 

                    return (
                      <div 
                        key={idx}
                        style={{ top: `${topPx}px`, height: `${heightPx}px` }}
                        className={`absolute left-1 right-1 rounded-lg px-2 py-1.5 text-xs shadow-sm border overflow-hidden flex flex-col
                          ${ev.isActual 
                            ? 'bg-blue-100/90 text-blue-800 border-blue-300 z-10' 
                            : 'bg-slate-100/80 text-slate-600 border-slate-300 border-dashed z-0 opacity-80'
                          }`}
                      >
                        <div className="font-bold truncate">{ev.name}</div>
                        <div className="text-[10px] opacity-80 truncate">{ev.time.split('~')[0]} {ev.isActual ? '(출석)' : '(예정)'}</div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col bg-bg-theme p-6 md:p-10 gap-6 min-h-0 overflow-hidden">
      
      {/* Header Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-text-main flex items-center gap-2">
            <CalendarIcon className="w-6 h-6 text-primary" />
            통합 시간표 및 출결 관리
          </h2>
          <p className="text-sm text-text-muted mt-1">업로드된 결제 내역과 등록된 스케줄을 비교하여 한눈에 파악하세요.</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-slate-200/50 p-1 rounded-xl">
            <button
              onClick={() => setViewMode('month')}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'month' ? 'bg-white text-primary shadow-md' : 'text-text-muted hover:text-text-main'}`}
            >
              월간
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'week' ? 'bg-white text-primary shadow-md' : 'text-text-muted hover:text-text-main'}`}
            >
              주간
            </button>
            <button
              onClick={() => setViewMode('day')}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'day' ? 'bg-white text-primary shadow-md' : 'text-text-muted hover:text-text-main'}`}
            >
              일간
            </button>
          </div>
        </div>
      </div>

      {/* Date Navigation */}
      <div className="flex items-center justify-between bg-white px-6 py-4 rounded-2xl shadow-sm border border-border-theme shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={handlePrev} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <ChevronLeft className="w-5 h-5 text-slate-600" />
          </button>
          <h3 className="text-xl font-black text-slate-800 min-w-[150px] text-center">
            {viewMode === 'month' && `${year}년 ${month + 1}월`}
            {viewMode === 'week' && `${currentDate.getMonth() + 1}월 ${currentDate.getDate()}일 주간`}
            {viewMode === 'day' && `${currentDate.getMonth() + 1}월 ${currentDate.getDate()}일`}
          </h3>
          <button onClick={handleNext} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <ChevronRight className="w-5 h-5 text-slate-600" />
          </button>
        </div>
        
        <div className="flex items-center gap-4">
          <button onClick={handleToday} className="px-4 py-2 text-sm font-bold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
            오늘
          </button>
          
          <div className="flex items-center gap-3 text-xs font-semibold">
            <div className="flex items-center gap-1.5 text-blue-700 bg-blue-50 px-2 py-1 rounded">
              <CheckCircle2 className="w-3.5 h-3.5" /> 결제/출석 완료
            </div>
            <div className="flex items-center gap-1.5 text-slate-500 bg-slate-50 border border-slate-200 border-dashed px-2 py-1 rounded">
              <CircleDashed className="w-3.5 h-3.5" /> 예정 스케줄
            </div>
          </div>
        </div>
      </div>

      {/* View Content */}
      {viewMode === 'month' && renderMonthView()}
      {viewMode === 'week' && renderTimelineView(weekDays)}
      {viewMode === 'day' && renderTimelineView([currentDate])}

    </div>
  );
};
