import React, { useState, useRef } from 'react';
import { Plus, Edit2, Trash2, UserPlus, Save, X, Search, User, FileText, CheckCircle2, Loader2, Paperclip, Phone, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { StudentInfo } from '../types';
import { extractTextFromFile } from '../utils/extractText';
import { WEEKDAY_OPTIONS, normalizeScheduleDay, normalizeScheduleFrequency, normalizeScheduleTime } from '../utils/studentSchedule';

interface Props {
  studentInfos: StudentInfo[];
  onAdd: (student: StudentInfo) => void;
  onUpdate: (oldName: string, student: StudentInfo) => void;
  onDelete: (name: string) => void;
  onGenerateDocument: (name: string) => void;
  onUploadReference: (studentName: string, referenceData: string, fileName: string) => Promise<void>;
  onUploadAttachment: (studentName: string, file: File | Blob, name: string, type: 'image' | 'file') => Promise<void>;
  onDeleteAttachment: (studentName: string, attachmentUrl: string) => Promise<void>;
}

const createEmptyStudentInfo = (): StudentInfo => ({
  name: '',
  birthDate: '',
  school: '',
  disabilityType: '기타',
  treatmentArea: '언어치료',
  therapistName: '',
  guardianName: '',
  guardianPhone: '',
  guardianRelation: '보호자',
  messageConsent: false,
  scheduleDay: '',
  scheduleTime: '',
  scheduleFrequency: '1',
  specialNotes: ''
});

const normalizeStudentFormData = (info: StudentInfo): StudentInfo => ({
  ...info,
  name: info.name.trim(),
  birthDate: info.birthDate.trim(),
  school: info.school.trim(),
  disabilityType: info.disabilityType.trim(),
  treatmentArea: info.treatmentArea.trim(),
  therapistName: info.therapistName.trim(),
  guardianName: (info.guardianName || '').trim(),
  guardianPhone: (info.guardianPhone || '').trim(),
  guardianRelation: (info.guardianRelation || '').trim(),
  messageConsent: Boolean(info.messageConsent),
  scheduleDay: normalizeScheduleDay(info.scheduleDay),
  scheduleTime: normalizeScheduleTime(info.scheduleTime),
  scheduleFrequency: normalizeScheduleFrequency(info.scheduleFrequency),
  specialNotes: info.specialNotes || ''
});

export const StudentManagement: React.FC<Props> = ({
  studentInfos,
  onAdd,
  onUpdate,
  onDelete,
  onGenerateDocument,
  onUploadReference,
  onUploadAttachment,
  onDeleteAttachment
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingUploadName, setPendingUploadName] = useState<string>('');

  const handleFileUploadClick = (studentName: string) => {
    setPendingUploadName(studentName);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !pendingUploadName) return;

    setUploadingFor(pendingUploadName);
    try {
      if (file.type.startsWith('image/')) {
        await onUploadAttachment(pendingUploadName, file, file.name, 'image');
      } else {
        const text = await extractTextFromFile(file);
        await onUploadReference(pendingUploadName, text, file.name);
      }
    } catch (error) {
      console.error('File upload error:', error);
      alert(error instanceof Error ? error.message : '파일 처리 중 오류가 발생했습니다.');
    } finally {
      setUploadingFor(null);
      setPendingUploadName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePaste = async (e: React.ClipboardEvent, studentName: string) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile();
        if (blob) {
          setUploadingFor(studentName);
          const fileName = `clipboard_${new Date().getTime()}.png`;
          try {
            await onUploadAttachment(studentName, blob, fileName, 'image');
          } catch (error) {
            console.error('Paste upload error:', error);
          } finally {
            setUploadingFor(null);
          }
        }
      }
    }
  };
  
  const [formData, setFormData] = useState<StudentInfo>(createEmptyStudentInfo());
  const selectedScheduleDay = normalizeScheduleDay(formData.scheduleDay);
  const hasCustomScheduleDay = Boolean(selectedScheduleDay && !(WEEKDAY_OPTIONS as readonly string[]).includes(selectedScheduleDay));

  const filteredInfos = studentInfos.filter(info => 
    info.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const nextFormData = normalizeStudentFormData(formData);
    if (!nextFormData.name) return;

    if (editingName) {
      onUpdate(editingName, nextFormData);
      setEditingName(null);
      setIsAdding(false);
    } else {
      onAdd(nextFormData);
      setIsAdding(false);
    }
    
    setFormData(createEmptyStudentInfo());
  };

  const handleEdit = (info: StudentInfo) => {
    setFormData(normalizeStudentFormData({ ...createEmptyStudentInfo(), ...info }));
    setEditingName(info.name);
    setIsAdding(true);
  };

  const cancelEdit = () => {
    setIsAdding(false);
    setEditingName(null);
    setFormData(createEmptyStudentInfo());
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-bg-theme/50 p-6 md:p-10">
      {/* 숨겨진 파일 입력 */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept=".pdf,.txt,image/*"
        onChange={handleFileChange}
      />
      <div className="max-w-5xl mx-auto w-full flex flex-col h-full">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-3xl font-black text-text-main tracking-tight">학생 정보 관리</h2>
            <p className="text-text-muted mt-1">서류 자동 완성을 위한 학생들의 기본 정보를 관리합니다.</p>
          </div>
          <button
            onClick={() => setIsAdding(true)}
            className="bg-primary text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-primary-dark transition-all shadow-lg shadow-primary/20"
          >
            <Plus className="w-5 h-5" />
            새 학생 등록
          </button>
        </div>

        <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-border-theme flex flex-col overflow-hidden flex-1">
          <div className="p-6 border-b border-border-theme bg-bg-theme/30 flex flex-col md:flex-row gap-4 justify-between items-center">
            <div className="relative w-full md:w-96">
              <input
                type="text"
                placeholder="학생 이름으로 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-white border border-border-theme rounded-2xl focus:border-primary outline-none transition-all text-sm font-medium shadow-sm"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-5 h-5" />
            </div>
            <div className="text-sm font-bold text-text-muted">
              총 <span className="text-primary">{filteredInfos.length}</span>명 등록됨
            </div>
          </div>

          <div className="flex-1 overflow-auto p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <AnimatePresence mode="popLayout">
                {filteredInfos.map((info) => (
                  <motion.div
                    key={info.name}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="bg-white border border-border-theme rounded-2xl p-5 hover:shadow-lg transition-all group relative"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary-light flex items-center justify-center text-primary font-bold">
                          {info.name.charAt(0)}
                        </div>
                        <div>
                          <h4 className="font-bold text-text-main">{info.name}</h4>
                          <p className="text-[10px] text-text-muted font-bold uppercase tracking-wider">{info.treatmentArea}</p>
                        </div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handleEdit(info)}
                          className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-primary transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => onDelete(info.name)}
                          className="p-2 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* 참조 데이터 배지 및 이미지 썸네일 */}
                    {(info.referenceData || (info.attachments && info.attachments.length > 0)) && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {info.referenceData && (
                          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 rounded-lg border border-emerald-100 max-w-full">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                            <span className="text-[10px] font-bold text-emerald-700 truncate">
                              📎 {info.referenceFileName || '자료'}
                            </span>
                          </div>
                        )}
                        {info.attachments?.map((att, idx) => (
                          <div key={idx} className="relative group/att">
                            {att.type === 'image' ? (
                              <img 
                                src={att.url} 
                                alt={att.name} 
                                className="w-10 h-10 rounded-lg object-cover border border-border-theme shadow-sm"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-slate-50 border border-border-theme flex items-center justify-center">
                                <Paperclip className="w-4 h-4 text-slate-400" />
                              </div>
                            )}
                            <button 
                              onClick={() => onDeleteAttachment(info.name, att.url)}
                              className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover/att:opacity-100 transition-opacity"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-text-muted">생년월일</span>
                        <span className="font-semibold">{info.birthDate}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-muted">소속</span>
                        <span className="font-semibold">{info.school}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-muted">장애유형</span>
                        <span className="font-semibold">{info.disabilityType}</span>
                      </div>
                      <div className="flex justify-between border-t border-slate-50 pt-2 mt-2">
                        <span className="text-text-muted">담당 치료사</span>
                        <span className="font-bold text-primary">{info.therapistName}</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-text-muted flex-shrink-0">수업 일정</span>
                        <span className="font-semibold text-right leading-snug">
                          {info.scheduleDay || '요일 미정'} · {info.scheduleTime || '시간 미정'} · 주 {info.scheduleFrequency || '1'}회
                        </span>
                      </div>
                      <div className="flex justify-between gap-3 border-t border-slate-50 pt-2 mt-2">
                        <span className="text-text-muted flex-shrink-0">보호자</span>
                        <span className="font-semibold text-right leading-snug">
                          {info.guardianName || '미등록'}
                          {info.guardianRelation ? ` · ${info.guardianRelation}` : ''}
                        </span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-text-muted flex-shrink-0">연락처</span>
                        <span className="font-semibold text-right leading-snug">
                          {info.guardianPhone || '미등록'}
                        </span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-text-muted flex items-center gap-1 flex-shrink-0">
                          <MessageSquare className="w-3 h-3" />
                          메시지
                        </span>
                        <span className={`font-bold ${info.messageConsent ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {info.messageConsent ? '수신 동의' : '동의 확인 필요'}
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-2 mt-4">
                      <button 
                        onClick={() => handleFileUploadClick(info.name)}
                        disabled={uploadingFor === info.name}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-amber-50 text-amber-700 rounded-xl font-bold text-xs hover:bg-amber-100 transition-all border border-amber-100 disabled:opacity-50"
                      >
                        {uploadingFor === info.name ? (
                          <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 추출 중...</>
                        ) : (
                          <><Paperclip className="w-3.5 h-3.5" /> 과거 자료</>
                        )}
                      </button>
                      <button 
                        onClick={() => onGenerateDocument(info.name)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-primary-light text-primary rounded-xl font-bold text-xs hover:bg-primary hover:text-white transition-all border border-primary/10"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        서류 생성
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              
              {filteredInfos.length === 0 && !isAdding && (
                <div className="col-span-full py-20 text-center text-text-muted">
                  <User className="w-16 h-16 mx-auto mb-4 opacity-10" />
                  <p className="text-lg font-bold">등록된 학생이 없습니다.</p>
                  <p className="text-sm mt-1">새 학생 등록 버튼을 눌러 정보를 추가해 주세요.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={cancelEdit}
              className="absolute inset-0 bg-text-main/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-3xl max-h-[90vh] bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-8 border-b border-border-theme flex justify-between items-center bg-bg-theme/30">
                <div className="flex items-center gap-3">
                  <div className="bg-primary p-2 rounded-xl">
                    <UserPlus className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-text-main">
                    {editingName ? '학생 정보 수정' : '새 학생 등록'}
                  </h3>
                </div>
                <button onClick={cancelEdit} className="p-2 hover:bg-white rounded-full transition-colors">
                  <X className="w-6 h-6 text-text-muted" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-8 space-y-6 overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-text-muted ml-1 uppercase tracking-wider">학생명</label>
                    <input
                      required
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="이름 입력"
                      className="w-full px-4 py-3 bg-bg-theme border border-border-theme rounded-2xl focus:border-primary outline-none transition-all font-medium"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-text-muted ml-1 uppercase tracking-wider">생년월일</label>
                    <input
                      required
                      type="text"
                      value={formData.birthDate}
                      onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
                      placeholder="13.01.10"
                      className="w-full px-4 py-3 bg-bg-theme border border-border-theme rounded-2xl focus:border-primary outline-none transition-all font-medium"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-text-muted ml-1 uppercase tracking-wider">소속 학교/유치원</label>
                  <input
                    required
                    type="text"
                    value={formData.school}
                    onChange={(e) => setFormData({ ...formData, school: e.target.value })}
                    placeholder="학교명 입력"
                    className="w-full px-4 py-3 bg-bg-theme border border-border-theme rounded-2xl focus:border-primary outline-none transition-all font-medium"
                  />
                </div>

                <div className="rounded-2xl border border-border-theme bg-bg-theme/50 p-4 space-y-4">
                  <div className="flex items-center gap-2 text-sm font-black text-text-main">
                    <Phone className="h-4 w-4 text-primary" />
                    보호자 연락 정보
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-text-muted ml-1 uppercase tracking-wider">보호자명</label>
                      <input
                        type="text"
                        value={formData.guardianName || ''}
                        onChange={(e) => setFormData({ ...formData, guardianName: e.target.value })}
                        placeholder="보호자 이름"
                        autoComplete="off"
                        className="w-full px-4 py-3 bg-white border border-border-theme rounded-2xl focus:border-primary outline-none transition-all font-medium"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-text-muted ml-1 uppercase tracking-wider">관계</label>
                      <select
                        value={formData.guardianRelation || '보호자'}
                        onChange={(e) => setFormData({ ...formData, guardianRelation: e.target.value })}
                        className="w-full px-4 py-3 bg-white border border-border-theme rounded-2xl focus:border-primary outline-none transition-all font-medium cursor-pointer"
                      >
                        {['보호자', '부', '모', '조부모', '교사', '기타'].map(relation => (
                          <option key={relation} value={relation}>{relation}</option>
                        ))}
                        {formData.guardianRelation && !['보호자', '부', '모', '조부모', '교사', '기타'].includes(formData.guardianRelation) && (
                          <option value={formData.guardianRelation}>{formData.guardianRelation} (기존)</option>
                        )}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-text-muted ml-1 uppercase tracking-wider">연락처</label>
                      <input
                        type="tel"
                        value={formData.guardianPhone || ''}
                        onChange={(e) => setFormData({ ...formData, guardianPhone: e.target.value })}
                        placeholder="010-0000-0000"
                        autoComplete="tel"
                        className="w-full px-4 py-3 bg-white border border-border-theme rounded-2xl focus:border-primary outline-none transition-all font-medium"
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-3 rounded-xl border border-border-theme bg-white px-4 py-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(formData.messageConsent)}
                      onChange={(e) => setFormData({ ...formData, messageConsent: e.target.checked })}
                      className="h-4 w-4 rounded border-border-theme text-primary focus:ring-primary"
                    />
                    <span className="text-sm font-bold text-text-main">보호자 메시지 수신 동의 확인됨</span>
                  </label>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-text-muted ml-1 uppercase tracking-wider">장애 유형</label>
                  <select
                    value={formData.disabilityType || '기타'}
                    onChange={(e) => setFormData({ ...formData, disabilityType: e.target.value })}
                    className="w-full px-4 py-3 bg-bg-theme border border-border-theme rounded-2xl focus:border-primary outline-none transition-all font-medium cursor-pointer"
                  >
                    {[
                      '자폐성장애',
                      '지적장애',
                      '뇌병변장애',
                      '청각장애',
                      '언어장애',
                      '발달지연',
                      '기타'
                    ].map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                    {formData.disabilityType && ![
                      '자폐성장애', '지적장애', '뇌병변장애', '청각장애', '언어장애', '발달지연', '기타'
                    ].includes(formData.disabilityType) && (
                      <option value={formData.disabilityType}>{formData.disabilityType} (기존 데이터)</option>
                    )}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-text-muted ml-1 uppercase tracking-wider">치료 영역</label>
                    <select
                      value={formData.treatmentArea}
                      onChange={(e) => setFormData({ ...formData, treatmentArea: e.target.value })}
                      className="w-full px-4 py-3 bg-bg-theme border border-border-theme rounded-2xl focus:border-primary outline-none transition-all font-medium cursor-pointer"
                    >
                      <option value="언어치료">언어치료</option>
                      <option value="미술치료">미술치료</option>
                      <option value="감각통합">감각통합</option>
                      <option value="인지치료">인지치료</option>
                      <option value="기타">기타</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-text-muted ml-1 uppercase tracking-wider">담당 치료사</label>
                    <input
                      required
                      type="text"
                      value={formData.therapistName}
                      onChange={(e) => setFormData({ ...formData, therapistName: e.target.value })}
                      placeholder="치료사 이름"
                      className="w-full px-4 py-3 bg-bg-theme border border-border-theme rounded-2xl focus:border-primary outline-none transition-all font-medium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-text-muted ml-1 uppercase tracking-wider">수업 요일</label>
                    <select
                      value={selectedScheduleDay || ''}
                      onChange={(e) => setFormData({ ...formData, scheduleDay: e.target.value })}
                      className="w-full px-4 py-3 bg-bg-theme border border-border-theme rounded-2xl focus:border-primary outline-none transition-all font-medium cursor-pointer"
                    >
                      <option value="">요일 선택</option>
                      {hasCustomScheduleDay && (
                        <option value={selectedScheduleDay}>{selectedScheduleDay} (기존)</option>
                      )}
                      {WEEKDAY_OPTIONS.map(day => (
                        <option key={day} value={day}>{day}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-text-muted ml-1 uppercase tracking-wider">수업 시간</label>
                    <input
                      type="text"
                      value={formData.scheduleTime || ''}
                      onChange={(e) => setFormData({ ...formData, scheduleTime: e.target.value })}
                      placeholder="14:50~15:30"
                      autoComplete="off"
                      className="w-full px-4 py-3 bg-bg-theme border border-border-theme rounded-2xl focus:border-primary outline-none transition-all font-medium"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-text-muted ml-1 uppercase tracking-wider">주 횟수</label>
                    <select
                      value={formData.scheduleFrequency || '1'}
                      onChange={(e) => setFormData({ ...formData, scheduleFrequency: e.target.value })}
                      className="w-full px-4 py-3 bg-bg-theme border border-border-theme rounded-2xl focus:border-primary outline-none transition-all font-medium cursor-pointer"
                    >
                      {['1', '2', '3', '4', '5'].map(count => (
                        <option key={count} value={count}>주 {count}회</option>
                      ))}
                      {formData.scheduleFrequency && !['1', '2', '3', '4', '5'].includes(formData.scheduleFrequency) && (
                        <option value={formData.scheduleFrequency}>주 {formData.scheduleFrequency}회</option>
                      )}
                    </select>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="text-xs font-bold text-text-muted ml-1 uppercase tracking-wider">특이사항 및 관찰 내용</label>
                  <div className="relative">
                    <textarea
                      value={formData.specialNotes || ''}
                      onChange={(e) => setFormData({ ...formData, specialNotes: e.target.value })}
                      onPaste={(e) => editingName && handlePaste(e, editingName)}
                      placeholder="아이의 임상적 특성이나 특이사항을 자유롭게 기록하세요. 복사한 이미지를 여기에 붙여넣을 수 있습니다."
                      className="w-full h-24 px-4 py-3 bg-bg-theme border border-border-theme rounded-2xl focus:border-primary outline-none transition-all font-medium resize-none"
                    />
                    {uploadingFor === editingName && (
                      <div className="absolute inset-0 bg-white/50 backdrop-blur-[2px] rounded-2xl flex items-center justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-primary" />
                      </div>
                    )}
                  </div>
                </div>

                {/* 등록된 첨부파일 미리보기 (수정 모드) */}
                {editingName && formData.attachments && formData.attachments.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-text-muted ml-1 uppercase tracking-wider">등록된 첨부파일</label>
                    <div className="flex flex-wrap gap-3">
                      {formData.attachments.map((att, idx) => (
                        <div key={idx} className="relative group ring-1 ring-border-theme p-1 rounded-xl bg-bg-theme shadow-sm">
                          {att.type === 'image' ? (
                            <img src={att.url} className="w-16 h-16 rounded-lg object-cover" alt="attachment" />
                          ) : (
                            <div className="w-16 h-16 rounded-lg flex items-center justify-center bg-white">
                              <Paperclip className="w-6 h-6 text-slate-300" />
                            </div>
                          )}
                          <button 
                            type="button"
                            onClick={() => onDeleteAttachment(editingName, att.url)}
                            className="absolute -top-2 -right-2 bg-text-main text-white rounded-full p-1 shadow-lg hover:bg-red-500 transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="flex-1 py-4 rounded-2xl font-bold text-text-muted hover:bg-bg-theme transition-all border border-border-theme"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-4 bg-primary text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-primary-dark transition-all shadow-lg shadow-primary/20"
                  >
                    <Save className="w-5 h-5" />
                    저장하기
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
