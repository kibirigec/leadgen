"use client";

import { useState, useEffect } from "react";
import { clientDb } from "@/lib/firebase-client";
import { doc, onSnapshot, collection, query, orderBy, limit, where, getDocs, getCountFromServer } from "firebase/firestore";
import { pauseBotAction, resumeBotAction, stopBotAction, clearBotLogs, getSettings, setTestMode, setScrapeEnabled, setDispatchEnabled, setCronTime } from "@/actions/bot";
import { Pause, Play, Square, RefreshCw, Wifi, WifiOff, Trash2, Rocket, Users, CheckCircle, AlertCircle, XCircle, Bell, BellOff, Zap, X, Loader2, Package, Calendar, History, FlaskConical, Settings, Sunrise, Sun, Moon, RotateCcw, CalendarClock, Clock, ChevronUp, ChevronDown, Target, HelpCircle } from "lucide-react";
import { requestNotificationPermission, areNotificationsEnabled, onForegroundMessage, initMessaging } from "@/lib/notifications";
import { getNextScrapeDetails } from "@/lib/client-rotation";
import { USLocationPicker } from "./USLocationPicker";

interface BotStatus {
  status: string;
  currentLead?: string;
  totalLeads?: number;
  processedLeads?: number;
  errorCount?: number;
  updatedAt?: string;
  qrCode?: string;
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

export type ConfigStatus = 'morning' | 'lunch' | 'evening' | 'off';

interface DispatchConfig {
    active_types: Record<string, ConfigStatus>;
    quotas: { morning: number; lunch: number; evening: number };
    updatedAt: string;
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
  ugEnabled: boolean;
  usEnabled: boolean;
  usScrapeEnabled: boolean;
  usDispatchEnabled: boolean;
  usTestMode: boolean;
  usTestPhone: string;
  usCronTimes: {
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
    ugEnabled: true,
    usEnabled: false,
    usScrapeEnabled: true,
    usDispatchEnabled: true,
    usTestMode: false,
    usTestPhone: "",
    usCronTimes: DEFAULT_CRON_TIMES,
  });
  const [showTestSettings, setShowTestSettings] = useState(false);
  const [testPhoneInput, setTestPhoneInput] = useState("");
  const [market, setMarket] = useState<'UG' | 'US'>('UG');

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

  // Targeted actions state
  const [targetLocation, setTargetLocation] = useState('');
  const [targetBusinessType, setTargetBusinessType] = useState('');
  const [scrapeLimit, setScrapeLimit] = useState<number | ''>('');
  const [dispatchLimit, setDispatchLimit] = useState<number | ''>('');
  
  // Dispatch Configuration State
  const [dispatchConfig, setDispatchConfig] = useState<DispatchConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

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
      const collectionName = market === 'US' ? 'leads_queue_US' : 'leads_queue';
      
      let q;
      if (type === 'contacted') {
        if (windowFilter) {
          // Show contacted for specific window
          q = query(
            collection(clientDb, collectionName),
            where("status", "==", "sent"),
            where("timeWindow", "==", windowFilter),
            limit(50)
          );
        } else {
          // Show ALL contacted (total)
          q = query(
            collection(clientDb, collectionName),
            where("status", "==", "sent"),
            limit(50)
          );
        }
      } else if (type === 'reserve') {
        // Show reserve pool leads (available only)
        q = query(
          collection(clientDb, "reserve_pool"),
          where("status", "==", "available"),
          limit(50)
        );
      } else if (type === 'backlog') {
        // Show backlog (pending from previous days OR missing date)
        // Note: We avoid filtering by date in Firestore because it hides docs with missing/null dates.
        q = query(
          collection(clientDb, collectionName),
          where("status", "==", "pending"),
          limit(300) // Increase limit to potentially catch mixed backlog + today
        );
        
        // We'll filter client-side below
      } else {
        // Show pending for current window (TODAY ONLY)
        const targetWindow = windowFilter || currentWindow;
        q = query(
          collection(clientDb, collectionName),
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
      } else {
        // No market filter needed since collections are isolated
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
      const collectionName = market === 'US' ? 'leads_queue_US' : 'leads_queue';
      const queueRef = collection(clientDb, collectionName);
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
      
      // Calculate correct backlogs + total contacted for this market
      const pendingMarketSize = pendingSnap.size;
      
      const sentMarketSize = sentSnap.size;
      
      setLeadStats({
        sentToday,
        pendingToday,
        totalContacted: sentMarketSize,
        backlog: pendingMarketSize - pendingToday
      });
      setWindowStats(windows);
    } catch (err) {
      console.error("Error fetching lead stats:", err);
    }
  };

  // Initial fetch and refresh on status change
  useEffect(() => {
    fetchLeadStats();
  }, [status.processedLeads, market]);

