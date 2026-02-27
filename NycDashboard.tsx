import React, { useState, useEffect } from 'react';
import { Shield, Zap, BarChart3 } from 'lucide-react';

const NYCDashboard = () => {
  return (
    <div className="min-h-screen bg-black text-blue-100 p-8 font-mono">
      <div className="border-b border-blue-900 pb-4 mb-8 flex justify-between items-center">
        <h1 className="text-2xl font-bold tracking-tighter text-blue-400">NEW YORK CITY LOVE // LIVE_FEED</h1>
        <div className="flex gap-4">
          <span className="bg-blue-950 px-3 py-1 rounded text-xs border border-blue-800">API: OANDA_CONNECTED</span>
          <span className="bg-green-950 px-3 py-1 rounded text-xs border border-green-800 text-green-400">STATUS: SCANNING</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900/50 p-6 border border-blue-900/50 rounded-lg">
          <div className="flex items-center gap-2 mb-4 text-blue-400"><Shield size={20}/> SPREAD SHIELD</div>
          <div className="text-4xl font-bold">1.1 <span className="text-sm font-normal text-slate-500">pips</span></div>
          <div className="text-xs mt-2 text-green-500">✓ WITHIN LIMIT (1.2)</div>
        </div>

        <div className="bg-slate-900/50 p-6 border border-purple-900/50 rounded-lg">
          <div className="flex items-center gap-2 mb-4 text-purple-400"><Zap size={20}/> VELOCITY FEELER</div>
          <div className="text-4xl font-bold">164%</div>
          <div className="text-xs mt-2 text-purple-300">INSTITUTIONAL PRESSURE DETECTED</div>
        </div>

        <div className="bg-slate-900/50 p-6 border border-orange-900/50 rounded-lg">
          <div className="flex items-center gap-2 mb-4 text-orange-400"><BarChart3 size={20}/> SOVEREIGN GAUGE</div>
          <div className="text-4xl font-bold">DXY <span className="text-lg text-slate-500">97.75</span></div>
          <div className="text-xs mt-2 text-orange-300">USD STABILIZING PRE-DATA</div>
        </div>
      </div>

      <div className="mt-8 bg-slate-950 p-4 border border-blue-900 rounded h-64 overflow-y-auto">
        <div className="text-xs text-blue-500 mb-2">// LOG_INITIALIZED: 08:30:00 EST</div>
        <div className="text-sm text-green-400">[SYSTEM] NYC Love Agent monitoring EUR/USD...</div>
        <div className="text-sm text-red-400">[SHIELD] Spread spike detected (1.5). Trade aborted.</div>
        <div className="text-sm text-blue-300">[FEELER] Velocity spike 164% confirmed. Checking Sovereign correlation...</div>
      </div>
    </div>
  );
};

export default NYCDashboard;
