"use client";

import { useState, useEffect } from "react";
import { clientDb } from "@/lib/firebase-client";
import { doc, onSnapshot, collection, query, orderBy, limit, where, getDocs } from "firebase/firestore";
import { pauseBotAction, resumeBotAction, stopBotAction, clearBotLogs, startBotAction } from "@/actions/bot";
import { getSavedLeadsAction } from "@/actions/leads";
import { Pause, Play, Square, RefreshCw, Wifi, WifiOff, Trash2, Rocket, Users, CheckCircle, AlertCircle, XCircle } from "lucide-react";

interface BotStatus {
  status: string;
  currentLead?: string;
  totalLeads?: number;
  processedLeads?: number;
  errorCount?: number;
  updatedAt?: string;
}

interface LogEntry {
  id: string;
  type: "info" | "error" | "warning";
  message: string;
  leadName?: string;
  timestamp: string;
}

interface LeadStats {
  total: number;
  contacted: number;
  pending: number;
}

export function MonitorClient() {
  const [status, setStatus] = useState<BotStatus>({ status: "idle" });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [leadStats, setLeadStats] = useState<LeadStats>({ total: 0, contacted: 0, pending: 0 });
  const [error, setError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Helper: action with timeout
  const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error("Request timeout")), ms)
      )
    ]);
  };

  // Fetch lead stats from leads_queue collection
  const fetchLeadStats = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const queueRef = collection(clientDb, 'leads_queue');
      
      // Get all leads for today
      const allLeadsQuery = query(queueRef, where('dispatchDate', '==', today));
      const allSnap = await getDocs(allLeadsQuery);
      
      // Count by status
      let pending = 0;
      let sent = 0;
      allSnap.forEach(doc => {
        const data = doc.data();
        if (data.status === 'sent') sent++;
        else if (data.status === 'pending') pending++;
      });
      
      setLeadStats({
        total: allSnap.size,
        contacted: sent,
        pending
      });
    } catch (err) {
      console.error("Error fetching lead stats:", err);
    }
  };

  // Initial fetch and refresh on status change
  useEffect(() => {
    fetchLeadStats();
  }, [status.processedLeads]);

  // Subscribe to bot status
  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(clientDb, "system", "bot_status"),
      (snapshot) => {
        setIsConnected(true);
        setConnectionError(null);
        if (snapshot.exists()) {
          setStatus(snapshot.data() as BotStatus);
        }
      },
      (err) => {
        console.error("Status subscription error:", err);
        setIsConnected(false);
        setConnectionError("Lost connection to server");
      }
    );
    return () => unsubscribe();
  }, []);

  // Subscribe to bot logs
  useEffect(() => {
    const logsQuery = query(
      collection(clientDb, "system", "bot_logs", "entries"),
      orderBy("timestamp", "desc"),
      limit(50)
    );
    
    const unsubscribe = onSnapshot(
      logsQuery,
      (snapshot) => {
        const entries = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as LogEntry[];
        setLogs(entries);
      },
      (err) => {
        console.error("Logs subscription error:", err);
      }
    );
    return () => unsubscribe();
  }, []);

  // Clear error after 3 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const handleStart = async () => {
    setLoading("start");
    setError(null);
    try {
      // Call worker API to start test dispatch
      const workerUrl = process.env.NEXT_PUBLIC_WORKER_URL || 'http://localhost:4000';
      const response = await fetch(`${workerUrl}/trigger/test-dispatch`, {
        method: 'POST',
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to start');
      }
      console.log('Worker dispatch started');
    } catch (err: any) {
      console.error("Failed to start bot:", err);
      setError(err.message || "Failed to start");
    } finally {
      setTimeout(() => setLoading(null), 1000);
    }
  };

  const handlePause = async () => {
    setLoading("pause");
    setError(null);
    try {
      await withTimeout(pauseBotAction(), 15000);
    } catch (err: any) {
      console.error("Failed to pause:", err);
      setError(err.message || "Failed to pause");
    } finally {
      setLoading(null);
    }
  };

  const handleResume = async () => {
    setLoading("resume");
    setError(null);
    try {
      await withTimeout(resumeBotAction(), 15000);
    } catch (err: any) {
      console.error("Failed to resume:", err);
      setError(err.message || "Failed to resume");
    } finally {
      setLoading(null);
    }
  };

  const handleStop = async () => {
    setLoading("stop");
    setError(null);
    try {
      await withTimeout(stopBotAction(), 15000);
    } catch (err: any) {
      console.error("Failed to stop:", err);
      setError(err.message || "Failed to stop");
    } finally {
      setLoading(null);
    }
  };

  const handleClearLogs = async () => {
    setLoading("clear");
    try {
      await withTimeout(clearBotLogs(), 15000);
    } catch (err: any) {
      console.error("Failed to clear logs:", err);
      setError(err.message || "Failed to clear");
    } finally {
      setLoading(null);
    }
  };

  const getStatusColor = () => {
    switch (status.status) {
      case "running": return "bg-green-500";
      case "paused": return "bg-yellow-500";
      case "error": return "bg-red-500";
      case "stopped": return "bg-red-600";
      case "starting": return "bg-blue-500";
      case "waiting_for_scan": return "bg-purple-500";
      default: return "bg-gray-500";
    }
  };

  const getStatusIcon = () => {
    switch (status.status) {
      case "running": return "🟢";
      case "paused": return "🟡";
      case "error": return "🔴";
      case "stopped": return "🛑";
      case "starting": return "🔵";
      case "waiting_for_scan": return "📱";
      default: return "⚪";
    }
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const getLogIcon = (type: string) => {
    switch (type) {
      case "info": return "✅";
      case "error": return "❌";
      case "warning": return "⚠️";
      default: return "📝";
    }
  };

  const isRunning = ["running", "starting", "waiting_for_scan", "paused"].includes(status.status);

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4 max-w-lg mx-auto">
      {/* Error Toast */}
      {error && (
        <div className="fixed top-4 left-4 right-4 max-w-lg mx-auto bg-red-600 text-white px-4 py-3 rounded-xl flex items-center gap-2 shadow-lg z-50 animate-pulse">
          <XCircle className="w-5 h-5 shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Connection Error Banner */}
      {connectionError && (
        <div className="bg-red-900/50 border border-red-600 text-red-200 px-4 py-2 rounded-xl mb-4 flex items-center gap-2">
          <WifiOff className="w-4 h-4" />
          <span className="text-sm">{connectionError}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold flex items-center gap-2">
          🤖 Bot Monitor
        </h1>
        <div className="flex items-center gap-2">
          {isConnected ? (
            <Wifi className="w-5 h-5 text-green-400" />
          ) : (
            <WifiOff className="w-5 h-5 text-red-400" />
          )}
        </div>
      </div>

      {/* Lead Stats Cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-slate-800 rounded-xl p-4 text-center">
          <Users className="w-5 h-5 mx-auto mb-1 text-slate-400" />
          <p className="text-2xl font-bold">{leadStats.total}</p>
          <p className="text-xs text-slate-400">Total Leads</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 text-center">
          <CheckCircle className="w-5 h-5 mx-auto mb-1 text-green-400" />
          <p className="text-2xl font-bold text-green-400">{leadStats.contacted}</p>
          <p className="text-xs text-slate-400">Contacted</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 text-center">
          <AlertCircle className="w-5 h-5 mx-auto mb-1 text-yellow-400" />
          <p className="text-2xl font-bold text-yellow-400">{leadStats.pending}</p>
          <p className="text-xs text-slate-400">Pending</p>
        </div>
      </div>

      {/* Status Card */}
      <div className="bg-slate-800 rounded-2xl p-6 mb-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-slate-400 uppercase tracking-wide">Status</span>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor()}`}>
            {getStatusIcon()} {status.status?.toUpperCase()}
          </span>
        </div>

        {status.currentLead && (
          <div className="mb-4">
            <span className="text-sm text-slate-400">Current Lead</span>
            <p className="text-lg font-medium truncate">{status.currentLead}</p>
          </div>
        )}

        {status.totalLeads && status.totalLeads > 0 && (
          <div className="mb-4">
            <span className="text-sm text-slate-400">Progress</span>
            <div className="flex items-center gap-3 mt-1">
              <div className="flex-1 bg-slate-700 rounded-full h-3">
                <div 
                  className="bg-emerald-500 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${((status.processedLeads || 0) / status.totalLeads) * 100}%` }}
                />
              </div>
              <span className="text-sm font-medium">
                {status.processedLeads || 0}/{status.totalLeads}
              </span>
            </div>
          </div>
        )}

        {status.errorCount !== undefined && status.errorCount > 0 && (
          <div className="flex items-center gap-2 text-red-400">
            <span className="text-sm">Errors: {status.errorCount}</span>
          </div>
        )}
      </div>

      {/* Control Buttons */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {/* Start Button - enabled when idle or stopped */}
        <button
          onClick={handleStart}
          disabled={loading !== null || status.status === 'running' || status.status === 'paused'}
          className="flex flex-col items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 p-4 rounded-xl transition-colors"
        >
          <Rocket className="w-6 h-6" />
          <span className="text-xs font-medium">Start</span>
        </button>

        {/* Pause/Resume Button - only enabled when running or paused */}
        {status.status === "paused" ? (
          <button
            onClick={handleResume}
            disabled={loading !== null}
            className="flex flex-col items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 p-4 rounded-xl transition-colors"
          >
            <Play className="w-6 h-6" />
            <span className="text-xs font-medium">Resume</span>
          </button>
        ) : (
          <button
            onClick={handlePause}
            disabled={loading !== null || status.status !== 'running'}
            className="flex flex-col items-center gap-2 bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 p-4 rounded-xl transition-colors"
          >
            <Pause className="w-6 h-6" />
            <span className="text-xs font-medium">Pause</span>
          </button>
        )}

        {/* Stop Button - only enabled when running or paused */}
        <button
          onClick={handleStop}
          disabled={loading !== null || (status.status !== 'running' && status.status !== 'paused')}
          className="flex flex-col items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 p-4 rounded-xl transition-colors"
        >
          <Square className="w-6 h-6" />
          <span className="text-xs font-medium">Stop</span>
        </button>

        {/* Refresh Button */}
        <button
          onClick={() => { fetchLeadStats(); window.location.reload(); }}
          className="flex flex-col items-center gap-2 bg-slate-700 hover:bg-slate-600 p-4 rounded-xl transition-colors"
        >
          <RefreshCw className="w-6 h-6" />
          <span className="text-xs font-medium">Refresh</span>
        </button>
      </div>

      {/* Live Logs */}
      <div className="bg-slate-800 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <h2 className="font-semibold flex items-center gap-2">
            📋 Live Logs
            <span className="text-xs bg-slate-700 px-2 py-0.5 rounded-full">{logs.length}</span>
          </h2>
          <button
            onClick={handleClearLogs}
            disabled={loading === "clear"}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {logs.length === 0 ? (
            <p className="text-center text-slate-500 py-8">No logs yet</p>
          ) : (
            <ul className="divide-y divide-slate-700">
              {logs.map((log) => (
                <li key={log.id} className="px-4 py-3 hover:bg-slate-700/50">
                  <div className="flex items-start gap-2">
                    <span className="text-lg">{getLogIcon(log.type)}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${log.type === "error" ? "text-red-400" : log.type === "warning" ? "text-yellow-400" : "text-slate-200"}`}>
                        {log.message}
                      </p>
                      {log.leadName && (
                        <p className="text-xs text-slate-500 truncate">{log.leadName}</p>
                      )}
                    </div>
                    <span className="text-xs text-slate-500 whitespace-nowrap">
                      {formatTime(log.timestamp)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Footer */}
      <p className="text-center text-slate-600 text-xs mt-6">
        Last updated: {status.updatedAt ? formatTime(status.updatedAt) : "Never"}
      </p>
    </div>
  );
}
