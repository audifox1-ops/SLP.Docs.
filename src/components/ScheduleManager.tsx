import React, { useEffect, useMemo, useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, User, CheckCircle2, CircleDashed, AlertCircle, Save, X, RotateCcw } from 'lucide-react';
import { StudentInfo, PaymentRecord } from '../types';
import { getScheduleDayNumber } from '../utils/studentSchedule';

interface Props {
  studentInfos: StudentInfo[];
  paymentRecords: PaymentRecord[];
}

type ViewMode = 'month' | 'week' | 'day';
type SessionOperationStatus = 'planned' | 'attended' | 'absent' | 'cancelled' | 'makeup';

interface SessionOperationRecord {
  key: string;
  date: string;
  studentName: string;
  time: string;
  status: SessionOperationStatus;
  note: string;
  updatedAtMs: number;
}

interface ScheduleEvent {
  key: string;
  date: string;
  name: string;
  time: string;
  isActual: boolean;
  status: SessionOperationStatus;
  note: string;
}

const SESSION_OPERATION_STORAGE_KEY = 'schedule_operation_records_v1';

const SESSION_STATUS_META: Record<SessionOperationStatus, { label: string; monthClass: string; timelineClass: string }> = {
  planned: {
    label: '예정',
    monthClass: 'bg-slate-50 text-slate-500 border-slate-200 border-dashed',
    timelineClass: 'bg-slate-100/80 text-slate-600 border-slate-300 border-dashed z-0 opacity-80'
  },
  attended: {
    label: '출석',
    monthClass: 'bg-blue-50 text-blue-700 border-blue-200 font-medium',
    timelineClass: 'bg-blue-100/90 text-blue-800 border-blue-300 z-10'
  },
  absent: {
    label: '결석',
    monthClass: 'bg-red-50 text-red-700 border-red-200 font-medium',
    timelineClass: 'bg-red-100/90 text-red-800 border-red-300 z-20'
  },
  cancelled: {
    label: '취소',
    monthClass: 'bg-slate-100 text-slate-500 border-slate-300 font-medium line-through',
    timelineClass: 'bg-slate-200/90 text-slate-600 border-slate-300 z-20 line-through'
  },
  makeup: {
    label: '보강',
    monthClass: 'bg-purple-50 text-purple-700 border-purple-200 font-medium',
    timelineClass: 'bg-purple-100/90 text-purple-800 border-purple-300 z-20'
  }
};

