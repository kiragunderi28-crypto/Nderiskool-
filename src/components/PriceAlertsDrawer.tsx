import React, { useState } from 'react';
import { useTrading } from '../context/TradingContext';
import { Bell, Plus, Trash2, CheckCircle2, ArrowUpRight, ArrowDownRight, X } from 'lucide-react';

export const PriceAlertsDrawer: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const { activeSymbol, priceAlerts, addPriceAlert, removePriceAlert } = useTrading();
  const [targetPrice, setTargetPrice] = useState<number>(activeSymbol.currentPrice);
  const [condition, setCondition] = useState<'ABOVE' | 'BELOW'>('ABOVE');

  if (!isOpen) return null;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetPrice || targetPrice <= 0) return;
    addPriceAlert(targetPrice, condition);
  };

  const isJpy = activeSymbol.symbol.includes('JPY');
  const decimals = isJpy ? 3 : activeSymbol.symbol.startsWith('R_') ? 2 : 5;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-white border-l border-slate-200 shadow-2xl flex flex-col text-xs select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 bg-[#0b1930] text-white">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-amber-400" />
          <h3 className="font-bold text-white text-sm">Price Alerts</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 text-slate-300 hover:text-white rounded hover:bg-white/10 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 space-y-4 overflow-y-auto bg-[#f8fafc]">
        {/* Create Alert Form */}
        <form onSubmit={handleAdd} className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-900">{activeSymbol.displayName}</span>
            <span className="font-mono text-slate-500 tabular-nums">
              Live: <strong className="text-slate-900">{activeSymbol.currentPrice.toFixed(decimals)}</strong>
            </span>
          </div>

          <div>
            <label className="text-slate-600 font-medium block mb-1 text-[11px]">Condition</label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setCondition('ABOVE')}
                className={`py-2 px-2 rounded-lg border flex items-center justify-center gap-1 font-semibold transition-colors cursor-pointer ${
                  condition === 'ABOVE'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-400 shadow-xs'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>Price Above (≥)</span>
              </button>
              <button
                type="button"
                onClick={() => setCondition('BELOW')}
                className={`py-2 px-2 rounded-lg border flex items-center justify-center gap-1 font-semibold transition-colors cursor-pointer ${
                  condition === 'BELOW'
                    ? 'bg-rose-50 text-rose-700 border-rose-400 shadow-xs'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <ArrowDownRight className="w-3.5 h-3.5" />
                <span>Price Below (≤)</span>
              </button>
            </div>
          </div>

          <div>
            <label className="text-slate-600 font-medium block mb-1 text-[11px]">Target Price</label>
            <input
              type="number"
              step="any"
              value={targetPrice}
              onChange={(e) => setTargetPrice(Number(e.target.value))}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono text-xs focus:outline-none focus:border-[#0b1930]"
            />
          </div>

          <button
            type="submit"
            className="w-full py-2 bg-[#2bbbad] hover:bg-[#239b8f] text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Price Alert</span>
          </button>
        </form>

        {/* Existing Alerts List */}
        <div>
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="font-bold text-xs text-slate-800">Active Alerts ({priceAlerts.length})</span>
            <span className="text-[10px]">Real-time trigger</span>
          </div>

          {priceAlerts.length === 0 ? (
            <div className="py-8 text-center text-slate-500 bg-white border border-slate-200 rounded-xl">
              No price alerts set.
            </div>
          ) : (
            <div className="space-y-2">
              {priceAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`p-3 rounded-xl border font-mono flex items-center justify-between shadow-xs ${
                    alert.triggered
                      ? 'bg-emerald-50 border-emerald-200 opacity-75'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-1.5 font-bold text-slate-900 tabular-nums">
                      <span>{alert.symbolName}</span>
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                          alert.condition === 'ABOVE'
                            ? 'text-emerald-700 bg-emerald-100'
                            : 'text-rose-700 bg-rose-100'
                        }`}
                      >
                        {alert.condition === 'ABOVE' ? '≥' : '≤'} {alert.targetPrice}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {alert.triggered ? (
                        <span className="text-emerald-700 flex items-center gap-1 font-semibold">
                          <CheckCircle2 className="w-2.5 h-2.5" /> Triggered
                        </span>
                      ) : (
                        <span>Monitoring live tick stream</span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => removePriceAlert(alert.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors rounded hover:bg-rose-50 cursor-pointer"
                    title="Delete Alert"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
