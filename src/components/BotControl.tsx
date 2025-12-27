"use client";

import { useState, useEffect } from "react";
import { checkBotStatus } from "@/actions/bot";
import { Business } from "@/lib/types";
import { Bot, Loader2 } from "lucide-react";
import Image from "next/image";

interface BotControlProps {
  leads: Business[];
}

export function BotControl({ leads }: BotControlProps) {
  const [loading, setLoading] = useState(false);
  const [botRunning, setBotRunning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);

  // Client-side filter to show accurate count
  const newLeads = leads.filter(l => l.phone && l.status !== 'contacted');
  const newLeadsCount = newLeads.length;

  // Polling for QR Code - Tied to botRunning
  useEffect(() => {
    if (!botRunning) return;

    const interval = setInterval(async () => {
        const botStatus = await checkBotStatus();
        console.log("Polling Result:", JSON.stringify(botStatus, null, 2));
        console.log("Status check:", botStatus.status, "| QR exists:", !!botStatus.qrCode);
        
        if (botStatus.status === 'waiting_for_scan' && botStatus.qrCode) {
            console.log("✅ Setting QR code!");
            setQrCode(botStatus.qrCode);
            setStatus("Please scan the QR code below.");
        } else if (botStatus.status === 'logged_in') {
            setQrCode(null);
            setStatus("Logged in! Sending messages...");
        } else if (botStatus.status === 'idle') {
            // Bot finished or reset
            setQrCode(null);
            setBotRunning(false);
            setLoading(false);
        } else if (botStatus.status === 'error') {
             setStatus("Bot encountered an error. Check logs.");
             setBotRunning(false);
             setLoading(false);
        } else {
            console.log("⚠️ Unhandled status:", botStatus.status);
        }
    }, 1000); // Poll every 1 second

    return () => clearInterval(interval);
  }, [botRunning]);

  const handleStartClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (newLeadsCount === 0) {
      setStatus("No new leads to process.");
      return;
    }
    setShowConfirm(true);
  };

  const handleConfirm = async () => {
    setShowConfirm(false);
    setLoading(true);
    setBotRunning(true);
    setQrCode(null);
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

  return (
    <div className="relative">
      <div className="flex items-center gap-4">
        {status && <span className="text-sm text-gray-600 animate-pulse">{status}</span>}
        
        <button
            type="button"
            onClick={handleStartClick}
            disabled={loading || newLeadsCount === 0}
            className="flex items-center gap-2 px-4 py-2 bg-transparent border border-green-600 text-gray-900 hover:bg-green-50 rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            title={newLeadsCount === 0 ? "No new leads to contact" : "Start outreach"}
        >
            {loading ? (
            <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Running Bot...
            </>
            ) : (
            <>
                <Bot className="w-4 h-4" />
                Start Outreach Bot ({newLeadsCount})
            </>
            )}
        </button>
      </div>

      {/* Custom Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full border border-gray-100 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Start Outreach?</h3>
            <p className="text-sm text-gray-600 mb-6">
              You are about to start the WhatsApp Bot for <span className="font-bold text-gray-900">{newLeadsCount} new leads</span>.
              <br /><br />
              This will open a Chrome window on your computer. Please do not close it until the process is finished.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className="px-4 py-2 text-sm font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors shadow-sm"
              >
                Start Bot
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Persistent QR Code Section - Outside flex container */}
      {qrCode && (
        <div className="mt-4 p-4 bg-white rounded-xl shadow-xl border-4 border-red-500 w-64">
            <h3 className="text-sm font-bold text-gray-900 mb-2">Scan to Login</h3>
            <div className="bg-white p-2 rounded-lg border border-gray-200 mb-2">
                <Image src={qrCode} alt="WhatsApp QR Code" width={200} height={200} unoptimized className="w-full h-auto" />
            </div>
            <p className="text-xs text-gray-500 text-center">
              Open WhatsApp &gt; Linked Devices &gt; Link a Device
            </p>
        </div>
      )}
    </div>
  );
}
