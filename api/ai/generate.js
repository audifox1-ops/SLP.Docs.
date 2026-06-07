import { generateGeminiContent } from '../../serverless/aiCommon.js';
import { requireStaffFromRequest, toAuthErrorResponse } from '../../serverless/firebaseAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({
      error: {
        code: 'METHOD_NOT_ALLOWED',
        userMessage: '지원하지 않는 AI 생성 요청입니다.'
      }
    });
  }

  const body = parseBody(req.body);
  let operator;
  try {
    operator = await requireStaffFromRequest(req);
  } catch (error) {
    const authError = toAuthErrorResponse(error);
    return res.status(authError.status).json(authError.payload);
  }

  const result = await generateGeminiContent(body?.prompt, body?.model, operator);
  if (result.payload?.error?.retryAfterSeconds) {
    res.setHeader('Retry-After', String(result.payload.error.retryAfterSeconds));
  }
  return res.status(result.status).json(result.payload);
}

function parseBody(body) {
  if (!body) return {};
  if (Buffer.isBuffer(body)) {
    return parseBody(body.toString('utf8'));
  }
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