  // Subscribe to bot status
  useEffect(() => {
    const docId = market === 'US' ? 'bot_status_US' : 'bot_status';
    const unsubscribe = onSnapshot(
      doc(clientDb, "system", docId),
      (snapshot) => {
        setIsConnected(true);
        setConnectionError(null);
        if (snapshot.exists()) {
          setStatus(snapshot.data() as BotStatus);
        } else {
          setStatus({ status: "idle" });
        }
      },
      (err) => {
        console.error("Status subscription error:", err);
        setIsConnected(false);
        setConnectionError("Lost connection to server");
      }
    );
    return () => unsubscribe();
  }, [market]);

  // Subscribe to bot logs
  useEffect(() => {
    const docId = market === 'US' ? 'bot_logs_US' : 'bot_logs';
    const logsQuery = query(
      collection(clientDb, "system", docId, "entries"),
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
  }, [market]);

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
            ugEnabled: data.ugEnabled ?? true,
            usEnabled: data.usEnabled ?? false,
            usScrapeEnabled: data.usScrapeEnabled ?? true,
            usDispatchEnabled: data.usDispatchEnabled ?? true,
            usTestMode: data.usTestMode ?? false,
            usTestPhone: data.usTestPhone ?? "",
            usCronTimes: {
              scrape: data.usCronTimes?.scrape ?? DEFAULT_CRON_TIMES.scrape,
              morning: data.usCronTimes?.morning ?? DEFAULT_CRON_TIMES.morning,
              lunch: data.usCronTimes?.lunch ?? DEFAULT_CRON_TIMES.lunch,
              evening: data.usCronTimes?.evening ?? DEFAULT_CRON_TIMES.evening,
            },
          });
          setTestPhoneInput(market === 'US' ? (data.usTestPhone ?? "") : (data.testPhone ?? ""));
        }
      },
    );
    return () => unsubscribe();
  }, [market]);

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
      const collectionName = market === 'US' ? 'reserve_pool_US' : 'reserve_pool';
      const poolRef = collection(clientDb, collectionName);
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
  }, [status.status, market]);

  // Fetch dispatch config
  // Fetch dispatch config
  const fetchConfig = async () => {
    setConfigLoading(true);
    setConfigError(null);
    const workerUrl = process.env.NEXT_PUBLIC_WORKER_URL || 'http://localhost:4000';
    try {
      const res = await fetch(`${workerUrl}/config/dispatch?market=${market}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDispatchConfig(data);
    } catch (err: any) {
      console.error("Failed to fetch config:", err);
      setConfigError(`Failed to load config from ${workerUrl}. ${err.message}`);
    } finally {
      setConfigLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, [market]);

  const updateConfigType = async (type: string, status: ConfigStatus) => {
    if (!dispatchConfig) return;
    
    // Optimistic update
    const newConfig = { ...dispatchConfig, active_types: { ...dispatchConfig.active_types, [type]: status } };
    setDispatchConfig(newConfig);

    try {
      const workerUrl = process.env.NEXT_PUBLIC_WORKER_URL || 'http://localhost:4000';
      await fetch(`${workerUrl}/config/dispatch?market=${market}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active_types: newConfig.active_types })
      });
    } catch (err) {
      console.error("Failed to update config:", err);
      fetchConfig();
    }
  };

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
      const res = await fetch(`${workerUrl}/trigger/scrape`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          location: targetLocation,
          businessType: targetBusinessType,
          limit: scrapeLimit || undefined,
          market
        })
      });
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
      const filters = {
        businessType: targetBusinessType && targetBusinessType !== 'all' ? targetBusinessType : undefined,
        location: targetLocation || undefined,
      };
      
      const res = await fetch(`${workerUrl}/trigger/dispatch/${window}`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          filters,
          limit: dispatchLimit || undefined,
          market
        })
      });
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
      if (market === 'US') {
        await import('@/actions/bot').then(m => m.setUsTestMode(true, testPhoneInput));
      } else {
        await setTestMode(true, testPhoneInput);
      }
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ market })
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
      await withTimeout(pauseBotAction(market), 15000);
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
      await withTimeout(resumeBotAction(market), 15000);
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
      await withTimeout(stopBotAction(market), 15000);
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
      await withTimeout(clearBotLogs(market), 15000);
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
      if (market === 'US') {
        await import('@/actions/bot').then(m => m.setUsCronTime(timePickerTarget as any, timePickerHour, timePickerMinute));
      } else {
        await setCronTime(timePickerTarget as any, timePickerHour, timePickerMinute);
      }
      
      // Auto-apply scheduling changes
      const workerUrl = process.env.NEXT_PUBLIC_WORKER_URL || 'http://localhost:4000';
      await fetch(`${workerUrl}/reschedule`, { method: 'POST' });
      
      setTimePickerOpen(false);
    } catch (err: any) {
      console.error("Failed to save time:", err);
      setError(err.message || "Failed to save time");
    } finally {
      setLoading(null);
    }
  };

  const handleDispatchBacklog = async () => {
    if (leadStats.backlog === 0) return;
    setLoading('backlog');
    try {
      const workerUrl = process.env.NEXT_PUBLIC_WORKER_URL || 'http://localhost:4000';
      const res = await fetch(`${workerUrl}/trigger/dispatch-backlog?limit=30`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ market })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setTimeout(() => setLoading(null), 1000);
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

  const currentCronTimes = market === 'US' ? settings.usCronTimes : settings.cronTimes;
  const currentScrapeEnabled = market === 'US' ? settings.usScrapeEnabled : settings.scrapeEnabled;
  const currentDispatchEnabled = market === 'US' ? settings.usDispatchEnabled : settings.dispatchEnabled;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 p-4 max-w-lg mx-auto pb-24 font-sans selection:bg-zinc-800">
      {/* Error Toast */}
      {error && (
        <div className="fixed top-4 left-4 right-4 max-w-lg mx-auto bg-rose-500/10 border border-rose-500/20 backdrop-blur-md text-rose-400 px-4 py-3 rounded-xl flex items-center gap-2 shadow-2xl z-50 animate-in slide-in-from-top-2">
          <XCircle className="w-5 h-5 shrink-0" />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      {/* Market Selector Tabs */}
      <div className="flex bg-zinc-900 border border-zinc-800 rounded-xl p-1 mb-4">
        <button
          onClick={() => setMarket('UG')}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
            market === 'UG' ? 'bg-zinc-800 text-zinc-100 shadow-sm' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
          }`}
        >
          🇺🇬 Uganda
        </button>
        <button
          onClick={() => setMarket('US')}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
            market === 'US' ? 'bg-zinc-800 text-zinc-100 shadow-sm' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
          }`}
        >
          🇺🇸 United States
        </button>
      </div>

      {/* Market Master Toggle Warning */}
      {market === 'UG' && !settings.ugEnabled && (
        <div className="mb-4 bg-zinc-800/80 border border-zinc-700 rounded-xl p-3 flex justify-between items-center text-zinc-400 text-sm">
          <span>🇺🇬 Uganda Market is currently OFF</span>
          <button onClick={() => import('@/actions/bot').then(m => m.setUgEnabled(true))} className="text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-lg">Turn ON</button>
        </div>
      )}
      {market === 'US' && !settings.usEnabled && (
        <div className="mb-4 bg-zinc-800/80 border border-zinc-700 rounded-xl p-3 flex justify-between items-center text-zinc-400 text-sm">
          <span>🇺🇸 US Market is currently OFF</span>
          <button onClick={() => import('@/actions/bot').then(m => m.setUsEnabled(true))} className="text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-lg">Turn ON</button>
        </div>
      )}

      {/* WhatsApp Session Card */}
      <div className="mb-4 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <div className="flex justify-between items-center text-zinc-400 text-sm mb-3">
          <div className="flex items-center gap-2">
            <Rocket className="w-4 h-4 text-emerald-400" />
            <span className="font-semibold text-zinc-200">
              {market === 'US' ? '🇺🇸 US' : '🇺🇬 Uganda'} WhatsApp Session
            </span>
          </div>
          <button 
            disabled={status.status === 'running' || status.status === 'starting' || loading === 'login'}
            onClick={async () => {
              setLoading('login');
              try {
                const workerUrl = process.env.NEXT_PUBLIC_WORKER_URL || 'http://localhost:4000';
                await fetch(`${workerUrl}/trigger/whatsapp-login`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ market })
                });
              } catch (err) {
                console.error("Failed to start login:", err);
              }
              setLoading(null);
            }} 
            className="text-blue-400 bg-blue-500/10 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all animate-pulse"
          >
            {loading === 'login' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : status.status === 'waiting_for_scan' ? (
              'Scan Required'
            ) : status.status === 'running' ? (
              'Connected'
            ) : (
              'Start WhatsApp Login'
            )}
          </button>
        </div>

        {/* Real-time QR Code display */}
        {status.status === 'waiting_for_scan' && status.qrCode && (
          <div className="mt-4 p-4 bg-zinc-950 rounded-xl border border-zinc-800 flex flex-col items-center gap-3 animate-in fade-in duration-300">
            <h3 className="text-sm font-bold text-zinc-300">Scan to Link {market === 'US' ? 'US' : 'Uganda'} Bot</h3>
            <div className="bg-white p-3 rounded-xl border-4 border-emerald-500 shadow-2xl">
              <img src={status.qrCode} alt="WhatsApp QR Code" className="w-48 h-48" />
            </div>
            <p className="text-xs text-zinc-500 text-center max-w-[200px]">
              Open WhatsApp on your phone &gt; Settings &gt; Linked Devices &gt; Link a Device
            </p>
          </div>
        )}
      </div>

      {/* Test Mode Banner */}
      {(market === 'US' ? settings.usTestMode : settings.testMode) && (
        <div className="mb-4 bg-orange-500/10 border border-orange-500/30 rounded-xl p-3 flex items-center gap-3">
          <FlaskConical className="w-5 h-5 text-orange-400" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-orange-400">🧪 TEST MODE ACTIVE</p>
            <p className="text-xs text-orange-400/70">Messages → {market === 'US' ? settings.usTestPhone : settings.testPhone}</p>
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
              if (market === 'US') {
                await import('@/actions/bot').then(m => m.setUsScrapeEnabled(!settings.usScrapeEnabled));
              } else {
                await setScrapeEnabled(!settings.scrapeEnabled);
              }
              setLoading(null);
            }}
            className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              (market === 'US' ? settings.usScrapeEnabled : settings.scrapeEnabled) 
                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/20' 
                : 'bg-zinc-800/50 text-zinc-500 border border-zinc-700/50 hover:bg-zinc-800'
            }`}
          >
            <div className={`w-1.5 h-1.5 rounded-full ${(market === 'US' ? settings.usScrapeEnabled : settings.scrapeEnabled) ? 'bg-purple-500 animate-pulse' : 'bg-zinc-600'}`} />
            <span className="truncate">{(market === 'US' ? settings.usScrapeEnabled : settings.scrapeEnabled) ? 'Scrape Active' : 'Scrape Paused'}</span>
          </button>

          {/* Dispatch Toggle */}
          <button
            onClick={async () => {
              setLoading('dispatch-toggle');
              if (market === 'US') {
                await import('@/actions/bot').then(m => m.setUsDispatchEnabled(!settings.usDispatchEnabled));
              } else {
                await setDispatchEnabled(!settings.dispatchEnabled);
              }
              setLoading(null);
            }}
            className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              (market === 'US' ? settings.usDispatchEnabled : settings.dispatchEnabled)
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/20' 
                : 'bg-zinc-800/50 text-zinc-500 border border-zinc-700/50 hover:bg-zinc-800'
            }`}
          >
            <div className={`w-1.5 h-1.5 rounded-full ${(market === 'US' ? settings.usDispatchEnabled : settings.dispatchEnabled) ? 'bg-blue-500 animate-pulse' : 'bg-zinc-600'}`} />
            <span className="truncate">{(market === 'US' ? settings.usDispatchEnabled : settings.dispatchEnabled) ? 'Dispatch Active' : 'Dispatch Paused'}</span>
          </button>

          {/* Test Mode Toggle */}
          <button
            onClick={handleToggleTestMode}
            className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              (market === 'US' ? settings.usTestMode : settings.testMode) 
                ? 'bg-orange-500/20 text-orange-400 border border-orange-500/20' 
                : 'bg-zinc-800/50 text-zinc-500 border border-zinc-700/50 hover:bg-zinc-800'
            }`}
          >
            <div className={`w-1.5 h-1.5 rounded-full ${(market === 'US' ? settings.usTestMode : settings.testMode) ? 'bg-orange-500 animate-pulse' : 'bg-zinc-600'}`} />
            <span className="truncate">{(market === 'US' ? settings.usTestMode : settings.testMode) ? 'Test Mode On' : 'Test Mode Off'}</span>
          </button>
        </div>

        {/* Location & Business Type Inputs */}
        <form 
          onSubmit={(e) => { e.preventDefault(); handleTriggerScrape(); }}
          className="flex flex-col gap-3 mb-4 p-3 bg-zinc-900/50 rounded-xl border border-zinc-800/50"
        >
          {market === 'US' ? (
            <USLocationPicker 
              value={targetLocation}
              onChange={setTargetLocation}
            />
          ) : (
            <input 
              type="text"
              placeholder="Target Location (e.g. Kampala)"
              value={targetLocation}
              onChange={e => setTargetLocation(e.target.value)}
              className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-zinc-500"
            />
          )}
          <input 
            type="text"
            placeholder="Business Type (e.g. hospital)"
            value={targetBusinessType}
            onChange={e => setTargetBusinessType(e.target.value)}
            className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-zinc-500"
          />
          <button type="submit" className="hidden" />
        </form>

        <div className="grid grid-cols-4 gap-3">
          <button
            onClick={handleTriggerScrape}
            disabled={loading !== null}
            className="group relative flex flex-col items-center justify-center gap-2 p-3 rounded-xl border transition-all duration-300 disabled:opacity-50 bg-purple-500/10 border-purple-500/20 hover:bg-purple-500/20 hover:border-purple-500/30 text-purple-400"
          >
            <div className="p-2 rounded-full bg-purple-500/20 group-hover:bg-purple-500/30 transition-colors">
              {loading === 'scrape' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            </div>
            <span className="text-[10px] font-medium tracking-wide">SCRAPE</span>
          </button>

          <button
            onClick={() => triggerDispatch('morning')}
            disabled={loading !== null}
            className="group relative flex flex-col items-center justify-center gap-2 p-3 rounded-xl border transition-all duration-300 disabled:opacity-50 bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20 hover:border-blue-500/30 text-blue-400"
          >
            <div className="p-2 rounded-full bg-blue-500/20 group-hover:bg-blue-500/30 transition-colors">
              {loading === 'dispatch-morning' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sunrise className="w-4 h-4" />}
            </div>
            <span className="text-[10px] font-medium tracking-wide">MORNING</span>
          </button>

          <button
            onClick={() => triggerDispatch('lunch')}
            disabled={loading !== null}
            className="group relative flex flex-col items-center justify-center gap-2 p-3 rounded-xl border transition-all duration-300 disabled:opacity-50 bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/20 hover:border-amber-500/30 text-amber-400"
          >
            <div className="p-2 rounded-full bg-amber-500/20 group-hover:bg-amber-500/30 transition-colors">
              {loading === 'dispatch-lunch' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sun className="w-4 h-4" />}
            </div>
            <span className="text-[10px] font-medium tracking-wide">LUNCH</span>
          </button>

          <button
            onClick={() => triggerDispatch('evening')}
            disabled={loading !== null}
            className="group relative flex flex-col items-center justify-center gap-2 p-3 rounded-xl border transition-all duration-300 disabled:opacity-50 bg-indigo-500/10 border-indigo-500/20 hover:bg-indigo-500/20 hover:border-indigo-500/30 text-indigo-400"
          >
            <div className="p-2 rounded-full bg-indigo-500/20 group-hover:bg-indigo-500/30 transition-colors">
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
            <span className="text-xs text-zinc-300 font-semibold uppercase tracking-wider">Automated Schedule ({market === 'US' ? 'UTC' : 'EAT'})</span>
          </div>
          <span className="text-[10px] text-zinc-500 bg-zinc-800/50 px-2 py-0.5 rounded-full">Click time to edit</span>
        </div>
        <div className="grid grid-cols-4 gap-3 mb-4">
          <button
            onClick={() => {
              setTimePickerTarget('scrape');
              setTimePickerHour(currentCronTimes?.scrape?.hour ?? DEFAULT_CRON_TIMES.scrape.hour);
              setTimePickerMinute(currentCronTimes?.scrape?.minute ?? DEFAULT_CRON_TIMES.scrape.minute);
              setTimePickerOpen(true);
            }}
            className={`relative overflow-hidden group p-3 rounded-xl border transition-all duration-300 flex flex-col items-center justify-center ${
              currentScrapeEnabled 
                ? 'bg-zinc-900 border-purple-500/30 hover:border-purple-500/60 shadow-[0_0_15px_-3px_rgba(168,85,247,0.15)]' 
                : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <div className={`text-lg font-mono font-bold mb-1 ${currentScrapeEnabled ? 'text-purple-400' : 'text-zinc-500'}`}>
              {currentCronTimes?.scrape?.hour ?? DEFAULT_CRON_TIMES.scrape.hour}:{String(currentCronTimes?.scrape?.minute ?? DEFAULT_CRON_TIMES.scrape.minute).padStart(2, '0')}
            </div>
            <div className="flex items-center justify-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${currentScrapeEnabled ? 'bg-purple-500 animate-pulse' : 'bg-zinc-700'}`} />
              <span className={`text-[10px] font-medium uppercase tracking-wider ${currentScrapeEnabled ? 'text-purple-300' : 'text-zinc-600'}`}>Scrape</span>
            </div>
          </button>

          <button
            onClick={() => {
              setTimePickerTarget('morning');
              setTimePickerHour(currentCronTimes?.morning?.hour ?? DEFAULT_CRON_TIMES.morning.hour);
              setTimePickerMinute(currentCronTimes?.morning?.minute ?? DEFAULT_CRON_TIMES.morning.minute);
              setTimePickerOpen(true);
            }}
            className={`relative overflow-hidden group p-3 rounded-xl border transition-all duration-300 flex flex-col items-center justify-center ${
              currentDispatchEnabled 
                ? 'bg-zinc-900 border-blue-500/30 hover:border-blue-500/60 shadow-[0_0_15px_-3px_rgba(59,130,246,0.15)]' 
                : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <div className={`text-lg font-mono font-bold mb-1 ${currentDispatchEnabled ? 'text-blue-400' : 'text-zinc-500'}`}>
              {currentCronTimes?.morning?.hour ?? DEFAULT_CRON_TIMES.morning.hour}:{String(currentCronTimes?.morning?.minute ?? DEFAULT_CRON_TIMES.morning.minute).padStart(2, '0')}
            </div>
            <div className="flex items-center justify-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${currentDispatchEnabled ? 'bg-blue-500 animate-pulse' : 'bg-zinc-700'}`} />
              <span className={`text-[10px] font-medium uppercase tracking-wider ${currentDispatchEnabled ? 'text-blue-300' : 'text-zinc-600'}`}>Morning</span>
            </div>
          </button>

          <button
            onClick={() => {
              setTimePickerTarget('lunch');
              setTimePickerHour(currentCronTimes?.lunch?.hour ?? DEFAULT_CRON_TIMES.lunch.hour);
              setTimePickerMinute(currentCronTimes?.lunch?.minute ?? DEFAULT_CRON_TIMES.lunch.minute);
              setTimePickerOpen(true);
            }}
            className={`relative overflow-hidden group p-3 rounded-xl border transition-all duration-300 flex flex-col items-center justify-center ${
              currentDispatchEnabled 
                ? 'bg-zinc-900 border-amber-500/30 hover:border-amber-500/60 shadow-[0_0_15px_-3px_rgba(245,158,11,0.15)]' 
                : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <div className={`text-lg font-mono font-bold mb-1 ${currentDispatchEnabled ? 'text-amber-400' : 'text-zinc-500'}`}>
              {currentCronTimes?.lunch?.hour ?? DEFAULT_CRON_TIMES.lunch.hour}:{String(currentCronTimes?.lunch?.minute ?? DEFAULT_CRON_TIMES.lunch.minute).padStart(2, '0')}
            </div>
            <div className="flex items-center justify-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${currentDispatchEnabled ? 'bg-amber-500 animate-pulse' : 'bg-zinc-700'}`} />
              <span className={`text-[10px] font-medium uppercase tracking-wider ${currentDispatchEnabled ? 'text-amber-300' : 'text-zinc-600'}`}>Lunch</span>
            </div>
          </button>

          <button
            onClick={() => {
              setTimePickerTarget('evening');
              setTimePickerHour(currentCronTimes?.evening?.hour ?? DEFAULT_CRON_TIMES.evening.hour);
              setTimePickerMinute(currentCronTimes?.evening?.minute ?? DEFAULT_CRON_TIMES.evening.minute);
              setTimePickerOpen(true);
            }}
            className={`relative overflow-hidden group p-3 rounded-xl border transition-all duration-300 flex flex-col items-center justify-center ${
              currentDispatchEnabled 
                ? 'bg-zinc-900 border-indigo-500/30 hover:border-indigo-500/60 shadow-[0_0_15px_-3px_rgba(99,102,241,0.15)]' 
                : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <div className={`text-lg font-mono font-bold mb-1 ${currentDispatchEnabled ? 'text-indigo-400' : 'text-zinc-500'}`}>
              {currentCronTimes?.evening?.hour ?? DEFAULT_CRON_TIMES.evening.hour}:{String(currentCronTimes?.evening?.minute ?? DEFAULT_CRON_TIMES.evening.minute).padStart(2, '0')}
            </div>
            <div className="flex items-center justify-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${currentDispatchEnabled ? 'bg-indigo-500 animate-pulse' : 'bg-zinc-700'}`} />
              <span className={`text-[10px] font-medium uppercase tracking-wider ${currentDispatchEnabled ? 'text-indigo-300' : 'text-zinc-600'}`}>Evening</span>
            </div>
          </button>
        </div>

        {/* Global Action Controls */}
        <div className="grid grid-cols-4 gap-3 mt-2">
          {/* Start Button */}
          <button
            onClick={handleResume}
            disabled={loading !== null || status.status === 'running' || !settings.dispatchEnabled}
            className={`group relative flex items-center justify-center gap-2 p-3 rounded-xl border transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed ${
              status.status === 'running' 
               ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' 
               : !settings.dispatchEnabled
                 ? 'bg-zinc-800/50 text-zinc-600 border-zinc-700/50'
                 : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20 hover:border-emerald-500/30'
            }`}
          >
            {loading === 'resume' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
            <span className="text-[10px] font-bold tracking-wider">START</span>
          </button>

          {/* Pause Button */}
          <button
            onClick={handlePause}
            disabled={loading !== null || status.status !== 'running'}
            className={`group relative flex items-center justify-center gap-2 p-3 rounded-xl border transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed ${
              status.status === 'paused'
               ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
               : 'bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20 hover:border-amber-500/30'
            }`}
          >
            {loading === 'pause' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pause className="w-4 h-4 fill-current" />}
            <span className="text-[10px] font-bold tracking-wider">PAUSE</span>
          </button>

          {/* Stop Button */}
          <button
            onClick={handleStop}
            disabled={loading !== null || (status.status !== 'running' && status.status !== 'paused')}
            className={`group relative flex items-center justify-center gap-2 p-3 rounded-xl border transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed ${
               status.status === 'stopped'
               ? 'bg-red-500/20 text-red-400 border-red-500/30'
               : 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20 hover:border-red-500/30'
            }`}
          >
            {loading === 'stop' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4 fill-current" />}
            <span className="text-[10px] font-bold tracking-wider">STOP</span>
          </button>

          {/* Backlog (Dispatch Backlog) Button */}
          <button
            onClick={handleDispatchBacklog}
            disabled={loading !== null || leadStats.backlog === 0 || status.status === 'running' || !settings.dispatchEnabled}
             className={`group relative flex items-center justify-center gap-2 p-3 rounded-xl border transition-all duration-300 disabled:opacity-50 ${
               settings.dispatchEnabled && leadStats.backlog > 0
                ? 'bg-orange-500/10 text-orange-400 border-orange-500/20 hover:bg-orange-500/20 hover:border-orange-500/30'
                : 'bg-zinc-800/50 text-zinc-600 border-zinc-700/50 hover:bg-zinc-800'
             }`}
          >
            {loading === 'backlog' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4 fill-current opacity-70" />}
            <span className="text-[10px] font-bold tracking-wider">BACKLOG</span>
          </button>
        </div>
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
            
            <div className="flex items-center justify-center gap-6 mb-8">
              {/* Hour Input */}
              <div className="flex flex-col items-center gap-1">
                <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1">Hour</label>
                <div className="flex flex-col items-center">
                  <button 
                    onClick={() => setTimePickerHour(h => h < 23 ? h + 1 : 0)}
                    className="p-1 hover:bg-white/10 text-zinc-500 hover:text-zinc-300 rounded-full transition-colors mb-1"
                  >
                    <ChevronUp className="w-6 h-6" />
                  </button>
                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={timePickerHour}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (!isNaN(val) && val >= 0 && val <= 23) setTimePickerHour(val);
                    }}
                    className="w-20 h-20 bg-zinc-800/50 rounded-2xl text-center text-5xl font-light text-white border border-white/5 focus:border-blue-500/50 focus:bg-zinc-800 transition-all outline-none appearance-none"
                  />
                  <button 
                    onClick={() => setTimePickerHour(h => h > 0 ? h - 1 : 23)}
                    className="p-1 hover:bg-white/10 text-zinc-500 hover:text-zinc-300 rounded-full transition-colors mt-1"
                  >
                    <ChevronDown className="w-6 h-6" />
                  </button>
                </div>
              </div>

              <div className="text-4xl font-light text-zinc-600 self-center pt-6">:</div>

              {/* Minute Input */}
              <div className="flex flex-col items-center gap-1">
                <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1">Minute</label>
                 <div className="flex flex-col items-center">
                  <button 
                    onClick={() => setTimePickerMinute(m => m < 59 ? m + 1 : 0)}
                    className="p-1 hover:bg-white/10 text-zinc-500 hover:text-zinc-300 rounded-full transition-colors mb-1"
                  >
                    <ChevronUp className="w-6 h-6" />
                  </button>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={timePickerMinute}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (!isNaN(val) && val >= 0 && val <= 59) setTimePickerMinute(val);
                    }}
                    className="w-20 h-20 bg-zinc-800/50 rounded-2xl text-center text-5xl font-light text-white border border-white/5 focus:border-blue-500/50 focus:bg-zinc-800 transition-all outline-none appearance-none"
                  />
                  <button 
                    onClick={() => setTimePickerMinute(m => m > 0 ? m - 1 : 59)}
                    className="p-1 hover:bg-white/10 text-zinc-500 hover:text-zinc-300 rounded-full transition-colors mt-1"
                  >
                    <ChevronDown className="w-6 h-6" />
                  </button>
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
          <span title="Active windows where leads are dispatched. Icons show current time of day.">
            <HelpCircle className="w-3 h-3 text-zinc-600 cursor-help ml-1" />
          </span>
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
          <span title="Leads scraped but not yet dispatched. They fill gaps when new scrapes are low.">
            <HelpCircle className="w-3 h-3 text-zinc-600 cursor-help ml-1" />
          </span>
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
      {/* Control Buttons - Hidden as requested */}
      {/* <div className="grid grid-cols-4 gap-3 mb-6">
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

        <button
          onClick={handleStop}
          disabled={loading !== null || (status.status !== 'running' && status.status !== 'paused')}
          className="group flex flex-col items-center gap-2 bg-white/5 hover:bg-white/10 text-rose-400 border border-white/10 disabled:opacity-30 disabled:cursor-not-allowed p-4 rounded-2xl transition-all active:scale-95"
        >
          <Square className="w-5 h-5" />
          <span className="text-[10px] font-bold uppercase tracking-wide">Stop</span>
        </button>

        <button
          onClick={handleDispatchBacklog}
          disabled={loading !== null || leadStats.backlog === 0 || status.status === 'running' || !settings.dispatchEnabled}
          className={`group flex flex-col items-center gap-2 border disabled:opacity-30 disabled:cursor-not-allowed p-4 rounded-2xl transition-all active:scale-95 ${
            settings.dispatchEnabled && leadStats.backlog > 0
              ? 'bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border-orange-500/20' 
              : 'bg-zinc-800/50 text-zinc-600 border-zinc-700'
          }`}
        >
          <Package className="w-5 h-5" />
          <span className="text-[10px] font-bold uppercase tracking-wide">Backlog</span>
        </button>

        <button
          onClick={() => { fetchLeadStats(); fetchReservePool(); }}
          className="group flex flex-col items-center gap-2 bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/10 p-4 rounded-2xl transition-all active:scale-95"
        >
          <RefreshCw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
          <span className="text-[10px] font-bold uppercase tracking-wide">Refresh</span>
        </button>
      </div> */}

      {/* Dispatch Configuration */}
      <div className="bg-white/5 border border-white/5 rounded-2xl p-5 mb-6 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-4">
             <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
               <Settings className="w-3 h-3" /> Dispatch Configuration
             </h3>
             <button 
                onClick={handleStart} 
                disabled={loading !== null || !settings.dispatchEnabled}
                className="flex items-center gap-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-all disabled:opacity-50"
             >
                {loading === 'start' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                Dispatch Now (Auto)
             </button>
        </div>

        {configLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-zinc-600" /></div>
        ) : configError ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
               <AlertCircle className="w-6 h-6 text-rose-500 mb-2" />
               <p className="text-xs text-rose-400 font-medium mb-3">{configError}</p>
               <button 
                 onClick={fetchConfig}
                 className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide flex items-center gap-2"
               >
                 <RefreshCw className="w-3 h-3" /> Retry
               </button>
            </div>
        ) : !dispatchConfig ? (
             <div className="flex justify-center py-8 text-zinc-600 text-xs">No configuration loaded</div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {Object.entries(dispatchConfig.active_types).map(([type, status]) => (
                    <div key={type} className="flex items-center justify-between bg-black/20 border border-white/5 rounded-xl p-3">
                        <span className="text-xs font-medium text-zinc-300 capitalize">{type.replace('_', ' ')}</span>
                        <select
                            value={status}
                            onChange={(e) => updateConfigType(type, e.target.value as ConfigStatus)}
                            className={`text-[10px] font-bold uppercase tracking-wide bg-transparent border-none focus:ring-0 cursor-pointer ${
                                status === 'off' ? 'text-zinc-500' :
                                status === 'morning' ? 'text-blue-400' :
                                status === 'lunch' ? 'text-amber-400' :
                                'text-indigo-400'
                            }`}
                        >
                            <option value="off">Off</option>
                            <option value="morning">Morning</option>
                            <option value="lunch">Lunch</option>
                            <option value="evening">Evening</option>
                        </select>
                    </div>
                ))}
            </div>
        )}
        
        {/* Manual Override Section */}
        <div className="mt-4 pt-4 border-t border-white/5">
             <div className="flex items-center gap-2 mb-2">
                 <span className="text-[10px] font-bold text-zinc-500 uppercase">Manual Override</span>
             </div>
             <div className="flex gap-2">
                <select 
                    value={targetBusinessType}
                    onChange={(e) => setTargetBusinessType(e.target.value)}
                    className="bg-black/20 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-white/20"
                >
                    <option value="">Select Type...</option>
                    {Object.keys(dispatchConfig?.active_types || {}).map(t => (
                        <option key={t} value={t}>{t.replace('_', ' ')}</option>
                    ))}
                </select>
                <button
                    onClick={() => triggerDispatch(getCurrentWindow())}
                    disabled={!targetBusinessType || loading !== null}
                    className="bg-zinc-700 hover:bg-zinc-600 text-zinc-200 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide disabled:opacity-50"
                >
                    Dispatch Just This
                </button>
             </div>
        </div>
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
