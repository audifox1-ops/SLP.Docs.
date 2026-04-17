import * as pdfjsLib from 'pdfjs-dist';

// PDF.js 워커 설정 - CDN에서 로드
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

const MAX_TEXT_LENGTH = 50000; // Firestore 저장용 최대 글자 수

/**
 * PDF 파일에서 텍스트를 추출합니다.
 */
async function extractTextFromPDF(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
  let fullText = '';
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ');
    fullText += pageText + '\n';
  }
  
  return fullText.trim();
}

/**
 * TXT 파일에서 텍스트를 추출합니다.
 */
function extractTextFromTXT(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      resolve(text?.trim() || '');
    };
    reader.onerror = () => reject(new Error('파일 읽기에 실패했습니다.'));
    reader.readAsText(file, 'UTF-8');
  });
}

/**
 * 추출된 텍스트를 정리하고 길이를 제한합니다.
 */
function cleanAndTruncate(text: string): string {
  // 연속 공백 및 빈 줄 정리
  const cleaned = text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  
  if (cleaned.length > MAX_TEXT_LENGTH) {
    return cleaned.substring(0, MAX_TEXT_LENGTH) + '\n\n[... 텍스트가 너무 길어 일부만 포함되었습니다.]';
  }
  
  return cleaned;
}

/**
 * 파일에서 텍스트를 추출하는 메인 함수입니다.
 * 지원 형식: PDF, TXT
 */
export async function extractTextFromFile(file: File): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  
  let rawText = '';
  
  switch (extension) {
    case 'pdf':
      rawText = await extractTextFromPDF(file);
      break;
    case 'txt':
      rawText = await extractTextFromTXT(file);
      break;
    default:
      throw new Error(`지원하지 않는 파일 형식입니다: .${extension}\nPDF 또는 TXT 파일만 업로드할 수 있습니다.`);
  }
  
  if (!rawText || rawText.length < 10) {
    throw new Error('파일에서 텍스트를 추출할 수 없습니다. 스캔된 이미지 PDF가 아닌, 텍스트가 포함된 파일을 업로드해 주세요.');
  }
  
  return cleanAndTruncate(rawText);
}
