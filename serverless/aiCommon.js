import { GoogleGenAI } from '@google/genai';

const DEFAULT_MODEL = 'gemini-2.5-flash-lite';
const QUOTA_RETRY_AFTER_SECONDS = 60;
const MAX_PROMPT_CHARS = Number(process.env.AI_MAX_PROMPT_CHARS || 30000);
const RATE_LIMIT_WINDOW_MS = Number(process.env.AI_RATE_LIMIT_WINDOW_MS || 60_000);
const RATE_LIMIT_MAX_REQUESTS = Number(process.env.AI_RATE_LIMIT_MAX_REQUESTS || 12);
const ALLOWED_MODELS = new Set(
  (process.env.GEMINI_ALLOWED_MODELS || DEFAULT_MODEL)
    .split(',')
    .map(model => model.trim())
    .filter(Boolean)
);
const rateLimitBuckets = new Map();

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

export async function generateGeminiContent(prompt, model = DEFAULT_MODEL, operator = null) {
  const apiKey = process.env.GEMINI_API_KEY;
  const requestedModel = typeof model === 'string' && model.trim() ? model.trim() : DEFAULT_MODEL;

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

  if (prompt.length > MAX_PROMPT_CHARS) {
    return {
      status: 400,
      payload: {
        error: {
          code: 'PROMPT_TOO_LARGE',
          message: `Prompt exceeds ${MAX_PROMPT_CHARS} characters.`,
          userMessage: 'AI 생성 요청 내용이 너무 깁니다. 자료를 줄인 뒤 다시 시도해 주세요.'
        }
      }
    };
  }

  if (!ALLOWED_MODELS.has(requestedModel)) {
    return {
      status: 400,
      payload: {
        error: {
          code: 'MODEL_NOT_ALLOWED',
          message: `Model ${requestedModel} is not allowed.`,
          userMessage: '허용되지 않은 AI 모델 요청입니다.'
        }
      }
    };
  }

  const rateLimit = checkRateLimit(operator);
  if (!rateLimit.ok) {
    return {
      status: 429,
      payload: {
        error: {
          status: 429,
          code: 'AI_RATE_LIMITED',
          message: 'AI request rate limit exceeded.',
          retryAfterSeconds: rateLimit.retryAfterSeconds,
          userMessage: 'AI 요청이 짧은 시간에 많습니다. 잠시 후 다시 시도해 주세요.'
        }
      }
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: requestedModel,
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

function checkRateLimit(operator) {
  const key = operator?.uid || operator?.email || 'unknown';
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { ok: true };
  }

  if (bucket.count >= RATE_LIMIT_MAX_REQUESTS) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
    };
  }

  bucket.count += 1;
  return { ok: true };
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
