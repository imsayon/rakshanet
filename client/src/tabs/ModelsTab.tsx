import React, { useEffect, useRef, useState } from 'react';
import {
  Chart, LineElement, PointElement, LinearScale, CategoryScale,
  BarElement, BarController, LineController, Filler, Tooltip, Legend
} from 'chart.js';
import {
  LineChart,
  BarChart2,
  Microscope,
  Zap,
  Activity,
  Target
} from 'lucide-react';
import { Panel, PanelHeader } from '../components/Panel';
import type { ModelScore, Transaction } from '../types';

Chart.register(LineElement, PointElement, LinearScale, CategoryScale, BarElement, BarController, LineController, Filler, Tooltip, Legend);

const CHART_OPTIONS_BASE = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { intersect: false },
  plugins: {
    legend: {
      labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 }, usePointStyle: true }
    },
    tooltip: {
      backgroundColor: '#1e293b',
      borderColor: 'rgba(255,255,255,0.08)',
      borderWidth: 1,
      titleColor: '#f1f5f9',
      bodyColor: '#94a3b8',
      cornerRadius: 8,
    }
  },
  scales: {
    x: {
      grid: { color: 'rgba(255,255,255,0.03)' },
      ticks: { color: '#64748b', font: { size: 10 } }
    },
    y: {
      grid: { color: 'rgba(255,255,255,0.03)' },
      ticks: { color: '#64748b', font: { size: 10 } }
    }
  }
};

interface ModelsTabProps {
  models: ModelScore[];
  transactions?: Transaction[];
}

const INITIAL_METRICS = [
  { name: 'Rule Engine', prauc: 0.62, precision: 0.58, recall: 0.72, f1: 0.64, color: '#94a3b8' },
  { name: 'XGBoost',    prauc: 0.84, precision: 0.79, recall: 0.81, f1: 0.80, color: '#3b82f6' },
  { name: 'GNN',        prauc: 0.71, precision: 0.68, recall: 0.74, f1: 0.71, color: '#f97316' },
  { name: 'LSTM',       prauc: 0.68, precision: 0.65, recall: 0.70, f1: 0.67, color: '#8b5cf6' },
  { name: 'NLP',        prauc: 0.75, precision: 0.72, recall: 0.77, f1: 0.74, color: '#06b6d4' },
  { name: 'Ensemble',   prauc: 0.91, precision: 0.88, recall: 0.86, f1: 0.87, color: '#10b981' },
];

const INITIAL_CURVES = {
  ensemble: [1.0, 0.95, 0.92, 0.88, 0.85, 0.81, 0.76, 0.70, 0.62, 0.50, 0.35],
  xgboost:  [1.0, 0.90, 0.85, 0.80, 0.75, 0.70, 0.64, 0.57, 0.48, 0.38, 0.25],
  gnn:      [1.0, 0.88, 0.82, 0.76, 0.70, 0.63, 0.55, 0.47, 0.38, 0.28, 0.18],
};

