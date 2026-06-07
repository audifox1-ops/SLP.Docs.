import {
  GoogleAuthProvider,
  User,
  getIdTokenResult,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

export type OperatorRole = 'admin' | 'staff' | 'viewer';
export type OperatorSessionStatus = 'checking' | 'signed-out' | 'ready' | 'unauthorized' | 'error';
export type OperatorRoleSource = 'claim' | 'profile' | 'bootstrap-email' | null;

export interface OperatorSession {
  status: OperatorSessionStatus;
  user: User | null;
  email: string | null;
  displayName: string | null;
  role: OperatorRole | null;
  roleSource: OperatorRoleSource;
  message?: string;
}

export const INITIAL_OPERATOR_SESSION: OperatorSession = {
  status: 'checking',
  user: null,
  email: null,
  displayName: null,
  role: null,
  roleSource: null,
};

const STAFF_ROLES = new Set<OperatorRole>(['admin', 'staff']);

const parseEmailList = (value?: string) => (
  (value || 'audifox1@gmail.com')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean)
);

const BOOTSTRAP_ADMIN_EMAILS = parseEmailList(
  (import.meta as any).env?.VITE_BOOTSTRAP_ADMIN_EMAILS
);

const normalizeRole = (role: unknown): OperatorRole | null => {
  if (role === 'admin' || role === 'staff' || role === 'viewer') return role;
  return null;
};

const isBootstrapAdmin = (user: User) => (
  Boolean(user.emailVerified && user.email && BOOTSTRAP_ADMIN_EMAILS.includes(user.email.toLowerCase()))
);

export const isStaffRole = (role: OperatorRole | null) => (
  role !== null && STAFF_ROLES.has(role)
);

async function resolveOperatorSession(user: User): Promise<OperatorSession> {
  const tokenResult = await getIdTokenResult(user);
  let role =
    tokenResult.claims.admin === true
      ? 'admin' as OperatorRole
      : normalizeRole(tokenResult.claims.role);
  let roleSource: OperatorRoleSource = role ? 'claim' : null;
  let displayName = user.displayName || null;
  let disabled = false;

  if (!role && isBootstrapAdmin(user)) {
    role = 'admin';
    roleSource = 'bootstrap-email';
  }

  if (!role) {
    const profileSnap = await getDoc(doc(db, 'users', user.uid));
    if (profileSnap.exists()) {
      const profile = profileSnap.data();
      role = normalizeRole(profile.role);
      roleSource = role ? 'profile' : null;
      displayName = typeof profile.displayName === 'string' ? profile.displayName : displayName;
      disabled = profile.disabled === true;
    }
  }

  if (disabled) {
    return {
      status: 'unauthorized',
      user,
      email: user.email,
      displayName,
      role,
      roleSource,
      message: '비활성화된 운영자 계정입니다.',
    };
  }

  if (!isStaffRole(role)) {
    return {
      status: 'unauthorized',
      user,
      email: user.email,
      displayName,
      role,
      roleSource,
      message: '운영자 권한이 없는 계정입니다. 관리자에게 users/{uid} 권한 등록을 요청해 주세요.',
    };
  }

  return {
    status: 'ready',
    user,
    email: user.email,
    displayName,
    role,
    roleSource,
  };
}

export function subscribeOperatorSession(onChange: (session: OperatorSession) => void) {
  let disposed = false;
  onChange(INITIAL_OPERATOR_SESSION);

  const unsubscribe = onAuthStateChanged(
    auth,
    async (user) => {
      if (disposed) return;
      if (!user) {
        onChange({
          status: 'signed-out',
          user: null,
          email: null,
          displayName: null,
          role: null,
          roleSource: null,
        });
        return;
      }

      onChange({
        status: 'checking',
        user,
        email: user.email,
        displayName: user.displayName,
        role: null,
        roleSource: null,
      });

      try {
        const session = await resolveOperatorSession(user);
        if (!disposed) onChange(session);
      } catch (error) {
        if (disposed) return;
        onChange({
          status: 'error',
          user,
          email: user.email,
          displayName: user.displayName,
          role: null,
          roleSource: null,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
    (error) => {
      if (disposed) return;
      onChange({
        status: 'error',
        user: null,
        email: null,
        displayName: null,
        role: null,
        roleSource: null,
        message: error.message,
      });
    }
  );

  return () => {
    disposed = true;
    unsubscribe();
  };
}

export async function signInOperatorWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(auth, provider);
}

export async function signInOperatorWithEmail(email: string, password: string) {
  await signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function signOutOperator() {
  await signOut(auth);
}

export async function getCurrentOperatorIdToken() {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('운영자 로그인이 필요합니다.');
  }
  return user.getIdToken();
}
