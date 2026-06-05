import { checkGeminiStatus } from '../../serverless/aiCommon.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({
      error: {
        code: 'METHOD_NOT_ALLOWED',
        userMessage: '지원하지 않는 AI 상태 점검 요청입니다.'
      }
    });
  }

  const status = await checkGeminiStatus();
  return res.status(200).json(status);
}
