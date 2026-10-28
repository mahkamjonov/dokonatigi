import React, { useState } from 'react';
import { useStore, UserSession } from '../store/useStore';
import { apiFetch, setToken } from '../api/client';

interface ProfileSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const inputClass =
  'w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/60 rounded-2xl text-sm font-medium text-on-surface focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all';
const labelClass = 'block text-[11px] font-bold uppercase tracking-wider text-on-surface-variant mb-1';

export const ProfileSettingsModal: React.FC<ProfileSettingsModalProps> = ({ isOpen, onClose }) => {
  const { user, updateSessionUser, notify } = useStore();

  const [newLogin, setNewLogin] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const close = () => {
    setNewLogin('');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setErrorMsg('');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!currentPassword.trim()) {
      setErrorMsg('Tasdiqlash uchun joriy parolingizni kiriting.');
      return;
    }
    if (!newLogin.trim() && !newPassword.trim()) {
      setErrorMsg('Yangi login yoki yangi parolni kiriting.');
      return;
    }
    if (newPassword.trim() && newPassword !== confirmPassword) {
      setErrorMsg('Yangi parol va uni tasdiqlash bir xil emas.');
      return;
    }

    setIsSaving(true);
    try {
      const data = await apiFetch<{ token: string; user: UserSession }>('/api/v1/auth/credentials', {
        method: 'PUT',
        body: {
          currentPassword,
          ...(newLogin.trim() ? { newLogin } : {}),
          ...(newPassword.trim() ? { newPassword } : {}),
        },
      });
      setToken(data.token);
      updateSessionUser({ ...user, ...data.user });
      notify('success', "Login va parol ma'lumotlari muvaffaqiyatli yangilandi.");
      close();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Ma'lumotlarni yangilashda xatolik yuz berdi.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-md bg-surface border border-outline-variant/60 rounded-3xl p-6 sm:p-8 shadow-2xl relative max-h-[92vh] overflow-y-auto">
        <button
          type="button"
          onClick={close}
          disabled={isSaving}
          className="absolute top-4 right-4 p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-full transition-all"
          title="Yopish"
        >
          <span className="material-symbols-outlined text-xl">close</span>
        </button>

        <div className="mb-5">
          <h3 className="text-xl font-headline font-black text-on-surface">Login va parolni o'zgartirish</h3>
          <p className="text-xs text-on-surface-variant font-medium mt-1">
            Hozirgi login: <span className="font-bold text-emerald-700">{user?.phone || '—'}</span>
          </p>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-600 text-xs font-medium text-center">
            ⚠️ {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className={labelClass}>Yangi telefon raqam yoki login</label>
            <input
              type="text"
              value={newLogin}
              onChange={(e) => setNewLogin(e.target.value)}
              placeholder="O'zgartirmasangiz bo'sh qoldiring"
              autoComplete="username"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Yangi parol</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Kamida 8 ta belgi (o'zgartirmasangiz bo'sh)"
              autoComplete="new-password"
              className={inputClass}
            />
          </div>

          {newPassword && (
            <div>
              <label className={labelClass}>Yangi parolni takrorlang</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                className={inputClass}
              />
            </div>
          )}

          <div className="pt-2 border-t border-outline-variant/40">
            <label className={labelClass}>Joriy parol (tasdiqlash uchun) *</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
              className={inputClass}
            />
          </div>

          <div className="flex gap-2.5 pt-2">
            <button
              type="button"
              onClick={close}
              disabled={isSaving}
              className="flex-1 py-3 rounded-2xl text-xs font-bold text-on-surface-variant bg-surface-container-high hover:bg-surface-variant transition-colors disabled:opacity-50"
            >
              Bekor qilish
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 py-3 rounded-2xl text-xs font-extrabold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-md disabled:opacity-50"
            >
              {isSaving ? 'Saqlanmoqda...' : 'Saqlash'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
