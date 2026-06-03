import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  console.log(`Starting server in ${process.env.NODE_ENV || 'development'} mode...`);

  app.use(express.json({ limit: '1mb' }));

  // CSP Middleware
  app.use((req, res, next) => {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://picsum.photos https:; connect-src 'self' wss: https:;"
    );
    next();
  });

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/ai/generate", async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    const prompt = req.body?.prompt;
    const model = req.body?.model || 'gemini-2.5-flash-lite';

    if (!apiKey) {
      return res.json({
        error: {
          status: 500,
          code: 'MISSING_GEMINI_API_KEY',
          message: 'GEMINI_API_KEY is not configured.',
          userMessage: '.env 파일에 새 GEMINI_API_KEY를 설정한 뒤 서버를 재시작해 주세요.'
        }
      });
    }

    if (typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({
        error: {
          code: 'INVALID_PROMPT',
          message: 'A non-empty prompt string is required.',
          userMessage: 'AI 생성 요청 내용이 비어 있습니다. 다시 시도해 주세요.'
        }
      });
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

      res.json({ text: response.text || '' });
    } catch (error) {
      const details = normalizeGeminiError(error);
      console.error('Gemini API Error:', details);
      res.json({ error: details });
    }
  });

  // Vite middleware for development
  const isProd = process.env.NODE_ENV === 'production';
  const distPath = path.join(process.cwd(), 'dist');
  const hasDist = fs.existsSync(distPath);

  if (!isProd) {
    console.log('Using Vite middleware...');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (hasDist) {
    console.log('Serving static files from dist...');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    console.error('Production mode enabled but dist folder not found!');
    // Fallback to Vite if dist is missing even in production
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

function normalizeGeminiError(error: unknown) {
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
      userMessage: 'Gemini API 키가 유출 신고되어 차단되었습니다. Google AI Studio 또는 Google Cloud에서 새 API 키를 발급하고 .env의 GEMINI_API_KEY를 교체한 뒤 서버를 재시작해 주세요.'
    };
  }

  if (text.includes('429') || text.includes('RESOURCE_EXHAUSTED') || text.toLowerCase().includes('quota')) {
    return {
      status: 429,
      code: 'GEMINI_QUOTA_EXCEEDED',
      message: rawMessage,
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
