import React, { useEffect, useRef } from 'react';
import { Chart, ArcElement, DoughnutController, Tooltip, Legend, LineElement, PointElement, LinearScale, CategoryScale, LineController, Filler } from 'chart.js';
import { Panel, PanelHeader, LiveBadge } from '../components/Panel';
import StatCard from '../components/StatCard';
import TxnItem from '../components/TxnItem';
import type { Transaction, ModelScore, ShapFactor, AppStats } from '../types';
import { 
  BarChart3, 
  Ban, 
  AlertTriangle, 
  Target, 
  Radio, 
  Activity,
  Cpu,
  Search,
  TrendingUp
} from 'lucide-react';

Chart.register(ArcElement, DoughnutController, Tooltip, Legend, LineElement, PointElement, LinearScale, CategoryScale, LineController, Filler);

interface OverviewTabProps {
  stats: AppStats;
  tps: number;
  transactions: Transaction[];
  models: ModelScore[];
  shapFactors: ShapFactor[];
  thresholds: { friction: number; block: number };
  onThresholdChange: (key: 'friction' | 'block', val: number) => void;
}

const OverviewTab: React.FC<OverviewTabProps> = ({
  stats, tps, transactions, models, shapFactors, thresholds, onThresholdChange
}) => {
  const donutRef = useRef<HTMLCanvasElement>(null);
  const chartInstanceRef = useRef<Chart | null>(null);
  const lineRef = useRef<HTMLCanvasElement>(null);
  const lineChartRef = useRef<Chart | null>(null);

  // ── Doughnut Chart ──
  useEffect(() => {
    if (!donutRef.current) return;
    if (chartInstanceRef.current) chartInstanceRef.current.destroy();

    chartInstanceRef.current = new Chart(donutRef.current, {
      type: 'doughnut',
      data: {
        labels: ['Allow', 'Friction', 'Block'],
        datasets: [{
          data: [
            transactions.filter(t => t.decision === 'ALLOW').length || stats.total - stats.blocked - stats.friction,
            transactions.filter(t => t.decision === 'FRICTION').length || stats.friction,
            transactions.filter(t => t.decision === 'BLOCK').length || stats.blocked,
          ],
          backgroundColor: ['#10b981', '#f59e0b', '#f43f5e'],
          borderWidth: 0,
          hoverOffset: 6,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '76%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#94a3b8',
              font: { family: 'Inter', size: 11 },
              padding: 20,
              usePointStyle: true,
              pointStyleWidth: 8,
            }
          },
          tooltip: {
            backgroundColor: '#1e293b',
            borderColor: 'rgba(255,255,255,0.08)',
            borderWidth: 1,
            titleColor: '#f1f5f9',
            bodyColor: '#94a3b8',
            cornerRadius: 8,
          }
        }
      }
    });

    return () => { chartInstanceRef.current?.destroy(); };
  }, []);

  // Update doughnut data
  useEffect(() => {
    if (!chartInstanceRef.current) return;
    const allow    = transactions.filter(t => t.decision === 'ALLOW').length;
    const friction = transactions.filter(t => t.decision === 'FRICTION').length;
    const block    = transactions.filter(t => t.decision === 'BLOCK').length;
    chartInstanceRef.current.data.datasets[0].data = [
      allow || stats.total - stats.blocked - stats.friction,
      friction || stats.friction,
      block || stats.blocked,
    ];
    chartInstanceRef.current.update('none');
  }, [transactions, stats]);

  // ── Live Score History Line Chart ──
  useEffect(() => {
    if (!lineRef.current) return;
    if (lineChartRef.current) lineChartRef.current.destroy();

    lineChartRef.current = new Chart(lineRef.current, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'Fraud Score',
          data: [],
          borderColor: '#06b6d4',
          backgroundColor: (ctx) => {
            const canvas = ctx.chart.ctx;
            const gradient = canvas.createLinearGradient(0, 0, 0, 160);
            gradient.addColorStop(0, 'rgba(6,182,212,0.25)');
            gradient.addColorStop(1, 'rgba(6,182,212,0)');
            return gradient;
          },
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: (ctx) => {
            const val = ctx.parsed?.y ?? 0;
            if (val >= 0.7) return '#f43f5e';
            if (val >= 0.3) return '#f59e0b';
            return '#10b981';
          },
          pointBorderWidth: 0,
          tension: 0.3,
          fill: true,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        scales: {
          x: {
            display: true,
            grid: { color: 'rgba(255,255,255,0.03)' },
            ticks: { color: '#475569', font: { family: 'JetBrains Mono', size: 9 }, maxRotation: 0 },
          },
          y: {
            min: 0, max: 1,
            grid: { color: 'rgba(255,255,255,0.04)' },
            ticks: {
              color: '#475569',
              font: { family: 'JetBrains Mono', size: 10 },
              stepSize: 0.25,
              callback: (v) => `${(Number(v) * 100).toFixed(0)}%`,
            },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1e293b',
            borderColor: 'rgba(255,255,255,0.08)',
            borderWidth: 1,
            titleColor: '#f1f5f9',
            bodyColor: '#94a3b8',
            cornerRadius: 8,
            callbacks: {
              label: (ctx) => `Score: ${((ctx.parsed?.y ?? 0) * 100).toFixed(1)}%`,
            }
          }
        }
      }
    });

    return () => { lineChartRef.current?.destroy(); };
  }, []);

  // Update line chart with latest transaction scores
  useEffect(() => {
    if (!lineChartRef.current) return;
    const recent = transactions.slice(0, 20).reverse();
    lineChartRef.current.data.labels = recent.map((_t, i) => `#${i + 1}`);
    lineChartRef.current.data.datasets[0].data = recent.map(t => t.score);
    lineChartRef.current.update('none');
  }, [transactions]);

  const blockRate    = ((stats.blocked / stats.total) * 100).toFixed(1);
  const frictionRate = ((stats.friction / stats.total) * 100).toFixed(1);

  return (
    <div className="space-y-5">
      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Transactions Processed"
          value={stats.total.toLocaleString()}
          icon={<BarChart3 size={18} />}
          iconBg="rgba(6,182,212,0.12)"
          iconColor="#06b6d4"
          valueColor="#06b6d4"
          topColor="#06b6d4"
          delay={0}
          change={<><span className="text-emerald-400">↑ {tps} TPS</span></>}
        />
        <StatCard
          label="Fraud Blocked"
          value={stats.blocked}
          icon={<Ban size={18} />}
          iconBg="rgba(244,63,94,0.12)"
          iconColor="#f43f5e"
          valueColor="#f43f5e"
          topColor="#f43f5e"
          delay={80}
          change={<><span className="text-emerald-400">↑ {blockRate}%</span><span className="text-slate-500"> block rate</span></>}
        />
        <StatCard
          label="Friction Applied"
          value={stats.friction}
          icon={<AlertTriangle size={18} />}
          iconBg="rgba(245,158,11,0.12)"
          iconColor="#f59e0b"
          valueColor="#f59e0b"
          topColor="#f59e0b"
          delay={160}
          change={<><span className="text-slate-400">{frictionRate}%</span><span className="text-slate-500 ml-1 tracking-tighter">of total</span></>}
        />
        <StatCard
          label="PR-AUC Score"
          value={stats.prauc.toFixed(3)}
          icon={<Target size={18} />}
          iconBg="rgba(16,185,129,0.12)"
          iconColor="#10b981"
          valueColor="#10b981"
          topColor="#10b981"
          delay={240}
          change={<><span className="text-slate-500 uppercase text-[10px] tracking-widest font-bold">Ensemble model</span></>}
        />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Live Feed */}
        <Panel delay={200}>
          <PanelHeader
            icon={<Radio size={18} className="text-cyan-400" />}
            iconBg="rgba(6,182,212,0.12)"
            title="Live Transaction Feed"
            badge={<LiveBadge />}
          />
          <div className="flex flex-col gap-2 overflow-y-auto max-h-[420px] pr-0.5">
            {transactions.slice(0, 9).map((t, i) => (
              <TxnItem key={t.id} txn={t} animate={i === 0} />
            ))}
          </div>
        </Panel>

        {/* Decision Distribution + Threshold */}
        <Panel delay={280}>
          <PanelHeader
            icon={<Activity size={18} className="text-indigo-400" />}
            iconBg="rgba(99,102,241,0.12)"
            title="Decision Distribution"
          />
          <div className="relative h-52">
            <canvas ref={donutRef} />
          </div>

          <div className="mt-4 space-y-4 p-4 rounded-xl border border-white/[0.05] bg-black/10">
            {/* Friction Threshold */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Friction Threshold</span>
                <span className="font-mono text-xs text-amber-400 tabular-nums">{thresholds.friction.toFixed(2)}</span>
              </div>
              <div className="relative">
                <div className="h-1.5 rounded-full" style={{ background: 'linear-gradient(to right, #10b981, #f59e0b, #f43f5e)' }} />
                <input
                  type="range" min={0} max={1} step={0.01}
                  value={thresholds.friction}
                  onChange={e => onThresholdChange('friction', parseFloat(e.target.value))}
                  className="absolute inset-0 w-full opacity-0 cursor-pointer h-1.5"
                  style={{ zIndex: 2 }}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-slate-100 shadow-lg pointer-events-none"
                  style={{ left: `calc(${thresholds.friction * 100}% - 8px)`, boxShadow: '0 0 10px rgba(245,158,11,0.5)' }}
                />
              </div>
            </div>
            {/* Block Threshold */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Block Threshold</span>
                <span className="font-mono text-xs text-rose-400 tabular-nums">{thresholds.block.toFixed(2)}</span>
              </div>
              <div className="relative">
                <div className="h-1.5 rounded-full" style={{ background: 'linear-gradient(to right, #10b981, #f59e0b, #f43f5e)' }} />
                <input
                  type="range" min={0} max={1} step={0.01}
                  value={thresholds.block}
                  onChange={e => onThresholdChange('block', parseFloat(e.target.value))}
                  className="absolute inset-0 w-full opacity-0 cursor-pointer h-1.5"
                  style={{ zIndex: 2 }}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-slate-100 shadow-lg pointer-events-none"
                  style={{ left: `calc(${thresholds.block * 100}% - 8px)`, boxShadow: '0 0 10px rgba(244,63,94,0.5)' }}
                />
              </div>
            </div>
          </div>
        </Panel>

        {/* Live Score History Chart */}
        <Panel delay={320}>
          <PanelHeader
            icon={<TrendingUp size={18} className="text-cyan-400" />}
            iconBg="rgba(6,182,212,0.12)"
            title="Live Fraud Score History"
            badge={<LiveBadge />}
          />
          <div className="relative h-44">
            <canvas ref={lineRef} />
          </div>
          {/* Threshold zone legend */}
          <div className="mt-3 flex gap-4 text-[10px] text-slate-500">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-400"/>
              <span>Allow (&lt;{(thresholds.friction * 100).toFixed(0)}%)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-amber-400"/>
              <span>Friction ({(thresholds.friction * 100).toFixed(0)}-{(thresholds.block * 100).toFixed(0)}%)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-rose-400"/>
              <span>Block (&gt;{(thresholds.block * 100).toFixed(0)}%)</span>
            </div>
          </div>
        </Panel>

        {/* Model Scores */}
        <Panel delay={360}>
          <PanelHeader
            icon={<Cpu size={18} className="text-blue-400" />}
            iconBg="rgba(59,130,246,0.12)"
            title="Active Model Scores"
            badge={
              <span className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                5 Models
              </span>
            }
          />
          <div className="grid grid-cols-2 gap-3">
            {models.map(m => (
              <div
                key={m.key}
                className="p-3.5 rounded-xl border border-white/[0.05] bg-white/[0.02] hover:border-white/[0.1] 
                           hover:bg-white/[0.03] transition-all duration-200"
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{m.name}</span>
                  <span className="text-[10px] text-slate-600 font-mono">{m.latency}ms</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden mb-2">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${m.score * 100}%`, background: m.color }}
                  />
                </div>
                <div className="font-mono text-lg font-bold" style={{ color: m.color }}>
                  {m.score.toFixed(3)}
                </div>
              </div>
            ))}
            {/* Latency summary card */}
            <div className="p-3.5 rounded-xl border border-white/[0.05] bg-white/[0.02] col-span-2">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2.5">Pipeline Latency</div>
              <div className="flex gap-2 items-end">
                {models.map(m => (
                  <div key={m.key} className="flex-1 flex flex-col items-center gap-1.5">
                    <div className="w-full rounded-full overflow-hidden bg-white/[0.05]" style={{ height: '40px', display: 'flex', alignItems: 'flex-end' }}>
                      <div
                        className="w-full rounded-t-sm transition-all duration-500"
                        style={{
                          height: `${(m.latency / 20) * 100}%`,
                          background: m.color,
                          opacity: 0.7,
                          minHeight: '10%'
                        }}
                      />
                    </div>
                    <span className="text-[9px] text-slate-500">{m.latency}ms</span>
                    <span className="text-[9px] font-semibold" style={{ color: m.color }}>{m.key.toUpperCase()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Panel>

        {/* SHAP Explainability */}
        <Panel delay={440}>
          <PanelHeader
            icon={<Search size={18} className="text-emerald-400" />}
            iconBg="rgba(16,185,129,0.12)"
            title="Top Risk Factors (SHAP)"
            badge={
              <span className="text-[11px] font-mono text-slate-500">
                {transactions[0]?.id ?? '—'}
              </span>
            }
          />
          <div className="space-y-2.5">
            {shapFactors.map((f, i) => {
              const isPositive = f.value > 0;
              const width = Math.abs(f.value) * 500;
              return (
                <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-white/[0.02]">
                  <span className="text-[12px] text-slate-400 min-w-[145px] font-mono">{f.label}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(width, 100)}%`, background: f.color }}
                    />
                  </div>
                  <span className="font-mono text-[11px] text-slate-300 min-w-[46px] text-right">
                    {isPositive ? '+' : ''}{f.value.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-4 pt-3 border-t border-white/[0.05] flex gap-4 text-[11px] text-slate-500">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-rose-400"/>
              <span>Increases risk</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400"/>
              <span>Decreases risk</span>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
};

export default OverviewTab;
