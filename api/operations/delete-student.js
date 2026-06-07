import { deleteStudentOperation, parseJsonBody, toOperationErrorResponse } from '../../serverless/operationsCommon.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({
      error: {
        code: 'METHOD_NOT_ALLOWED',
        userMessage: '지원하지 않는 학생 삭제 요청입니다.'
      }
    });
  }

  try {
    const payload = await deleteStudentOperation(req, parseJsonBody(req.body));
    return res.status(200).json(payload);
  } catch (error) {
    const operationError = toOperationErrorResponse(error);
    return res.status(operationError.status).json(operationError.payload);
  }
}
