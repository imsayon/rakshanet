import React, { useEffect, useRef, useState } from 'react';
import { Panel, PanelHeader } from '../components/Panel';
import { Network, X, Fingerprint, Activity, Clock } from 'lucide-react';
import { buildPayload } from '../data';
import type { TransactionPayload } from '../api';
import type { Transaction } from '../types';
import { AnimatePresence, motion } from 'framer-motion';

interface Node {
  id: string;
  x: number; y: number;
  vx: number; vy: number;
  radius: number;
  color: string;
  pulse: number;
  type: 'normal' | 'suspicious' | 'mule';
  payload: TransactionPayload;
}

interface Edge { a: Node; b: Node; alpha: number; }

const rand = (min: number, max: number) => Math.random() * (max - min) + min;

interface Props {
  transactions?: Transaction[];
}

const NetworkTab: React.FC<Props> = ({ transactions = [] }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef   = useRef<number>(0);
  const nodesRef  = useRef<Map<string, Node>>(new Map());
  const edgesRef  = useRef<Edge[]>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  // Sync transactions to nodes/edges
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const currentNodes = nodesRef.current;
    const newEdges: Edge[] = [];
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    transactions.forEach(t => {
      // Helper to ensure node exists
      const ensureNode = (vpa: string, isSender: boolean) => {
        if (!currentNodes.has(vpa)) {
          let type: Node['type'] = 'normal';
          let color = '#06b6d4'; // normal
          let radius = 4;
          
          if (t.decision === 'BLOCK') {
            type = 'mule'; color = '#f43f5e'; radius = 8;
          } else if (t.decision === 'FRICTION') {
            type = 'suspicious'; color = '#f59e0b'; radius = 6;
          }

          const txnType = type === 'mule' ? 'mule' : type === 'suspicious' ? 'sim_swap' : 'legit';
          
          const demoPayload = buildPayload(txnType);
          currentNodes.set(vpa, {
            id: vpa,
            x: centerX + rand(-50, 50),
            y: centerY + rand(-50, 50),
            vx: 0, vy: 0,
            radius, color, pulse: rand(0, Math.PI * 2),
            type,
            payload: {
              txn_id: t.id,
              user_vpa: isSender ? vpa : t.user,
              payee_vpa: !isSender ? vpa : t.payee,
              amount: t.amount,
              currency: 'INR',
              timestamp: t.timestamp.toISOString(),
              device_id: demoPayload.device_id,
              app_version: demoPayload.app_version,
              remarks: t.remark || '',
              biometrics: demoPayload.biometrics
            }
          });
        } else {
          // Upgrade risk if needed
          const n = currentNodes.get(vpa)!;
          if (t.decision === 'BLOCK' && n.type !== 'mule') {
            n.type = 'mule'; n.color = '#f43f5e'; n.radius = 8;
          } else if (t.decision === 'FRICTION' && n.type === 'normal') {
            n.type = 'suspicious'; n.color = '#f59e0b'; n.radius = 6;
          }
        }
        return currentNodes.get(vpa)!;
      };

      const userNode = ensureNode(t.user, true);
      const payeeNode = ensureNode(t.payee, false);
      
      // Avoid duplicate edges in a simple way
      if (!newEdges.some(e => (e.a === userNode && e.b === payeeNode) || (e.a === payeeNode && e.b === userNode))) {
        newEdges.push({ a: userNode, b: payeeNode, alpha: rand(0.1, 0.4) });
      }
    });

    edgesRef.current = newEdges;
  }, [transactions]);

  // Physics and render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const resize = () => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const nodes = Array.from(nodesRef.current.values());
      const edges = edgesRef.current;
      const k = Math.sqrt((canvas.width * canvas.height) / (nodes.length || 1));
      
      // Force-directed physics
      // 1. Repulsion
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const u = nodes[i], v = nodes[j];
          let dx = u.x - v.x, dy = u.y - v.y;
          let dist = Math.sqrt(dx * dx + dy * dy) || 1;
          if (dist < k * 2) {
            const force = (k * k) / dist;
            const fx = (dx / dist) * force * 0.05;
            const fy = (dy / dist) * force * 0.05;
            u.vx += fx; u.vy += fy;
            v.vx -= fx; v.vy -= fy;
          }
        }
      }

      // 2. Attraction (Springs)
      edges.forEach(e => {
        let dx = e.b.x - e.a.x, dy = e.b.y - e.a.y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist * dist) / k;
        const fx = (dx / dist) * force * 0.01;
        const fy = (dy / dist) * force * 0.01;
        e.a.vx += fx; e.a.vy += fy;
        e.b.vx -= fx; e.b.vy -= fy;
      });

      // 3. Gravity to center & Friction
      const cx = canvas.width / 2, cy = canvas.height / 2;
      nodes.forEach(n => {
        n.vx += (cx - n.x) * 0.01;
        n.vy += (cy - n.y) * 0.01;
        n.vx *= 0.6; // friction
        n.vy *= 0.6;
        n.x += n.vx;
        n.y += n.vy;

        // Bounds check
        n.x = Math.max(10, Math.min(canvas.width - 10, n.x));
        n.y = Math.max(10, Math.min(canvas.height - 10, n.y));
      });

      // Draw Edges
      edges.forEach(e => {
        ctx.beginPath();
        ctx.strokeStyle = `rgba(255,255,255,${e.alpha})`;
        ctx.moveTo(e.a.x, e.a.y);
        ctx.lineTo(e.b.x, e.b.y);
        ctx.stroke();
      });

      // Draw Nodes
      nodes.forEach(n => {
        n.pulse += 0.05;
        const pSize = Math.sin(n.pulse) * 2;
        
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius + pSize, 0, Math.PI * 2);
        ctx.fillStyle = n.color;
        ctx.globalAlpha = 0.4;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fillStyle = n.color;
        ctx.globalAlpha = 1;
        ctx.fill();
        ctx.globalAlpha = 1;
      });

      animRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animRef.current);
      ro.disconnect();
    };
  }, []);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    let clickedNode: Node | null = null;
    const nodes = Array.from(nodesRef.current.values());
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      const dx = clickX - n.x;
      const dy = clickY - n.y;
      if (Math.sqrt(dx * dx + dy * dy) <= n.radius + 10) {
        clickedNode = n;
        break;
      }
    }
    setSelectedNode(clickedNode);
  };

  const nodeStats = Array.from(nodesRef.current.values()).reduce((acc, n) => {
    acc[n.type] = (acc[n.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const LEGEND = [
    { label: 'Money Mule', color: '#f43f5e', count: nodeStats['mule'] || 0 },
    { label: 'Suspicious', color: '#f59e0b', count: nodeStats['suspicious'] || 0 },
    { label: 'Normal', color: '#06b6d4', count: nodeStats['normal'] || 0 },
  ];

  const STATS = [
    { label: 'Graph Nodes', value: nodesRef.current.size.toLocaleString(), color: '#06b6d4' },
    { label: 'Relationships', value: edgesRef.current.length.toLocaleString(), color: '#3b82f6' },
    { label: 'Anomalies', value: (nodeStats['mule'] || 0) + (nodeStats['suspicious'] || 0), color: '#f43f5e' },
    { label: 'P95 Latency', value: '24ms', color: '#10b981' }, // Static representation
  ];

  return (
    <div className="space-y-5 fade-up">
      <Panel>
        <PanelHeader
          icon={<Network size={18} className="text-emerald-400" />}
          iconBg="rgba(16,185,129,0.12)"
          title="Real-time Network Activity"
          badge={
            <span className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-widest flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot" /> LIVE DATA
            </span>
          }
        />

        <canvas
          ref={canvasRef}
          id="network-canvas"
          className="w-full rounded-xl bg-black/20 cursor-pointer"
          style={{ height: '380px' }}
          onClick={handleCanvasClick}
        />

        <p className="text-[11px] text-slate-500 italic mt-3 mb-2">
          Stable force-directed graph powered by real-time transaction streams.
        </p>
        <div className="flex flex-wrap gap-5 mt-2">
          {LEGEND.map(l => (
            <div key={l.label} className="flex items-center gap-2 text-sm text-slate-400">
              <div className="w-3 h-3 rounded-full shadow-lg" style={{ background: l.color, boxShadow: `0 0 8px ${l.color}` }} />
              <span>{l.label}</span>
              <span className="font-mono text-xs text-slate-600">({l.count})</span>
            </div>
          ))}
        </div>
      </Panel>

      {/* GNN Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {STATS.map(s => (
          <div
            key={s.label}
            className="p-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] text-center"
          >
            <div className="font-mono text-2xl font-bold mb-1" style={{ color: s.color }}>{s.value}</div>
            <div className="text-[11px] text-slate-500">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Selected Node Premium Panel Overlay */}
      <AnimatePresence>
        {selectedNode && (
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 50 }}
            className="fixed top-16 right-6 w-96 max-h-[85vh] overflow-y-auto bg-black/60 backdrop-blur-2xl border border-white/10 rounded-2xl p-6 shadow-2xl z-50"
          >
            <button
              onClick={() => setSelectedNode(null)}
              className="absolute top-4 right-4 p-1 rounded-full bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-colors"
            >
              <X size={16} />
            </button>
            
            <div className="flex items-center gap-3 mb-6">
              <div 
                className="w-10 h-10 rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(0,0,0,0.5)]"
                style={{ backgroundColor: `${selectedNode.color}20`, border: `1px solid ${selectedNode.color}50` }}
              >
                <Network size={20} color={selectedNode.color} />
              </div>
              <div>
                <h3 className="font-display font-semibold text-white">Node Identity</h3>
                <p className="text-[11px] font-mono tracking-wider" style={{ color: selectedNode.color }}>
                  {selectedNode.id}
                </p>
              </div>
            </div>

            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="text-[10px] text-white/40 uppercase tracking-widest font-semibold">Latest Txn ID</div>
                  <div className="font-mono text-xs text-white/80 break-all">{selectedNode.payload.txn_id}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] text-white/40 uppercase tracking-widest font-semibold">Risk Classification</div>
                  <div className="font-mono text-xs uppercase font-bold" style={{ color: selectedNode.color }}>
                    {selectedNode.type}
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                <div className="text-[10px] text-white/40 uppercase tracking-widest font-semibold mb-2">Latest Volume</div>
                <div className="font-display text-2xl text-white font-bold">
                  ₹{selectedNode.payload.amount.toLocaleString('en-IN')}
                </div>
                <div className="text-xs text-white/40 mt-1">{selectedNode.payload.remarks || 'No remarks provided'}</div>
              </div>

              <div className="space-y-3">
                <div className="text-[10px] text-white/40 uppercase tracking-widest font-semibold flex items-center gap-1.5">
                  <Fingerprint size={12} /> Biometrics & Telemetry
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-black/40 border border-white/[0.03]">
                    <div className="flex items-center gap-1.5 text-white/30 mb-1">
                      <Clock size={12} /> <span className="text-[10px] uppercase">PIN Latency</span>
                    </div>
                    <div className="font-mono text-sm text-white/80">{selectedNode.payload.biometrics.pin_entry_duration_ms}ms</div>
                  </div>
                  <div className="p-3 rounded-lg bg-black/40 border border-white/[0.03]">
                    <div className="flex items-center gap-1.5 text-white/30 mb-1">
                      <Activity size={12} /> <span className="text-[10px] uppercase">Tap Pressure</span>
                    </div>
                    <div className="font-mono text-sm text-white/80">
                      {selectedNode.payload.biometrics.tap_pressure_avg.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-white/10">
                <div className="text-[10px] text-white/40 uppercase tracking-widest font-semibold mb-2">Raw Payload Inspect</div>
                <pre className="p-3 rounded-xl bg-[#090d18] border border-white/5 text-[10px] font-mono text-cyan-400 overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(selectedNode.payload, null, 2)}
                </pre>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NetworkTab;
