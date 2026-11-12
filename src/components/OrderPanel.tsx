import React, { useState } from 'react';
import { useTrading } from '../context/TradingContext';
import { OrderType } from '../types/trading';
import { ArrowUpRight, ArrowDownRight, ShieldCheck, Zap, Sliders, DollarSign } from 'lucide-react';

export const OrderPanel: React.FC = () => {
  const { activeSymbol, executeTrade, account } = useTrading();

  const [orderType, setOrderType] = useState<OrderType>('MULTIPLIER');
  const [stake, setStake] = useState<number>(50);
  const [multiplier, setMultiplier] = useState<number>(50);
  const [durationSeconds, setDurationSeconds] = useState<number>(60);

  // TP & SL
  const [useTakeProfit, setUseTakeProfit] = useState<boolean>(true);
  const [tpAmount, setTpAmount] = useState<number>(25); // $25 profit target

  const [useStopLoss, setUseStopLoss] = useState<boolean>(true);
  const [slAmount, setSlAmount] = useState<number>(25); // $25 max loss

  const currentPrice = activeSymbol.currentPrice;
  const isJpy = activeSymbol.symbol.includes('JPY');
  const decimals = isJpy ? 3 : activeSymbol.symbol.startsWith('R_') ? 2 : 5;

  // Calculated TP & SL prices
  const calculateLevels = (direction: 'BUY' | 'SELL') => {
    // Relative move needed for tpAmount = (tpAmount / (stake * multiplier))
    const moveFrac = tpAmount / (stake * multiplier);
    const slMoveFrac = slAmount / (stake * multiplier);

    if (direction === 'BUY') {
      const tpPrice = Number((currentPrice * (1 + moveFrac)).toFixed(decimals));
      const slPrice = Number((currentPrice * (1 - slMoveFrac)).toFixed(decimals));
      return { tpPrice, slPrice };
    } else {
      const tpPrice = Number((currentPrice * (1 - moveFrac)).toFixed(decimals));
      const slPrice = Number((currentPrice * (1 + slMoveFrac)).toFixed(decimals));
      return { tpPrice, slPrice };
    }
  };

  const buyLevels = calculateLevels('BUY');
  const sellLevels = calculateLevels('SELL');

  const handleBuy = () => {
    executeTrade({
      type: orderType,
      direction: 'BUY',
      stake,
      multiplier: orderType === 'MULTIPLIER' ? multiplier : 1,
      durationSeconds: orderType === 'RISE_FALL' ? durationSeconds : undefined,
      takeProfit: orderType === 'MULTIPLIER' && useTakeProfit ? buyLevels.tpPrice : undefined,
      stopLoss: orderType === 'MULTIPLIER' && useStopLoss ? buyLevels.slPrice : undefined,
    });
  };

  const handleSell = () => {
    executeTrade({
      type: orderType,
      direction: 'SELL',
      stake,
      multiplier: orderType === 'MULTIPLIER' ? multiplier : 1,
      durationSeconds: orderType === 'RISE_FALL' ? durationSeconds : undefined,
      takeProfit: orderType === 'MULTIPLIER' && useTakeProfit ? sellLevels.tpPrice : undefined,
      stopLoss: orderType === 'MULTIPLIER' && useStopLoss ? sellLevels.slPrice : undefined,
    });
  };

  const potentialPayout = (stake * 1.95).toFixed(2);

  return (
    <div className="flex flex-col bg-[#0f141f] border border-slate-800 rounded-lg p-4 text-xs select-none">
      {/* Contract Mode Segmented Switcher */}
      <div className="grid grid-cols-2 gap-1 p-1 bg-slate-900 border border-slate-800 rounded-md mb-4">
        <button
          onClick={() => setOrderType('MULTIPLIER')}
          className={`py-2 text-center font-medium rounded transition-colors flex items-center justify-center gap-1.5 ${
            orderType === 'MULTIPLIER'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>Forex Multipliers</span>
        </button>
        <button
          onClick={() => setOrderType('RISE_FALL')}
          className={`py-2 text-center font-medium rounded transition-colors flex items-center justify-center gap-1.5 ${
            orderType === 'RISE_FALL'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Rise / Fall</span>
        </button>
      </div>

      {/* Stake Amount */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-slate-400 mb-1.5">
          <span className="font-medium">Stake (USD)</span>
          <span className="font-mono text-slate-500">
            Avail: ${account.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </span>
        </div>
        <div className="relative mb-2">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500 font-mono">
            $
          </div>
          <input
            type="number"
            min={1}
            max={account.balance}
            value={stake}
            onChange={(e) => setStake(Math.max(1, Number(e.target.value)))}
            className="w-full pl-8 pr-3 py-2 bg-slate-950 border border-slate-700 rounded font-mono text-sm text-white focus:outline-none focus:border-blue-500"
          />
        </div>
        {/* Quick Presets */}
        <div className="grid grid-cols-5 gap-1 font-mono text-[11px]">
          {[10, 25, 50, 100, 250].map((val) => (
            <button
              key={val}
              onClick={() => setStake(val)}
              className={`py-1 rounded border transition-colors ${
                stake === val
                  ? 'bg-slate-800 text-blue-400 border-blue-500/50'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
              }`}
            >
              ${val}
            </button>
          ))}
        </div>
      </div>

      {/* Mode-specific settings */}
      {orderType === 'MULTIPLIER' ? (
        <div className="space-y-3 mb-4">
          {/* Multiplier / Leverage selector */}
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-1.5">
              <span className="font-medium">Multiplier (Leverage)</span>
              <span className="text-blue-400 font-mono font-semibold">x{multiplier}</span>
            </div>
            <div className="grid grid-cols-5 gap-1 font-mono text-[11px]">
              {[10, 20, 50, 100, 200].map((m) => (
                <button
                  key={m}
                  onClick={() => setMultiplier(m)}
                  className={`py-1.5 rounded border transition-colors ${
                    multiplier === m
                      ? 'bg-blue-600 text-white font-medium border-blue-500 shadow-sm'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  {m}x
                </button>
              ))}
            </div>
            <div className="text-[10px] text-slate-500 mt-1 font-mono">
              Position value: ${(stake * multiplier).toLocaleString()}
            </div>
          </div>

          {/* Take Profit & Stop Loss Controls */}
          <div className="space-y-2 pt-2 border-t border-slate-800/80">
            {/* Take profit */}
            <div>
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useTakeProfit}
                    onChange={(e) => setUseTakeProfit(e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-0"
                  />
                  <span>Take Profit</span>
                </label>
                {useTakeProfit && (
                  <span className="font-mono text-emerald-400">+${tpAmount.toFixed(2)} (+{((tpAmount / stake) * 100).toFixed(0)}%)</span>
                )}
              </div>
              {useTakeProfit && (
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={5}
                    max={stake * 3}
                    step={5}
                    value={tpAmount}
                    onChange={(e) => setTpAmount(Number(e.target.value))}
                    className="w-full accent-emerald-500"
                  />
                </div>
              )}
            </div>

            {/* Stop loss */}
            <div>
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useStopLoss}
                    onChange={(e) => setUseStopLoss(e.target.checked)}
                    className="rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-0"
                  />
                  <span>Stop Loss</span>
                </label>
                {useStopLoss && (
                  <span className="font-mono text-rose-400">-${slAmount.toFixed(2)} (-{((slAmount / stake) * 100).toFixed(0)}%)</span>
                )}
              </div>
              {useStopLoss && (
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={5}
                    max={stake}
                    step={5}
                    value={slAmount}
                    onChange={(e) => setSlAmount(Number(e.target.value))}
                    className="w-full accent-rose-500"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Rise / Fall Duration Controls */
        <div className="space-y-3 mb-4">
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-1.5">
              <span className="font-medium">Contract Duration</span>
              <span className="text-blue-400 font-mono font-semibold">
                {durationSeconds < 60 ? `${durationSeconds}s` : `${durationSeconds / 60}m`}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1 font-mono text-[11px]">
              {[
                { label: '15s', sec: 15 },
                { label: '30s', sec: 30 },
                { label: '60s', sec: 60 },
                { label: '5m', sec: 300 },
              ].map((d) => (
                <button
                  key={d.sec}
                  onClick={() => setDurationSeconds(d.sec)}
                  className={`py-1.5 rounded border transition-colors ${
                    durationSeconds === d.sec
                      ? 'bg-blue-600 text-white font-medium border-blue-500 shadow-sm'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-2.5 bg-slate-950/60 border border-slate-800/80 rounded space-y-1 text-slate-400">
            <div className="flex justify-between">
              <span>Payout Return</span>
              <span className="text-emerald-400 font-mono font-bold">+95.0%</span>
            </div>
            <div className="flex justify-between">
              <span>Total Return</span>
              <span className="text-white font-mono font-bold">${potentialPayout}</span>
            </div>
          </div>
        </div>
      )}

      {/* Live Ask / Bid Spread Pill */}
      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 py-1.5 px-2 bg-slate-950/80 rounded border border-slate-800/80 mb-3">
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500">Spread:</span>
          <span className="text-slate-300">{activeSymbol.spreadPips} pips</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500">Live Quote:</span>
          <span className="text-slate-200">{activeSymbol.currentPrice.toFixed(decimals)}</span>
        </div>
      </div>

      {/* Dual Big Execution Buttons */}
      <div className="grid grid-cols-2 gap-2.5">
        {/* BUY / HIGHER BUTTON */}
        <button
          onClick={handleBuy}
          className="group relative flex flex-col items-center justify-center py-3 px-2 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white rounded-lg shadow-lg shadow-emerald-950/40 transition-all cursor-pointer font-medium"
        >
          <div className="flex items-center gap-1.5 text-sm font-bold tracking-wide">
            <ArrowUpRight className="w-4 h-4 stroke-[2.5]" />
            <span>{orderType === 'MULTIPLIER' ? 'BUY / LONG' : 'HIGHER'}</span>
          </div>
          <div className="font-mono text-[11px] opacity-90 tracking-tight mt-0.5">
            Ask: {activeSymbol.ask.toFixed(decimals)}
          </div>
        </button>

        {/* SELL / LOWER BUTTON */}
        <button
          onClick={handleSell}
          className="group relative flex flex-col items-center justify-center py-3 px-2 bg-rose-600 hover:bg-rose-500 active:scale-[0.98] text-white rounded-lg shadow-lg shadow-rose-950/40 transition-all cursor-pointer font-medium"
        >
          <div className="flex items-center gap-1.5 text-sm font-bold tracking-wide">
            <ArrowDownRight className="w-4 h-4 stroke-[2.5]" />
            <span>{orderType === 'MULTIPLIER' ? 'SELL / SHORT' : 'LOWER'}</span>
          </div>
          <div className="font-mono text-[11px] opacity-90 tracking-tight mt-0.5">
            Bid: {activeSymbol.bid.toFixed(decimals)}
          </div>
        </button>
      </div>

      {/* Risk Guardian Note */}
      <div className="flex items-center gap-1.5 text-[10px] text-slate-500 justify-center mt-3 pt-2 border-t border-slate-800/80">
        <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
        <span>nderiskool Risk Protection: Max loss bounded to stake</span>
      </div>
    </div>
  );
};
