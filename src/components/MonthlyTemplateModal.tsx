import React, { useRef } from 'react';
import { AlertCircle, ExternalLink, FileText, Loader2, Trash2, UploadCloud, X } from 'lucide-react';
import { DocumentTemplateKind, DocumentTemplateSample } from '../types';
import {
  ANNUAL_FIXED_MONTH_PLACEHOLDER_EXAMPLES,
  ANNUAL_TEMPLATE_PLACEHOLDERS,
  COMBINED_FIXED_PLACEHOLDER_EXAMPLES,
  COMBINED_TEMPLATE_PLACEHOLDERS,
  MONTHLY_FIXED_SESSION_PLACEHOLDER_EXAMPLES,
  MONTHLY_TEMPLATE_PLACEHOLDERS
} from '../utils/monthlyTemplateExport';

interface Props {
  isOpen: boolean;
  activeKind: DocumentTemplateKind;
  combinedTemplate: DocumentTemplateSample | null;
  annualTemplate: DocumentTemplateSample | null;
  monthlyTemplate: DocumentTemplateSample | null;
  isUploading: boolean;
  uploadProgress?: number | null;
  onClose: () => void;
  onKindChange: (kind: DocumentTemplateKind) => void;
  onUpload: (kind: DocumentTemplateKind, file: File) => void;
  onOpen: (kind: DocumentTemplateKind) => void;
  onDelete: (kind: DocumentTemplateKind) => void;
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
  activeKind,
  combinedTemplate,
  annualTemplate,
  monthlyTemplate,
  isUploading,
  uploadProgress,
  onClose,
  onKindChange,
  onUpload,
  onOpen,
  onDelete,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const template =
    activeKind === 'combined_journal' ? combinedTemplate :
    activeKind === 'annual_plan' ? annualTemplate :
    monthlyTemplate;
  const label =
    activeKind === 'combined_journal' ? '통합 양식' :
    activeKind === 'annual_plan' ? '연간계획서' :
    '월간일지';
  const placeholders =
    activeKind === 'combined_journal' ? COMBINED_TEMPLATE_PLACEHOLDERS :
    activeKind === 'annual_plan' ? ANNUAL_TEMPLATE_PLACEHOLDERS :
    MONTHLY_TEMPLATE_PLACEHOLDERS;
  const fixedPlaceholderExamples =
    activeKind === 'combined_journal' ? COMBINED_FIXED_PLACEHOLDER_EXAMPLES :
    activeKind === 'annual_plan' ? ANNUAL_FIXED_MONTH_PLACEHOLDER_EXAMPLES :
    MONTHLY_FIXED_SESSION_PLACEHOLDER_EXAMPLES;

  const handleFile = (file?: File) => {
    if (!file || isUploading) return;
    onUpload(activeKind, file);
  };

  const isAutoTemplate = ['hwpx-template', 'docx-template'].includes(template?.applyMode || '');
  const templateFormatLabel =
    template?.applyMode === 'hwp-template' ? 'HWP 보관' :
    template?.applyMode === 'hwpx-template' ? 'HWPX 자동 양식' :
    template?.applyMode === 'docx-template' ? 'DOCX 자동 양식' :
    '참조용';
  const normalizedProgress = typeof uploadProgress === 'number'
    ? Math.max(0, Math.min(100, uploadProgress))
    : null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 no-print">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-border-theme overflow-hidden">
        <div className="px-6 py-5 border-b border-border-theme flex items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-black text-text-main flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              문서 샘플 양식
            </h3>
            <p className="text-sm text-text-muted mt-1">연간계획서와 월간일지가 함께 있는 샘플 양식을 우선 사용합니다.</p>
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
          <div className="grid grid-cols-3 gap-2 rounded-2xl bg-slate-100 p-1">
            {([
              ['combined_journal', '통합 양식'],
              ['annual_plan', '연간계획서'],
              ['monthly_journal', '월간일지'],
            ] as [DocumentTemplateKind, string][]).map(([kind, name]) => (
              <button
                key={kind}
                onClick={() => onKindChange(kind)}
                disabled={isUploading}
                className={`px-3 py-2 rounded-xl text-sm font-black transition-colors ${
                  activeKind === kind
                    ? 'bg-white text-primary shadow-sm'
                    : 'text-text-muted hover:text-text-main'
                }`}
              >
                {name}
              </button>
            ))}
          </div>

