import { useState, useEffect } from "react";
import { startBotAction, checkBotStatus } from "@/actions/bot";
import { Business } from "@/lib/types";
import { Bot, Loader2 } from "lucide-react";
import Image from "next/image";

interface BotControlProps {
  leads: Business[];
}

export function BotControl({ leads }: BotControlProps) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);

  // Client-side filter to show accurate count
  const newLeads = leads.filter(l => l.phone && l.status !== 'contacted');
  const newLeadsCount = newLeads.length;

  // Polling for QR Code
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (loading) {
        interval = setInterval(async () => {
            const botStatus = await checkBotStatus();
            if (botStatus.status === 'waiting_for_scan' && botStatus.qrCode) {
                setQrCode(botStatus.qrCode);
                setStatus("Please scan the QR code below.");
            } else if (botStatus.status === 'idle') {
                // Bot finished or reset
                setQrCode(null);
            }
        }, 3000);
    }
    return () => clearInterval(interval);
  }, [loading]);

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
    setQrCode(null);
    setStatus("Bot is starting... This may take a moment.");

    try {
      const result = await startBotAction(leads);
      
      if (result.success) {
        setStatus(`Bot finished! Sent ${result.count} messages.`);
      } else {
        setStatus(`Bot failed: ${result.error}`);
      }
    } catch (error) {
      setStatus("An error occurred while running the bot.");
      console.error("Bot execution error:", error);
    } finally {
      setLoading(false);
      setQrCode(null);
    }
  };

  return (
    <div className="flex items-center gap-4 relative">
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

      {/* QR Code Modal */}
      {loading && qrCode && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full border border-gray-100 animate-in zoom-in-95 duration-200 flex flex-col items-center">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Scan QR Code</h3>
            <p className="text-sm text-gray-600 mb-4 text-center">
              Open WhatsApp on your phone, go to Linked Devices, and scan this code to log in.
            </p>
            <div className="bg-white p-2 rounded-lg border border-gray-200 mb-4">
                <Image src={qrCode} alt="WhatsApp QR Code" width={250} height={250} unoptimized />
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Waiting for scan...
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
