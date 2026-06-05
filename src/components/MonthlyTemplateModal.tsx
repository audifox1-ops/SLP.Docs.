import React, { useRef } from 'react';
import { AlertCircle, ExternalLink, FileText, Loader2, Trash2, UploadCloud, X } from 'lucide-react';
import { MonthlyJournalTemplateSample } from '../types';
import { MONTHLY_TEMPLATE_PLACEHOLDERS } from '../utils/monthlyTemplateExport';

interface Props {
  isOpen: boolean;
  template: MonthlyJournalTemplateSample | null;
  isUploading: boolean;
  onClose: () => void;
  onUpload: (file: File) => void;
  onDelete: () => void;
}

const formatBytes = (bytes: number) => {
  if (!bytes) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

export const MonthlyTemplateModal: React.FC<Props> = ({
  isOpen,
  template,
  isUploading,
  onClose,
  onUpload,
  onDelete,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFile = (file?: File) => {
    if (!file || isUploading) return;
    onUpload(file);
  };

  const isDocxTemplate = template?.applyMode === 'docx-template' && template.fileType === 'docx';

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 no-print">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-border-theme overflow-hidden">
        <div className="px-6 py-5 border-b border-border-theme flex items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-black text-text-main flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              월간일지 샘플 양식
            </h3>
            <p className="text-sm text-text-muted mt-1">DOCX 샘플은 표와 제목을 그대로 두고 작성 내용만 자동으로 채웁니다.</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-text-muted hover:text-text-main hover:bg-slate-100"
            title="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div
            className={`border-2 border-dashed rounded-2xl px-5 py-8 text-center transition-colors ${
              isUploading ? 'border-slate-200 bg-slate-50' : 'border-primary/30 bg-primary-light/30 hover:border-primary'
            }`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              handleFile(event.dataTransfer.files?.[0]);
            }}
          >
            <div className="mx-auto w-14 h-14 rounded-2xl bg-white border border-border-theme flex items-center justify-center mb-4 shadow-sm">
              {isUploading ? (
                <Loader2 className="w-7 h-7 text-primary animate-spin" />
              ) : (
                <UploadCloud className="w-7 h-7 text-primary" />
              )}
            </div>
            <div className="font-black text-text-main">
              {isUploading ? '업로드 중입니다' : '파일을 선택하거나 여기에 놓기'}
            </div>
            <div className="text-xs text-text-muted mt-2">DOCX 권장 · HWP/PDF/이미지는 참조용 · 최대 20MB</div>
            <input
              ref={inputRef}
              type="file"
              accept=".doc,.docx,.hwp,.pdf,.png,.jpg,.jpeg"
              className="hidden"
              onChange={(event) => {
                handleFile(event.target.files?.[0]);
                if (event.target) event.target.value = '';
              }}
            />
          </div>

          {template ? (
            <div className="border border-border-theme rounded-2xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="min-w-0">
                <div className="text-xs font-black text-primary mb-1">저장된 샘플</div>
                <div className="font-black text-text-main truncate">{template.fileName}</div>
                <div className="text-xs text-text-muted mt-1">
                  {template.fileType.toUpperCase()} · {formatBytes(template.fileSize)} · {new Date(template.uploadedAtMs).toLocaleString()} · {isDocxTemplate ? '자동 치환 적용' : '참조용'}
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <a
                  href={template.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-2 rounded-xl bg-white border border-border-theme text-sm font-bold text-text-main hover:bg-bg-theme flex items-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  열기
                </a>
                <button
                  onClick={onDelete}
                  disabled={isUploading}
                  className="px-3 py-2 rounded-xl bg-red-50 text-red-600 text-sm font-bold hover:bg-red-100 disabled:opacity-50 flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  삭제
                </button>
              </div>
            </div>
          ) : (
            <div className="border border-amber-100 bg-amber-50 rounded-2xl p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-black text-amber-800">저장된 월간일지 샘플이 없습니다.</div>
                <div className="text-xs text-amber-700 mt-1">샘플 파일을 올리면 이후 양식 반영 기준으로 확인할 수 있습니다.</div>
              </div>
            </div>
          )}

          <div className="bg-slate-50 border border-border-theme rounded-2xl p-4 text-sm text-text-muted leading-relaxed">
            샘플 DOCX 안의 표, 제목, 여백, 셀 병합은 그대로 유지됩니다. 값을 넣을 칸에는 아래 형식의 placeholder를 입력해 주세요.
            <div className="flex flex-wrap gap-1.5 mt-3">
              {MONTHLY_TEMPLATE_PLACEHOLDERS.filter(name => name !== 'sessions').map(name => (
                <code key={name} className="px-2 py-1 rounded-lg bg-white border border-border-theme text-[11px] font-bold text-text-main">
                  {`{{${name}}}`}
                </code>
              ))}
            </div>
            <div className="mt-3 text-xs">
              회기 표 행 반복은 한 행 안에 <code>{'{{#sessions}}'}</code>, <code>{'{{date}}'}</code>, <code>{'{{content}}'}</code>, <code>{'{{reaction}}'}</code>, <code>{'{{consultation}}'}</code>, <code>{'{{/sessions}}'}</code>를 배치합니다.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
