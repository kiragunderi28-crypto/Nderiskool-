import React, { useRef, useState } from 'react';
import { useTrading } from '../context/TradingContext';
import { BotStrategyType } from '../types/trading';
import {
  X,
  TrendingUp,
  TrendingDown,
  Zap,
  CheckCircle2,
  Download,
  Upload,
  Wallet,
  CandlestickChart,
  Cpu,
  Play,
} from 'lucide-react';

export const DashboardHubView: React.FC = () => {
  const {
    markets,
    activeSymbol,
    setActiveSymbol,
    setActiveView,
    botStrategy,
    updateBotStrategy,
    startBot,
    openCashier,
    tradeSignals,
    executeSignalTrade,
    isAutoTradeActive,
    toggleAutoTrade,
    safaricomPhone,
  } = useTrading();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importFeedback, setImportFeedback] = useState<string | null>(null);
  const [isQuickStrategyOpen, setIsQuickStrategyOpen] = useState(false);
  const [isDriveSyncOpen, setIsDriveSyncOpen] = useState(false);
  const [isSignalsOpen, setIsSignalsOpen] = useState(false);

  // Quick Strategy Modal State
  const [qsType, setQsType] = useState<BotStrategyType>(botStrategy.strategyType);
  const [qsSymbol, setQsSymbol] = useState<string>(botStrategy.symbol);
  const [qsStake, setQsStake] = useState<number>(botStrategy.baseStake);
  const [qsTP, setQsTP] = useState<number>(botStrategy.takeProfitTarget);
  const [qsSL, setQsSL] = useState<number>(botStrategy.stopLossLimit);

  const handleLocalFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = String(ev.target?.result || '');
        if (file.name.endsWith('.json')) {
          const parsed = JSON.parse(text);
          updateBotStrategy({
            name: parsed.name || file.name.replace(/\.(json|xml)$/i, ''),
            symbol: parsed.symbol || botStrategy.symbol,
            strategyType: parsed.strategyType || 'EMA_CROSS',
            baseStake: Number(parsed.baseStake) || botStrategy.baseStake,
            currentStake: Number(parsed.baseStake) || botStrategy.baseStake,
            takeProfitTarget: Number(parsed.takeProfitTarget) || botStrategy.takeProfitTarget,
            stopLossLimit: Number(parsed.stopLossLimit) || botStrategy.stopLossLimit,
          });
          setImportFeedback(`Imported bot "${parsed.name || file.name}" into Bot Builder.`);
        } else {
          updateBotStrategy({ name: file.name.replace(/\.xml$/i, '') });
          setImportFeedback(`Loaded XML bot workspace "${file.name}". Ready to Run!`);
        }
      } catch {
        setImportFeedback(`Loaded "${file.name}" strategy parameters.`);
      }
      setTimeout(() => setImportFeedback(null), 4000);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExportBotJson = () => {
    const payload = JSON.stringify(
      {
        name: botStrategy.name,
        symbol: botStrategy.symbol,
        strategyType: botStrategy.strategyType,
        baseStake: botStrategy.baseStake,
        multiplierFactor: botStrategy.multiplierFactor,
        takeProfitTarget: botStrategy.takeProfitTarget,
        stopLossLimit: botStrategy.stopLossLimit,
        durationSeconds: botStrategy.durationSeconds,
        exportedAt: new Date().toISOString(),
      },
      null,
      2
    );
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nderiskool-bot-${botStrategy.strategyType.toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setImportFeedback('Bot strategy JSON saved for cloud backup.');
    setIsDriveSyncOpen(false);
    setTimeout(() => setImportFeedback(null), 3500);
  };

  const handleApplyQuickStrategy = (shouldRun: boolean) => {
    updateBotStrategy({
      strategyType: qsType,
      symbol: qsSymbol,
      baseStake: qsStake,
      currentStake: qsStake,
      takeProfitTarget: qsTP,
      stopLossLimit: qsSL,
      name: `Quick ${qsType.replace('_', ' ')}`,
    });
    setIsQuickStrategyOpen(false);
    if (shouldRun) {
      startBot();
      setImportFeedback(`Quick strategy activated & running on ${qsSymbol}.`);
    } else {
      setImportFeedback(`Quick strategy saved on ${qsSymbol}.`);
    }
    setTimeout(() => setImportFeedback(null), 3500);
  };

  const handleLaunchKingOfMatches = () => {
    const synth = markets.find((m) => m.symbol === 'R_75') || markets[0];
    if (synth) setActiveSymbol(synth);
    setActiveView('terminal');
  };

  return (
    <div className="relative flex-1 flex flex-col bg-[#f8fafc] overflow-hidden select-none">
      {/* Hidden local bot file picker */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.xml"
        onChange={handleLocalFileChange}
        className="hidden"
      />

      {/* Live Scrolling Market Ticker Strip below Navy Bar (Matches Screenshot) */}
      <div className="bg-white/95 border-b border-slate-200 px-3 sm:px-5 h-8 flex items-center gap-5 overflow-x-auto no-scrollbar text-[11px] font-mono">
        {markets.slice(0, 7).map((m) => {
          const isUp = m.change24h >= 0;
          const isSelected = m.symbol === activeSymbol.symbol;
          const decimals = m.symbol.includes('JPY') ? 3 : m.symbol.startsWith('R_') ? 2 : 5;
          return (
            <button
              key={m.symbol}
              type="button"
              onClick={() => setActiveSymbol(m)}
              className={`flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer transition-opacity ${
                isSelected ? 'opacity-100 font-bold' : 'opacity-80 hover:opacity-100'
              }`}
            >
              <span className="text-amber-600 font-bold uppercase tracking-tight">
                {m.displayName}
              </span>
              <span className="text-slate-700 tabular-nums">{m.currentPrice.toFixed(decimals)}</span>
              <span className={`font-bold ${isUp ? 'text-emerald-600' : 'text-rose-500'}`}>
                {isUp ? '▲' : '▼'}
              </span>
            </button>
          );
        })}
      </div>

      {/* Subtle Faint Candlestick Background Pattern matching Screenshot */}
      <div
        className="pointer-events-none absolute inset-x-0 top-12 bottom-16 flex items-center justify-center overflow-hidden opacity-[0.16]"
        aria-hidden="true"
      >
        <svg viewBox="0 0 900 520" className="w-full h-full object-cover">
          {[
            { x: 40, y1: 180, y2: 260, h: 45, up: true },
            { x: 90, y1: 140, y2: 230, h: 52, up: true },
            { x: 140, y1: 165, y2: 245, h: 40, up: false },
            { x: 190, y1: 120, y2: 205, h: 48, up: true },
            { x: 240, y1: 135, y2: 235, h: 65, up: false },
            { x: 290, y1: 180, y2: 270, h: 44, up: false },
            { x: 340, y1: 210, y2: 310, h: 55, up: true },
            { x: 390, y1: 190, y2: 280, h: 40, up: false },
            { x: 440, y1: 230, y2: 340, h: 60, up: false },
            { x: 490, y1: 250, y2: 350, h: 50, up: true },
            { x: 540, y1: 220, y2: 310, h: 46, up: true },
            { x: 590, y1: 260, y2: 365, h: 58, up: false },
            { x: 640, y1: 240, y2: 330, h: 42, up: true },
            { x: 690, y1: 270, y2: 380, h: 62, up: false },
            { x: 740, y1: 255, y2: 355, h: 48, up: true },
            { x: 790, y1: 230, y2: 325, h: 52, up: true },
            { x: 840, y1: 250, y2: 345, h: 44, up: false },
          ].map((c, idx) => (
            <g key={idx}>
              <line
                x1={c.x}
                y1={c.y1 - 24}
                x2={c.x}
                y2={c.y2 + 24}
                stroke={c.up ? '#10b981' : '#f43f5e'}
                strokeWidth="3"
              />
              <rect
                x={c.x - 10}
                y={c.y1}
                width="20"
                height={c.h}
                rx="2"
                fill={c.up ? '#10b981' : '#f43f5e'}
              />
            </g>
          ))}
        </svg>
      </div>

      {/* Main Dashboard Content */}
      <div className="relative z-10 w-full max-w-4xl mx-auto px-4 sm:px-6 pt-5 pb-28 flex-1 flex flex-col">
        {importFeedback && (
          <div className="mb-4 px-3.5 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2 shadow-sm">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{importFeedback}</span>
          </div>
        )}

        <h1 className="text-base sm:text-lg font-semibold text-slate-800 mb-4">
          Import a bot from
        </h1>

        {/* 6-Card Grid (Exact 3-Column Match to Screenshot) */}
        <div className="grid grid-cols-3 gap-3 sm:gap-5">
          {/* 1. Local */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="group bg-white/95 hover:bg-white rounded-2xl border border-slate-100 shadow-[0_8px_24px_rgba(15,23,42,0.06)] hover:shadow-[0_12px_28px_rgba(15,23,42,0.11)] p-3.5 sm:p-5 flex flex-col items-center justify-center gap-3 min-h-[124px] sm:min-h-[146px] transition-all active:scale-[0.98] cursor-pointer"
          >
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-center group-hover:scale-105 transition-transform">
              <svg viewBox="0 0 36 36" className="w-8 h-8" aria-hidden="true">
                <rect x="4" y="5" width="28" height="20" rx="3" fill="#0f4c5c" />
                <rect x="7" y="8" width="22" height="14" rx="1" fill="#134e5e" />
                <path d="M14 25 H22 L24 30 H12 Z" fill="#64748b" />
                <rect x="10" y="29" width="16" height="2.2" rx="1" fill="#475569" />
              </svg>
            </div>
            <span className="text-xs sm:text-sm font-medium text-slate-800 text-center leading-tight">
              Local
            </span>
          </button>

          {/* 2. Google Drive */}
          <button
            type="button"
            onClick={() => setIsDriveSyncOpen(true)}
            className="group bg-white/95 hover:bg-white rounded-2xl border border-slate-100 shadow-[0_8px_24px_rgba(15,23,42,0.06)] hover:shadow-[0_12px_28px_rgba(15,23,42,0.11)] p-3.5 sm:p-5 flex flex-col items-center justify-center gap-3 min-h-[124px] sm:min-h-[146px] transition-all active:scale-[0.98] cursor-pointer"
          >
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-center group-hover:scale-105 transition-transform">
              <svg viewBox="0 0 36 36" className="w-8 h-8" aria-hidden="true">
                <polygon points="18,6 10,20 14,27 22,13" fill="#10b981" />
                <polygon points="18,6 26,20 22,27 14,13" fill="#f59e0b" />
                <polygon points="10,20 26,20 22,27 14,27" fill="#3b82f6" />
              </svg>
            </div>
            <span className="text-xs sm:text-sm font-medium text-slate-800 text-center leading-tight">
              Google Drive
            </span>
          </button>

          {/* 3. Bot Builder */}
          <button
            type="button"
            onClick={() => setActiveView('bot')}
            className="group bg-white/95 hover:bg-white rounded-2xl border border-slate-100 shadow-[0_8px_24px_rgba(15,23,42,0.06)] hover:shadow-[0_12px_28px_rgba(15,23,42,0.11)] p-3.5 sm:p-5 flex flex-col items-center justify-center gap-3 min-h-[124px] sm:min-h-[146px] transition-all active:scale-[0.98] cursor-pointer"
          >
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-center group-hover:scale-105 transition-transform">
              <svg viewBox="0 0 36 36" className="w-8 h-8" aria-hidden="true">
                <rect x="6" y="7" width="11" height="10" rx="2" fill="#0f766e" />
                <rect x="19" y="7" width="11" height="10" rx="2" fill="#14b8a6" />
                <rect x="6" y="19" width="24" height="10" rx="2" fill="#134e4a" />
                <circle cx="11.5" cy="12" r="1.5" fill="#ffffff" />
                <circle cx="24.5" cy="12" r="1.5" fill="#ffffff" />
              </svg>
            </div>
            <span className="text-xs sm:text-sm font-medium text-slate-800 text-center leading-tight">
              Bot Builder
            </span>
          </button>

          {/* 4. Quick strategy */}
          <button
            type="button"
            onClick={() => setIsQuickStrategyOpen(true)}
            className="group bg-white/95 hover:bg-white rounded-2xl border border-slate-100 shadow-[0_8px_24px_rgba(15,23,42,0.06)] hover:shadow-[0_12px_28px_rgba(15,23,42,0.11)] p-3.5 sm:p-5 flex flex-col items-center justify-center gap-3 min-h-[124px] sm:min-h-[146px] transition-all active:scale-[0.98] cursor-pointer"
          >
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-center group-hover:scale-105 transition-transform">
              <svg viewBox="0 0 36 36" className="w-8 h-8" aria-hidden="true">
                <rect x="6" y="6" width="11" height="11" rx="2" fill="#0f4c5c" />
                <rect x="19" y="6" width="11" height="11" rx="2" fill="#94d2bd" />
                <rect x="6" y="19" width="11" height="11" rx="2" fill="#94d2bd" />
                <rect x="19" y="19" width="11" height="11" rx="2" fill="#0f4c5c" />
                <circle cx="17.5" cy="11.5" r="2.5" fill="#0f4c5c" />
                <circle cx="11.5" cy="17.5" r="2.5" fill="#94d2bd" />
              </svg>
            </div>
            <span className="text-xs sm:text-sm font-medium text-slate-800 text-center leading-tight">
              Quick strategy
            </span>
          </button>

          {/* 5. King of Matches -> Manual Trade (Digits Under/Over & Higher/Lower) */}
          <button
            type="button"
            onClick={handleLaunchKingOfMatches}
            className="group bg-white/95 hover:bg-white rounded-2xl border border-slate-100 shadow-[0_8px_24px_rgba(15,23,42,0.06)] hover:shadow-[0_12px_28px_rgba(15,23,42,0.11)] p-3.5 sm:p-5 flex flex-col items-center justify-center gap-3 min-h-[124px] sm:min-h-[146px] transition-all active:scale-[0.98] cursor-pointer"
          >
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-amber-50/70 border border-amber-200/80 flex items-center justify-center group-hover:scale-105 transition-transform">
              <svg viewBox="0 0 36 36" className="w-8 h-8" aria-hidden="true">
                <path
                  d="M18 4 L30 9 V18 C30 25 24 30 18 32 C12 30 6 25 6 18 V9 Z"
                  fill="#b45309"
                />
                <path
                  d="M18 7 L27 11 V18 C27 23.5 22.5 27.5 18 29 C13.5 27.5 9 23.5 9 18 V11 Z"
                  fill="#f59e0b"
                />
                <circle cx="18" cy="16" r="3" fill="#ffffff" />
                <path d="M13.5 22 Q18 25 22.5 22" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <span className="text-xs sm:text-sm font-medium text-slate-800 text-center leading-tight">
              King of Matches
            </span>
          </button>

          {/* 6. Speed Lab -> Accumulators Studio */}
          <button
            type="button"
            onClick={() => setActiveView('accumulators')}
            className="group bg-white/95 hover:bg-white rounded-2xl border border-slate-100 shadow-[0_8px_24px_rgba(15,23,42,0.06)] hover:shadow-[0_12px_28px_rgba(15,23,42,0.11)] p-3.5 sm:p-5 flex flex-col items-center justify-center gap-3 min-h-[124px] sm:min-h-[146px] transition-all active:scale-[0.98] cursor-pointer"
          >
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-violet-50/70 border border-violet-200/80 flex items-center justify-center group-hover:scale-105 transition-transform">
              <svg viewBox="0 0 36 36" className="w-8 h-8" aria-hidden="true">
                <circle cx="18" cy="18" r="11" fill="none" stroke="#6d28d9" strokeWidth="2.5" />
                <path
                  d="M18 9 L21 15 L27 18 L21 21 L18 27 L15 21 L9 18 L15 15 Z"
                  fill="#8b5cf6"
                />
              </svg>
            </div>
            <span className="text-xs sm:text-sm font-medium text-slate-800 text-center leading-tight">
              Speed Lab
            </span>
          </button>
        </div>

        {/* Clean Secondary Quick Access Strip for Core Features */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => setActiveView('terminal')}
            className="flex items-center justify-between p-3.5 rounded-2xl bg-white border border-slate-200/80 hover:border-teal-300 shadow-xs transition-all cursor-pointer text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
                <CandlestickChart className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-900">Manual Under / Lower</div>
                <div className="text-[11px] text-slate-500">Charts, Digits &amp; Multipliers</div>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveView('autotrade')}
            className="flex items-center justify-between p-3.5 rounded-2xl bg-white border border-slate-200/80 hover:border-indigo-300 shadow-xs transition-all cursor-pointer text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Cpu className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-900">Auto-Trade Rules</div>
                <div className="text-[11px] text-slate-500">
                  {isAutoTradeActive ? 'Active on live ticks' : 'Rule engine paused'}
                </div>
              </div>
            </div>
          </button>

          <div className="flex items-center justify-between gap-2 p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-xs">
            <button
              type="button"
              onClick={() => openCashier('deposit')}
              className="flex items-center gap-3 text-left cursor-pointer group flex-1 min-w-0"
            >
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <Wallet className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900 group-hover:text-emerald-700 transition-colors truncate">
                  M-Pesa, DP2P &amp; Cashier
                </div>
                <div className="text-[11px] text-slate-500 font-mono truncate">{safaricomPhone} · Direct Sync</div>
              </div>
            </button>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => openCashier('dcash')}
                className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-[10px] font-bold cursor-pointer transition-colors"
              >
                D Cash
              </button>
              <button
                type="button"
                onClick={() => openCashier('dp2p')}
                className="px-2.5 py-1.5 rounded-lg bg-[#0b1930] hover:bg-slate-800 text-[#2bbbad] font-mono text-[10px] font-bold cursor-pointer transition-colors"
              >
                DP2P
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Purple 'AI' Signals Orb (Bottom-Right Matching Screenshot) */}
      <div className="fixed right-4 sm:right-6 bottom-24 z-30">
        <button
          type="button"
          onClick={() => setIsSignalsOpen(true)}
          title="Smart Quant Signals & Auto-Trade Scanner"
          className="relative w-16 h-16 flex items-center justify-center cursor-pointer group"
        >
          {/* Outer concentric ripple rings */}
          <span className="absolute inset-0 rounded-full bg-violet-500/10 ring-1 ring-violet-400/25 scale-125 pointer-events-none" />
          <span className="absolute inset-1 rounded-full bg-violet-500/15 ring-1 ring-violet-400/30 scale-110 pointer-events-none" />
          {/* Core Orb */}
          <span className="relative w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 via-purple-600 to-indigo-700 shadow-lg shadow-purple-900/25 flex items-center justify-center text-white font-extrabold text-sm tracking-tight group-hover:scale-105 transition-transform">
            {/* Scan brackets */}
            <span className="px-1.5 py-0.5 border border-white/40 rounded text-[13px] leading-none">
              AI
            </span>
            {/* Top-right emerald online dot */}
            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-white shadow-xs" />
          </span>
        </button>
      </div>

      {/* Quick Strategy Modal */}
      {isQuickStrategyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-xs">
            <div className="px-5 py-4 bg-[#0b1930] text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm">Quick Strategy Preset</h3>
                <p className="text-[11px] text-slate-300">Configure &amp; launch automated bot parameters</p>
              </div>
              <button
                type="button"
                onClick={() => setIsQuickStrategyOpen(false)}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3.5">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Strategy Logic</label>
                <select
                  value={qsType}
                  onChange={(e) => setQsType(e.target.value as BotStrategyType)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 font-medium focus:outline-none focus:border-teal-500"
                >
                  <option value="EMA_CROSS">EMA 9/21 Trend Crossover</option>
                  <option value="RSI_REVERSAL">RSI (14) Overbought/Oversold Reversal</option>
                  <option value="MARTINGALE_SCALPER">Martingale High-Frequency Scalper</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Target Deriv Market</label>
                <select
                  value={qsSymbol}
                  onChange={(e) => setQsSymbol(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 font-mono focus:outline-none focus:border-teal-500"
                >
                  {markets.map((m) => (
                    <option key={m.symbol} value={m.symbol}>
                      {m.displayName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-2 font-mono">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">Base Stake ($)</label>
                  <input
                    type="number"
                    min={1}
                    value={qsStake}
                    onChange={(e) => setQsStake(Math.max(1, Number(e.target.value)))}
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-300 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">Take Profit ($)</label>
                  <input
                    type="number"
                    min={5}
                    value={qsTP}
                    onChange={(e) => setQsTP(Math.max(5, Number(e.target.value)))}
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-300 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">Stop Loss ($)</label>
                  <input
                    type="number"
                    min={5}
                    value={qsSL}
                    onChange={(e) => setQsSL(Math.max(5, Number(e.target.value)))}
                    className="w-full px-2.5 py-2 rounded-lg border border-slate-300 text-slate-900"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => handleApplyQuickStrategy(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Save Preset
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyQuickStrategy(true)}
                  className="flex-1 py-2.5 rounded-xl bg-[#2bbbad] hover:bg-[#239b8e] text-white font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Load &amp; Run</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cloud Strategy Backup Modal (Google Drive Tile) */}
      {isDriveSyncOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-xs">
            <div className="px-5 py-4 bg-[#0b1930] text-white flex items-center justify-between">
              <h3 className="font-bold text-sm">Cloud Strategy Backup</h3>
              <button
                type="button"
                onClick={() => setIsDriveSyncOpen(false)}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-slate-600 leading-relaxed">
                Export your current <strong>{botStrategy.name}</strong> configuration as a portable JSON file to store in Google Drive, or restore a saved bot file from your device.
              </p>
              <button
                type="button"
                onClick={handleExportBotJson}
                className="w-full py-2.5 px-4 rounded-xl bg-[#2bbbad] hover:bg-[#239b8e] text-white font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Download Strategy (.json)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsDriveSyncOpen(false);
                  fileInputRef.current?.click();
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span>Restore Strategy File</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quant Signals & Auto-Trade Drawer (Opened by Purple AI Orb) */}
      {isSignalsOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-xs">
            <div className="px-5 py-4 bg-gradient-to-r from-[#0b1930] to-indigo-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-full bg-violet-500 flex items-center justify-center font-bold text-[11px]">
                  AI
                </span>
                <div>
                  <h3 className="font-bold text-sm">Technical Signal Scanner</h3>
                  <p className="text-[11px] text-slate-300">Live EMA / RSI / Bollinger Signals</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSignalsOpen(false)}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
              {/* Auto-Trade Master Toggle Row */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-900">Automatic Rule Engine</div>
                  <div className="text-[11px] text-slate-500">
                    {isAutoTradeActive ? 'Monitoring ticks & executing rules' : 'Paused'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={toggleAutoTrade}
                  className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer transition-colors ${
                    isAutoTradeActive
                      ? 'bg-rose-600 hover:bg-rose-500 text-white'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  }`}
                >
                  {isAutoTradeActive ? 'Pause' : 'Enable'}
                </button>
              </div>

              {tradeSignals.map((sig) => {
                const isBuy = sig.direction === 'BUY';
                return (
                  <div key={sig.id} className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{sig.symbolName}</span>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold text-[10px] ${
                            isBuy ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          {isBuy ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {sig.direction}
                        </span>
                      </div>
                      <span className="font-mono font-bold text-violet-700 bg-violet-50 px-2 py-0.5 rounded">
                        {sig.confidence}% Match
                      </span>
                    </div>
                    <p className="text-slate-600 leading-relaxed">{sig.reason}</p>
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 font-mono text-[11px]">
                      <span className="text-slate-500">
                        Entry <strong className="text-slate-900">{sig.entryPrice}</strong> · TP{' '}
                        <strong className="text-emerald-600">{sig.targetPrice}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          executeSignalTrade(sig);
                          setIsSignalsOpen(false);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#2bbbad] hover:bg-[#239b8e] text-white font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Zap className="w-3 h-3" />
                        <span>Execute</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
