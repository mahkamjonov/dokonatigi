import React, { useEffect } from 'react';
import { Header } from './components/Header';
import { DateSelector } from './components/DateSelector';
import { DailyRevenueForm } from './components/DailyRevenueForm';
import { SupplierDebtPage } from './components/SupplierDebtPage';
import { AdminDashboard } from './components/AdminDashboard';
import { AuthModal } from './components/AuthModal';
import { Toast } from './components/Toast';
import { useStore } from './store/useStore';
import { initSyncQueue } from './services/syncQueue';
import { initTelegramMiniApp } from './utils/telegram';

export const App: React.FC = () => {
  const { activeTab, restoreSession, logoutUser } = useStore();

  // Validate the saved session against the server and load the active store's data
  useEffect(() => {
    initTelegramMiniApp();
    restoreSession();

    // Offline revenue entries are re-sent when the connection returns
    const stopSync = initSyncQueue(() => useStore.getState().loadStoreData());

    // Developer test helper: window.resetAuth()
    (window as any).resetAuth = () => {
      logoutUser();
      console.log('⚡ Auth session successfully reset! User logged out.');
    };

    return stopSync;
  }, [restoreSession, logoutUser]);

  return (
    <div className="min-h-screen bg-background text-on-background pb-28 md:pb-12 antialiased selection:bg-primary/20">
      {/* Top Bar Main Navigation Header */}
      <Header />

      {/* Login: shown whenever there is no active session and cannot be dismissed */}
      <AuthModal />

      <Toast />

      {/* Main Responsive Container */}
      <main className="w-full max-w-5xl mx-auto px-3 sm:px-4 pt-3 sm:pt-5">
        {activeTab === 'seller' && (
          /* Page 1: Sotuvchi (POS Entry Page ONLY) */
          <div className="max-w-xl mx-auto flex flex-col gap-4 sm:gap-6">
            <DateSelector />
            <DailyRevenueForm />
          </div>
        )}

        {activeTab === 'debts' && (
          /* Page 3: Qarzlar (Supplier Debt Management) */
          <SupplierDebtPage />
        )}

        {(activeTab === 'tushum' || activeTab === 'expenses' || activeTab === 'profit') && (
          /* Pages 2, 4, 5: Direct Views (Tushum, Xarajat, Sof foyda) without nested sub-tab headers */
          <AdminDashboard />
        )}
      </main>
    </div>
  );
};

export default App;