export const ScheduleManager: React.FC<Props> = ({ studentInfos, paymentRecords }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [operationRecords, setOperationRecords] = useState<Record<string, SessionOperationRecord>>(() => {
    try {
      const stored = localStorage.getItem(SESSION_OPERATION_STORAGE_KEY);
      return stored ? JSON.parse(stored) as Record<string, SessionOperationRecord> : {};
    } catch {
      return {};
    }
  });
  const [editingEvent, setEditingEvent] = useState<ScheduleEvent | null>(null);
  const [editingStatus, setEditingStatus] = useState<SessionOperationStatus>('planned');
  const [editingNote, setEditingNote] = useState('');

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

  const normalizePaymentDate = (dateStr: string) => {
    const raw = String(dateStr || '').trim();
    if (!raw) return '';

    if (/^\d{5}$/.test(raw)) {
      const serial = parseInt(raw, 10);
      const date = new Date((serial - 25569) * 86400 * 1000);
      return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
    }

    const match = raw.match(/(\d{2,4})[-./\s년]+(\d{1,2})[-./\s월]+(\d{1,2})/);
    if (match) {
      const fullYear = match[1].length === 2 ? `20${match[1]}` : match[1];
      return `${fullYear}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    }

    return '';
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

  useEffect(() => {
    localStorage.setItem(SESSION_OPERATION_STORAGE_KEY, JSON.stringify(operationRecords));
  }, [operationRecords]);

  const getSessionOperationKey = (date: string, studentName: string) => `${date}_${studentName}`;

  const buildScheduleEvent = (date: string, name: string, time: string, isActual: boolean): ScheduleEvent => {
    const key = getSessionOperationKey(date, name);
    const record = operationRecords[key];
    return {
      key,
      date,
      name,
      time,
      isActual,
      status: record?.status || (isActual ? 'attended' : 'planned'),
      note: record?.note || ''
    };
  };

  const openOperationEditor = (event: ScheduleEvent) => {
    setEditingEvent(event);
    setEditingStatus(event.status);
    setEditingNote(event.note);
  };

  const saveOperationRecord = () => {
    if (!editingEvent) return;
    const record: SessionOperationRecord = {
      key: editingEvent.key,
      date: editingEvent.date,
      studentName: editingEvent.name,
      time: editingEvent.time,
      status: editingStatus,
      note: editingNote.trim(),
      updatedAtMs: Date.now()
    };
    setOperationRecords(prev => ({ ...prev, [record.key]: record }));
    setEditingEvent(null);
  };

  const resetOperationRecord = () => {
    if (!editingEvent) return;
    setOperationRecords(prev => {
      const next = { ...prev };
      delete next[editingEvent.key];
      return next;
    });
    setEditingEvent(null);
  };

  const currentMonthOperationSummary = useMemo(() => {
    const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
    const records = Object.values(operationRecords as Record<string, SessionOperationRecord>)
      .filter(record => record.date.startsWith(monthPrefix));
    return {
      total: records.length,
      attended: records.filter(record => record.status === 'attended').length,
      makeup: records.filter(record => record.status === 'makeup').length,
      absent: records.filter(record => record.status === 'absent').length,
      cancelled: records.filter(record => record.status === 'cancelled').length
    };
  }, [operationRecords, year, month]);

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
      
      const expected = studentInfos.filter(s => getScheduleDayNumber(s.scheduleDay) === dayOfWeek);
      map.set(dateStr, { expected, actual: [] });
    }

    // Map actual payments
    paymentRecords.forEach(record => {
      if (!record.transactionDate) return;
      const dateStr = normalizePaymentDate(record.transactionDate);
      if (!dateStr) return;
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
      const eventList: ScheduleEvent[] = [];
      
      if (dayData) {
        dayData.actual.forEach(a => {
          eventList.push(buildScheduleEvent(dateStr, a.studentName, a.transactionTime || '시간미상', true));
        });
        
        dayData.expected.forEach(e => {
          // If already in actual, skip showing expected to avoid duplicates if you want. 
          // For now, let's show expected only if there is no actual payment for this student on this day
          if (!dayData.actual.some(a => a.studentName === e.name)) {
            eventList.push(buildScheduleEvent(dateStr, e.name, e.scheduleTime || '미정', false));
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
              <button
                type="button"
                key={idx} 
                onClick={() => openOperationEditor(ev)}
                className={`text-[10px] px-1.5 py-1 rounded truncate border flex items-center gap-1 text-left ${SESSION_STATUS_META[ev.status].monthClass}`}
                title={`${ev.time} - ${ev.name} - ${SESSION_STATUS_META[ev.status].label}${ev.note ? `: ${ev.note}` : ''}`}
              >
                {ev.status === 'attended' ? <CheckCircle2 className="w-3 h-3 flex-shrink-0" /> : ev.status === 'planned' ? <CircleDashed className="w-3 h-3 flex-shrink-0" /> : <AlertCircle className="w-3 h-3 flex-shrink-0" />}
                <span className="truncate">{ev.time.split('~')[0]} {ev.name} · {SESSION_STATUS_META[ev.status].label}</span>
              </button>
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
              
              const eventList: ScheduleEvent[] = [];
              if (dayData) {
                dayData.actual.forEach(a => eventList.push(buildScheduleEvent(dateStr, a.studentName, a.transactionTime || '09:00:00', true)));
                dayData.expected.forEach(e => {
                  if (!dayData.actual.some(a => a.studentName === e.name)) {
                    eventList.push(buildScheduleEvent(dateStr, e.name, e.scheduleTime || '09:00', false));
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
                      <button
                        type="button"
                        key={idx}
                        onClick={() => openOperationEditor(ev)}
                        style={{ top: `${topPx}px`, height: `${heightPx}px` }}
                        className={`absolute left-1 right-1 rounded-lg px-2 py-1.5 text-xs shadow-sm border overflow-hidden flex flex-col text-left ${SESSION_STATUS_META[ev.status].timelineClass}`}
                      >
                        <div className="font-bold truncate">{ev.name}</div>
                        <div className="text-[10px] opacity-80 truncate">{ev.time.split('~')[0]} ({SESSION_STATUS_META[ev.status].label})</div>
                      </button>
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
        
        <div className="flex flex-wrap items-center justify-end gap-3">
          <button onClick={handleToday} className="px-4 py-2 text-sm font-bold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
            오늘
          </button>
          
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <div className="flex items-center gap-1.5 text-blue-700 bg-blue-50 px-2 py-1 rounded">
              <CheckCircle2 className="w-3.5 h-3.5" /> 출석
            </div>
            <div className="flex items-center gap-1.5 text-purple-700 bg-purple-50 px-2 py-1 rounded">
              <AlertCircle className="w-3.5 h-3.5" /> 보강
            </div>
            <div className="flex items-center gap-1.5 text-red-700 bg-red-50 px-2 py-1 rounded">
              <AlertCircle className="w-3.5 h-3.5" /> 결석
            </div>
            <div className="flex items-center gap-1.5 text-slate-500 bg-slate-50 border border-slate-200 border-dashed px-2 py-1 rounded">
              <CircleDashed className="w-3.5 h-3.5" /> 예정
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 shrink-0">
        {[
          { label: '운영 기록', value: currentMonthOperationSummary.total, tone: 'bg-white text-text-main border-border-theme' },
          { label: '출석', value: currentMonthOperationSummary.attended, tone: 'bg-blue-50 text-blue-700 border-blue-100' },
          { label: '보강', value: currentMonthOperationSummary.makeup, tone: 'bg-purple-50 text-purple-700 border-purple-100' },
          { label: '결석', value: currentMonthOperationSummary.absent, tone: 'bg-red-50 text-red-700 border-red-100' },
          { label: '취소', value: currentMonthOperationSummary.cancelled, tone: 'bg-slate-100 text-slate-600 border-slate-200' },
        ].map(item => (
          <div key={item.label} className={`rounded-xl border px-4 py-3 ${item.tone}`}>
            <div className="text-xl font-black">{item.value}</div>
            <div className="mt-1 text-xs font-bold opacity-80">{item.label}</div>
          </div>
        ))}
      </div>

      {/* View Content */}
      {viewMode === 'month' && renderMonthView()}
      {viewMode === 'week' && renderTimelineView(weekDays)}
      {viewMode === 'day' && renderTimelineView([currentDate])}

      {editingEvent && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 no-print">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setEditingEvent(null)} />
          <div className="relative w-full max-w-lg rounded-2xl border border-border-theme bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="flex items-center gap-2 text-xl font-black text-text-main">
                  <Clock className="h-5 w-5 text-primary" />
                  수업 운영 기록
                </h3>
                <p className="mt-1 text-sm font-semibold text-text-muted">
                  {editingEvent.date} · {editingEvent.time}
                </p>
              </div>
              <button onClick={() => setEditingEvent(null)} className="rounded-lg p-2 text-text-muted hover:bg-bg-theme hover:text-text-main">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-4 rounded-xl bg-bg-theme px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-black text-text-main">
                <User className="h-4 w-4 text-primary" />
                {editingEvent.name}
              </div>
              <div className="mt-1 text-xs font-semibold text-text-muted">
                {editingEvent.isActual ? '결제 기록 기반 수업' : '등록 시간표 기반 예정 수업'}
              </div>
            </div>

            <label className="mb-4 block">
              <span className="mb-2 block text-sm font-black text-text-main">상태</span>
              <select
                value={editingStatus}
                onChange={(e) => setEditingStatus(e.target.value as SessionOperationStatus)}
                className="w-full rounded-xl border border-border-theme bg-white px-4 py-3 text-sm font-bold outline-none focus:border-primary"
              >
                {(Object.keys(SESSION_STATUS_META) as SessionOperationStatus[]).map(status => (
                  <option key={status} value={status}>{SESSION_STATUS_META[status].label}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-black text-text-main">메모</span>
              <textarea
                value={editingNote}
                onChange={(e) => setEditingNote(e.target.value)}
                placeholder="결석 사유, 보강 예정일, 취소 사유 등을 기록"
                className="h-28 w-full resize-none rounded-xl border border-border-theme bg-bg-theme px-4 py-3 text-sm font-semibold outline-none focus:border-primary"
              />
            </label>

            <div className="mt-5 flex flex-wrap justify-between gap-2">
              <button
                onClick={resetOperationRecord}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-200"
              >
                <RotateCcw className="h-4 w-4" />
                기본값
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditingEvent(null)}
                  className="rounded-xl border border-border-theme px-4 py-2 text-sm font-black text-text-muted hover:bg-bg-theme"
                >
                  취소
                </button>
                <button
                  onClick={saveOperationRecord}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-black text-white hover:bg-primary-dark"
                >
                  <Save className="h-4 w-4" />
                  저장
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
