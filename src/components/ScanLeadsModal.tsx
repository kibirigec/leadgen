"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Search, MapPin, Loader2, X } from "lucide-react";
import { searchLeadsAction } from "@/actions/leads";
import { Business } from "@/lib/types";
import { LeadCard } from "@/components/LeadCard";

interface ScanLeadsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ScanLeadsModal({ isOpen, onClose }: ScanLeadsModalProps) {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [results, setResults] = useState<Business[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  if (!isOpen) return null;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || !location.trim()) return;

    setLoading(true);
    setHasSearched(true);
    
    try {
      const data = await searchLeadsAction(query, location);
      setResults(data);

      // Auto-save target leads (no website)
      const targetLeads = data.filter(lead => lead.isTarget);
      if (targetLeads.length > 0) {
        // We import this dynamically or at top level. Let's add import at top.
        const { saveMultipleLeadsAction } = await import("@/actions/leads");
        await saveMultipleLeadsAction(targetLeads);
        console.log(`Auto-saved ${targetLeads.length} target leads.`);
      }
    } catch (error) {
      console.error("Search failed:", error);
    } finally {
      setLoading(false);
    }
  };

  // Use a portal to ensure the modal is always on top of other content (z-index fix)
  // and use flexbox for reliable centering.
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm animate-in fade-in duration-200">
      {/* Overlay click to close could be added here if desired */}
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-white z-10">
          <h2 className="text-lg font-semibold text-gray-900">Scan New Leads</h2>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Search Form */}
        <div className="p-6 bg-gray-50/50 border-b border-gray-100">
          <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1 group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-gray-900 transition-colors" />
              <input
                type="text"
                placeholder="Find leads (e.g., 'Restaurant')"
                className="w-full h-12 pl-10 pr-4 rounded-xl bg-white border border-gray-200 focus:ring-2 focus:ring-gray-500/20 focus:border-gray-500 transition-all outline-none placeholder:text-gray-400"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
            </div>
            <div className="relative flex-1 group">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-gray-900 transition-colors" />
              <input
                type="text"
                placeholder="Location (e.g., 'Ntinda')"
                className="w-full h-12 pl-10 pr-4 rounded-xl bg-white border border-gray-200 focus:ring-2 focus:ring-gray-500/20 focus:border-gray-500 transition-all outline-none placeholder:text-gray-400"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            <button
              type="submit"
              disabled={loading || !query || !location}
              className="h-12 px-8 bg-black hover:bg-gray-800 text-white font-medium rounded-xl transition-all shadow-lg shadow-gray-500/20 disabled:opacity-50 disabled:shadow-none active:scale-95 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Searching...
                </>
              ) : (
                "Search"
              )}
            </button>
          </form>
        </div>

        {/* Results Area */}
        <div className="flex-1 overflow-y-auto p-6 bg-[#F5F5F7]">
          {!hasSearched && (
            <div className="flex flex-col items-center justify-center h-64 text-center text-gray-500">
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm">
                <Search className="w-8 h-8 text-gray-300" />
              </div>
              <h3 className="text-lg font-medium text-gray-900">Ready to scan</h3>
              <p className="max-w-xs mt-2 text-sm">Enter a business type and location to start finding leads.</p>
            </div>
          )}

          {hasSearched && !loading && results.length === 0 && (
            <div className="flex flex-col items-center justify-center h-64 text-center text-gray-500">
              <p>No results found for "{query}" in "{location}".</p>
            </div>
          )}

          <div className="grid gap-4">
            {results.map((business, index) => (
              <div 
                key={business.id} 
                className="animate-in fade-in slide-in-from-bottom-4 fill-mode-backwards"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <LeadCard business={business} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
