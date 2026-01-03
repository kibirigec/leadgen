"use client";

import { useState, useEffect } from "react";
import { clientDb } from "@/lib/firebase-client";
import { doc, onSnapshot, collection, query, orderBy, limit, where, getDocs, getCountFromServer } from "firebase/firestore";
import { pauseBotAction, resumeBotAction, stopBotAction, clearBotLogs, getSettings, setTestMode, setScrapeEnabled, setDispatchEnabled, setCronTime } from "@/actions/bot";
import { Pause, Play, Square, RefreshCw, Wifi, WifiOff, Trash2, Rocket, Users, CheckCircle, AlertCircle, XCircle, Bell, BellOff, Zap, X, Loader2, Package, Calendar, History, FlaskConical, Settings, Sunrise, Sun, Moon, RotateCcw, CalendarClock, Clock } from "lucide-react";
import { requestNotificationPermission, areNotificationsEnabled, onForegroundMessage, initMessaging } from "@/lib/notifications";
import { getNextScrapeDetails } from "@/lib/client-rotation";

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
  sentToday: number;
  pendingToday: number;
  totalContacted: number;
  backlog: number;
}

interface WindowStats {
  morning: { pending: number; sent: number };
  lunch: { pending: number; sent: number };
  evening: { pending: number; sent: number };
}


interface CronTime {
  hour: number;
  minute: number;
}

interface SystemSettings {
  testMode: boolean;
  testPhone: string;
  scrapeEnabled: boolean;
  dispatchEnabled: boolean;
  cronTimes: {
    scrape: CronTime;
    morning: CronTime;
    lunch: CronTime;
    evening: CronTime;
  };
}

const DEFAULT_CRON_TIMES = {
  scrape: { hour: 5, minute: 0 },
  morning: { hour: 6, minute: 30 },
  lunch: { hour: 12, minute: 30 },
  evening: { hour: 19, minute: 30 },
};

