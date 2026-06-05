import { ref, uploadBytes, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../firebase';

/**
 * 일반 파일을 Firebase Storage에 업로드합니다.
 */
export async function uploadFile(file: File, path: string): Promise<string> {
  const storageRef = ref(storage, path);
  const snapshot = await uploadBytes(storageRef, file);
  return getDownloadURL(snapshot.ref);
}

/**
 * 진행률을 제공하면서 일반 파일을 Firebase Storage에 업로드합니다.
 */
export async function uploadFileWithProgress(
  file: File,
  path: string,
  onProgress?: (progress: number) => void
): Promise<string> {
  const storageRef = ref(storage, path);
  const uploadTask = uploadBytesResumable(storageRef, file);

  return new Promise((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = snapshot.totalBytes > 0
          ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
          : 0;
        onProgress?.(progress);
      },
      reject,
      async () => {
        try {
          onProgress?.(100);
          resolve(await getDownloadURL(uploadTask.snapshot.ref));
        } catch (error) {
          reject(error);
        }
      }
    );
  });
}

/**
 * Blob 데이터(예: 클립보드 이미지)를 Firebase Storage에 업로드합니다.
 */
export async function uploadBlob(blob: Blob, path: string): Promise<string> {
  const storageRef = ref(storage, path);
  const snapshot = await uploadBytes(storageRef, blob);
  return getDownloadURL(snapshot.ref);
}

/**
 * 저장된 파일을 삭제합니다.
 */
export async function deleteFileFromStorage(url: string): Promise<void> {
  const fileRef = ref(storage, url);
  await deleteObject(fileRef);
}