          <div
            className={`border-2 border-dashed rounded-2xl px-5 py-8 text-center transition-colors ${
              isUploading ? 'border-slate-200 bg-slate-50' : 'border-primary/30 bg-primary-light/30 hover:border-primary'
            }`}
            onClick={() => {
              if (!isUploading) inputRef.current?.click();
            }}
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
              {isUploading
                ? normalizedProgress !== null ? `업로드 중입니다 (${normalizedProgress}%)` : '업로드 중입니다'
                : '파일을 선택하거나 여기에 놓기'}
            </div>
            <div className="text-xs text-text-muted mt-2">{label} 샘플 · HWPX/DOCX는 자동 치환 가능 · 최대 20MB</div>
            {isUploading && normalizedProgress !== null && (
              <div className="mt-5 max-w-sm mx-auto">
                <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-200"
                    style={{ width: `${normalizedProgress}%` }}
                  />
                </div>
                <div className="mt-2 text-[11px] font-bold text-text-muted">
                  파일 전송이 끝나면 저장 정보만 빠르게 반영됩니다.
                </div>
              </div>
            )}
            <input
              ref={inputRef}
              type="file"
              accept=".hwp,.hwpx,.docx,.doc,.pdf,.png,.jpg,.jpeg"
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
                  {template.fileType.toUpperCase()} · {formatBytes(template.fileSize)} · {new Date(template.uploadedAtMs).toLocaleString()} · {templateFormatLabel} · {isAutoTemplate ? '자동 치환 적용' : '자동 치환 안 됨'}
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => onOpen(activeKind)}
                  disabled={isUploading}
                  className="px-3 py-2 rounded-xl bg-white border border-border-theme text-sm font-bold text-text-main hover:bg-bg-theme disabled:opacity-50 flex items-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  열기
                </button>
                <button
                  onClick={() => onDelete(activeKind)}
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
                <div className="text-sm font-black text-amber-800">저장된 {label} 샘플이 없습니다.</div>
                <div className="text-xs text-amber-700 mt-1">연간계획서와 월간일지가 함께 들어 있는 HWPX 또는 DOCX 샘플은 통합 양식에 업로드해 주세요.</div>
              </div>
            </div>
          )}

          <div className="bg-slate-50 border border-border-theme rounded-2xl p-4 text-sm text-text-muted leading-relaxed">
            표와 제목까지 자동으로 유지해 치환하려면 한글에서 샘플을 HWPX로 저장하거나 DOCX 샘플을 업로드해 주세요. 값을 넣을 칸에는 아래 형식의 placeholder를 입력합니다.
            <div className="flex flex-wrap gap-1.5 mt-3">
              {placeholders.filter(name => name !== 'sessions' && name !== 'monthlyGoals').map(name => (
                <code key={name} className="px-2 py-1 rounded-lg bg-white border border-border-theme text-[11px] font-bold text-text-main">
                  {`{{${name}}}`}
                </code>
              ))}
            </div>
            <div className="mt-3 text-xs">
              {activeKind === 'combined_journal'
                ? '통합 양식에는 '
                : activeKind === 'annual_plan'
                  ? '월별 표에는 '
                  : '고정된 회기 표에는 '}
              <code>{
                activeKind === 'combined_journal' ? '{{month1Goal}}' :
                activeKind === 'annual_plan' ? '{{month1Goal}}' :
                '{{session1Date}}'
              }</code>
              , <code>{
                activeKind === 'combined_journal' ? '{{session1Content}}' :
                activeKind === 'annual_plan' ? '{{month1Content}}' :
                '{{session1Content}}'
              }</code>
              {activeKind === 'combined_journal'
                ? '처럼 연간 월별 목표와 월간 회기 정보를 함께 배치합니다.'
                : activeKind === 'annual_plan'
                  ? '처럼 월 번호를 붙여 배치합니다.'
                  : '처럼 회차 번호를 붙여 배치합니다.'}
              {fixedPlaceholderExamples.map(name => (
                <code key={name} className="ml-1">{`{{${name}}}`}</code>
              ))}
            </div>
            <div className="mt-2 text-xs">HWP 원본은 보관/열기만 가능하며 자동 치환은 HWPX 또는 DOCX에서 적용됩니다.</div>
          </div>
        </div>
      </div>
    </div>
  );
};