export function MonitorClient() {
  const [status, setStatus] = useState<BotStatus>({ status: "idle" });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [leadStats, setLeadStats] = useState<LeadStats>({ sentToday: 0, pendingToday: 0, totalContacted: 0, backlog: 0 });
  const [windowStats, setWindowStats] = useState<WindowStats>({
    morning: { pending: 0, sent: 0 },
    lunch: { pending: 0, sent: 0 },
    evening: { pending: 0, sent: 0 },
  });
  const [error, setError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [reservePool, setReservePool] = useState({ morning: 0, lunch: 0, evening: 0, total: 0 });

  // Settings state
  const [settings, setSettings] = useState<SystemSettings>({ 
    testMode: false, 
    testPhone: "", 
    scrapeEnabled: true, 
    dispatchEnabled: true,
    cronTimes: DEFAULT_CRON_TIMES,
  });
  const [showTestSettings, setShowTestSettings] = useState(false);
  const [testPhoneInput, setTestPhoneInput] = useState("");

  // Time picker modal state
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [timePickerTarget, setTimePickerTarget] = useState<'scrape' | 'morning' | 'lunch' | 'evening'>('scrape');
  const [timePickerHour, setTimePickerHour] = useState(5);
  const [timePickerMinute, setTimePickerMinute] = useState(0);

  // Modal state
  const [selectedView, setSelectedView] = useState<'contacted' | 'pending' | 'reserve' | 'backlog' | null>(null);
  const [selectedWindow, setSelectedWindow] = useState<string | null>(null);
  const [detailedLeads, setDetailedLeads] = useState<any[]>([]);
  const [modalLoading, setModalLoading] = useState(false);

  // Helper: action with timeout
  const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error("Request timeout")), ms)
      )
    ]);
  };

  // Get current dispatch window based on EAT time (UTC+3)
  const getCurrentWindow = (): 'morning' | 'lunch' | 'evening' => {
    const now = new Date();
    const eatHour = (now.getUTCHours() + 3) % 24;
    if (eatHour >= 5 && eatHour < 12) return 'morning';
    if (eatHour >= 12 && eatHour < 17) return 'lunch';
    return 'evening';
  };

  const fetchDetailedLeads = async (type: 'contacted' | 'pending' | 'reserve' | 'backlog', windowFilter?: string) => {
    setModalLoading(true);
    setSelectedView(type);
    setSelectedWindow(windowFilter || null);
    setDetailedLeads([]);
    
    try {
      const today = new Date().toISOString().split('T')[0];
      const currentWindow = getCurrentWindow();
      
      let q;
      if (type === 'contacted') {
        if (windowFilter) {
          // Show contacted for specific window
          q = query(
            collection(clientDb, "leads_queue"),
            where("status", "==", "sent"),
            where("timeWindow", "==", windowFilter),
            limit(50)
          );
        } else {
          // Show ALL contacted (total)
          q = query(
            collection(clientDb, "leads_queue"),
            where("status", "==", "sent"),
            limit(50)
          );
        }
      } else if (type === 'reserve') {
        // Show reserve pool leads
        q = query(
          collection(clientDb, "reserve_pool"),
          limit(50)
        );
      } else if (type === 'backlog') {
        // Show backlog (pending from previous days OR missing date)
        // Note: We avoid filtering by date in Firestore because it hides docs with missing/null dates.
        q = query(
          collection(clientDb, "leads_queue"),
          where("status", "==", "pending"),
          limit(300) // Increase limit to potentially catch mixed backlog + today
        );
        
        // We'll filter client-side below
      } else {
        // Show pending for current window (TODAY ONLY)
        const targetWindow = windowFilter || currentWindow;
        q = query(
          collection(clientDb, "leads_queue"),
          where("dispatchDate", "==", today),
          where("timeWindow", "==", targetWindow),
          where("status", "==", "pending"),
          limit(50)
        );
      }
      
      const snap = await getDocs(q);
      let leads = snap.docs.map(d => d.data());
      
      if (type === 'backlog') {
        // Client-side filter: Remove leads scheduled for today
        // This keeps leads with missing dates or past dates
        leads = leads.filter(l => l.dispatchDate !== today).slice(0, 50);
      }
      
      setDetailedLeads(leads);
    } catch (err) {
      console.error("Error fetching details:", err);
    } finally {
      setModalLoading(false);
    }
  };

  // Fetch lead stats from leads_queue collection
  const fetchLeadStats = async () => {
    try {
      const queueRef = collection(clientDb, 'leads_queue');
      const currentWindow = getCurrentWindow();
      
      const today = new Date().toISOString().split('T')[0];
      
      // 1. Get ALL Pending (to calculate Today vs Backlog in memory)
      // We do this because legacy leads might lack 'dispatchDate', causing Firestore filters to hide them.
      const pendingQuery = query(
        queueRef,
        where('status', '==', 'pending')
      );
      
      // 2. Get ALL Sent (to calculate Today vs History in memory)
      const sentQuery = query(
        queueRef,
        where('status', '==', 'sent')
      );

      const [pendingSnap, sentSnap] = await Promise.all([
        getDocs(pendingQuery),
        getDocs(sentQuery)
      ]);
      
      // Count Today's by status and window
      let pendingToday = 0;
      let sentToday = 0;
      // Backlog = Total Pending - Pending Today
      // Total Contacted = Total Sent
      
      const windows = {
        morning: { pending: 0, sent: 0 },
        lunch: { pending: 0, sent: 0 },
        evening: { pending: 0, sent: 0 },
      };
      
      // Process Pending
      pendingSnap.forEach(doc => {
        const data = doc.data();
        const win = data.timeWindow as 'morning' | 'lunch' | 'evening';
        
        if (data.dispatchDate === today) {
          pendingToday++;
          if (win && windows[win]) windows[win].pending++;
        }
        // Else it's backlog (counted implicitly by subtraction or explicitly)
      });

      // Process Sent
      sentSnap.forEach(doc => {
        const data = doc.data();
        const win = data.timeWindow as 'morning' | 'lunch' | 'evening';
        
        if (data.dispatchDate === today) {
          sentToday++;
          if (win && windows[win]) windows[win].sent++;
        }
      });
      
      setLeadStats({
        sentToday,
        pendingToday,
        totalContacted: sentSnap.size,
        backlog: pendingSnap.size - pendingToday
      });
      setWindowStats(windows);
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

  // Subscribe to settings
  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(clientDb, "system", "settings"),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setSettings({
            testMode: data.testMode ?? false,
            testPhone: data.testPhone ?? "",
            scrapeEnabled: data.scrapeEnabled ?? true,
            dispatchEnabled: data.dispatchEnabled ?? true,
            cronTimes: {
              scrape: data.cronTimes?.scrape ?? DEFAULT_CRON_TIMES.scrape,
              morning: data.cronTimes?.morning ?? DEFAULT_CRON_TIMES.morning,
              lunch: data.cronTimes?.lunch ?? DEFAULT_CRON_TIMES.lunch,
              evening: data.cronTimes?.evening ?? DEFAULT_CRON_TIMES.evening,
            },
          });
          setTestPhoneInput(data.testPhone ?? "");
        }
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

  // Check notification status on mount
  useEffect(() => {
    const checkNotifications = async () => {
      setNotificationsEnabled(areNotificationsEnabled());
      await initMessaging();
      
      // Listen for foreground messages
      const unsubscribe = onForegroundMessage((payload) => {
        console.log('Foreground notification:', payload);
      });
      
      return unsubscribe;
    };
    
    checkNotifications();
  }, []);

  // Fetch reserve pool stats
  const fetchReservePool = async () => {
    try {
      const poolRef = collection(clientDb, 'reserve_pool');
      const snapshot = await getDocs(query(poolRef, where('status', '==', 'available')));
      
      const stats = { morning: 0, lunch: 0, evening: 0, total: 0 };
      snapshot.forEach(doc => {
        const win = doc.data().timeWindow as 'morning' | 'lunch' | 'evening';
        if (win && stats.hasOwnProperty(win)) {
          stats[win]++;
          stats.total++;
        }
      });
      
      setReservePool(stats);
    } catch (err) {
      console.error('Error fetching reserve pool:', err);
    }
  };

  // Fetch reserve pool on mount and after scrapes
  useEffect(() => {
    fetchReservePool();
  }, [status.status]);

  // Enable/disable notifications
  const handleToggleNotifications = async () => {
    if (notificationsEnabled) {
      // Can't disable programmatically - tell user
      setError('Use browser settings to disable notifications');
      return;
    }
    
    setLoading('notifications');
    try {
      const token = await requestNotificationPermission();
      setNotificationsEnabled(!!token);
      if (token) {
        console.log('Notifications enabled with token:', token);
      }
    } catch (err) {
      setError('Failed to enable notifications');
    } finally {
      setLoading(null);
    }
  };

  // Quick trigger functions
  const handleTriggerScrape = async () => {
    setLoading('scrape');
    try {
      const workerUrl = process.env.NEXT_PUBLIC_WORKER_URL || 'http://localhost:4000';
      const res = await fetch(`${workerUrl}/trigger/scrape`, { method: 'POST' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      await fetchLeadStats();
      await fetchReservePool();
    } catch (err: any) {
      setError(err.message || 'Scrape failed');
    } finally {
      setLoading(null);
    }
  };

  const triggerDispatch = async (window: 'morning' | 'lunch' | 'evening') => {
    setLoading(`dispatch-${window}`);
    try {
      const workerUrl = process.env.NEXT_PUBLIC_WORKER_URL || 'http://localhost:4000';
      const res = await fetch(`${workerUrl}/trigger/dispatch/${window}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
    } catch (err: any) {
      setError(err.message || 'Dispatch failed');
    } finally {
      setLoading(null);
    }
  };

  const handleToggleTestMode = async () => {
    if (settings.testMode) {
      // Disable test mode
      setLoading('testmode');
      try {
        await setTestMode(false, settings.testPhone);
        setShowTestSettings(false);
      } catch (err: any) {
        setError(err.message || 'Failed to update');
      } finally {
        setLoading(null);
      }
    } else {
      // Show settings modal to enable
      setShowTestSettings(true);
    }
  };

  const handleSaveTestMode = async () => {
    if (!testPhoneInput) {
      setError('Test phone number required');
      return;
    }
    setLoading('testmode');
    try {
      await setTestMode(true, testPhoneInput);
      setShowTestSettings(false);
    } catch (err: any) {
      setError(err.message || 'Failed to enable test mode');
    } finally {
      setLoading(null);
    }
  };

  const handleStart = async () => {
    setLoading("start");
    setError(null);
    try {
      // Call worker API to resume dispatch for current time window
      const workerUrl = process.env.NEXT_PUBLIC_WORKER_URL || 'http://localhost:4000';
      const response = await fetch(`${workerUrl}/trigger/dispatch-current`, {
        method: 'POST',
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to start');
      }
      const data = await response.json();
      console.log(`Dispatch started for ${data.window} window`);
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

  const handleSaveTime = async () => {
    setLoading('timepicker');
    try {
      await setCronTime(timePickerTarget, timePickerHour, timePickerMinute);
      setTimePickerOpen(false);
    } catch (err: any) {
      console.error("Failed to save time:", err);
      setError(err.message || "Failed to save time");
    } finally {
      setLoading(null);
    }
  };

  const getStatusColor = () => {
    switch (status.status) {
      case "running": return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_15px_-3px_rgba(16,185,129,0.1)]";
      case "paused": return "bg-amber-500/10 text-amber-400 border border-amber-500/20";
      case "error": return "bg-rose-500/10 text-rose-400 border border-rose-500/20";
      case "stopped": return "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20";
      case "starting": return "bg-blue-500/10 text-blue-400 border border-blue-500/20";
      case "waiting_for_scan": return "bg-purple-500/10 text-purple-400 border border-purple-500/20";
      default: return "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20";
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

  if (loading === 'initial') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-950 text-zinc-500">
        <Loader2 className="w-8 h-8 animate-spin mb-4" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 p-4 max-w-lg mx-auto pb-24 font-sans selection:bg-zinc-800">
      {/* Error Toast */}
      {error && (
        <div className="fixed top-4 left-4 right-4 max-w-lg mx-auto bg-rose-500/10 border border-rose-500/20 backdrop-blur-md text-rose-400 px-4 py-3 rounded-xl flex items-center gap-2 shadow-2xl z-50 animate-in slide-in-from-top-2">
          <XCircle className="w-5 h-5 shrink-0" />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      {/* Test Mode Banner */}
      {settings.testMode && (
        <div className="mb-4 bg-orange-500/10 border border-orange-500/30 rounded-xl p-3 flex items-center gap-3">
          <FlaskConical className="w-5 h-5 text-orange-400" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-orange-400">🧪 TEST MODE ACTIVE</p>
            <p className="text-xs text-orange-400/70">Messages → {settings.testPhone}</p>
          </div>
          <button 
            onClick={handleToggleTestMode}
            className="text-xs px-2 py-1 bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 rounded-lg"
          >
            Disable
          </button>
        </div>
      )}

      {/* Manual Cron Triggers */}
      <div className="mb-4 bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-zinc-400" />
            <span className="text-xs text-zinc-300 font-semibold uppercase tracking-wider">Manual Controls</span>
          </div>
        </div>

        {/* Global Controls */}
        <div className="grid grid-cols-3 gap-3 mb-4 p-3 bg-zinc-900/50 rounded-xl border border-zinc-800/50">
          {/* Scrape Toggle */}
          <button
            onClick={async () => {
              setLoading('scrape-toggle');
              await setScrapeEnabled(!settings.scrapeEnabled);
              setLoading(null);
            }}
            className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              settings.scrapeEnabled 
                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/20' 
                : 'bg-zinc-800/50 text-zinc-500 border border-zinc-700/50 hover:bg-zinc-800'
            }`}
          >
            <div className={`w-1.5 h-1.5 rounded-full ${settings.scrapeEnabled ? 'bg-purple-500 animate-pulse' : 'bg-zinc-600'}`} />
            <span className="truncate">{settings.scrapeEnabled ? 'Scrape Active' : 'Scrape Paused'}</span>
          </button>

          {/* Dispatch Toggle */}
          <button
            onClick={async () => {
              setLoading('dispatch-toggle');
              await setDispatchEnabled(!settings.dispatchEnabled);
              setLoading(null);
            }}
            className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              settings.dispatchEnabled 
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/20' 
                : 'bg-zinc-800/50 text-zinc-500 border border-zinc-700/50 hover:bg-zinc-800'
            }`}
          >
            <div className={`w-1.5 h-1.5 rounded-full ${settings.dispatchEnabled ? 'bg-blue-500 animate-pulse' : 'bg-zinc-600'}`} />
            <span className="truncate">{settings.dispatchEnabled ? 'Dispatch Active' : 'Dispatch Paused'}</span>
          </button>

          {/* Test Mode Toggle */}
          <button
            onClick={handleToggleTestMode}
            className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              settings.testMode 
                ? 'bg-orange-500/20 text-orange-400 border border-orange-500/20' 
                : 'bg-zinc-800/50 text-zinc-500 border border-zinc-700/50 hover:bg-zinc-800'
            }`}
          >
            <div className={`w-1.5 h-1.5 rounded-full ${settings.testMode ? 'bg-orange-500 animate-pulse' : 'bg-zinc-600'}`} />
            <span className="truncate">{settings.testMode ? 'Test Mode On' : 'Test Mode Off'}</span>
          </button>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <button
            onClick={handleTriggerScrape}
            disabled={loading !== null || !settings.scrapeEnabled}
            className={`group relative flex flex-col items-center justify-center gap-2 p-3 rounded-xl border transition-all duration-300 disabled:opacity-50 ${
              settings.scrapeEnabled 
                ? 'bg-purple-500/10 border-purple-500/20 hover:bg-purple-500/20 hover:border-purple-500/30 text-purple-400' 
                : 'bg-zinc-800/30 border-zinc-800 text-zinc-600'
            }`}
          >
            <div className={`p-2 rounded-full ${settings.scrapeEnabled ? 'bg-purple-500/20 group-hover:bg-purple-500/30' : 'bg-zinc-800'} transition-colors`}>
              {loading === 'scrape' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            </div>
            <span className="text-[10px] font-medium tracking-wide">SCRAPE</span>
          </button>

          <button
            onClick={() => triggerDispatch('morning')}
            disabled={loading !== null || !settings.dispatchEnabled}
            className={`group relative flex flex-col items-center justify-center gap-2 p-3 rounded-xl border transition-all duration-300 disabled:opacity-50 ${
              settings.dispatchEnabled 
                ? 'bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20 hover:border-blue-500/30 text-blue-400' 
                : 'bg-zinc-800/30 border-zinc-800 text-zinc-600'
            }`}
          >
            <div className={`p-2 rounded-full ${settings.dispatchEnabled ? 'bg-blue-500/20 group-hover:bg-blue-500/30' : 'bg-zinc-800'} transition-colors`}>
              {loading === 'dispatch-morning' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sunrise className="w-4 h-4" />}
            </div>
            <span className="text-[10px] font-medium tracking-wide">MORNING</span>
          </button>

          <button
            onClick={() => triggerDispatch('lunch')}
            disabled={loading !== null || !settings.dispatchEnabled}
            className={`group relative flex flex-col items-center justify-center gap-2 p-3 rounded-xl border transition-all duration-300 disabled:opacity-50 ${
              settings.dispatchEnabled 
                ? 'bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/20 hover:border-amber-500/30 text-amber-400' 
                : 'bg-zinc-800/30 border-zinc-800 text-zinc-600'
            }`}
          >
            <div className={`p-2 rounded-full ${settings.dispatchEnabled ? 'bg-amber-500/20 group-hover:bg-amber-500/30' : 'bg-zinc-800'} transition-colors`}>
              {loading === 'dispatch-lunch' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sun className="w-4 h-4" />}
            </div>
            <span className="text-[10px] font-medium tracking-wide">LUNCH</span>
          </button>

          <button
            onClick={() => triggerDispatch('evening')}
            disabled={loading !== null || !settings.dispatchEnabled}
            className={`group relative flex flex-col items-center justify-center gap-2 p-3 rounded-xl border transition-all duration-300 disabled:opacity-50 ${
              settings.dispatchEnabled 
                ? 'bg-indigo-500/10 border-indigo-500/20 hover:bg-indigo-500/20 hover:border-indigo-500/30 text-indigo-400' 
                : 'bg-zinc-800/30 border-zinc-800 text-zinc-600'
            }`}
          >
            <div className={`p-2 rounded-full ${settings.dispatchEnabled ? 'bg-indigo-500/20 group-hover:bg-indigo-500/30' : 'bg-zinc-800'} transition-colors`}>
              {loading === 'dispatch-evening' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Moon className="w-4 h-4" />}
            </div>
            <span className="text-[10px] font-medium tracking-wide">EVENING</span>
          </button>
        </div>
      </div>

      {/* Cron Schedule */}
      <div className="mb-4 bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-zinc-400" />
            <span className="text-xs text-zinc-300 font-semibold uppercase tracking-wider">Automated Schedule (EAT)</span>
          </div>
          <span className="text-[10px] text-zinc-500 bg-zinc-800/50 px-2 py-0.5 rounded-full">Click time to edit</span>
        </div>
        <div className="grid grid-cols-4 gap-3 mb-4">
          <button
            onClick={() => {
              setTimePickerTarget('scrape');
              setTimePickerHour(settings.cronTimes?.scrape?.hour ?? DEFAULT_CRON_TIMES.scrape.hour);
              setTimePickerMinute(settings.cronTimes?.scrape?.minute ?? DEFAULT_CRON_TIMES.scrape.minute);
              setTimePickerOpen(true);
            }}
            className={`relative overflow-hidden group p-3 rounded-xl border transition-all duration-300 flex flex-col items-center justify-center ${
              settings.scrapeEnabled 
                ? 'bg-zinc-900 border-purple-500/30 hover:border-purple-500/60 shadow-[0_0_15px_-3px_rgba(168,85,247,0.15)]' 
                : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <div className={`text-lg font-mono font-bold mb-1 ${settings.scrapeEnabled ? 'text-purple-400' : 'text-zinc-500'}`}>
              {settings.cronTimes?.scrape?.hour ?? DEFAULT_CRON_TIMES.scrape.hour}:{String(settings.cronTimes?.scrape?.minute ?? DEFAULT_CRON_TIMES.scrape.minute).padStart(2, '0')}
            </div>
            <div className="flex items-center justify-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${settings.scrapeEnabled ? 'bg-purple-500 animate-pulse' : 'bg-zinc-700'}`} />
              <span className={`text-[10px] font-medium uppercase tracking-wider ${settings.scrapeEnabled ? 'text-purple-300' : 'text-zinc-600'}`}>Scrape</span>
            </div>
          </button>

          <button
            onClick={() => {
              setTimePickerTarget('morning');
              setTimePickerHour(settings.cronTimes?.morning?.hour ?? DEFAULT_CRON_TIMES.morning.hour);
              setTimePickerMinute(settings.cronTimes?.morning?.minute ?? DEFAULT_CRON_TIMES.morning.minute);
              setTimePickerOpen(true);
            }}
            className={`relative overflow-hidden group p-3 rounded-xl border transition-all duration-300 flex flex-col items-center justify-center ${
              settings.dispatchEnabled 
                ? 'bg-zinc-900 border-blue-500/30 hover:border-blue-500/60 shadow-[0_0_15px_-3px_rgba(59,130,246,0.15)]' 
                : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <div className={`text-lg font-mono font-bold mb-1 ${settings.dispatchEnabled ? 'text-blue-400' : 'text-zinc-500'}`}>
              {settings.cronTimes?.morning?.hour ?? DEFAULT_CRON_TIMES.morning.hour}:{String(settings.cronTimes?.morning?.minute ?? DEFAULT_CRON_TIMES.morning.minute).padStart(2, '0')}
            </div>
            <div className="flex items-center justify-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${settings.dispatchEnabled ? 'bg-blue-500 animate-pulse' : 'bg-zinc-700'}`} />
              <span className={`text-[10px] font-medium uppercase tracking-wider ${settings.dispatchEnabled ? 'text-blue-300' : 'text-zinc-600'}`}>Morning</span>
            </div>
          </button>

          <button
            onClick={() => {
              setTimePickerTarget('lunch');
              setTimePickerHour(settings.cronTimes?.lunch?.hour ?? DEFAULT_CRON_TIMES.lunch.hour);
              setTimePickerMinute(settings.cronTimes?.lunch?.minute ?? DEFAULT_CRON_TIMES.lunch.minute);
              setTimePickerOpen(true);
            }}
            className={`relative overflow-hidden group p-3 rounded-xl border transition-all duration-300 flex flex-col items-center justify-center ${
              settings.dispatchEnabled 
                ? 'bg-zinc-900 border-amber-500/30 hover:border-amber-500/60 shadow-[0_0_15px_-3px_rgba(245,158,11,0.15)]' 
                : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <div className={`text-lg font-mono font-bold mb-1 ${settings.dispatchEnabled ? 'text-amber-400' : 'text-zinc-500'}`}>
              {settings.cronTimes?.lunch?.hour ?? DEFAULT_CRON_TIMES.lunch.hour}:{String(settings.cronTimes?.lunch?.minute ?? DEFAULT_CRON_TIMES.lunch.minute).padStart(2, '0')}
            </div>
            <div className="flex items-center justify-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${settings.dispatchEnabled ? 'bg-amber-500 animate-pulse' : 'bg-zinc-700'}`} />
              <span className={`text-[10px] font-medium uppercase tracking-wider ${settings.dispatchEnabled ? 'text-amber-300' : 'text-zinc-600'}`}>Lunch</span>
            </div>
          </button>

          <button
            onClick={() => {
              setTimePickerTarget('evening');
              setTimePickerHour(settings.cronTimes?.evening?.hour ?? DEFAULT_CRON_TIMES.evening.hour);
              setTimePickerMinute(settings.cronTimes?.evening?.minute ?? DEFAULT_CRON_TIMES.evening.minute);
              setTimePickerOpen(true);
            }}
            className={`relative overflow-hidden group p-3 rounded-xl border transition-all duration-300 flex flex-col items-center justify-center ${
              settings.dispatchEnabled 
                ? 'bg-zinc-900 border-indigo-500/30 hover:border-indigo-500/60 shadow-[0_0_15px_-3px_rgba(99,102,241,0.15)]' 
                : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <div className={`text-lg font-mono font-bold mb-1 ${settings.dispatchEnabled ? 'text-indigo-400' : 'text-zinc-500'}`}>
              {settings.cronTimes?.evening?.hour ?? DEFAULT_CRON_TIMES.evening.hour}:{String(settings.cronTimes?.evening?.minute ?? DEFAULT_CRON_TIMES.evening.minute).padStart(2, '0')}
            </div>
            <div className="flex items-center justify-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${settings.dispatchEnabled ? 'bg-indigo-500 animate-pulse' : 'bg-zinc-700'}`} />
              <span className={`text-[10px] font-medium uppercase tracking-wider ${settings.dispatchEnabled ? 'text-indigo-300' : 'text-zinc-600'}`}>Evening</span>
            </div>
          </button>
        </div>

        {/* Reschedule button */}
        <button
          onClick={async () => {
            setLoading('reschedule');
            try {
              const workerUrl = process.env.NEXT_PUBLIC_WORKER_URL || 'http://localhost:4000';
              await fetch(`${workerUrl}/reschedule`, { method: 'POST' });
            } catch (err: any) {
              setError(err.message);
            } finally {
              setLoading(null);
            }
          }}
          disabled={loading !== null}
          className="w-full relative group overflow-hidden bg-gradient-to-r from-emerald-500/10 to-teal-500/10 hover:from-emerald-500/20 hover:to-teal-500/20 border border-emerald-500/30 hover:border-emerald-500/50 text-emerald-400 hover:text-emerald-300 p-3 rounded-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="flex items-center justify-center gap-2">
            {loading === 'reschedule' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RotateCcw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
            )}
            <span className="text-sm font-semibold tracking-wide">
              {loading === 'reschedule' ? 'APPLYING CHANGES...' : 'APPLY SCHEDULE CHANGES'}
            </span>
          </div>
          {/* Subtle shine effect */}
          <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        </button>
      </div>



      {/* Test Settings Modal */}
      {showTestSettings && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 rounded-2xl p-6 max-w-sm w-full border border-zinc-800">
            <h3 className="text-lg font-semibold text-zinc-100 mb-4 flex items-center gap-2">
              <FlaskConical className="w-5 h-5 text-orange-400" />
              Enable Test Mode
            </h3>
            <p className="text-sm text-zinc-400 mb-4">
              All messages will be sent to this phone number instead of the actual leads.
            </p>
            <input
              type="tel"
              value={testPhoneInput}
              onChange={(e) => setTestPhoneInput(e.target.value)}
              placeholder="256700000000"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-100 mb-4 focus:outline-none focus:border-orange-500"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowTestSettings(false)}
                className="flex-1 py-2 text-zinc-400 hover:bg-zinc-800 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTestMode}
                disabled={loading === 'testmode'}
                className="flex-1 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl disabled:opacity-50"
              >
                {loading === 'testmode' ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Enable'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Time Picker Modal - Apple Style */}
      {timePickerOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[60] p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-900/90 border border-white/10 rounded-3xl p-6 max-w-[320px] w-full shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-lg font-semibold text-white tracking-tight flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-500" />
                Set Time
              </h3>
              <button 
                onClick={() => setTimePickerOpen(false)}
                className="text-zinc-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex items-center justify-center gap-4 mb-8">
              {/* Hour Input */}
              <div className="flex flex-col items-center gap-2">
                <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Hour</label>
                <div className="relative group">
                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={timePickerHour}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (!isNaN(val) && val >= 0 && val <= 23) setTimePickerHour(val);
                    }}
                    className="w-20 h-24 bg-zinc-800/50 rounded-2xl text-center text-4xl font-light text-white border border-white/5 focus:border-blue-500/50 focus:bg-zinc-800 transition-all outline-none"
                  />
                  <div className="absolute inset-x-0 -bottom-6 flex justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => setTimePickerHour(h => h > 0 ? h - 1 : 23)}
                      className="p-1 hover:bg-white/10 rounded-full text-zinc-400"
                    >
                      <img src="/icons/minus.svg" className="w-4 h-4 hidden" alt="" />-
                    </button>
                    <button 
                      onClick={() => setTimePickerHour(h => h < 23 ? h + 1 : 0)}
                      className="p-1 hover:bg-white/10 rounded-full text-zinc-400"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              <div className="text-4xl font-light text-zinc-600 pb-6">:</div>

              {/* Minute Input */}
              <div className="flex flex-col items-center gap-2">
                <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Minute</label>
                <div className="relative group">
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={timePickerMinute}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (!isNaN(val) && val >= 0 && val <= 59) setTimePickerMinute(val);
                    }}
                    className="w-20 h-24 bg-zinc-800/50 rounded-2xl text-center text-4xl font-light text-white border border-white/5 focus:border-blue-500/50 focus:bg-zinc-800 transition-all outline-none"
                  />
                   <div className="absolute inset-x-0 -bottom-6 flex justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => setTimePickerMinute(m => m > 0 ? m - 1 : 59)}
                      className="p-1 hover:bg-white/10 rounded-full text-zinc-400"
                    >
                      -
                    </button>
                    <button 
                      onClick={() => setTimePickerMinute(m => m < 59 ? m + 1 : 0)}
                      className="p-1 hover:bg-white/10 rounded-full text-zinc-400"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="text-center text-xs text-zinc-500 font-medium mb-8 bg-zinc-800/50 py-2 rounded-lg">
              Time Zone: East Africa Time (UTC+3)
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setTimePickerOpen(false)}
                className="flex-1 py-3.5 text-sm font-medium text-zinc-400 hover:bg-white/5 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTime}
                disabled={loading === 'timepicker'}
                className="flex-1 py-3.5 text-sm font-medium bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded-xl disabled:opacity-50 disabled:scale-100 transition-all shadow-lg shadow-blue-500/5 active:scale-[0.98]"
              >
                {loading === 'timepicker' ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Set Time'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats Grid - Row 1: History & Today's Wins */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        {/* Total Contacted Ever */}
        <button 
          onClick={() => fetchDetailedLeads('contacted')}
          className="group bg-white/5 border border-white/5 rounded-2xl p-5 text-center hover:bg-white/10 hover:border-white/10 transition-all duration-300 backdrop-blur-sm"
        >
          <div className="mb-2 bg-blue-500/10 w-10 h-10 rounded-full flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
            <History className="w-5 h-5 text-blue-400" />
          </div>
          <p className="text-3xl font-light text-zinc-100">{leadStats.totalContacted}</p>
          <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider mt-1">Total Contacted</p>
        </button>
        
        {/* Contacted Today */}
        <div className="bg-white/5 border border-white/5 rounded-2xl p-5 text-center backdrop-blur-sm">
          <div className="mb-2 bg-emerald-500/10 w-10 h-10 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="w-5 h-5 text-emerald-400" />
          </div>
          <p className="text-3xl font-light text-zinc-100">{leadStats.sentToday}</p>
          <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider mt-1">Sent Today</p>
        </div>
      </div>

      {/* Stats Grid - Row 2: Workload */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {/* Backlog */}
        <button 
          onClick={() => fetchDetailedLeads('backlog')}
          className="group bg-white/5 border border-white/5 rounded-2xl p-5 text-center hover:bg-white/10 hover:border-white/10 transition-all duration-300 relative overflow-hidden backdrop-blur-sm"
        >
          {leadStats.backlog > 0 && (
             <div className="absolute top-3 right-3 w-2 h-2 bg-rose-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(244,63,94,0.5)]" />
          )}
          <div className="mb-2 bg-orange-500/10 w-10 h-10 rounded-full flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
            <Calendar className="w-5 h-5 text-orange-400" />
          </div>
          <p className="text-3xl font-light text-zinc-100">{leadStats.backlog}</p>
          <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider mt-1">Backlog</p>
        </button>

        {/* Pending Today */}
        <button 
          onClick={() => fetchDetailedLeads('pending')}
          className="group bg-white/5 border border-white/5 rounded-2xl p-5 text-center hover:bg-white/10 hover:border-white/10 transition-all duration-300 backdrop-blur-sm"
        >
           <div className="mb-2 bg-amber-500/10 w-10 h-10 rounded-full flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
            <AlertCircle className="w-5 h-5 text-amber-400" />
          </div>
          <p className="text-3xl font-light text-zinc-100">{leadStats.pendingToday}</p>
          <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider mt-1">Pending Today</p>
        </button>
      </div>

      {/* Leads Modal */}
      {selectedView && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-zinc-900/90 w-full max-w-lg rounded-3xl max-h-[80vh] flex flex-col border border-white/10 shadow-2xl">
            {/* Header */}
            <div className="p-5 border-b border-white/5 flex justify-between items-center">
              <h3 className="font-semibold text-zinc-200 flex items-center gap-3">
                {selectedView === 'contacted' && <div className="bg-emerald-500/10 p-2 rounded-full"><CheckCircle className="text-emerald-400 w-5 h-5"/></div>}
                {selectedView === 'pending' && <div className="bg-amber-500/10 p-2 rounded-full"><AlertCircle className="text-amber-400 w-5 h-5"/></div>}
                {selectedView === 'reserve' && <div className="bg-purple-500/10 p-2 rounded-full"><Package className="text-purple-400 w-5 h-5"/></div>}
                {selectedView === 'backlog' && <div className="bg-orange-500/10 p-2 rounded-full"><Calendar className="text-orange-400 w-5 h-5"/></div>}
                
                <span className="text-lg">
                  {selectedView === 'contacted' && !selectedWindow && 'All Contacted Leads'}
                  {selectedView === 'contacted' && selectedWindow && `Contacted (${selectedWindow})`}
                  
                  {selectedView === 'pending' && !selectedWindow && 'Pending Leads'}
                  {selectedView === 'pending' && selectedWindow && `Pending (${selectedWindow})`}
                  
                  {selectedView === 'reserve' && 'Reserve Pool'}
                  {selectedView === 'backlog' && 'Backlog Leads'}
                </span>
              </h3>
              <button onClick={() => { setSelectedView(null); setSelectedWindow(null); }} className="p-2 hover:bg-white/10 rounded-full transition-colors text-zinc-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 overflow-y-auto flex-1 space-y-2">
              {modalLoading ? (
                <div className="flex flex-col items-center justify-center py-12 text-zinc-500 gap-3">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <p className="text-sm">Loading data...</p>
                </div>
              ) : detailedLeads.length > 0 ? (
                detailedLeads.map((lead, i) => (
                  <div key={i} className="group bg-white/5 border border-white/5 hover:bg-white/10 p-4 rounded-xl flex justify-between items-center transition-all">
                    <div>
                      <p className="font-medium text-zinc-200">{lead.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                         <span className="text-xs font-mono text-zinc-500 bg-black/20 px-1.5 py-0.5 rounded">{lead.phone}</span>
                         <span className="text-[10px] text-zinc-500 uppercase tracking-wide border border-white/5 px-1.5 py-0.5 rounded-full">{lead.businessType}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      {selectedView === 'pending' && (
                        <div className="text-xs text-zinc-600 font-mono">
                           PR: <span className="text-zinc-400">{lead.priority}</span>
                        </div>
                      )}
                      {lead.dispatchDate && (
                         <div className="text-[10px] text-zinc-600 mt-1">{lead.dispatchDate}</div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 text-zinc-600">
                  No leads found in this view.
                </div>
              )}
            </div>
          </div>
        </div>
      )}



      {/* REPOSITIONED Status Card */}
      <div className="bg-white/5 border border-white/10 rounded-3xl p-6 mb-6 shadow-2xl backdrop-blur-md relative overflow-hidden">
        {/* Glow effect */}
        <div className={`absolute top-0 right-0 w-32 h-32 bg-${status.status === 'running' ? 'emerald' : 'zinc'}-500/10 blur-[50px] rounded-full -mr-10 -mt-10 pointer-events-none`} />

        <div className="flex items-center justify-between mb-6 relative">
          <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">System Status</span>
          <span className={`px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wide flex items-center gap-2 ${getStatusColor()}`}>
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  status.status === 'running' ? 'bg-emerald-400' :
                  status.status === 'paused' ? 'bg-amber-400' :
                  status.status === 'error' ? 'bg-rose-400' : 'bg-zinc-400'
              }`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${
                  status.status === 'running' ? 'bg-emerald-400' :
                  status.status === 'paused' ? 'bg-amber-400' :
                  status.status === 'error' ? 'bg-rose-400' : 'bg-zinc-400'
              }`}></span>
            </span>
            {status.status?.replace(/_/g, ' ')}
          </span>
        </div>
        
        {/* Next Scrape Info */}
        <div className="mb-4 bg-black/20 rounded-xl p-4 border border-white/5 flex items-center justify-between">
           <div>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold mb-1">Next Scrape Target</p>
              <div className="flex items-center gap-2">
                 <span className="text-sm font-medium text-emerald-400">{getNextScrapeDetails().city}</span>
                 <span className="text-zinc-600">•</span>
                 <span className="text-xs text-zinc-400">{getNextScrapeDetails().date}</span>
              </div>
           </div>
           <div className="bg-white/5 p-2 rounded-lg">
              <RefreshCw className="w-4 h-4 text-zinc-500" />
           </div>
        </div>

        {status.currentLead && (
          <div className="mb-6 relative">
            <span className="text-xs text-zinc-500 uppercase tracking-wide block mb-2">Processing Lead</span>
            <div className="bg-black/30 rounded-xl p-3 border border-white/5">
                <p className="text-lg font-medium text-zinc-200 truncate">{status.currentLead}</p>
            </div>
          </div>
        )}

        {(status.totalLeads || 0) > 0 && (
          <div className="mb-6 relative">
            <div className="flex justify-between text-xs text-zinc-500 mb-2 uppercase tracking-wide">
                <span>Progress</span>
                <span className="font-mono text-zinc-300">{status.processedLeads || 0} / {status.totalLeads || 0}</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-zinc-800 rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-zinc-100 h-2 rounded-full transition-all duration-500 ease-out shadow-[0_0_10px_rgba(255,255,255,0.3)]"
                  style={{ width: `${((status.processedLeads || 0) / (status.totalLeads || 1)) * 100}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {(status.errorCount || 0) > 0 && (
          <div className="flex items-center gap-2 text-rose-400 bg-rose-500/5 px-3 py-2 rounded-lg border border-rose-500/10">
            <AlertCircle className="w-4 h-4" />
            <span className="text-xs font-medium">Errors: {status.errorCount || 0}</span>
          </div>
        )}
      </div>

      {/* Window Breakdown */}
      <div className="bg-white/5 border border-white/5 rounded-2xl p-5 mb-6 backdrop-blur-sm">
        <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4 flex items-center gap-2">
          <Zap className="w-3 h-3" /> Dispatch Windows
        </h3>
        <div className="space-y-3">
          {(['morning', 'lunch', 'evening'] as const).map((win) => (
            <div key={win} className="group flex items-center justify-between text-sm bg-black/20 p-3 rounded-xl border border-transparent hover:border-white/5 transition-all">
              <span className="capitalize flex items-center gap-3 font-medium text-zinc-300">
                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-lg bg-white/5 group-hover:scale-110 transition-transform duration-300`}>
                  {win === 'morning' && '☀️'}
                  {win === 'lunch' && '🌤️'}
                  {win === 'evening' && '🌙'}
                </span>
                {win}
                {getCurrentWindow() === win && (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded font-bold tracking-wide">NOW</span>
                )}
              </span>
              <div className="flex gap-4 font-mono text-xs">
                <div 
                  className="flex items-center gap-1.5 cursor-pointer hover:bg-white/5 px-2 py-1 rounded transition-colors"
                  onClick={() => fetchDetailedLeads('pending', win)}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500/50" />
                  <span className="text-zinc-400 group-hover:text-zinc-200">{windowStats[win].pending}</span>
                </div>
                <div 
                  className="flex items-center gap-1.5 cursor-pointer hover:bg-white/5 px-2 py-1 rounded transition-colors"
                  onClick={() => fetchDetailedLeads('contacted', win)}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/50" />
                  <span className="text-zinc-400 group-hover:text-zinc-200">{windowStats[win].sent}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Reserve Pool */}
      <div className="bg-white/5 border border-white/5 rounded-2xl p-5 mb-6 backdrop-blur-sm">
        <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4 flex items-center gap-2">
          <Package className="w-3 h-3" /> Reserve Pool
        </h3>
        <div className="grid grid-cols-4 gap-3 text-center">
          {(['morning', 'lunch', 'evening', 'total'] as const).map((key) => (
            <div 
              key={key} 
              className={`bg-black/20 border border-white/5 rounded-xl p-3 ${key === 'total' ? 'cursor-pointer hover:bg-purple-500/10 hover:border-purple-500/20 transition-all' : ''}`}
              onClick={() => key === 'total' && fetchDetailedLeads('reserve')}
            >
              <p className={`text-xl font-light ${key === 'total' ? 'text-purple-400' : 'text-zinc-300'}`}>
                {key === 'total' ? reservePool.total : reservePool[key]}
              </p>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mt-1">{key}</p>
            </div>
          ))}
        </div>
      </div>







      {/* Control Buttons */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {/* Start Button */}
        <button
          onClick={handleStart}
          disabled={loading !== null || status.status === 'running' || status.status === 'paused' || !settings.dispatchEnabled}
          className={`group flex flex-col items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed p-4 rounded-2xl transition-all active:scale-95 ${
            settings.dispatchEnabled 
              ? 'bg-zinc-100 hover:bg-white text-zinc-950 shadow-lg shadow-white/5' 
              : 'bg-zinc-800/50 text-zinc-600'
          }`}
        >
          <Rocket className="w-5 h-5 group-hover:-translate-y-1 transition-transform" />
          <span className="text-[10px] font-bold uppercase tracking-wide">Start</span>
        </button>

        {/* Pause/Resume Button */}
        {status.status === "paused" ? (
          <button
            onClick={handleResume}
            disabled={loading !== null}
            className="group flex flex-col items-center gap-2 bg-white/5 hover:bg-white/10 text-blue-400 border border-white/10 disabled:opacity-30 disabled:cursor-not-allowed p-4 rounded-2xl transition-all active:scale-95"
          >
            <Play className="w-5 h-5" />
            <span className="text-[10px] font-bold uppercase tracking-wide">Resume</span>
          </button>
        ) : (
          <button
            onClick={handlePause}
            disabled={loading !== null || status.status !== 'running'}
            className="group flex flex-col items-center gap-2 bg-white/5 hover:bg-white/10 text-amber-400 border border-white/10 disabled:opacity-30 disabled:cursor-not-allowed p-4 rounded-2xl transition-all active:scale-95"
          >
            <Pause className="w-5 h-5" />
            <span className="text-[10px] font-bold uppercase tracking-wide">Pause</span>
          </button>
        )}

        {/* Stop Button */}
        <button
          onClick={handleStop}
          disabled={loading !== null || (status.status !== 'running' && status.status !== 'paused')}
          className="group flex flex-col items-center gap-2 bg-white/5 hover:bg-white/10 text-rose-400 border border-white/10 disabled:opacity-30 disabled:cursor-not-allowed p-4 rounded-2xl transition-all active:scale-95"
        >
          <Square className="w-5 h-5" />
          <span className="text-[10px] font-bold uppercase tracking-wide">Stop</span>
        </button>

        {/* Dispatch Backlog Button */}
        <button
          onClick={async () => {
            if (leadStats.backlog === 0) return;
            setLoading('backlog');
            try {
              const workerUrl = process.env.NEXT_PUBLIC_WORKER_URL || 'http://localhost:4000';
              const response = await fetch(`${workerUrl}/trigger/dispatch-backlog`, { method: 'POST' });
              const data = await response.json();
              if (!response.ok) throw new Error(data.error || 'Failed');
              setError(null);
            } catch (err: any) {
              setError(err.message);
            } finally {
              setTimeout(() => setLoading(null), 1000);
            }
          }}
          disabled={loading !== null || leadStats.backlog === 0 || status.status === 'running' || !settings.dispatchEnabled}
          className={`group flex flex-col items-center gap-2 border disabled:opacity-30 disabled:cursor-not-allowed p-4 rounded-2xl transition-all active:scale-95 ${
            settings.dispatchEnabled 
              ? 'bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border-orange-500/20' 
              : 'bg-zinc-800/50 text-zinc-600 border-zinc-700'
          }`}
        >
          <Package className="w-5 h-5" />
          <span className="text-[10px] font-bold uppercase tracking-wide">Backlog</span>
        </button>

        {/* Refresh Button */}
        <button
          onClick={() => { fetchLeadStats(); fetchReservePool(); }}
          className="group flex flex-col items-center gap-2 bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/10 p-4 rounded-2xl transition-all active:scale-95"
        >
          <RefreshCw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
          <span className="text-[10px] font-bold uppercase tracking-wide">Refresh</span>
        </button>
      </div>

      {/* Live Logs */}
      <div className="bg-white/5 border border-white/5 rounded-2xl overflow-hidden backdrop-blur-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-black/20">
          <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
            Terminal Logs
            <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full font-mono">{logs.length}</span>
          </h2>
          <button
            onClick={handleClearLogs}
            disabled={loading === "clear"}
            className="text-zinc-600 hover:text-rose-400 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-60 overflow-y-auto font-mono text-xs p-2 custom-scrollbar bg-black/10">
          {logs.length === 0 ? (
             <div className="flex flex-col items-center justify-center py-10 text-zinc-700 gap-2">
                <div className="w-10 h-10 border border-zinc-800 rounded flex items-center justify-center">
                    <span className="text-xl">_</span>
                </div>
                <p>System Idle</p>
             </div>
          ) : (
            <ul className="space-y-1">
              {logs.map((log) => (
                <li key={log.id} className="group px-3 py-2 hover:bg-white/5 rounded-lg transition-colors border border-transparent hover:border-white/5">
                  <div className="flex item-start gap-3">
                    <span className="opacity-50 mt-0.5 text-zinc-500 shrink-0 select-none">›</span>
                    <div className="flex-1 min-w-0">
                      <p className={`${
                          log.type === "error" ? "text-rose-400" : 
                          log.type === "warning" ? "text-amber-400" : "text-zinc-300"
                      }`}>
                        {log.message}
                      </p>
                      {log.leadName && (
                        <p className="text-zinc-600 truncate mt-0.5">Target: {log.leadName}</p>
                      )}
                    </div>
                    <span className="text-[10px] text-zinc-700 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                      {formatTime(log.timestamp)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Footer with connection indicator */}
      <div className="mt-8 flex justify-center items-center gap-2 text-[10px] text-zinc-700 uppercase tracking-widest">
         <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
         {isConnected ? 'Connected' : 'Disconnected'} • {status.updatedAt ? formatTime(status.updatedAt) : "Syncing..."}
      </div>
      
      {/* Connection error banner */}
      {connectionError && (
        <div className="fixed bottom-4 left-4 right-4 max-w-lg mx-auto bg-rose-500/10 border border-rose-500/20 text-rose-400 px-4 py-2 rounded-xl text-xs text-center">
          {connectionError}
        </div>
      )}
    </div>
  );
}
