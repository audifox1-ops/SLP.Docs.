import { createVerify } from 'crypto';

const FIREBASE_CERT_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const DEFAULT_PROJECT_ID = 'slp-docs';
const STAFF_ROLES = new Set(['admin', 'staff']);

let certCache = {
  expiresAt: 0,
  certs: {},
};

const parseEmailList = (value) => (
  (value || 'audifox1@gmail.com')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean)
);

const BOOTSTRAP_ADMIN_EMAILS = parseEmailList(
  process.env.SERVER_BOOTSTRAP_ADMIN_EMAILS || process.env.BOOTSTRAP_ADMIN_EMAILS
);

function createAuthError(status, code, userMessage, message = userMessage) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.userMessage = userMessage;
  return error;
}

export function getFirebaseProjectId() {
  return process.env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID;
}

function getBearerToken(req) {
  const header = getHeader(req, 'authorization');
  if (!header || typeof header !== 'string') return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

function getHeader(req, name) {
  if (typeof req.get === 'function') return req.get(name);
  const headers = req.headers || {};
  const value = headers[name] || headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), '=');
  return Buffer.from(padded, 'base64');
}

function decodeJsonSegment(segment, label) {
  try {
    return JSON.parse(decodeBase64Url(segment).toString('utf8'));
  } catch (error) {
    throw createAuthError(401, 'MALFORMED_AUTH_TOKEN', `운영자 인증 토큰의 ${label} 형식이 올바르지 않습니다.`, error.message);
  }
}

async function getFirebaseCert(kid) {
  const now = Date.now();
  if (certCache.expiresAt > now && certCache.certs[kid]) {
    return certCache.certs[kid];
  }

  const response = await fetch(FIREBASE_CERT_URL);
  if (!response.ok) {
    throw createAuthError(500, 'FIREBASE_CERT_FETCH_FAILED', 'Firebase 인증서 조회에 실패했습니다.');
  }

  const certs = await response.json();
  const maxAge = response.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1];
  certCache = {
    certs,
    expiresAt: now + Number(maxAge || 3600) * 1000,
  };

  if (!certs[kid]) {
    throw createAuthError(401, 'UNKNOWN_AUTH_TOKEN_KEY', '운영자 인증 토큰의 서명 키를 확인할 수 없습니다.');
  }

  return certs[kid];
}

async function verifyFirebaseIdToken(token) {
  const segments = token.split('.');
  if (segments.length !== 3) {
    throw createAuthError(401, 'MALFORMED_AUTH_TOKEN', '운영자 인증 토큰 형식이 올바르지 않습니다.');
  }

  const [encodedHeader, encodedPayload, encodedSignature] = segments;
  const header = decodeJsonSegment(encodedHeader, 'header');
  const payload = decodeJsonSegment(encodedPayload, 'payload');

  if (header.alg !== 'RS256' || !header.kid) {
    throw createAuthError(401, 'UNSUPPORTED_AUTH_TOKEN', '지원하지 않는 운영자 인증 토큰입니다.');
  }

  const cert = await getFirebaseCert(header.kid);
  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${encodedHeader}.${encodedPayload}`);
  verifier.end();

  if (!verifier.verify(cert, decodeBase64Url(encodedSignature))) {
    throw createAuthError(401, 'INVALID_AUTH_TOKEN_SIGNATURE', '운영자 인증 토큰 서명이 유효하지 않습니다.');
  }

  const projectId = getFirebaseProjectId();
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (payload.aud !== projectId) {
    throw createAuthError(401, 'AUTH_TOKEN_PROJECT_MISMATCH', '운영자 인증 토큰의 Firebase 프로젝트가 일치하지 않습니다.');
  }
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw createAuthError(401, 'AUTH_TOKEN_ISSUER_MISMATCH', '운영자 인증 토큰 발급자가 올바르지 않습니다.');
  }
  if (!payload.sub || typeof payload.sub !== 'string' || payload.sub.length > 128) {
    throw createAuthError(401, 'AUTH_TOKEN_SUBJECT_INVALID', '운영자 인증 토큰의 사용자 식별자가 올바르지 않습니다.');
  }
  if (typeof payload.exp !== 'number' || payload.exp <= nowSeconds) {
    throw createAuthError(401, 'AUTH_TOKEN_EXPIRED', '운영자 인증 토큰이 만료되었습니다.');
  }
  if (typeof payload.iat !== 'number' || payload.iat > nowSeconds + 300) {
    throw createAuthError(401, 'AUTH_TOKEN_IAT_INVALID', '운영자 인증 토큰의 발급 시간이 올바르지 않습니다.');
  }

  return {
    ...payload,
    uid: payload.sub,
  };
}

function normalizeRole(role) {
  if (role === 'admin' || role === 'staff' || role === 'viewer') return role;
  return null;
}

function roleFromToken(decoded) {
  if (decoded.admin === true) return 'admin';
  return normalizeRole(decoded.role);
}

function isBootstrapAdmin(decoded) {
  return Boolean(
    decoded.email_verified &&
    decoded.email &&
    BOOTSTRAP_ADMIN_EMAILS.includes(String(decoded.email).toLowerCase())
  );
}

function parseFirestoreString(field) {
  return typeof field?.stringValue === 'string' ? field.stringValue : null;
}

async function roleFromProfile(uid, token) {
  const encodedUid = encodeURIComponent(uid);
  const projectId = getFirebaseProjectId();
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${encodedUid}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 404 || response.status === 403) {
    return { role: null, disabled: false };
  }

  if (!response.ok) {
    throw createAuthError(500, 'USER_PROFILE_LOOKUP_FAILED', '운영자 권한 프로필 조회에 실패했습니다.');
  }

  const payload = await response.json();
  const fields = payload.fields || {};
  return {
    role: normalizeRole(parseFirestoreString(fields.role)),
    disabled: fields.disabled?.booleanValue === true,
  };
}

export async function requireStaffFromRequest(req) {
  const token = getBearerToken(req);
  if (!token) {
    throw createAuthError(401, 'MISSING_AUTH_TOKEN', '운영자 로그인이 필요합니다.');
  }

  const decoded = await verifyFirebaseIdToken(token);
  let role = roleFromToken(decoded);
  let roleSource = role ? 'claim' : null;

  if (!role && isBootstrapAdmin(decoded)) {
    role = 'admin';
    roleSource = 'bootstrap-email';
  }

  if (!role) {
    const profile = await roleFromProfile(decoded.uid, token);
    if (profile.disabled) {
      throw createAuthError(403, 'DISABLED_OPERATOR', '비활성화된 운영자 계정입니다.');
    }
    role = profile.role;
    roleSource = role ? 'profile' : null;
  }

  if (!STAFF_ROLES.has(role)) {
    throw createAuthError(403, 'INSUFFICIENT_OPERATOR_ROLE', 'AI API를 사용할 운영자 권한이 없습니다.');
  }

  return {
    uid: decoded.uid,
    email: decoded.email || null,
    role,
    roleSource,
    token,
  };
}

export function requireAdminOperator(operator) {
  if (operator?.role !== 'admin') {
    throw createAuthError(403, 'ADMIN_ROLE_REQUIRED', '관리자 권한이 필요한 작업입니다.');
  }
}

export function toAuthErrorResponse(error) {
  const status = Number(error?.status) || 500;
  const code = error?.code || 'SERVER_AUTH_ERROR';
  return {
    status,
    payload: {
      error: {
        status,
        code,
        message: error instanceof Error ? error.message : String(error),
        userMessage: error?.userMessage || '서버 인증 확인 중 오류가 발생했습니다.',
      },
    },
  };
}
