import React, { useState, useRef, useEffect } from 'react';
import { useStore, UserSession } from '../store/useStore';
import { apiFetch, setToken } from '../api/client';

export const AuthModal: React.FC = () => {
  const { showAuthModal, setShowAuthModal, loginUser, linkTelegram, isAuthenticated } = useStore();

  // Login Form State
  const [loginPhone, setLoginPhone] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');

  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const phoneInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showAuthModal && phoneInputRef.current) {
      phoneInputRef.current.focus();
    }
  }, [showAuthModal]);

  if (!showAuthModal) return null;

  const resetModal = () => {
    setErrorMsg('');
    setIsLoading(false);
    setShowAuthModal(false);
  };

  const completeAuth = async (data: { token: string; user: UserSession }) => {
    setToken(data.token);
    setLoginPassword('');
    await loginUser(data.user);
    void linkTelegram();
    setIsLoading(false);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!loginPhone.trim() || !loginPassword.trim()) {
      setErrorMsg("Telefon raqam yoki login va parolni to'liq kiriting!");
      return;
    }

    setIsLoading(true);
    try {
      const data = await apiFetch('/api/v1/auth/login', {
        method: 'POST',
        auth: false,
        body: { login: loginPhone, password: loginPassword },
      });
      await completeAuth(data);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Tizimga kirishda xatolik yuz berdi!');
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md animate-fade-in">
      <div
        className="w-full max-w-md bg-surface border border-outline-variant/60 rounded-3xl p-6 sm:p-8 shadow-2xl relative max-h-[92vh] overflow-y-auto transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Close Button — hidden while the user has no active session, forcing login */}
        {isAuthenticated && (
          <button
            onClick={resetModal}
            className="absolute top-4 right-4 p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-full transition-all"
            title="Yopish"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {/* Modal Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-emerald-500/10 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-emerald-500/20 shadow-xs">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-2xl font-headline font-black text-on-surface tracking-tight">
            Tizimga Kirish
          </h2>
          <p className="text-xs text-on-surface-variant font-sans font-medium mt-1">
            Tizimga kirish uchun telefon raqam yoki login va parolingizni kiriting
          </p>
        </div>

        {/* Error Alert Box */}
        {errorMsg && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-600 text-xs font-medium text-center animate-shake">
            ⚠️ {errorMsg}
          </div>
        )}

        {/* LOGIN FORM */}
        <form onSubmit={handleLoginSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-on-surface-variant mb-1.5">
              Telefon Raqam yoki Login
            </label>
            <input
              ref={phoneInputRef}
              type="text"
              value={loginPhone}
              onChange={(e) => setLoginPhone(e.target.value)}
              placeholder="+998 90 123 45 67 yoki login"
              className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/60 rounded-2xl text-sm font-medium text-on-surface focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
              required
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-on-surface-variant mb-1.5">
              Parol
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/60 rounded-2xl text-sm font-medium text-on-surface focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface p-1"
              >
                {showPassword ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858-5.908a9.04 9.04 0 013.682-.763c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21M3 3l18 18" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-headline font-bold text-sm shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Kirilmoqda...
              </>
            ) : (
              'Kirish'
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
