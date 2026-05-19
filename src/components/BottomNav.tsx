"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Activity } from "lucide-react";
import clsx from "clsx";

export function BottomNav() {
  const pathname = usePathname();

  const tabs = [
    { name: "Home", href: "/", icon: LayoutDashboard },
    { name: "Leads", href: "/leads", icon: Users },
    { name: "Monitor", href: "/monitor", icon: Activity },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-gray-200/50 z-50 px-6 pb-safe pt-2">
      <div className="flex justify-between items-center max-w-md mx-auto h-16">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href;
          const Icon = tab.icon;
          return (
            <Link
              key={tab.name}
              href={tab.href}
              className={clsx(
                "flex flex-col items-center justify-center w-full h-full gap-1 transition-colors duration-200",
                isActive ? "text-green-600" : "text-gray-400 hover:text-gray-600"
              )}
            >
              <Icon className={clsx("w-6 h-6", isActive ? "fill-green-600/10 stroke-[2]" : "stroke-[1.5]")} />
              <span className={clsx("text-[10px] font-medium tracking-wide", isActive ? "text-green-600" : "text-gray-500")}>
                {tab.name}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
