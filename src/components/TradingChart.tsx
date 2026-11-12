import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useTrading } from '../context/TradingContext';
import { calculateEMA, calculateBollingerBands, calculateRSI } from '../utils/indicators';
import {
  Maximize2,
  Minimize2,
  TrendingUp,
  Activity,
  Layers,
  BarChart2,
  Eye,
  EyeOff,
} from 'lucide-react';

export const TradingChart: React.FC = () => {
  const {
    activeSymbol,
    candles,
    timeframe,
    setTimeframe,
    chartType,
    setChartType,
    indicators,
    toggleIndicator,
    activePositions,
    lastTick,
    isWsConnected,
  } = useTrading();

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 480 });
  const [crosshair, setCrosshair] = useState<{ x: number; y: number; candleIndex: number } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [isFullscreen]);

  // Indicator series
  const ema9 = useMemo(() => {
    if (!indicators.ema || candles.length === 0) return [];
    return calculateEMA(candles.map((c) => c.close), 9);
  }, [candles, indicators.ema]);

  const ema21 = useMemo(() => {
    if (!indicators.ema || candles.length === 0) return [];
    return calculateEMA(candles.map((c) => c.close), 21);
  }, [candles, indicators.ema]);

  const bollinger = useMemo(() => {
    if (!indicators.bollinger || candles.length === 0) return null;
    return calculateBollingerBands(candles, 20, 2);
  }, [candles, indicators.bollinger]);

  const rsiValues = useMemo(() => {
    if (!indicators.rsi || candles.length === 0) return [];
    return calculateRSI(candles, 14);
  }, [candles, indicators.rsi]);

  // Filter positions for active symbol
  const symbolPositions = useMemo(() => {
    return activePositions.filter((p) => p.symbol === activeSymbol.symbol);
  }, [activePositions, activeSymbol.symbol]);

  // Render chart on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || candles.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Retina display support
    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    ctx.scale(dpr, dpr);

    const width = dimensions.width;
    const height = dimensions.height;

    // Split for RSI if active
    const showRSI = indicators.rsi;
    const rsiHeight = showRSI ? 80 : 0;
    const mainHeight = height - rsiHeight - 28; // 28px bottom time axis
    const rightMargin = 72; // price scale margin

    // Clear background
    ctx.fillStyle = '#0b0e14';
    ctx.fillRect(0, 0, width, height);

    // Calculate Min & Max price for scaling
    let minPrice = Infinity;
    let maxPrice = -Infinity;

    candles.forEach((c) => {
      if (c.low < minPrice) minPrice = c.low;
      if (c.high > maxPrice) maxPrice = c.high;
    });

    // Factor in open positions & TP/SL into price range if close
    symbolPositions.forEach((pos) => {
      minPrice = Math.min(minPrice, pos.entryPrice);
      maxPrice = Math.max(maxPrice, pos.entryPrice);
      if (pos.takeProfitPrice) maxPrice = Math.max(maxPrice, pos.takeProfitPrice);
      if (pos.stopLossPrice) minPrice = Math.min(minPrice, pos.stopLossPrice);
    });

    if (minPrice === maxPrice) {
      minPrice -= minPrice * 0.001;
      maxPrice += maxPrice * 0.001;
    }

    const pricePadding = (maxPrice - minPrice) * 0.12;
    minPrice -= pricePadding;
    maxPrice += pricePadding;
    const priceRange = maxPrice - minPrice;

    // Coordinate conversion helpers
    const chartWidth = width - rightMargin;
    const count = candles.length;
    const candleSpacing = chartWidth / count;
    const candleWidth = Math.max(2, candleSpacing * 0.7);

    const getY = (price: number) => {
      return mainHeight - ((price - minPrice) / priceRange) * mainHeight;
    };

    const getX = (index: number) => {
      return index * candleSpacing + candleSpacing / 2;
    };

    // Draw horizontal grid lines & price labels
    const gridSteps = 5;
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);

    for (let i = 0; i <= gridSteps; i++) {
      const y = (mainHeight / gridSteps) * i;
      const price = maxPrice - (i / gridSteps) * priceRange;

      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartWidth, y);
      ctx.stroke();

      // Right axis price text
      ctx.setLineDash([]);
      ctx.fillStyle = '#64748b';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const decimals = activeSymbol.symbol.includes('JPY') ? 3 : activeSymbol.symbol.startsWith('R_') ? 2 : 5;
      ctx.fillText(price.toFixed(decimals), chartWidth + 6, y);
      ctx.setLineDash([3, 3]);
    }

    // Draw Bollinger Bands if enabled
    if (bollinger && indicators.bollinger) {
      ctx.setLineDash([]);
      // Upper band
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      let started = false;
      candles.forEach((_, idx) => {
        const val = bollinger.upper[idx];
        if (val !== null) {
          const x = getX(idx);
          const y = getY(val);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      });
      ctx.stroke();

      // Lower band
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
      ctx.beginPath();
      started = false;
      candles.forEach((_, idx) => {
        const val = bollinger.lower[idx];
        if (val !== null) {
          const x = getX(idx);
          const y = getY(val);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      });
      ctx.stroke();

      // Middle band
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      started = false;
      candles.forEach((_, idx) => {
        const val = bollinger.middle[idx];
        if (val !== null) {
          const x = getX(idx);
          const y = getY(val);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw EMA 9 & EMA 21
    if (indicators.ema) {
      ctx.setLineDash([]);
      // EMA 9 (Cyan)
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let started = false;
      candles.forEach((_, idx) => {
        const val = ema9[idx];
        if (val !== null) {
          const x = getX(idx);
          const y = getY(val);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      });
      ctx.stroke();

      // EMA 21 (Amber)
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      started = false;
      candles.forEach((_, idx) => {
        const val = ema21[idx];
        if (val !== null) {
          const x = getX(idx);
          const y = getY(val);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      });
      ctx.stroke();
    }

    // Draw Candlesticks or Line
    if (chartType === 'line') {
      ctx.setLineDash([]);
      // Gradient fill beneath line
      const gradient = ctx.createLinearGradient(0, 0, 0, mainHeight);
      gradient.addColorStop(0, 'rgba(16, 185, 129, 0.25)');
      gradient.addColorStop(1, 'rgba(16, 185, 129, 0.0)');

      ctx.beginPath();
      candles.forEach((c, idx) => {
        const x = getX(idx);
        const y = getY(c.close);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });

      // Close polygon for area fill
      ctx.lineTo(getX(candles.length - 1), mainHeight);
      ctx.lineTo(getX(0), mainHeight);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      // Stroke line
      ctx.beginPath();
      candles.forEach((c, idx) => {
        const x = getX(idx);
        const y = getY(c.close);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      // Candlesticks
      candles.forEach((c, idx) => {
        const x = getX(idx);
        const isUp = c.close >= c.open;
        const color = isUp ? '#10b981' : '#f43f5e';
        const openY = getY(c.open);
        const closeY = getY(c.close);
        const highY = getY(c.high);
        const lowY = getY(c.low);

        // Wick
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x, highY);
        ctx.lineTo(x, lowY);
        ctx.stroke();

        // Body
        ctx.fillStyle = color;
        const bodyTop = Math.min(openY, closeY);
        const bodyHeight = Math.max(1.5, Math.abs(closeY - openY));
        ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
      });
    }

    // Draw Open Position Entry lines directly on chart
    symbolPositions.forEach((pos) => {
      const entryY = getY(pos.entryPrice);
      const isBuy = pos.direction === 'BUY';
      const color = isBuy ? '#10b981' : '#f43f5e';

      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, entryY);
      ctx.lineTo(chartWidth, entryY);
      ctx.stroke();

      // Floating Entry Marker Badge
      ctx.setLineDash([]);
      const badgeText = `${pos.direction} ${pos.multiplier}x · Entry: ${pos.entryPrice} (${pos.pnl >= 0 ? '+' : ''}$${pos.pnl.toFixed(2)})`;
      ctx.font = '10px "JetBrains Mono", monospace';
      const textWidth = ctx.measureText(badgeText).width;

      ctx.fillStyle = isBuy ? 'rgba(16, 185, 129, 0.9)' : 'rgba(244, 63, 94, 0.9)';
      ctx.fillRect(8, entryY - 10, textWidth + 12, 20);

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, 14, entryY);

      // TP Line
      if (pos.takeProfitPrice) {
        const tpY = getY(pos.takeProfitPrice);
        ctx.setLineDash([2, 4]);
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, tpY);
        ctx.lineTo(chartWidth, tpY);
        ctx.stroke();

        ctx.fillStyle = '#22c55e';
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.fillText(`TP: ${pos.takeProfitPrice}`, 8, tpY - 6);
      }

      // SL Line
      if (pos.stopLossPrice) {
        const slY = getY(pos.stopLossPrice);
        ctx.setLineDash([2, 4]);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, slY);
        ctx.lineTo(chartWidth, slY);
        ctx.stroke();

        ctx.fillStyle = '#ef4444';
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.fillText(`SL: ${pos.stopLossPrice}`, 8, slY - 6);
      }
    });

    // Draw Live Current Price Line on Right Axis
    const currentPrice = activeSymbol.currentPrice;
    const currentY = getY(currentPrice);

    ctx.setLineDash([2, 2]);
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, currentY);
    ctx.lineTo(chartWidth, currentY);
    ctx.stroke();

    // Live Price Pill on Right Axis
    ctx.setLineDash([]);
    ctx.fillStyle = '#2563eb';
    ctx.fillRect(chartWidth + 2, currentY - 10, rightMargin - 4, 20);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const decimals = activeSymbol.symbol.includes('JPY') ? 3 : activeSymbol.symbol.startsWith('R_') ? 2 : 5;
    ctx.fillText(currentPrice.toFixed(decimals), chartWidth + rightMargin / 2, currentY);

    // Draw Bottom Time Axis
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, mainHeight);
    ctx.lineTo(width, mainHeight);
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const timeSteps = 6;
    for (let i = 0; i < timeSteps; i++) {
      const idx = Math.floor((count - 1) * (i / (timeSteps - 1)));
      if (candles[idx]) {
        const date = new Date(candles[idx].epoch * 1000);
        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        ctx.fillText(timeStr, getX(idx), mainHeight + 6);
      }
    }

    // Draw RSI Sub-panel if enabled
    if (showRSI) {
      const rsiTop = height - rsiHeight;

      // Divider line
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, rsiTop);
      ctx.lineTo(width, rsiTop);
      ctx.stroke();

      // RSI Label
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText('RSI (14)', 8, rsiTop + 8);

      // Overbought 70 & Oversold 30 levels
      const rsiGetY = (val: number) => {
        return rsiTop + rsiHeight - (val / 100) * (rsiHeight - 20) - 10;
      };

      ctx.setLineDash([2, 2]);
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
      ctx.beginPath();
      ctx.moveTo(0, rsiGetY(70));
      ctx.lineTo(chartWidth, rsiGetY(70));
      ctx.stroke();

      ctx.strokeStyle = 'rgba(34, 197, 94, 0.4)';
      ctx.beginPath();
      ctx.moveTo(0, rsiGetY(30));
      ctx.lineTo(chartWidth, rsiGetY(30));
      ctx.stroke();

      // RSI Curve
      ctx.setLineDash([]);
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let started = false;
      candles.forEach((_, idx) => {
        const val = rsiValues[idx];
        if (val !== null) {
          const x = getX(idx);
          const y = rsiGetY(val);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      });
      ctx.stroke();

      // Current RSI value text
      const latestRsi = rsiValues[rsiValues.length - 1];
      if (latestRsi !== null && latestRsi !== undefined) {
        ctx.fillStyle = latestRsi > 70 ? '#f43f5e' : latestRsi < 30 ? '#10b981' : '#a855f7';
        ctx.textAlign = 'left';
        ctx.fillText(latestRsi.toFixed(1), 60, rsiTop + 8);
      }
    }

    // Draw Crosshair if active
    if (crosshair && crosshair.x < chartWidth && crosshair.y < mainHeight) {
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1;

      // Vertical line
      ctx.beginPath();
      ctx.moveTo(crosshair.x, 0);
      ctx.lineTo(crosshair.x, mainHeight);
      ctx.stroke();

      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(0, crosshair.y);
      ctx.lineTo(chartWidth, crosshair.y);
      ctx.stroke();

      ctx.setLineDash([]);
      // Price badge on axis
      const hoveredPrice = maxPrice - (crosshair.y / mainHeight) * priceRange;
      ctx.fillStyle = '#334155';
      ctx.fillRect(chartWidth + 2, crosshair.y - 10, rightMargin - 4, 20);
      ctx.fillStyle = '#ffffff';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(hoveredPrice.toFixed(decimals), chartWidth + rightMargin / 2, crosshair.y);
    }
  }, [
    candles,
    dimensions,
    chartType,
    indicators,
    ema9,
    ema21,
    bollinger,
    rsiValues,
    symbolPositions,
    activeSymbol,
    crosshair,
    timeframe,
  ]);

  // Mouse move for crosshair
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || candles.length === 0) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const chartWidth = dimensions.width - 72;
    const candleSpacing = chartWidth / candles.length;
    const candleIndex = Math.min(candles.length - 1, Math.max(0, Math.floor(x / candleSpacing)));

    setCrosshair({ x, y, candleIndex });
  };

  const handleMouseLeave = () => {
    setCrosshair(null);
  };

  // Hovered candle info for crosshair bar
  const activeCandle = crosshair && candles[crosshair.candleIndex] ? candles[crosshair.candleIndex] : candles[candles.length - 1];

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col bg-[#0b0e14] border border-slate-800 rounded-lg overflow-hidden ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none' : 'h-full min-h-[460px]'
      }`}
    >
      {/* Top Chart Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-[#0f141f] border-b border-slate-800 text-xs select-none">
        {/* Left: Symbol & OHLC values */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-100 text-sm tracking-tight">{activeSymbol.displayName}</span>
            <span className="text-[10px] text-slate-400 uppercase font-mono">
              {activeSymbol.category.replace('_', ' ')}
            </span>
          </div>

          {activeCandle && (
            <div className="hidden lg:flex items-center gap-3 font-mono text-[11px] text-slate-400">
              <span>
                O: <span className="text-slate-200">{activeCandle.open}</span>
              </span>
              <span>
                H: <span className="text-emerald-400">{activeCandle.high}</span>
              </span>
              <span>
                L: <span className="text-rose-400">{activeCandle.low}</span>
              </span>
              <span>
                C: <span className="text-slate-200">{activeCandle.close}</span>
              </span>
            </div>
          )}
        </div>

        {/* Right: Timeframe, Chart type, Indicators & Fullscreen */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Timeframes */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded p-0.5">
            {[
              { label: '1M', sec: 60 },
              { label: '5M', sec: 300 },
              { label: '15M', sec: 900 },
              { label: '1H', sec: 3600 },
              { label: '1D', sec: 86400 },
            ].map((tf) => (
              <button
                key={tf.sec}
                onClick={() => setTimeframe(tf.sec)}
                className={`px-2 py-1 text-[11px] font-mono rounded transition-colors ${
                  timeframe === tf.sec
                    ? 'bg-blue-600 text-white font-medium shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>

          {/* Chart Style: Candle vs Line */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded p-0.5">
            <button
              onClick={() => setChartType('candle')}
              title="Candlestick Chart"
              className={`p-1 rounded transition-colors ${
                chartType === 'candle' ? 'bg-slate-700 text-emerald-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BarChart2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setChartType('line')}
              title="Area Line Chart"
              className={`p-1 rounded transition-colors ${
                chartType === 'line' ? 'bg-slate-700 text-blue-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Indicators toggles */}
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded p-0.5">
            <button
              onClick={() => toggleIndicator('ema')}
              className={`px-2 py-1 text-[10px] font-mono rounded transition-colors ${
                indicators.ema ? 'bg-cyan-950 text-cyan-400 border border-cyan-800/60' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              EMA 9/21
            </button>
            <button
              onClick={() => toggleIndicator('bollinger')}
              className={`px-2 py-1 text-[10px] font-mono rounded transition-colors ${
                indicators.bollinger
                  ? 'bg-sky-950 text-sky-400 border border-sky-800/60'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              BB (20,2)
            </button>
            <button
              onClick={() => toggleIndicator('rsi')}
              className={`px-2 py-1 text-[10px] font-mono rounded transition-colors ${
                indicators.rsi ? 'bg-purple-950 text-purple-400 border border-purple-800/60' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              RSI (14)
            </button>
          </div>

          {/* Fullscreen toggle */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800 rounded transition-colors"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="relative flex-1 w-full h-full min-h-[380px] bg-[#0b0e14]">
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="absolute inset-0 w-full h-full cursor-crosshair block"
        />

        {/* Deriv Stream Feed Watermark */}
        <div className="absolute bottom-10 left-4 pointer-events-none opacity-40 select-none flex items-center gap-2 text-[10px] font-mono text-slate-500">
          <span>DERIV WS FEED // {activeSymbol.symbol}</span>
          <span>·</span>
          <span>LATENCY &lt; 25ms</span>
        </div>
      </div>
    </div>
  );
};
