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
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-[#0f141f] border-l border-slate-800 shadow-2xl flex flex-col text-xs select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/60">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-amber-400" />
          <h3 className="font-bold text-slate-100 text-sm">Price Alerts</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 space-y-4 overflow-y-auto">
        {/* Create Alert Form */}
        <form onSubmit={handleAdd} className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-200">{activeSymbol.displayName}</span>
            <span className="font-mono text-slate-400">
              Live: <strong className="text-white">{activeSymbol.currentPrice.toFixed(decimals)}</strong>
            </span>
          </div>

          <div>
            <label className="text-slate-400 block mb-1 text-[11px]">Condition</label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setCondition('ABOVE')}
                className={`py-1.5 px-2 rounded border flex items-center justify-center gap-1 font-medium transition-colors ${
                  condition === 'ABOVE'
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-700 shadow-sm'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                }`}
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>Price Above (≥)</span>
              </button>
              <button
                type="button"
                onClick={() => setCondition('BELOW')}
                className={`py-1.5 px-2 rounded border flex items-center justify-center gap-1 font-medium transition-colors ${
                  condition === 'BELOW'
                    ? 'bg-rose-950 text-rose-300 border-rose-700 shadow-sm'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                }`}
              >
                <ArrowDownRight className="w-3.5 h-3.5" />
                <span>Price Below (≤)</span>
              </button>
            </div>
          </div>

          <div>
            <label className="text-slate-400 block mb-1 text-[11px]">Target Price</label>
            <input
              type="number"
              step="any"
              value={targetPrice}
              onChange={(e) => setTargetPrice(Number(e.target.value))}
              className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-100 font-mono text-xs focus:outline-none focus:border-blue-500"
            />
          </div>

          <button
            type="submit"
            className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Price Alert</span>
          </button>
        </form>

        {/* Existing Alerts List */}
        <div>
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="font-semibold text-xs text-slate-300">Active Alerts ({priceAlerts.length})</span>
            <span className="text-[10px]">Real-time trigger</span>
          </div>

          {priceAlerts.length === 0 ? (
            <div className="py-8 text-center text-slate-500">No price alerts set.</div>
          ) : (
            <div className="space-y-2">
              {priceAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`p-2.5 rounded-lg border font-mono flex items-center justify-between ${
                    alert.triggered
                      ? 'bg-emerald-950/30 border-emerald-800/40 opacity-70'
                      : 'bg-slate-950 border-slate-800'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-1.5 font-bold text-slate-200">
                      <span>{alert.symbolName}</span>
                      <span
                        className={`text-[10px] font-semibold px-1 rounded ${
                          alert.condition === 'ABOVE'
                            ? 'text-emerald-400 bg-emerald-950'
                            : 'text-rose-400 bg-rose-950'
                        }`}
                      >
                        {alert.condition === 'ABOVE' ? '≥' : '≤'} {alert.targetPrice}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {alert.triggered ? (
                        <span className="text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-2.5 h-2.5" /> Triggered
                        </span>
                      ) : (
                        <span>Monitoring live tick stream</span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => removePriceAlert(alert.id)}
                    className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors rounded hover:bg-slate-900"
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
