import React from 'react';
import { useTrading } from '../context/TradingContext';
import { Volume2, VolumeX, ShieldCheck, User, Wifi, WifiOff, Bell, Bot } from 'lucide-react';

export const Header: React.FC<{ onOpenAlerts: () => void }> = ({ onOpenAlerts }) => {
  const {
    account,
    activeView,
    setActiveView,
    isMuted,
    toggleMute,
    setIsConnectModalOpen,
    setIsProfileModalOpen,
    isWsConnected,
    priceAlerts,
    botStrategy,
  } = useTrading();

  const activeAlertCount = priceAlerts.filter((a) => !a.triggered).length;

  return (
    <header className="flex items-center justify-between gap-8 px-5 py-3 bg-[#0a0d13] border-b border-slate-800/90 select-none">
      {/* Zone 1: Single text element wordmark */}
      <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
        <div className="w-7 h-7 rounded bg-red-600/90 flex items-center justify-center text-white font-bold text-xs tracking-tighter">
          D
        </div>
        <span className="text-base font-bold tracking-tight text-slate-100 font-sans">
          nderiskool <span className="text-red-500 font-mono text-xs font-semibold">DERIV</span>
        </span>
      </div>

      {/* Zone 2: Navigation Links */}
      <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-400">
        <button
          onClick={() => setActiveView('terminal')}
          className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeView === 'terminal' ? 'text-white font-semibold border-b border-blue-500 pb-0.5' : ''
          }`}
        >
          Terminal
        </button>
        <button
          onClick={() => setActiveView('watchlist')}
          className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeView === 'watchlist' ? 'text-white font-semibold border-b border-blue-500 pb-0.5' : ''
          }`}
        >
          Watchlist
        </button>
        <button
          onClick={() => setActiveView('orders')}
          className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeView === 'orders' ? 'text-white font-semibold border-b border-blue-500 pb-0.5' : ''
          }`}
        >
          Positions
        </button>
        <button
          onClick={() => setActiveView('bot')}
          className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
            activeView === 'bot' ? 'text-white font-semibold border-b border-blue-500 pb-0.5' : ''
          }`}
        >
          <span>Deriv Bot</span>
          {botStrategy.isRunning && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          )}
        </button>
        <button
          onClick={() => setActiveView('analytics')}
          className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeView === 'analytics' ? 'text-white font-semibold border-b border-blue-500 pb-0.5' : ''
          }`}
        >
          Analytics
        </button>
        <button
          onClick={() => setActiveView('calendar')}
          className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeView === 'calendar' ? 'text-white font-semibold border-b border-blue-500 pb-0.5' : ''
          }`}
        >
          Calendar
        </button>
      </nav>

      {/* Zone 3: Account & Connection Action */}
      <div className="flex items-center gap-2.5 shrink-0 text-xs">
        {/* Price Alerts trigger */}
        <button
          onClick={onOpenAlerts}
          title="Price Alerts"
          className="relative p-1.5 text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800 rounded transition-colors"
        >
          <Bell className="w-3.5 h-3.5" />
          {activeAlertCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-slate-950 font-mono font-bold text-[9px] flex items-center justify-center">
              {activeAlertCount}
            </span>
          )}
        </button>
        {/* WebSocket Connection indicator (functional live status dot per Section 1.E) */}
        <div
          title={isWsConnected ? 'Connected to Deriv WebSocket (Live)' : 'Reconnecting to Deriv WS...'}
          className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-400"
        >
          <span
            className={`w-2 h-2 rounded-full ${
              isWsConnected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]' : 'bg-amber-500'
            }`}
          />
          <span className="hidden sm:inline">{isWsConnected ? 'Deriv WS Live' : 'Connecting'}</span>
        </div>

        {/* Audio Mute toggle */}
        <button
          onClick={toggleMute}
          title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
          className="p-1.5 text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800 rounded transition-colors"
        >
          {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
        </button>

        {/* Account Button (opens Deriv Connect / Switch Modal) */}
        <button
          onClick={() => setIsConnectModalOpen(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-lg transition-colors cursor-pointer"
        >
          <div className="text-left font-mono">
            <div className="text-[10px] text-slate-400 leading-none">
              {account.isReal ? 'DERIV REAL' : 'DEMO VIRTUAL'}
            </div>
            <div className="font-bold text-emerald-400 text-xs leading-tight">
              ${account.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </div>
          <span
            className={`px-1.5 py-0.5 text-[9px] font-bold rounded uppercase ${
              account.isReal
                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                : 'bg-blue-950 text-blue-400 border border-blue-800/60'
            }`}
          >
            {account.isReal ? 'Real' : 'Demo'}
          </span>
        </button>

        {/* Trader Profile Button */}
        <button
          onClick={() => setIsProfileModalOpen(true)}
          title="nderiskool Trader Profile & Risk Calculator"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg shadow-sm transition-colors cursor-pointer whitespace-nowrap"
        >
          <User className="w-3.5 h-3.5" />
          <span>nderiskool</span>
        </button>
      </div>
    </header>
  );
};
