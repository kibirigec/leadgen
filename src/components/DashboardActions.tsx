"use client";

import { createWhatsAppLink } from "@/lib/utils";
import { Business } from "@/lib/types";
import { MessageCircle } from "lucide-react";

interface DashboardActionsProps {
  lead: Business;
}

export function DashboardActions({ lead }: DashboardActionsProps) {
  // If no phone, we can't send a message
  if (!lead.phone) return null;

  const whatsappLink = createWhatsAppLink(lead.phone, lead.name, lead.location || "your area");

  return (
    <div className="flex items-center justify-end gap-2">
      <a 
        href={whatsappLink}
        target="whatsapp_outreach"
        rel="noopener noreferrer"
        className="p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900 rounded-full transition-colors disabled:opacity-50"
        title="Send WhatsApp Message"
      >
        <MessageCircle className="w-4 h-4" />
      </a>
    </div>
  );
}
