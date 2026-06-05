import { collection, doc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';

const TEMPLATE_DOC_COLLECTION = 'document_templates';
const TEMPLATE_FILE_CHUNKS = 'file_chunks';
const RAW_CHUNK_SIZE = 512 * 1024;

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  const batchSize = 0x8000;
  for (let i = 0; i < bytes.length; i += batchSize) {
    const batch = bytes.subarray(i, i + batchSize);
    binary += String.fromCharCode(...batch);
  }
  return btoa(binary);
};

const base64ToBytes = (base64: string) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const chunksCollection = (templateId: string) => (
  collection(db, TEMPLATE_DOC_COLLECTION, templateId, TEMPLATE_FILE_CHUNKS)
);

const createChunkUploadId = () => (
  `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
);

export const getFirestoreTemplateUrl = (templateId: string) => (
  `firestore://${TEMPLATE_DOC_COLLECTION}/${templateId}/${TEMPLATE_FILE_CHUNKS}`
);

export const deleteTemplateFileChunks = async (templateId: string, uploadId?: string) => {
  const snapshot = await getDocs(chunksCollection(templateId));
  if (snapshot.empty) return;

  const BATCH_LIMIT = 450;
  let batch = writeBatch(db);
  let pendingDeletes = 0;

  for (const docSnap of snapshot.docs) {
    if (uploadId && docSnap.data().uploadId !== uploadId) continue;
    batch.delete(docSnap.ref);
    pendingDeletes++;
    if (pendingDeletes >= BATCH_LIMIT) {
      await batch.commit();
      batch = writeBatch(db);
      pendingDeletes = 0;
    }
  }

  if (pendingDeletes > 0) {
    await batch.commit();
  }
};

export const saveTemplateFileChunks = async (
  templateId: string,
  file: File,
  onProgress?: (progress: number) => void
) => {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const chunkCount = Math.max(1, Math.ceil(bytes.length / RAW_CHUNK_SIZE));
  const uploadId = createChunkUploadId();

  onProgress?.(5);

  const BATCH_LIMIT = 450;
  let batch = writeBatch(db);
  let pendingWrites = 0;

  for (let index = 0; index < chunkCount; index++) {
    const start = index * RAW_CHUNK_SIZE;
    const chunkBytes = bytes.subarray(start, Math.min(start + RAW_CHUNK_SIZE, bytes.length));
    const chunkRef = doc(db, TEMPLATE_DOC_COLLECTION, templateId, TEMPLATE_FILE_CHUNKS, `${uploadId}_${String(index).padStart(4, '0')}`);
    batch.set(chunkRef, {
      uploadId,
      index,
      data: bytesToBase64(chunkBytes),
      size: chunkBytes.length,
    });
    pendingWrites++;

    if (pendingWrites >= BATCH_LIMIT) {
      await batch.commit();
      batch = writeBatch(db);
      pendingWrites = 0;
    }

    const progress = 5 + Math.round(((index + 1) / chunkCount) * 90);
    onProgress?.(progress);
  }

  if (pendingWrites > 0) {
    await batch.commit();
  }

  onProgress?.(100);
  return {
    uploadId,
    chunkCount,
    chunkSize: RAW_CHUNK_SIZE,
    fileUrl: getFirestoreTemplateUrl(templateId),
  };
};

export const loadTemplateFileFromChunks = async (templateId: string, uploadId?: string) => {
  const snapshot = await getDocs(chunksCollection(templateId));
  const chunks = snapshot.docs
    .map(docSnap => docSnap.data() as { uploadId?: string; index: number; data: string; size: number })
    .filter(chunk => !uploadId || chunk.uploadId === uploadId)
    .sort((a, b) => a.index - b.index);

  if (chunks.length === 0) {
    throw new Error('저장된 샘플 양식 파일 조각을 찾을 수 없습니다.');
  }

  const totalSize = chunks.reduce((sum, chunk) => sum + chunk.size, 0);
  const result = new Uint8Array(totalSize);
  let offset = 0;

  for (const chunk of chunks) {
    const bytes = base64ToBytes(chunk.data);
    result.set(bytes, offset);
    offset += bytes.length;
  }

  return result.buffer;
};
