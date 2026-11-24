import React, { useState, useEffect } from 'react';
import { useTrading } from '../context/TradingContext';
import { normalizeKenyanPhone } from '../utils/mpesa';
import { X, Shield, Calculator, UserCheck, Smartphone, Edit3, ArrowDownLeft, ArrowUpRight, Fingerprint } from 'lucide-react';
import { useBiometric } from '../context/BiometricContext';

export const TraderProfileModal: React.FC = () => {
  const {
    isProfileModalOpen,
    setIsProfileModalOpen,
    account,
    tradeHistory,
    activePositions,
    safaricomPhone,
    safaricomFormatted,
    updateSafaricomPhone,
    openCashier,
  } = useTrading();
  const { status: bioStatus, capabilities, setIsSecurityModalOpen } = useBiometric();

  const [riskPercent, setRiskPercent] = useState<number>(1.5);
  const [stopLossPips, setStopLossPips] = useState<number>(25);
  const [maxDailyLoss, setMaxDailyLoss] = useState<number>(300);
  const [dailyProfitTarget, setDailyProfitTarget] = useState<number>(500);
  const [isEditingPhone, setIsEditingPhone] = useState<boolean>(false);
  const [phoneDraft, setPhoneDraft] = useState<string>(safaricomPhone);

  useEffect(() => {
    setPhoneDraft(safaricomPhone);
  }, [safaricomPhone]);

  if (!isProfileModalOpen) return null;

  const handleSavePhone = () => {
    const parsed = normalizeKenyanPhone(phoneDraft);
    if (parsed.valid) {
      updateSafaricomPhone(parsed.local);
    }
    setIsEditingPhone(false);
  };

  const totalTrades = tradeHistory.length;
  const wonTrades = tradeHistory.filter((t) => t.status === 'WON' || t.pnl > 0).length;
  const winRate = totalTrades > 0 ? ((wonTrades / totalTrades) * 100).toFixed(1) : '0.0';

  const grossProfit = tradeHistory
    .filter((t) => t.pnl > 0)
    .reduce((acc, t) => acc + t.pnl, 0);

  const grossLoss = Math.abs(
    tradeHistory.filter((t) => t.pnl < 0).reduce((acc, t) => acc + t.pnl, 0)
  );

  const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : grossProfit > 0 ? 'MAX' : '0.00';
  const totalNetPnl = tradeHistory.reduce((acc, t) => acc + t.pnl, 0);

  const riskAmount = account.balance * (riskPercent / 100);
  const recommendedLotSize = (riskAmount / (stopLossPips * 10)).toFixed(2);
  const recommendedStake = Math.round(riskAmount);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs select-none">
      <div className="relative w-full max-w-xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden text-xs">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-[#0b1930] text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#2bbbad] to-emerald-500 flex items-center justify-center font-bold text-white text-base shadow-md">
              N
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-sm">nderiskool</h3>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-white/10 text-[#2bbbad] border border-[#2bbbad]/40 font-mono">
                  <UserCheck className="w-2.5 h-2.5" />
                  VERIFIED TRADER
                </span>
              </div>
              <p className="text-[11px] text-slate-300 font-mono">
                kiragunderi28@gmail.com · ID: {account.loginId}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsProfileModalOpen(false)}
            className="p-1.5 text-slate-300 hover:text-white rounded-md hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Key Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono tabular-nums">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-slate-500 text-[10px] block">Win Rate</span>
              <span className="text-emerald-600 text-lg font-bold">{winRate}%</span>
              <span className="text-[10px] text-slate-500 block mt-0.5">{wonTrades}/{totalTrades} Trades</span>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-slate-500 text-[10px] block">Net P&L</span>
              <span
                className={`text-lg font-bold ${
                  totalNetPnl >= 0 ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {totalNetPnl >= 0 ? '+' : ''}${totalNetPnl.toFixed(2)}
              </span>
              <span className="text-[10px] text-slate-500 block mt-0.5">USD</span>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-slate-500 text-[10px] block">Profit Factor</span>
              <span className="text-teal-700 text-lg font-bold">{profitFactor}</span>
              <span className="text-[10px] text-slate-500 block mt-0.5">Ratio</span>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-slate-500 text-[10px] block">Active Stakes</span>
              <span className="text-slate-900 text-lg font-bold">{activePositions.length}</span>
              <span className="text-[10px] text-slate-500 block mt-0.5">Open Orders</span>
            </div>
          </div>

          {/* Connected Safaricom M-Pesa Wallet */}
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-emerald-700" />
                <span className="font-bold text-slate-900">Connected SafariCom M-Pesa</span>
                <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-[9px] font-mono font-bold text-white">
                  ACTIVE LINK
                </span>
              </div>
              {isEditingPhone ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={phoneDraft}
                    onChange={(e) => setPhoneDraft(e.target.value)}
                    placeholder="0793950512"
                    className="px-2 py-1 bg-white border border-emerald-400 rounded font-mono text-xs text-slate-900 w-32 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleSavePhone}
                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-mono text-[10px] font-bold cursor-pointer"
                  >
                    Save
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditingPhone(true)}
                  className="inline-flex items-center gap-1 font-mono font-bold text-emerald-800 hover:text-emerald-950 cursor-pointer"
                >
                  <span>{safaricomPhone} ({safaricomFormatted})</span>
                  <Edit3 className="w-3 h-3 text-emerald-600" />
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setIsProfileModalOpen(false);
                  openCashier('deposit');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2bbbad] hover:bg-[#239b8f] text-white font-mono text-[11px] font-bold cursor-pointer"
              >
                <ArrowDownLeft className="w-3.5 h-3.5" />
                <span>Deposit via M-Pesa ({safaricomPhone})</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsProfileModalOpen(false);
                  openCashier('withdrawal');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-rose-50 border border-rose-300 text-rose-700 font-mono text-[11px] font-bold cursor-pointer"
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>Withdraw to M-Pesa ({safaricomPhone})</span>
              </button>
            </div>
          </div>

          {/* Mobile Biometric Access Card */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#0b1930] text-[#2bbbad] flex items-center justify-center shrink-0">
                <Fingerprint className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold text-slate-900 text-xs">
                  Mobile Biometrics ({capabilities.platformLabel})
                </div>
                <div className="text-[11px] font-mono text-slate-500">
                  {bioStatus.hasPasskeys
                    ? `${bioStatus.credentials.length} passkey enrolled · ${bioStatus.settings.lockOnLaunch ? 'Launch lock on' : 'Ready'}`
                    : bioStatus.hasPin
                    ? 'Quick PIN active · Enroll TouchID/FaceID'
                    : 'Protect mobile access with TouchID / FaceID'}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsProfileModalOpen(false);
                setIsSecurityModalOpen(true);
              }}
              className="min-h-[44px] px-3.5 rounded-xl bg-[#0b1930] hover:bg-slate-800 text-white font-semibold text-xs cursor-pointer transition-colors"
            >
              {bioStatus.protectionConfigured ? 'Manage Security' : 'Enable Biometrics'}
            </button>
          </div>

          {/* Risk Management / Position Sizing Calculator */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
              <Calculator className="w-4 h-4 text-[#2bbbad]" />
              <span>nderiskool Position Size & Risk Calculator</span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-slate-600 block mb-1 font-medium">Risk per trade: {riskPercent}%</label>
                <input
                  type="range"
                  min={0.5}
                  max={5.0}
                  step={0.5}
                  value={riskPercent}
                  onChange={(e) => setRiskPercent(Number(e.target.value))}
                  className="w-full accent-[#2bbbad]"
                />
                <span className="font-mono text-slate-600 text-[11px] block mt-1 tabular-nums">
                  Risk Amount: <strong className="text-slate-900">${riskAmount.toFixed(2)}</strong>
                </span>
              </div>

              <div>
                <label className="text-slate-600 block mb-1 font-medium">Stop Loss: {stopLossPips} pips</label>
                <input
                  type="range"
                  min={5}
                  max={100}
                  step={5}
                  value={stopLossPips}
                  onChange={(e) => setStopLossPips(Number(e.target.value))}
                  className="w-full accent-[#2bbbad]"
                />
                <span className="font-mono text-slate-600 text-[11px] block mt-1 tabular-nums">
                  Est. Pip Risk: <strong className="text-slate-900">{stopLossPips} pips</strong>
                </span>
              </div>
            </div>

            <div className="p-3 bg-white border border-slate-200 rounded-lg flex items-center justify-between font-mono text-[11px] tabular-nums">
              <div>
                <span className="text-slate-500 block text-[10px]">Recommended Lot Size</span>
                <span className="text-[#0b1930] font-bold text-sm">{recommendedLotSize} Lots</span>
              </div>
              <div className="text-right">
                <span className="text-slate-500 block text-[10px]">Optimal Multiplier Stake</span>
                <span className="text-emerald-600 font-bold text-sm">${recommendedStake}</span>
              </div>
            </div>
          </div>

          {/* Daily Risk Guardian */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-xs">
              <Shield className="w-4 h-4 text-emerald-600" />
              <span>Daily Risk Guardian Rules</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-slate-600 font-medium block mb-1">Daily Max Loss Threshold</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-400 font-mono">$</span>
                  <input
                    type="number"
                    value={maxDailyLoss}
                    onChange={(e) => setMaxDailyLoss(Number(e.target.value))}
                    className="w-full pl-6 pr-2 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono focus:outline-none focus:border-[#0b1930]"
                  />
                </div>
              </div>
              <div>
                <label className="text-slate-600 font-medium block mb-1">Daily Take Profit Goal</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-400 font-mono">$</span>
                  <input
                    type="number"
                    value={dailyProfitTarget}
                    onChange={(e) => setDailyProfitTarget(Number(e.target.value))}
                    className="w-full pl-6 pr-2 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono focus:outline-none focus:border-[#0b1930]"
                  />
                </div>
              </div>
            </div>
            <p className="text-[10px] text-slate-500">
              The terminal monitors open P&amp;L and warns nderiskool when approaching risk thresholds to preserve capital.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={() => setIsProfileModalOpen(false)}
            className="px-4 py-1.5 bg-[#0b1930] hover:bg-slate-800 text-white font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Save &amp; Close
          </button>
        </div>
      </div>
    </div>
  );
};
