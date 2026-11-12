import React, { useState, useMemo } from 'react';
import { useTrading } from '../context/TradingContext';
import { MarketSymbol } from '../types/trading';
import { Search, Star, TrendingUp, TrendingDown } from 'lucide-react';

export const MarketSelector: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { markets, activeSymbol, setActiveSymbol } = useTrading();
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<'all' | 'forex_major' | 'forex_minor' | 'metals' | 'synthetic'>('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);

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
    <div className={`flex flex-col bg-[#0f141f] border border-slate-800 rounded-lg text-xs ${compact ? 'h-full' : 'p-4'}`}>
      {/* Category Pills & Search */}
      <div className="p-3 border-b border-slate-800 space-y-2.5">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search Forex or Deriv symbols..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 text-xs"
          />
        </div>

        {/* Filter categories */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[11px] font-medium text-slate-400 no-scrollbar">
          <button
            onClick={() => setActiveCategory('all')}
            className={`px-2.5 py-1 rounded whitespace-nowrap transition-colors ${
              activeCategory === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-400'
            }`}
          >
            All ({markets.length})
          </button>
          <button
            onClick={() => setActiveCategory('forex_major')}
            className={`px-2.5 py-1 rounded whitespace-nowrap transition-colors ${
              activeCategory === 'forex_major'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-400'
            }`}
          >
            Majors
          </button>
          <button
            onClick={() => setActiveCategory('forex_minor')}
            className={`px-2.5 py-1 rounded whitespace-nowrap transition-colors ${
              activeCategory === 'forex_minor'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-400'
            }`}
          >
            Crosses
          </button>
          <button
            onClick={() => setActiveCategory('metals')}
            className={`px-2.5 py-1 rounded whitespace-nowrap transition-colors ${
              activeCategory === 'metals'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-400'
            }`}
          >
            Gold/Metals
          </button>
          <button
            onClick={() => setActiveCategory('synthetic')}
            className={`px-2.5 py-1 rounded whitespace-nowrap transition-colors ${
              activeCategory === 'synthetic'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-400'
            }`}
          >
            Deriv Synthetics
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60 max-h-[480px]">
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
                    ? 'bg-blue-950/40 border-l-2 border-blue-500'
                    : 'hover:bg-slate-900/60'
                }`}
              >
                <div>
                  <div className="flex items-center gap-1.5 font-bold text-slate-100 text-xs">
                    <span>{m.displayName}</span>
                    {m.isFavorite && <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />}
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-0.5">
                    <span>Spread: {m.spreadPips}p</span>
                    <span>·</span>
                    <span className="capitalize">{m.category.replace('_', ' ')}</span>
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-semibold text-slate-100 text-xs tabular-nums">
                    {m.currentPrice.toFixed(decimals)}
                  </div>
                  <div
                    className={`flex items-center justify-end gap-0.5 text-[10px] font-bold tabular-nums ${
                      isPositive ? 'text-emerald-400' : 'text-rose-400'
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
