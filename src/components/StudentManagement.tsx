import React, { useState, useRef } from 'react';
import { Plus, Edit2, Trash2, UserPlus, Save, X, Search, User, FileText, Upload, CheckCircle2, Loader2, Paperclip } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { StudentInfo } from '../types';
import { extractTextFromFile } from '../utils/extractText';

interface Props {
  studentInfos: StudentInfo[];
  onAdd: (student: StudentInfo) => void;
  onUpdate: (oldName: string, student: StudentInfo) => void;
  onDelete: (name: string) => void;
  onGenerateDocument: (name: string) => void;
  onUploadReference: (studentName: string, referenceData: string, fileName: string) => Promise<void>;
}

export const StudentManagement: React.FC<Props> = ({ studentInfos, onAdd, onUpdate, onDelete, onGenerateDocument, onUploadReference }) => {
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
      const text = await extractTextFromFile(file);
      await onUploadReference(pendingUploadName, text, file.name);
    } catch (error) {
      console.error('File upload error:', error);
      alert(error instanceof Error ? error.message : '파일 처리 중 오류가 발생했습니다.');
    } finally {
      setUploadingFor(null);
      setPendingUploadName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };
  
  const [formData, setFormData] = useState<StudentInfo>({
    name: '',
    birthDate: '',
    school: '',
    disabilityType: '',
    treatmentArea: '언어치료',
    therapistName: ''
  });

  const filteredInfos = studentInfos.filter(info => 
    info.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;

    if (editingName) {
      onUpdate(editingName, formData);
      setEditingName(null);
    } else {
      onAdd(formData);
      setIsAdding(false);
    }
    
    setFormData({
      name: '',
      birthDate: '',
      school: '',
      disabilityType: '',
      treatmentArea: '언어치료',
      therapistName: ''
    });
  };

  const handleEdit = (info: StudentInfo) => {
    setFormData(info);
    setEditingName(info.name);
    setIsAdding(true);
  };

  const cancelEdit = () => {
    setIsAdding(false);
    setEditingName(null);
    setFormData({
      name: '',
      birthDate: '',
      school: '',
      disabilityType: '',
      treatmentArea: '언어치료',
      therapistName: ''
    });
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-bg-theme/50 p-6 md:p-10">
      {/* 숨겨진 파일 입력 */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept=".pdf,.txt"
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

                    {/* 참조 데이터 배지 */}
                    {info.referenceData && (
                      <div className="flex items-center gap-1.5 mb-3 px-2.5 py-1.5 bg-emerald-50 rounded-lg border border-emerald-100">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                        <span className="text-[10px] font-bold text-emerald-700 truncate">
                          📎 {info.referenceFileName || '과거 자료 등록됨'}
                        </span>
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
              className="relative w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl overflow-hidden"
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

              <form onSubmit={handleSubmit} className="p-8 space-y-6">
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

                <div className="space-y-2">
                  <label className="text-xs font-bold text-text-muted ml-1 uppercase tracking-wider">장애 유형</label>
                  <input
                    required
                    type="text"
                    value={formData.disabilityType}
                    onChange={(e) => setFormData({ ...formData, disabilityType: e.target.value })}
                    placeholder="예: 자폐성장애, 지적장애"
                    className="w-full px-4 py-3 bg-bg-theme border border-border-theme rounded-2xl focus:border-primary outline-none transition-all font-medium"
                  />
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
