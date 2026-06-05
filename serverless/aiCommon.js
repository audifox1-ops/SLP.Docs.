import { GoogleGenAI } from '@google/genai';

const DEFAULT_MODEL = 'gemini-2.5-flash-lite';
const QUOTA_RETRY_AFTER_SECONDS = 60;

export async function checkGeminiStatus() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      configured: false,
      ok: false,
      error: {
        code: 'MISSING_GEMINI_API_KEY',
        userMessage: 'Vercel 환경 변수에 GEMINI_API_KEY를 설정한 뒤 다시 배포해 주세요.'
      }
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents: [{ role: 'user', parts: [{ text: 'Return JSON only: {"ok": true}' }] }],
      config: {
        responseMimeType: 'application/json'
      }
    });

    return { configured: true, ok: Boolean(response.text), text: response.text || '' };
  } catch (error) {
    return { configured: true, ok: false, error: normalizeGeminiError(error) };
  }
}

export async function generateGeminiContent(prompt, model = DEFAULT_MODEL) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return {
      status: 500,
      payload: {
        error: {
          status: 500,
          code: 'MISSING_GEMINI_API_KEY',
          message: 'GEMINI_API_KEY is not configured.',
          userMessage: 'Vercel 환경 변수에 GEMINI_API_KEY를 설정한 뒤 다시 배포해 주세요.'
        }
      }
    };
  }

  if (typeof prompt !== 'string' || !prompt.trim()) {
    return {
      status: 400,
      payload: {
        error: {
          code: 'INVALID_PROMPT',
          message: 'A non-empty prompt string is required.',
          userMessage: 'AI 생성 요청 내용이 비어 있습니다. 다시 시도해 주세요.'
        }
      }
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: 'application/json'
      }
    });

    return { status: 200, payload: { text: response.text || '' } };
  } catch (error) {
    const details = normalizeGeminiError(error);
    return { status: details.status || 500, payload: { error: details } };
  }
}

function normalizeGeminiError(error) {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const serialized = (() => {
    try {
      return JSON.stringify(error);
    } catch {
      return rawMessage;
    }
  })();
  const text = `${rawMessage} ${serialized}`;

  if (text.includes('reported as leaked')) {
    return {
      status: 403,
      code: 'LEAKED_GEMINI_API_KEY',
      message: rawMessage,
      userMessage: 'Gemini API 키가 유출 신고되어 차단되었습니다. Google AI Studio 또는 Google Cloud에서 새 API 키를 발급하고 GEMINI_API_KEY를 교체해 주세요.'
    };
  }

  if (text.includes('429') || text.includes('RESOURCE_EXHAUSTED') || text.toLowerCase().includes('quota')) {
    return {
      status: 429,
      code: 'GEMINI_QUOTA_EXCEEDED',
      message: rawMessage,
      retryAfterSeconds: QUOTA_RETRY_AFTER_SECONDS,
      userMessage: 'Gemini API 할당량이 초과되었습니다. 잠시 후 다시 시도하거나 API 결제/할당량 설정을 확인해 주세요.'
    };
  }

  if (text.includes('403') || text.includes('PERMISSION_DENIED')) {
    return {
      status: 403,
      code: 'GEMINI_PERMISSION_DENIED',
      message: rawMessage,
      userMessage: 'Gemini API 권한이 거부되었습니다. API 키가 유효한지, Gemini API 사용 설정과 키 제한을 확인해 주세요.'
    };
  }

  return {
    status: 500,
    code: 'GEMINI_GENERATION_FAILED',
    message: rawMessage,
    userMessage: 'AI 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
  };
}
