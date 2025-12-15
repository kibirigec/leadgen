"use client";

import { useState } from "react";
import { ChevronDown, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { BusinessCategory } from "@/lib/types";

interface SearchFiltersProps {
  categories: BusinessCategory[];
  selectedCategory: string | null;
  onSelectCategory: (id: string | null) => void;
}

export function SearchFilters({ categories, selectedCategory, onSelectCategory }: SearchFiltersProps) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2 font-medium text-gray-900">
          <Tag className="w-4 h-4 text-blue-600" />
          <span>Categories</span>
        </div>
        <ChevronDown 
          className={cn(
            "w-5 h-5 text-gray-400 transition-transform duration-300",
            isOpen ? "rotate-180" : ""
          )} 
        />
      </button>

      <div 
        className={cn(
          "accordion-content overflow-hidden bg-gray-50/50",
          isOpen ? "max-h-[500px] border-t border-gray-100" : "max-h-0"
        )}
      >
        <div className="p-2 space-y-1">
          <button
            onClick={() => onSelectCategory(null)}
            className={cn(
              "w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-all",
              selectedCategory === null 
                ? "bg-blue-50 text-blue-700 font-medium shadow-sm" 
                : "text-gray-600 hover:bg-white hover:text-gray-900"
            )}
          >
            <span>All Businesses</span>
          </button>
          
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => onSelectCategory(category.name)} // Filtering by name for MVP simplicity
              className={cn(
                "w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-all",
                selectedCategory === category.name 
                  ? "bg-blue-50 text-blue-700 font-medium shadow-sm" 
                  : "text-gray-600 hover:bg-white hover:text-gray-900"
              )}
            >
              <span>{category.name}</span>
              <span className="text-xs px-2 py-0.5 bg-gray-200/50 rounded-full text-gray-500">
                {category.count}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
