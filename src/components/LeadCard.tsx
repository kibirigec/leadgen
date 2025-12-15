"use client";

import { useState } from "react";
import { Business } from "@/lib/types";
import { Phone, Globe, MessageCircle, AlertCircle, Save, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { sendWhatsAppAction, saveLeadAction } from "@/actions/leads";

interface LeadCardProps {
  business: Business;
}

export function LeadCard({ business }: LeadCardProps) {
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSendOutreach = async () => {
    if (!business.phone) return;
    setSending(true);
    try {
      // In a real app one might format the phone number
      const result = await sendWhatsAppAction(business.id, business.phone, business.name);
      if (result.success) {
        setSent(true);
      } else {
        alert("Failed to send message: " + result.error);
      }
    } catch (err) {
      console.error(err);
      alert("Error sending message");
    } finally {
      setSending(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await saveLeadAction(business);
      if (result.success) {
        setIsSaved(true);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div 
      className={cn(
        "group relative overflow-hidden rounded-2xl p-6 transition-all duration-300 hover:shadow-lg border",
        business.isTarget 
          ? "bg-white border-gray-200 shadow-sm" 
          : "bg-gray-50/50 border-transparent opacity-80 hover:opacity-100"
      )}
    >
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="font-semibold text-lg tracking-tight text-gray-900">
            {business.name}
          </h3>
          <p className="text-sm text-gray-500 mt-1">{business.category} • {business.location}</p>
        </div>
        <div className="flex items-center gap-2">
           {business.isTarget && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 ring-1 ring-inset ring-gray-600/20">
              Target Lead
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving || isSaved}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-900 transition-colors"
            title="Save Lead"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin"/> : isSaved ? <Check className="w-5 h-5 text-gray-900"/> : <Save className="w-5 h-5"/>}
          </button>
        </div>
      </div>

      <div className="space-y-3 text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <Phone className="w-4 h-4 text-gray-400" />
          <span>{business.phone || "No phone"}</span>
        </div>
        
        <div className="flex items-center gap-2">
          <Globe className={cn("w-4 h-4", business.website ? "text-gray-900" : "text-gray-400")} />
          {business.website ? (
            <a 
              href={business.website} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-gray-900 hover:underline truncate max-w-[200px]"
            >
              {new URL(business.website).hostname}
            </a>
          ) : (
            <span className="text-gray-400 italic">No website available</span>
          )}
        </div>
      </div>

      {business.isTarget && (
        <div className="mt-6 pt-4 border-t border-gray-100">
          <button
            onClick={handleSendOutreach}
            disabled={sending || sent || !business.phone}
            className={cn(
                "flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl font-medium transition-colors shadow-sm hover:shadow active:scale-[0.98] border border-gray-200",
                sent 
                    ? "bg-gray-100 text-gray-900" 
                    : "bg-black hover:bg-gray-800 text-white"
            )}
          >
            {sending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
            ) : sent ? (
                <>
                    <Check className="w-5 h-5" />
                    <span>Sent</span>
                </>
            ) : (
                <>
                    <MessageCircle className="w-5 h-5" />
                    <span>Send Outreach via API</span>
                </>
            )}
          </button>
          <div className="mt-3 flex items-start gap-2 text-xs text-gray-500 bg-gray-50 p-2 rounded-lg">
            <AlertCircle className="w-4 h-4 text-gray-900 shrink-0 mt-0.5" />
            <p>This business has no website. They are a prime candidate for your services.</p>
          </div>
        </div>
      )}
    </div>
  );
}
