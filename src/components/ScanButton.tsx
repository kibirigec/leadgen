"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { ScanLeadsModal } from "./ScanLeadsModal";

export function ScanButton() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <button 
        onClick={() => setIsModalOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-transparent border border-blue-600 text-gray-900 hover:bg-blue-50 text-sm font-medium rounded-full transition-all active:scale-95"
      >
        <Plus className="w-4 h-4" />
        Scan New Leads
      </button>

      <ScanLeadsModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
      />
    </>
  );
}
