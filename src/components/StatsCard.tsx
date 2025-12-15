import { LucideIcon } from "lucide-react";

interface StatsCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  trend?: string;
  trendUp?: boolean;
}

export function StatsCard({ label, value, icon: Icon, trend, trendUp }: StatsCardProps) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col justify-between h-32 transition-all hover:shadow-md">
      <div className="flex justify-between items-start">
        <span className="text-sm font-medium text-gray-500">{label}</span>
        {Icon && <Icon className="w-5 h-5 text-gray-400" />}
      </div>
      <div className="flex items-end justify-between">
        <span className="text-3xl font-semibold text-gray-900 tracking-tight">{value}</span>
        {trend && (
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${
            trendUp ? "bg-gray-100 text-gray-900" : "bg-gray-100 text-gray-900"
          }`}>
            {trend}
          </span>
        )}
      </div>
    </div>
  );
}