const ModelsTab: React.FC<ModelsTabProps> = ({ models: _models, transactions = [] }) => {
  const prRef  = useRef<HTMLCanvasElement>(null);
  const barRef = useRef<HTMLCanvasElement>(null);
  const prChart  = useRef<Chart | null>(null);
  const barChart = useRef<Chart | null>(null);

  const [metrics, setMetrics] = useState(INITIAL_METRICS);
  const [curves, setCurves] = useState(INITIAL_CURVES);

  // Dynamic jitter simulation
  useEffect(() => {
    if (!transactions.length) return;
    
    // Apply micro-jitter to simulate real-time training drift
    const jitter = (val: number, maxAmount = 0.005) => {
      const offset = (Math.random() - 0.5) * maxAmount;
      return Math.min(0.99, Math.max(0.01, val + offset));
    };

    setMetrics(prev => prev.map(m => ({
      ...m,
      prauc: jitter(m.prauc),
      precision: jitter(m.precision),
      recall: jitter(m.recall),
      f1: jitter(m.f1),
    })));

    setCurves(prev => ({
      ensemble: prev.ensemble.map(v => jitter(v, 0.002)),
      xgboost: prev.xgboost.map(v => jitter(v, 0.002)),
      gnn: prev.gnn.map(v => jitter(v, 0.002)),
    }));
  }, [transactions]);

  useEffect(() => {
    if (!prRef.current || !barRef.current) return;

    if (prChart.current) prChart.current.destroy();
    prChart.current = new Chart(prRef.current, {
      type: 'line',
      data: {
        labels: ['0.0','0.1','0.2','0.3','0.4','0.5','0.6','0.7','0.8','0.9','1.0'],
        datasets: [
          {
            label: 'Ensemble',
            data: [1.0, 0.95, 0.92, 0.88, 0.85, 0.81, 0.76, 0.70, 0.62, 0.50, 0.35],
            borderColor: '#06b6d4',
            backgroundColor: 'rgba(6,182,212,0.08)',
            fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: '#06b6d4',
          },
          {
            label: 'XGBoost',
            data: [1.0, 0.90, 0.85, 0.80, 0.75, 0.70, 0.64, 0.57, 0.48, 0.38, 0.25],
            borderColor: '#3b82f6',
            borderDash: [5, 5],
            tension: 0.4, pointRadius: 0,
          },
          {
            label: 'GNN',
            data: [1.0, 0.88, 0.82, 0.76, 0.70, 0.63, 0.55, 0.47, 0.38, 0.28, 0.18],
            borderColor: '#f97316',
            borderDash: [3, 3],
            tension: 0.4, pointRadius: 0,
          }
        ]
      },
      options: {
        ...CHART_OPTIONS_BASE,
        scales: {
          ...CHART_OPTIONS_BASE.scales,
          y: { ...CHART_OPTIONS_BASE.scales.y, min: 0, max: 1, title: { display: true, text: 'Precision', color: '#64748b', font: { size: 10 } } },
          x: { ...CHART_OPTIONS_BASE.scales.x, title: { display: true, text: 'Recall', color: '#64748b', font: { size: 10 } } },
        }
      } as never
    });

    if (barChart.current) barChart.current.destroy();
    barChart.current = new Chart(barRef.current, {
      type: 'bar',
      data: {
        labels: ['Rule', 'XGB', 'GNN', 'LSTM', 'NLP', 'Ensemble'],
        datasets: [
          {
            label: 'PR-AUC',
            data: [0.62, 0.84, 0.71, 0.68, 0.75, 0.91],
            backgroundColor: ['#94a3b8','#3b82f6','#f97316','#8b5cf6','#06b6d4','#10b981'],
            borderRadius: 6,
            borderSkipped: false,
          }
        ]
      },
      options: {
        ...CHART_OPTIONS_BASE,
        plugins: { ...CHART_OPTIONS_BASE.plugins, legend: { display: false } },
        scales: {
          ...CHART_OPTIONS_BASE.scales,
          y: { ...CHART_OPTIONS_BASE.scales.y, min: 0, max: 1 }
        }
      } as never
    });

    return () => {
      prChart.current?.destroy();
      barChart.current?.destroy();
    };
  }, []); // Initialize once

  // Update chart data smoothly
  useEffect(() => {
    if (prChart.current) {
      prChart.current.data.datasets[0].data = curves.ensemble;
      prChart.current.data.datasets[1].data = curves.xgboost;
      prChart.current.data.datasets[2].data = curves.gnn;
      prChart.current.update('none');
    }
    if (barChart.current) {
      barChart.current.data.datasets[0].data = metrics.map(m => m.prauc);
      barChart.current.update('none');
    }
  }, [curves, metrics]);

  return (
    <div className="space-y-5 fade-up">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Panel delay={0}>
          <PanelHeader icon={<LineChart size={18} className="text-blue-400" />} iconBg="rgba(59,130,246,0.12)" title="Precision–Recall Curve" />
          <div className="h-72">
            <canvas ref={prRef} />
          </div>
        </Panel>
        <Panel delay={80}>
          <PanelHeader icon={<BarChart2 size={18} className="text-violet-400" />} iconBg="rgba(139,92,246,0.12)" title="Model PR-AUC Comparison" />
          <div className="h-72">
            <canvas ref={barRef} />
          </div>
        </Panel>
      </div>

      {/* Metrics table */}
      <Panel delay={160}>
        <PanelHeader icon={<Microscope size={18} className="text-emerald-400" />} iconBg="rgba(16,185,129,0.12)" title="Detailed Model Metrics" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {['Model', 'PR-AUC', 'Precision', 'Recall', 'F1-Score', 'Status'].map(h => (
                  <th key={h} className="text-left py-2.5 px-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr key={m.name} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: m.color }} />
                      <span className="font-medium text-slate-200">{m.name}</span>
                    </div>
                  </td>
                  {[m.prauc, m.precision, m.recall, m.f1].map((v, j) => (
                    <td key={j} className="py-3 px-3 font-mono text-slate-300">{v.toFixed(2)}</td>
                  ))}
                  <td className="py-3 px-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      m.name === 'Ensemble'
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-blue-500/10 text-blue-400'
                    }`}>
                      {m.name === 'Ensemble' ? 'ACTIVE' : 'STACKED'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
};

export default ModelsTab;
