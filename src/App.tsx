import React, { useState } from 'react';
import { TradingProvider, useTrading } from './context/TradingContext';
import { Header } from './components/Header';
import { DashboardHubView } from './components/DashboardHubView';
import { BottomBotBar } from './components/BottomBotBar';
import { TradingChart } from './components/TradingChart';
import { OrderPanel } from './components/OrderPanel';
import { PositionsManager } from './components/PositionsManager';
import { MarketSelector } from './components/MarketSelector';
import { DerivConnectModal } from './components/DerivConnectModal';
import { TraderProfileModal } from './components/TraderProfileModal';
import { EconomicCalendar } from './components/EconomicCalendar';
import { AnalyticsView } from './components/AnalyticsView';
import { DerivBotView } from './components/DerivBotView';
import { AccumulatorsView } from './components/AccumulatorsView';
import { AutoTradeView } from './components/AutoTradeView';
import { PriceAlertsDrawer } from './components/PriceAlertsDrawer';
import { CashierModal } from './components/CashierModal';
import { PlayStorePublishModal } from './components/PlayStorePublishModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import { BiometricProvider } from './context/BiometricContext';
import { BiometricLockScreen } from './components/BiometricLockScreen';
import { BiometricSecurityModal, BiometricStepUpModal } from './components/BiometricSecurityModal';
import { Bell, X } from 'lucide-react';

const TerminalMain: React.FC = () => {
  const { activeView } = useTrading();

  if (activeView === 'dashboard') {
    return <DashboardHubView />;
  }

  if (activeView === 'watchlist') {
    return (
      <div className="max-w-7xl mx-auto p-4 md:p-6 pb-24 w-full">
        <MarketSelector />
      </div>
    );
  }

  if (activeView === 'orders') {
    return (
      <div className="max-w-7xl mx-auto p-4 md:p-6 pb-24 w-full">
        <PositionsManager />
      </div>
    );
  }

  if (activeView === 'accumulators') {
    return (
      <div className="pb-20">
        <AccumulatorsView />
      </div>
    );
  }

  if (activeView === 'autotrade') {
    return (
      <div className="pb-20">
        <AutoTradeView />
      </div>
    );
  }

  if (activeView === 'bot') {
    return (
      <div className="pb-20">
        <DerivBotView />
      </div>
    );
  }

  if (activeView === 'analytics') {
    return (
      <div className="max-w-7xl mx-auto p-4 md:p-6 pb-24 w-full">
        <AnalyticsView />
      </div>
    );
  }

  if (activeView === 'calendar') {
    return (
      <div className="max-w-7xl mx-auto p-4 md:p-6 pb-24 w-full">
        <EconomicCalendar />
      </div>
    );
  }

  // Standard Manual Trade Terminal View (Chart + Order Panel + Watchlist + Positions)
  return (
    <div className="flex-1 w-full p-2.5 sm:p-4 pb-24 grid grid-cols-1 lg:grid-cols-12 gap-3 max-w-[1680px] mx-auto overflow-hidden">
      {/* Left Sidebar: Market Watchlist */}
      <aside className="hidden xl:block xl:col-span-3 h-full overflow-hidden">
        <MarketSelector compact />
      </aside>

      {/* Center: Live Chart + Positions */}
      <section className="col-span-12 xl:col-span-6 lg:col-span-8 flex flex-col gap-3 min-h-[600px]">
        <div className="flex-1 min-h-[460px]">
          <TradingChart />
        </div>

        <div>
          <PositionsManager />
        </div>
      </section>

      {/* Right Column: Order Execution Panel */}
      <aside className="col-span-12 xl:col-span-3 lg:col-span-4 flex flex-col gap-3">
        <OrderPanel />

        <div className="block xl:hidden">
          <MarketSelector compact />
        </div>
      </aside>
    </div>
  );
};

const AppShell: React.FC = () => {
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const [isPlayStoreOpen, setIsPlayStoreOpen] = useState(false);
  const { activeToast, dismissToast } = useTrading();

  return (
    <div className="min-h-screen flex flex-col bg-[#f8fafc] text-slate-900 selection:bg-teal-600 selection:text-white">
      <Header
        onOpenAlerts={() => setIsAlertsOpen(true)}
        onOpenPlayStore={() => setIsPlayStoreOpen(true)}
      />
      <main className="flex-1 flex flex-col">
        <TerminalMain />
      </main>

      <BottomBotBar />

      {/* Floating Alert Notification Toast */}
      {activeToast && (
        <div className="fixed top-28 right-4 z-50 flex items-center gap-3 p-3.5 bg-[#0b1930] text-white border border-slate-700 rounded-xl shadow-2xl font-mono text-xs font-bold">
          <Bell className="w-4 h-4 text-amber-400 fill-current shrink-0" />
          <span>{activeToast}</span>
          <button
            type="button"
            onClick={dismissToast}
            className="p-1 hover:bg-white/10 rounded transition-colors ml-2 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Drawers & Modals */}
      <PriceAlertsDrawer isOpen={isAlertsOpen} onClose={() => setIsAlertsOpen(false)} />
      <DerivConnectModal />
      <TraderProfileModal />
      <CashierModal />
      <PlayStorePublishModal isOpen={isPlayStoreOpen} onClose={() => setIsPlayStoreOpen(false)} />
      <OfflineIndicator />
      <BiometricSecurityModal />
      <BiometricStepUpModal />
      <BiometricLockScreen />
    </div>
  );
};

export default function App() {
  return (
    <BiometricProvider>
      <TradingProvider>
        <AppShell />
      </TradingProvider>
    </BiometricProvider>
  );
}
