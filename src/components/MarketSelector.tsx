import React, { useState, useMemo } from 'react';
import { useTrading } from '../context/TradingContext';
import { Search, Star, TrendingUp, TrendingDown } from 'lucide-react';

export const MarketSelector: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { markets, activeSymbol, setActiveSymbol } = useTrading();
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<'all' | 'forex_major' | 'forex_minor' | 'metals' | 'synthetic'>('all');
  const [favoritesOnly] = useState(false);

  const filteredMarkets = useMemo(() => {
    return markets.filter((m) => {
      if (favoritesOnly && !m.isFavorite) return false;
      if (activeCategory !== 'all' && m.category !== activeCategory) return false;
      if (
        search &&
        !m.displayName.toLowerCase().includes(search.toLowerCase()) &&
        !m.symbol.toLowerCase().includes(search.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [markets, activeCategory, favoritesOnly, search]);

  return (
    <div className={`flex flex-col bg-white border border-slate-200 rounded-2xl shadow-xs text-xs ${compact ? 'h-full' : 'p-4'}`}>
      {/* Category Pills & Search */}
      <div className="p-3 border-b border-slate-200 space-y-2.5">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search Forex or Deriv symbols..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-teal-500 text-xs"
          />
        </div>

        <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[11px] font-medium text-slate-600 no-scrollbar">
          {[
            { id: 'all', label: `All (${markets.length})` },
            { id: 'forex_major', label: 'Majors' },
            { id: 'forex_minor', label: 'Crosses' },
            { id: 'metals', label: 'Gold/Metals' },
            { id: 'synthetic', label: 'Deriv Synthetics' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id as any)}
              className={`px-2.5 py-1 rounded-md whitespace-nowrap transition-colors cursor-pointer ${
                activeCategory === cat.id
                  ? 'bg-[#0b1930] text-white font-semibold'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100 max-h-[480px]">
        {filteredMarkets.length === 0 ? (
          <div className="py-8 text-center text-slate-500">No symbols found</div>
        ) : (
          filteredMarkets.map((m) => {
            const isSelected = m.symbol === activeSymbol.symbol;
            const isPositive = m.change24h >= 0;
            const decimals = m.symbol.includes('JPY') ? 3 : m.symbol.startsWith('R_') ? 2 : 5;

            return (
              <button
                key={m.symbol}
                onClick={() => setActiveSymbol(m)}
                className={`w-full flex items-center justify-between p-3 text-left transition-colors font-mono cursor-pointer ${
                  isSelected
                    ? 'bg-teal-50/70 border-l-2 border-teal-600'
                    : 'hover:bg-slate-50'
                }`}
              >
                <div>
                  <div className="flex items-center gap-1.5 font-bold text-slate-900 text-xs">
                    <span>{m.displayName}</span>
                    {m.isFavorite && <Star className="w-2.5 h-2.5 text-amber-500 fill-amber-500" />}
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-slate-500 mt-0.5">
                    <span>Spread: {m.spreadPips}p</span>
                    <span>·</span>
                    <span className="capitalize">{m.category.replace('_', ' ')}</span>
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-semibold text-slate-900 text-xs tabular-nums">
                    {m.currentPrice.toFixed(decimals)}
                  </div>
                  <div
                    className={`flex items-center justify-end gap-0.5 text-[10px] font-bold tabular-nums ${
                      isPositive ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    {isPositive ? (
                      <TrendingUp className="w-2.5 h-2.5" />
                    ) : (
                      <TrendingDown className="w-2.5 h-2.5" />
                    )}
                    <span>{isPositive ? '+' : ''}{m.change24h.toFixed(2)}%</span>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
