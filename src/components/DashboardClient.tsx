"use client";

import { useState, useEffect } from "react";
import { checkBotStatus } from "@/actions/bot";
import { Business } from "@/lib/types";
import { Bot, Loader2, Users, MessageCircle, LayoutDashboard, QrCode, Activity, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { StatsCard } from "@/components/StatsCard";
import { ScanButton } from "@/components/ScanButton";
import { DashboardActions } from "@/components/DashboardActions";
import Image from "next/image";
import { clientDb } from "@/lib/firebase-client";
import { doc, onSnapshot, collection, query, orderBy, limit } from "firebase/firestore";
import Link from "next/link";

interface DashboardClientProps {
  initialLeads: Business[];
}

interface BotStatusData {
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

export function DashboardClient({ initialLeads }: DashboardClientProps) {
  const [leads, setLeads] = useState(initialLeads);
  const [loading, setLoading] = useState(false);
  const [botRunning, setBotRunning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  
  // Live status from Firebase
  const [liveStatus, setLiveStatus] = useState<BotStatusData>({ status: "idle" });
  const [liveLogs, setLiveLogs] = useState<LogEntry[]>([]);

  // Calculate stats
  const totalLeads = leads.length;
  const potentialWhatsApp = leads.filter(l => l.phone).length;
  const contacted = leads.filter(l => l.status === "contacted").length;
  const newLeadsToContact = leads.filter(l => l.phone && l.status !== 'contacted').length;

  // Subscribe to live bot status
  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(clientDb, "system", "bot_status"),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as BotStatusData;
          setLiveStatus(data);
          // Update botRunning based on live status
          const isRunning = ["running", "starting", "waiting_for_scan", "paused"].includes(data.status);
          setBotRunning(isRunning);
          if (data.status === "waiting_for_scan" && (data as any).qrCode) {
            setQrCode((data as any).qrCode);
          } else if (data.status !== "waiting_for_scan") {
            setQrCode(null);
          }
        }
      }
    );
    return () => unsubscribe();
  }, []);

  // Subscribe to live logs (last 5)
  useEffect(() => {
    const logsQuery = query(
      collection(clientDb, "system", "bot_logs", "entries"),
      orderBy("timestamp", "desc"),
      limit(5)
    );
    const unsubscribe = onSnapshot(logsQuery, (snapshot) => {
      const entries = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as LogEntry[];
      setLiveLogs(entries);
    });
    return () => unsubscribe();
  }, []);
  useEffect(() => {
    if (!botRunning) return;

    const interval = setInterval(async () => {
        const botStatus = await checkBotStatus();
        console.log("Polling Result:", JSON.stringify(botStatus, null, 2));
        
        if (botStatus.status === 'waiting_for_scan' && botStatus.qrCode) {
            setQrCode(botStatus.qrCode);
            setStatus("Please scan the QR code below.");
        } else if (botStatus.status === 'logged_in') {
            setQrCode(null);
            setStatus("Logged in! Sending messages...");
        } else if (botStatus.status === 'idle') {
            setQrCode(null);
            setBotRunning(false);
            setLoading(false);
            setStatus(null);
        } else if (botStatus.status === 'error') {
             setStatus("Bot encountered an error. Check logs.");
             setBotRunning(false);
             setLoading(false);
        }
    }, 1000);

    return () => clearInterval(interval);
  }, [botRunning]);

  const handleStartClick = () => {
    if (newLeadsToContact === 0) {
      setStatus("No new leads to process.");
      return;
    }
    setShowConfirm(true);
  };

  const handleConfirm = async () => {
    setShowConfirm(false);
    setLoading(true);
    setBotRunning(true);
    setStatus("Starting via worker...");

    try {
        const workerUrl = process.env.NEXT_PUBLIC_WORKER_URL || 'http://localhost:4000';
        const response = await fetch(`${workerUrl}/trigger/dispatch-current`, { method: 'POST' });
        const data = await response.json();
        
        if (response.ok) {
            setStatus(`Dispatch started for ${data.window} window`);
        } else {
            setStatus(`Failed: ${data.error || 'Unknown error'}`);
            setLoading(false);
            setBotRunning(false);
        }
    } catch (error: any) {
        setStatus(`Network error: ${error.message}`);
        setLoading(false);
        setBotRunning(false);
    }
  };

  // Grouping logic (same as before)
  const groupedLeads: { [key: string]: typeof leads } = {};
  leads.forEach(lead => {
    let groupKey = "Earlier";
    if (lead.savedAt) {
        const date = new Date(lead.savedAt);
        groupKey = date.toLocaleString('en-US', { 
            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true 
        });
    }
    if (!groupedLeads[groupKey]) groupedLeads[groupKey] = [];
    groupedLeads[groupKey].push(lead);
  });
  const groupKeys = Object.keys(groupedLeads);

  return (
    <main className="h-screen flex flex-col bg-[#F5F5F7] font-sans text-gray-900 overflow-hidden">
      {/* Header */}
      <div className="bg-white/70 backdrop-blur-xl z-20 border-b border-gray-200/50 shrink-0">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-xl font-bold tracking-tight text-gray-900">Lead Gen Dashboard</h1>
                <p className="text-sm text-gray-500">Manage and outreach to your local business leads.</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
               {/* Status Pill */}
               {status && <span className="text-sm text-gray-600 animate-pulse bg-gray-100 px-3 py-1 rounded-full">{status}</span>}

               <button
                onClick={handleStartClick}
                disabled={loading || newLeadsToContact === 0}
                className="flex items-center gap-2 px-4 py-2 bg-transparent border border-green-600 text-gray-900 hover:bg-green-50 rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Bot className="w-4 h-4" />
                    Start Outreach ({newLeadsToContact})
                  </>
                )}
              </button>
              <ScanButton />
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 max-w-7xl mx-auto w-full px-6 py-8 gap-6">
        {/* Stats Row - 4 Columns now */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 shrink-0">
          <StatsCard label="Total Leads" value={totalLeads} icon={Users} />
          <StatsCard 
            label="Potential WhatsApp" 
            value={potentialWhatsApp} 
            icon={MessageCircle}
            trend={totalLeads > 0 ? `${Math.round((potentialWhatsApp / totalLeads) * 100)}%` : undefined}
            trendUp={true}
          />
          <StatsCard label="Contacted" value={contacted} icon={LayoutDashboard} />
          
          {/* Fourth Card: Live Bot Status */}
          <Link href="/monitor" className="block">
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex flex-col relative overflow-hidden h-[140px] hover:border-green-200 hover:shadow-md transition-all cursor-pointer">
              {/* Header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Activity className={`w-4 h-4 ${liveStatus.status === 'running' ? 'text-green-500 animate-pulse' : liveStatus.status === 'paused' ? 'text-yellow-500' : 'text-gray-400'}`} />
                  <span className="text-xs font-semibold uppercase text-gray-500">Live Status</span>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  liveStatus.status === 'running' ? 'bg-green-100 text-green-700' :
                  liveStatus.status === 'paused' ? 'bg-yellow-100 text-yellow-700' :
                  liveStatus.status === 'error' ? 'bg-red-100 text-red-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {liveStatus.status?.toUpperCase() || 'IDLE'}
                </span>
              </div>

              {/* Progress or Current Lead */}
              {liveStatus.status === 'running' && liveStatus.currentLead ? (
                <div className="flex-1 flex flex-col justify-center">
                  <p className="text-xs text-gray-500 truncate mb-1">
                    Processing: <span className="font-medium text-gray-700">{liveStatus.currentLead}</span>
                  </p>
                  {liveStatus.totalLeads && (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                        <div 
                          className="bg-green-500 h-1.5 rounded-full transition-all"
                          style={{ width: `${((liveStatus.processedLeads || 0) / liveStatus.totalLeads) * 100}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-gray-500">{liveStatus.processedLeads || 0}/{liveStatus.totalLeads}</span>
                    </div>
                  )}
                </div>
              ) : qrCode ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="relative w-16 h-16">
                    <Image src={qrCode} alt="QR" fill className="object-contain" unoptimized />
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col justify-center">
                  {liveLogs.length > 0 ? (
                    <div className="space-y-1">
                      {liveLogs.slice(0, 2).map((log) => (
                        <div key={log.id} className="flex items-center gap-1.5 text-[10px]">
                          {log.type === 'info' ? <CheckCircle className="w-3 h-3 text-green-500" /> :
                           log.type === 'error' ? <XCircle className="w-3 h-3 text-red-500" /> :
                           <AlertCircle className="w-3 h-3 text-yellow-500" />}
                          <span className="text-gray-600 truncate">{log.leadName || log.message}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 text-center">No recent activity</p>
                  )}
                </div>
              )}

              {/* Footer hint */}
              <p className="text-[9px] text-gray-400 text-right mt-auto">Tap for full monitor →</p>
            </div>
          </Link>
        </div>

        {/* Filters & Content Area */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 flex flex-col min-h-0 overflow-hidden">
           {/* ... (Same as before) ... */}
           {/* Toolbar */}
           <div className="px-6 py-4 border-b border-gray-100 flex flex-col md:flex-row gap-4 items-center justify-between bg-gray-50/50 shrink-0">
             {/* ... inputs ... */}
             <div className="flex items-center gap-2 w-full md:w-auto">
                 <input type="text" placeholder="Search businesses..." className="w-full md:w-64 h-10 px-4 rounded-xl bg-white border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-500/20" />
             </div>
           </div>

           {/* Leads List */}
           <div className="flex-1 overflow-y-auto p-0">
              <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-gray-50/80 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider sticky top-0 backdrop-blur-sm z-10">
                <div className="col-span-4">Business Name</div>
                <div className="col-span-4">Contact Info</div>
                <div className="col-span-2">Outreach Status</div>
                <div className="col-span-2 text-right">Actions</div>
              </div>

              {leads.length === 0 ? (
                 <div className="flex flex-col items-center justify-center py-32 text-gray-400">
                   <p>No leads found.</p>
                 </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {groupKeys.map((group) => (
                     <div key={group}>
                         <div className="px-6 py-2 bg-gray-100/50 text-xs font-bold text-gray-500 uppercase tracking-wider border-y border-gray-100 sticky top-[41px] z-10 backdrop-blur-sm">
                             Scan: {group}
                         </div>
                         {groupedLeads[group].map((business) => (
                            <div key={business.id} className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-gray-50/50 transition-colors group">
                              <div className="col-span-4">
                                <h3 className="font-medium text-gray-900">{business.name}</h3>
                                <p className="text-sm text-gray-500 truncate">{business.address}</p>
                              </div>
                              <div className="col-span-4">
                                {business.phone ? (
                                  <div className="flex items-center gap-2 text-sm text-gray-700">
                                    <MessageCircle className="w-3.5 h-3.5 text-gray-600" />
                                    {business.phone}
                                  </div>
                                ) : (
                                  <span className="text-sm text-gray-400 italic">No phone</span>
                                )}
                              </div>
                              <div className="col-span-2">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                  business.status === 'contacted' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                }`}>
                                  {business.status === 'contacted' ? 'Contacted' : 'New'}
                                </span>
                              </div>
                              <div className="col-span-2 text-right">
                                 <DashboardActions lead={business} />
                              </div>
                            </div>
                         ))}
                     </div>
                  ))}
                </div>
              )}
           </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Start Outreach?</h3>
            <p className="text-sm text-gray-600 mb-6">
              Start bot for <span className="font-bold text-gray-900">{newLeadsToContact} new leads</span>?
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowConfirm(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={handleConfirm} className="px-4 py-2 text-sm font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg">Start Bot</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
