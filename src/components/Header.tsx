import React, { useState, useRef, useEffect } from 'react';
import { useTrading } from '../context/TradingContext';
import {
  Menu,
  X,
  ChevronDown,
  ChevronUp,
  Home,
  SlidersHorizontal,
  LogOut,
  Wallet,
  Smartphone,
  Bell,
  Volume2,
  VolumeX,
  User,
  KeyRound,
  Calendar,
  Flame,
  Bot,
  Cpu,
  BarChart3,
  ListOrdered,
  CandlestickChart,
  ExternalLink,
  ArrowRightLeft,
  Fingerprint,
  Lock,
} from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';
import { useBiometric } from '../context/BiometricContext';

export const Header: React.FC<{
  onOpenAlerts: () => void;
  onOpenPlayStore: () => void;
}> = ({ onOpenAlerts, onOpenPlayStore }) => {
  const {
    account,
    realAccount,
    activeView,
    setActiveView,
    isMuted,
    toggleMute,
    setIsConnectModalOpen,
    setIsProfileModalOpen,
    isWsConnected,
    priceAlerts,
    botStrategy,
    isAutoTradeActive,
    openCashier,
    switchAccountMode,
    disconnectDerivToken,
    safaricomPhone,
  } = useTrading();
  const { status: bioStatus, setIsSecurityModalOpen, lockNow } = useBiometric();

  const [isAccountDropdownOpen, setIsAccountDropdownOpen] = useState(false);
  const [accountTab, setAccountTab] = useState<'REAL' | 'DEMO'>(account.isReal ? 'REAL' : 'DEMO');
  const [isDerivAccountsExpanded, setIsDerivAccountsExpanded] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeAlertCount = priceAlerts.filter((a) => !a.triggered).length;

  useEffect(() => {
    setAccountTab(account.isReal ? 'REAL' : 'DEMO');
  }, [account.isReal]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsAccountDropdownOpen(false);
      }
    };
    if (isAccountDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isAccountDropdownOpen]);

  const demoAccountDisplay = (() => {
    try {
      const saved = localStorage.getItem('nderiskool_deriv_demo_acc');
      if (saved) return JSON.parse(saved);
    } catch {}
    return { loginId: 'VRTC-NDERISKOOL', balance: !account.isReal ? account.balance : 10000.0, currency: 'USD' };
  })();

  const displayedAccount =
    accountTab === 'REAL'
      ? {
          loginId: realAccount.loginId || 'CR-NDERISKOOL',
          balance: account.isReal ? account.balance : realAccount.balance,
          currency: realAccount.currency || 'USD',
        }
      : {
          loginId: demoAccountDisplay.loginId || 'VRTC-NDERISKOOL',
          balance: !account.isReal ? account.balance : demoAccountDisplay.balance ?? 10000.0,
          currency: demoAccountDisplay.currency || 'USD',
        };

  const navItems: Array<{
    id: 'dashboard' | 'terminal' | 'accumulators' | 'bot' | 'autotrade' | 'orders' | 'analytics';
    label: string;
    icon: React.ReactNode;
    dot?: boolean;
  }> = [
    { id: 'dashboard', label: 'Dashboard', icon: <Home className="w-3.5 h-3.5" /> },
    { id: 'terminal', label: 'Manual Trade', icon: <CandlestickChart className="w-3.5 h-3.5" /> },
    { id: 'accumulators', label: 'Accumulators', icon: <Flame className="w-3.5 h-3.5" /> },
    { id: 'bot', label: 'Bot Builder', icon: <Bot className="w-3.5 h-3.5" />, dot: botStrategy.isRunning },
    { id: 'autotrade', label: 'Auto Trade', icon: <Cpu className="w-3.5 h-3.5" />, dot: isAutoTradeActive },
    { id: 'orders', label: 'Positions', icon: <ListOrdered className="w-3.5 h-3.5" /> },
    { id: 'analytics', label: 'Analytics', icon: <BarChart3 className="w-3.5 h-3.5" /> },
  ];

  return (
    <header className="sticky top-0 z-40 select-none shadow-sm">
      {/* Row 1: Crisp White Top Bar matching Screenshot */}
      <div className="relative h-14 px-3 sm:px-5 bg-white border-b border-slate-200 flex items-center justify-between">
        {/* Left: Circular Emblem + Hamburger */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => setActiveView('dashboard')}
            title="nderiskool Deriv Bot Terminal"
            className="flex items-center gap-2 cursor-pointer group"
          >
            {/* Circular Dark Neon Trading Emblem */}
            <div className="w-9 h-9 rounded-full bg-slate-950 p-0.5 ring-2 ring-emerald-400/70 shadow-sm flex items-center justify-center overflow-hidden shrink-0">
              <div className="w-full h-full rounded-full bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950 flex flex-col items-center justify-center">
                <svg viewBox="0 0 28 28" className="w-5 h-5" aria-hidden="true">
                  <path
                    d="M5 18 L10 13 L14 16 L22 7"
                    fill="none"
                    stroke="#34d399"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M17 7 H22 V12"
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
            <span className="hidden sm:inline text-sm font-extrabold tracking-tight text-slate-900">
              nderiskool
            </span>
          </button>

          <button
            type="button"
            onClick={() => setIsMenuOpen(true)}
            aria-label="Open Navigation Drawer"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="hidden md:flex items-center gap-1.5 pl-1 text-[11px] font-mono text-slate-500">
            <span
              className={`w-2 h-2 rounded-full ${
                isWsConnected ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
              }`}
            />
            <span>{isWsConnected ? 'Deriv Live' : 'Syncing'}</span>
          </div>
        </div>

        {/* Right: Quick Desktop Actions + Deriv Balance Switcher Dropdown */}
        <div className="flex items-center gap-2 sm:gap-3" ref={dropdownRef}>
          {/* Desktop quick cashier & standalone money transfer shortcuts */}
          <button
            type="button"
            onClick={() => openCashier('payhero')}
            title="Independent Money Transfers (PayHero, KCB App, M-Pesa — No Deriv Required)"
            className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 font-semibold text-xs transition-colors cursor-pointer whitespace-nowrap"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span>Money Transfer</span>
          </button>

          <button
            type="button"
            onClick={() => openCashier('deposit')}
            className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-semibold text-xs transition-colors cursor-pointer whitespace-nowrap"
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>Cashier</span>
          </button>

          <button
            type="button"
            onClick={onOpenAlerts}
            title="Price Alerts"
            className="hidden sm:flex relative min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <Bell className="w-4 h-4" />
            {activeAlertCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-amber-500 text-white font-mono font-bold text-[9px] flex items-center justify-center">
                {activeAlertCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsSecurityModalOpen(true)}
            title="Touch ID / Face ID & Security"
            aria-label="Touch ID and Face ID Security"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer relative"
          >
            <Fingerprint className={`w-4 h-4 ${bioStatus.hasPasskeys ? 'text-teal-600' : 'text-slate-600'}`} />
          </button>

          {bioStatus.protectionConfigured && (
            <button
              type="button"
              onClick={() => {
                void lockNow();
              }}
              title="Lock Terminal Now"
              aria-label="Lock Terminal Now"
              className="hidden sm:flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <Lock className="w-4 h-4 text-slate-600" />
            </button>
          )}

          <div className="hidden sm:block">
            <PWAInstallButton />
          </div>

          {/* Deriv Account Balance Trigger (Matches Screenshot Exact Design) */}
          <button
            type="button"
            onClick={() => setIsAccountDropdownOpen((o) => !o)}
            className="min-h-[44px] flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
          >
            {/* Deriv (D) emblem */}
            <div className="w-7 h-7 rounded-full bg-slate-200/80 border border-slate-300/70 flex items-center justify-center shrink-0">
              <span className="font-mono font-extrabold text-xs text-slate-600">Ð</span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm sm:text-[15px] text-[#14b8a6] tabular-nums whitespace-nowrap">
                {account.balance.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{' '}
                {account.currency}
              </span>
              {isAccountDropdownOpen ? (
                <ChevronUp className="w-4 h-4 text-slate-600" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-600" />
              )}
            </div>
          </button>

          {/* Deriv Accounts Dropdown Popover (Matches Screenshot) */}
          {isAccountDropdownOpen && (
            <div className="absolute right-3 top-14 z-50 w-[308px] sm:w-[356px] bg-white rounded-2xl shadow-[0_18px_48px_rgba(15,23,42,0.18)] border border-slate-200 overflow-hidden text-xs animate-in fade-in duration-150">
              {/* Real / Demo Tabs */}
              <div className="grid grid-cols-2 border-b border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setAccountTab('REAL');
                    switchAccountMode(true);
                  }}
                  className={`py-3 font-bold text-sm transition-colors cursor-pointer border-b-2 ${
                    accountTab === 'REAL'
                      ? 'text-slate-900 border-[#0b1930]'
                      : 'text-slate-400 border-transparent hover:text-slate-700'
                  }`}
                >
                  Real
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAccountTab('DEMO');
                    switchAccountMode(false);
                  }}
                  className={`py-3 font-bold text-sm transition-colors cursor-pointer border-b-2 ${
                    accountTab === 'DEMO'
                      ? 'text-slate-900 border-[#0b1930]'
                      : 'text-slate-400 border-transparent hover:text-slate-700'
                  }`}
                >
                  Demo
                </button>
              </div>

              {/* Deriv Accounts Section */}
              <div className="px-4 py-3 space-y-2.5">
                <button
                  type="button"
                  onClick={() => setIsDerivAccountsExpanded((e) => !e)}
                  className="w-full flex items-center justify-between text-slate-900 font-bold text-xs cursor-pointer"
                >
                  <span>Deriv accounts</span>
                  {isDerivAccountsExpanded ? (
                    <ChevronUp className="w-4 h-4 text-amber-600" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-amber-600" />
                  )}
                </button>

                {isDerivAccountsExpanded && (
                  <button
                    type="button"
                    onClick={() => {
                      switchAccountMode(accountTab === 'REAL');
                      setIsAccountDropdownOpen(false);
                    }}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/80 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 text-left">
                      {/* Circular US Dollar Flag SVG */}
                      <div className="w-7 h-7 rounded-full overflow-hidden border border-slate-200 shrink-0 bg-white flex items-center justify-center">
                        <svg viewBox="0 0 24 24" className="w-full h-full" aria-hidden="true">
                          <rect width="24" height="24" fill="#ffffff" />
                          <rect y="0" width="24" height="3.5" fill="#dc2626" />
                          <rect y="7" width="24" height="3.5" fill="#dc2626" />
                          <rect y="14" width="24" height="3.5" fill="#dc2626" />
                          <rect y="20.5" width="24" height="3.5" fill="#dc2626" />
                          <rect width="12" height="12" fill="#1e3a8a" />
                          <circle cx="4" cy="4" r="1" fill="#fff" />
                          <circle cx="8" cy="4" r="1" fill="#fff" />
                          <circle cx="6" cy="7" r="1" fill="#fff" />
                          <circle cx="4" cy="9.5" r="1" fill="#fff" />
                          <circle cx="8" cy="9.5" r="1" fill="#fff" />
                        </svg>
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 text-xs">{displayedAccount.currency}</div>
                        <div className="font-mono text-[11px] text-slate-500">{displayedAccount.loginId}</div>
                      </div>
                    </div>
                    <div className="font-bold text-slate-900 font-mono tabular-nums text-xs">
                      {Number(displayedAccount.balance).toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{' '}
                      {displayedAccount.currency}
                    </div>
                  </button>
                )}

                {/* Quick Cashier & Token Row */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAccountDropdownOpen(false);
                      openCashier('deposit');
                    }}
                    className="py-2 px-2.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold text-[11px] border border-emerald-200 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Wallet className="w-3.5 h-3.5" />
                    <span>Cashier ({safaricomPhone})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAccountDropdownOpen(false);
                      setIsConnectModalOpen(true);
                    }}
                    className="py-2 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] border border-slate-200 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>API Token</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAccountDropdownOpen(false);
                      openCashier('dp2p');
                    }}
                    className="py-2 px-2 rounded-lg bg-[#0b1930] hover:bg-slate-800 text-white font-mono font-bold text-[10px] flex items-center justify-center gap-1 cursor-pointer transition-colors"
                  >
                    <Smartphone className="w-3 h-3 text-[#2bbbad]" />
                    <span>DP2P M-Pesa</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAccountDropdownOpen(false);
                      openCashier('dcash');
                    }}
                    className="py-2 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-mono font-bold text-[10px] flex items-center justify-center gap-1 cursor-pointer transition-colors"
                  >
                    <Wallet className="w-3 h-3" />
                    <span>D Cash Real</span>
                  </button>
                </div>
              </div>

              {/* Footer Prompt & Logout */}
              <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/70 space-y-2.5">
                <div className="text-center text-xs text-slate-600">
                  Looking for CFD accounts?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setIsAccountDropdownOpen(false);
                      setActiveView('terminal');
                    }}
                    className="font-bold text-[#ea580c] hover:text-[#c2410c] cursor-pointer"
                  >
                    Go to Trader&apos;s Hub
                  </button>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-200/70">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAccountDropdownOpen(false);
                      setIsProfileModalOpen(true);
                    }}
                    className="text-[11px] font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                  >
                    Profile: <strong>nderiskool</strong>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      disconnectDerivToken();
                      setIsAccountDropdownOpen(false);
                    }}
                    className="inline-flex items-center gap-1.5 text-slate-800 hover:text-rose-600 font-semibold text-xs py-1 px-2 rounded cursor-pointer"
                  >
                    <span>Logout</span>
                    <LogOut className="w-3.5 h-3.5 text-[#ea580c]" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Row 2: Dark Navy Navigation Strip (#0b1930) matching Screenshot */}
      <nav className="bg-[#0b1930] text-slate-200 h-11 px-2 sm:px-4 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setActiveView('watchlist')}
          title="Market Filter & Watchlist"
          className={`min-h-[36px] min-w-[36px] flex items-center justify-center rounded-md transition-colors cursor-pointer shrink-0 ${
            activeView === 'watchlist'
              ? 'bg-[#1c3154] text-white'
              : 'text-slate-300 hover:bg-[#152847] hover:text-white'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>

        <div className="w-px h-5 bg-slate-700/70 mx-0.5 shrink-0" />

        {navItems.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveView(item.id)}
              className={`min-h-[36px] flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                isActive
                  ? 'bg-[#1a2f52] text-white font-semibold'
                  : 'text-slate-300 hover:bg-[#132542] hover:text-white font-medium'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.dot && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => openCashier('deposit')}
          className="min-h-[36px] flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-emerald-300 hover:bg-[#132542] hover:text-emerald-200 whitespace-nowrap shrink-0 cursor-pointer ml-auto"
        >
          <Wallet className="w-3.5 h-3.5" />
          <span>Cashier (M-Pesa)</span>
        </button>
      </nav>

      {/* Slide-out Hamburger Menu Drawer */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-[1px]"
            onClick={() => setIsMenuOpen(false)}
          />
          <aside className="relative z-10 w-80 max-w-[85vw] bg-white h-full shadow-2xl border-r border-slate-200 flex flex-col justify-between overflow-y-auto">
            <div>
              {/* Drawer Header */}
              <div className="p-4 bg-[#0b1930] text-white flex items-center justify-between">
                <div>
                  <div className="font-bold text-sm">nderiskool Trading Suite</div>
                  <div className="text-[11px] text-slate-300 font-mono">
                    {account.isReal ? realAccount.loginId : account.loginId} · {account.currency}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMenuOpen(false)}
                  className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Navigation & Tools */}
              <div className="p-3 space-y-1">
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Trading Workspaces
                </div>
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveView(item.id);
                      setIsMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium cursor-pointer transition-colors ${
                      activeView === item.id
                        ? 'bg-teal-50 text-teal-800 font-bold'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setActiveView('calendar');
                    setIsMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium cursor-pointer transition-colors ${
                    activeView === 'calendar'
                      ? 'bg-teal-50 text-teal-800 font-bold'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Economic Calendar</span>
                </button>

                <div className="my-2 border-t border-slate-100" />
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Cashier &amp; Mobile Money
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    openCashier('payhero');
                  }}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-900 font-semibold text-xs cursor-pointer"
                >
                  <span className="flex items-center gap-2.5">
                    <ArrowRightLeft className="w-4 h-4 text-indigo-700" />
                    <span>Money Transfer (No Deriv Needed)</span>
                  </span>
                  <span className="font-mono text-[10px] bg-white px-1.5 py-0.5 rounded border border-indigo-200">
                    KCB · PayHero
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    openCashier('deposit');
                  }}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold text-xs cursor-pointer"
                >
                  <span className="flex items-center gap-2.5">
                    <Wallet className="w-4 h-4 text-emerald-600" />
                    <span>Deposit / Withdraw (M-Pesa)</span>
                  </span>
                  <span className="font-mono text-[10px] bg-white px-1.5 py-0.5 rounded border border-emerald-200">
                    {safaricomPhone}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    setIsConnectModalOpen(true);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  <KeyRound className="w-4 h-4 text-slate-500" />
                  <span>Connect Deriv API Token</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    setIsProfileModalOpen(true);
                  }}
                  className="w-full min-h-[44px] flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  <User className="w-4 h-4 text-slate-500" />
                  <span>Trader Profile &amp; Risk Calc</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    setIsSecurityModalOpen(true);
                  }}
                  className="w-full min-h-[44px] flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  <span className="flex items-center gap-3">
                    <Fingerprint className="w-4 h-4 text-teal-600" />
                    <span>Touch ID / Face ID Security</span>
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">
                    {bioStatus.hasPasskeys ? `${bioStatus.credentials.length} Active` : bioStatus.hasPin ? 'PIN' : 'Setup'}
                  </span>
                </button>

                {bioStatus.protectionConfigured && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      void lockNow();
                    }}
                    className="w-full min-h-[44px] flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    <Lock className="w-4 h-4 text-slate-500" />
                    <span>Lock Terminal Now</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onOpenAlerts();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  <span className="flex items-center gap-3">
                    <Bell className="w-4 h-4 text-slate-500" />
                    <span>Price Alerts</span>
                  </span>
                  {activeAlertCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-mono text-[10px] font-bold">
                      {activeAlertCount}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onOpenPlayStore();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  <span className="flex items-center gap-3">
                    <Smartphone className="w-4 h-4 text-emerald-600" />
                    <span>Google Play Store / Android TWA</span>
                  </span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                </button>

                <button
                  type="button"
                  onClick={toggleMute}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  <span className="flex items-center gap-3">
                    {isMuted ? <VolumeX className="w-4 h-4 text-slate-500" /> : <Volume2 className="w-4 h-4 text-slate-500" />}
                    <span>Trade Sound Effects</span>
                  </span>
                  <span className="text-[11px] font-mono text-slate-500">{isMuted ? 'Muted' : 'On'}</span>
                </button>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 text-[11px] text-slate-500 flex items-center justify-between">
              <span>nderiskool Terminal PWA</span>
              <PWAInstallButton />
            </div>
          </aside>
        </div>
      )}
    </header>
  );
};
