import { getFirebaseProjectId, requireAdminOperator, requireStaffFromRequest, toAuthErrorResponse } from './firebaseAdmin.js';

function createOperationError(status, code, userMessage, message = userMessage) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.userMessage = userMessage;
  return error;
}

function encodeDocumentPath(...segments) {
  return segments.map(segment => encodeURIComponent(segment)).join('/');
}

function getFirestoreDocumentUrl(...segments) {
  const projectId = getFirebaseProjectId();
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${encodeDocumentPath(...segments)}`;
}

export function parseJsonBody(body) {
  if (!body) return {};
  if (Buffer.isBuffer(body)) return parseJsonBody(body.toString('utf8'));
  if (typeof body === 'object') return body;
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return {};
}

export async function deleteStudentOperation(req, body) {
  const operator = await requireStaffFromRequest(req);
  requireAdminOperator(operator);

  const studentName = typeof body?.studentName === 'string' ? body.studentName.trim() : '';
  if (!studentName || studentName.length > 100 || studentName.includes('/')) {
    throw createOperationError(400, 'INVALID_STUDENT_NAME', '삭제할 학생 이름이 올바르지 않습니다.');
  }

  const response = await fetch(getFirestoreDocumentUrl('students', studentName), {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${operator.token}`,
    },
  });

  if (response.status === 404) {
    return { ok: true, deleted: false, studentName };
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw createOperationError(500, 'STUDENT_DELETE_FAILED', '학생 정보 삭제 중 서버 오류가 발생했습니다.', errorText);
  }

  return { ok: true, deleted: true, studentName };
}

export function toOperationErrorResponse(error) {
  return toAuthErrorResponse(error);
}
