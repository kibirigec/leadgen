import { getSavedLeadsAction } from "@/actions/leads";
import { StatsCard } from "@/components/StatsCard";
import { ScanButton } from "@/components/ScanButton";
import { DashboardActions } from "@/components/DashboardActions";
import { LayoutDashboard, MessageCircle, Users } from "lucide-react";
import Link from "next/link";

import { BotControl } from "@/components/BotControl";

export const dynamic = "force-dynamic";

export default async function SavedLeadsPage() {
  const leads = await getSavedLeadsAction();

  // Calculate stats
  const totalLeads = leads.length;
  const potentialWhatsApp = leads.filter(l => l.phone).length;
  const contacted = leads.filter(l => l.status === "contacted").length;

  // Group leads by savedAt timestamp
  const groupedLeads: { [key: string]: typeof leads } = {};
  
  leads.forEach(lead => {
    // Format date nicely: "Dec 15, 10:30 AM"
    // If savedAt is missing, put in "Unknown Date"
    let groupKey = "Earlier";
    if (lead.savedAt) {
        const date = new Date(lead.savedAt);
        groupKey = date.toLocaleString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
        });
    }
    
    if (!groupedLeads[groupKey]) {
        groupedLeads[groupKey] = [];
    }
    groupedLeads[groupKey].push(lead);
  });

  // Sort groups by date (descending) - assuming keys are roughly chronological or we rely on insertion order if leads are sorted
  // Since leads are already sorted by desc, the groups created should be in order of appearance
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
              <BotControl leads={leads} />
              <ScanButton />
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 max-w-7xl mx-auto w-full px-6 py-8 gap-6">
        {/* Stats Row - Fixed Height */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 shrink-0">
          <StatsCard 
            label="Total Leads" 
            value={totalLeads} 
            icon={Users}
          />
          <StatsCard 
            label="Potential WhatsApp" 
            value={potentialWhatsApp} 
            icon={MessageCircle}
            trend={totalLeads > 0 ? `${Math.round((potentialWhatsApp / totalLeads) * 100)}%` : undefined}
            trendUp={true}
          />
          <StatsCard 
            label="Contacted" 
            value={contacted} 
            icon={LayoutDashboard}
          />
        </div>

        {/* Filters & Content Area - Flex Grow */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 flex flex-col min-h-0 overflow-hidden">
          {/* Toolbar */}
          <div className="px-6 py-4 border-b border-gray-100 flex flex-col md:flex-row gap-4 items-center justify-between bg-gray-50/50 shrink-0">
            <div className="flex items-center gap-2 w-full md:w-auto">
               <input 
                 type="text" 
                 placeholder="Search businesses..." 
                 className="w-full md:w-64 h-10 px-4 rounded-xl bg-white border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-500/20 focus:border-gray-500 transition-all"
               />
            </div>
            <div className="flex items-center gap-3 w-full md:w-auto">
              <select className="h-10 px-3 pr-8 rounded-xl bg-white border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-500/20 cursor-pointer">
                <option>All Statuses</option>
                <option>Contacted</option>
                <option>New</option>
              </select>
              <select className="h-10 px-3 pr-8 rounded-xl bg-white border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-500/20 cursor-pointer">
                <option>All Websites</option>
                <option>Has Website</option>
                <option>No Website</option>
              </select>
            </div>
          </div>

          {/* Leads List - Scrollable */}
          <div className="flex-1 overflow-y-auto p-0">
             {/* Table Header */}
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
                        {/* Group Header */}
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
                               {business.website && (
                                 <a href={business.website} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-600 hover:underline block mt-0.5 truncate">
                                   {business.website}
                                 </a>
                               )}
                             </div>
                             <div className="col-span-2">
                               <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                 business.status === 'contacted' 
                                   ? 'bg-green-100 text-green-800 border border-green-200' 
                                   : 'bg-gray-100 text-gray-800 border border-gray-200'
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
    </main>
  );
}
