import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Smartphone, X } from 'lucide-react';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        title="Install nderiskool App on Android / Desktop"
        className="flex items-center gap-1.5 rounded-lg bg-[#2bbbad] hover:bg-[#239b8f] px-2.5 py-1.5 text-xs font-bold text-white shadow-sm transition-colors cursor-pointer whitespace-nowrap"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-800 transition-colors cursor-pointer whitespace-nowrap shadow-xs"
        >
          <Smartphone className="w-3.5 h-3.5 text-[#2bbbad]" />
          <span>Install on iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white border border-slate-200 p-5 shadow-2xl">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-900">Install nderiskool on iPhone / iPad</h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed space-y-1.5">
                <span className="block">
                  1. Tap the <strong className="text-slate-900">Share</strong> button in Safari&apos;s toolbar.
                </span>
                <span className="block">
                  2. Scroll down and tap <strong className="text-slate-900">Add to Home Screen</strong>.
                </span>
                <span className="block">
                  3. Tap <strong className="text-emerald-600">Add</strong> to launch in standalone mode.
                </span>
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 w-full rounded-lg bg-[#0b1930] hover:bg-slate-800 py-2 text-xs font-bold text-white transition-colors cursor-pointer"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
