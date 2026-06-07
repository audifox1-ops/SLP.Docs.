import React, { FormEvent, useState } from 'react';
import { AlertCircle, Loader2, LockKeyhole, LogOut, Mail, ShieldCheck } from 'lucide-react';
import { OperatorSession } from '../services/authService';

interface OperatorAuthGateProps {
  session: OperatorSession;
  onGoogleSignIn: () => Promise<void>;
  onEmailSignIn: (email: string, password: string) => Promise<void>;
  onSignOut: () => Promise<void>;
}

const getAuthErrorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('auth/popup-closed-by-user')) return '로그인 창이 닫혔습니다.';
  if (message.includes('auth/invalid-credential') || message.includes('auth/wrong-password')) return '이메일 또는 비밀번호를 확인해 주세요.';
  if (message.includes('auth/user-not-found')) return '등록되지 않은 이메일 계정입니다.';
  if (message.includes('auth/popup-blocked')) return '브라우저에서 로그인 팝업이 차단되었습니다.';
  return message || '로그인 중 오류가 발생했습니다.';
};

export function OperatorAuthGate({
  session,
  onGoogleSignIn,
  onEmailSignIn,
  onSignOut,
}: OperatorAuthGateProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const isChecking = session.status === 'checking';
  const isUnauthorized = session.status === 'unauthorized';

  const runAuthAction = async (action: () => Promise<void>) => {
    setIsBusy(true);
    setErrorMessage('');
    try {
      await action();
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  const handleEmailSubmit = (event: FormEvent) => {
    event.preventDefault();
    void runAuthAction(() => onEmailSignIn(email, password));
  };

  return (
    <div className="min-h-screen bg-bg-theme px-5 py-8 text-text-main">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col justify-center">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-lg bg-primary p-2">
            <ShieldCheck className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-primary">SLP.Docs</h1>
            <p className="text-sm font-semibold text-text-muted">운영자 인증</p>
          </div>
        </div>

        <div className="rounded-lg border border-border-theme bg-white p-6 shadow-sm">
          {isChecking ? (
            <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-4 py-3 text-sm font-bold text-text-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              인증 상태 확인 중
            </div>
          ) : isUnauthorized ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                <div className="mb-2 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  접근 권한이 없습니다
                </div>
                <p className="font-semibold leading-relaxed">{session.message}</p>
                {session.email && (
                  <p className="mt-2 text-xs text-amber-700">로그인 계정: {session.email}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => void runAuthAction(onSignOut)}
                disabled={isBusy}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-border-theme px-4 py-3 text-sm font-black text-text-main hover:bg-slate-50 disabled:opacity-60"
              >
                <LogOut className="h-4 w-4" />
                다른 계정으로 로그인
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              <button
                type="button"
                onClick={() => void runAuthAction(onGoogleSignIn)}
                disabled={isBusy}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
                Google 계정으로 로그인
              </button>

              <div className="flex items-center gap-3 text-xs font-bold uppercase text-text-muted">
                <div className="h-px flex-1 bg-border-theme" />
                Email
                <div className="h-px flex-1 bg-border-theme" />
              </div>

              <form className="space-y-3" onSubmit={handleEmailSubmit}>
                <label className="block">
                  <span className="mb-1 block text-xs font-black text-text-muted">이메일</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    required
                    className="w-full rounded-lg border border-border-theme px-3 py-2.5 text-sm font-semibold outline-none focus:border-primary"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-black text-text-muted">비밀번호</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    required
                    className="w-full rounded-lg border border-border-theme px-3 py-2.5 text-sm font-semibold outline-none focus:border-primary"
                  />
                </label>
                <button
                  type="submit"
                  disabled={isBusy}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-primary bg-white px-4 py-3 text-sm font-black text-primary hover:bg-primary-light disabled:opacity-60"
                >
                  {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  이메일로 로그인
                </button>
              </form>

              {(errorMessage || session.status === 'error') && (
                <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                  {errorMessage || session.message}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
