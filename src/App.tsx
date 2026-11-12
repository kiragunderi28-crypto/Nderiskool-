import React, { useState } from 'react';
import { TradingProvider, useTrading } from './context/TradingContext';
import { Header } from './components/Header';
import { TradingChart } from './components/TradingChart';
import { OrderPanel } from './components/OrderPanel';
import { PositionsManager } from './components/PositionsManager';
import { MarketSelector } from './components/MarketSelector';
import { DerivConnectModal } from './components/DerivConnectModal';
import { TraderProfileModal } from './components/TraderProfileModal';
import { EconomicCalendar } from './components/EconomicCalendar';
import { AnalyticsView } from './components/AnalyticsView';
import { DerivBotView } from './components/DerivBotView';
import { PriceAlertsDrawer } from './components/PriceAlertsDrawer';
import { Bell, X } from 'lucide-react';

const TerminalMain: React.FC = () => {
  const { activeView } = useTrading();

  if (activeView === 'watchlist') {
    return (
      <div className="max-w-7xl mx-auto p-4 md:p-6 w-full">
        <MarketSelector />
      </div>
    );
  }

  if (activeView === 'orders') {
    return (
      <div className="max-w-7xl mx-auto p-4 md:p-6 w-full">
        <PositionsManager />
      </div>
    );
  }

  if (activeView === 'bot') {
    return <DerivBotView />;
  }

  if (activeView === 'analytics') {
    return (
      <div className="max-w-7xl mx-auto p-4 md:p-6 w-full">
        <AnalyticsView />
      </div>
    );
  }

  if (activeView === 'calendar') {
    return (
      <div className="max-w-7xl mx-auto p-4 md:p-6 w-full">
        <EconomicCalendar />
      </div>
    );
  }

  // Standard Terminal View (Chart + Order Panel + Watchlist + Positions)
  return (
    <div className="flex-1 w-full p-2.5 sm:p-4 grid grid-cols-1 lg:grid-cols-12 gap-3 max-w-[1680px] mx-auto overflow-hidden">
      {/* Left Sidebar: Market Watchlist (3 cols on lg, 2 cols on 2xl) */}
      <aside className="hidden xl:block xl:col-span-3 h-full overflow-hidden">
        <MarketSelector compact />
      </aside>

      {/* Center: Live Chart + Positions (6 cols on xl, 8 on lg, 12 on mobile) */}
      <section className="col-span-12 xl:col-span-6 lg:col-span-8 flex flex-col gap-3 min-h-[600px]">
        {/* Interactive Trading Chart */}
        <div className="flex-1 min-h-[460px]">
          <TradingChart />
        </div>

        {/* Positions & Orders Manager */}
        <div>
          <PositionsManager />
        </div>
      </section>

      {/* Right Column: Order Execution Panel (3 cols on xl, 4 on lg) */}
      <aside className="col-span-12 xl:col-span-3 lg:col-span-4 flex flex-col gap-3">
        <OrderPanel />

        {/* Quick Compact Watchlist for medium screens if xl sidebar hidden */}
        <div className="block xl:hidden">
          <MarketSelector compact />
        </div>
      </aside>
    </div>
  );
};

const AppShell: React.FC = () => {
  const [isAlertsOpen, setIsAlertsOpen] = useState(false);
  const { activeToast, dismissToast } = useTrading();

  return (
    <div className="min-h-screen flex flex-col bg-[#080b11] text-slate-100 selection:bg-blue-600 selection:text-white">
      <Header onOpenAlerts={() => setIsAlertsOpen(true)} />
      <main className="flex-1 flex flex-col">
        <TerminalMain />
      </main>

      {/* Floating Price Alert Notification Banner */}
      {activeToast && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-3 p-3.5 bg-amber-500 text-slate-950 rounded-xl shadow-2xl font-mono text-xs font-bold animate-bounce">
          <Bell className="w-4 h-4 fill-current shrink-0" />
          <span>{activeToast}</span>
          <button
            onClick={dismissToast}
            className="p-1 hover:bg-black/20 rounded transition-colors ml-2"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Drawers & Modals */}
      <PriceAlertsDrawer isOpen={isAlertsOpen} onClose={() => setIsAlertsOpen(false)} />
      <DerivConnectModal />
      <TraderProfileModal />
    </div>
  );
};

export default function App() {
  return (
    <TradingProvider>
      <AppShell />
    </TradingProvider>
  );
}
