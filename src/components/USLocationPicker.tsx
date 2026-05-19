"use client";

import { useState } from "react";
import { US_LOCATION_HIERARCHY } from "../../worker/src/location-rotation-us";
import { ChevronDown } from "lucide-react";

interface USLocationPickerProps {
  value: string;
  onChange: (location: string) => void;
  placeholder?: string;
}

const CITIES = Object.entries(US_LOCATION_HIERARCHY).map(([key, val]) => ({
  key,
  label: val.label,
  neighborhoods: val.neighborhoods,
}));

export function USLocationPicker({ value, onChange, placeholder = "Select or type a location..." }: USLocationPickerProps) {
  const [selectedCity, setSelectedCity] = useState<string>("");
  const [cityOpen, setCityOpen] = useState(false);
  const [neighborhoodOpen, setNeighborhoodOpen] = useState(false);

  const currentCity = CITIES.find((c) => c.key === selectedCity);

  const handleCitySelect = (cityKey: string) => {
    setSelectedCity(cityKey);
    setCityOpen(false);
    onChange(""); // reset location
  };

  const handleNeighborhoodSelect = (neighborhood: string) => {
    onChange(neighborhood);
    setNeighborhoodOpen(false);
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Row 1: City picker */}
      <div className="flex gap-2">
        {/* City dropdown */}
        <div className="relative flex-1">
          <button
            type="button"
            onClick={() => { setCityOpen(!cityOpen); setNeighborhoodOpen(false); }}
            className="w-full flex items-center justify-between px-3 py-2 bg-zinc-800/60 border border-zinc-700/50 rounded-lg text-xs text-zinc-300 hover:border-zinc-600 transition-all"
          >
            <span className={currentCity ? "text-zinc-200" : "text-zinc-500"}>
              {currentCity ? currentCity.label : "City"}
            </span>
            <ChevronDown className={`w-3 h-3 text-zinc-500 transition-transform ${cityOpen ? "rotate-180" : ""}`} />
          </button>

          {cityOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-50 overflow-hidden">
              {CITIES.map((city) => (
                <button
                  key={city.key}
                  type="button"
                  onClick={() => handleCitySelect(city.key)}
                  className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-zinc-800 ${
                    selectedCity === city.key ? "text-blue-400 bg-blue-500/10" : "text-zinc-300"
                  }`}
                >
                  {city.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Neighborhood dropdown — only shown when city is selected */}
        {currentCity && (
          <div className="relative flex-[2]">
            <button
              type="button"
              onClick={() => { setNeighborhoodOpen(!neighborhoodOpen); setCityOpen(false); }}
              className="w-full flex items-center justify-between px-3 py-2 bg-zinc-800/60 border border-zinc-700/50 rounded-lg text-xs text-zinc-300 hover:border-zinc-600 transition-all"
            >
              <span className={value && value.includes(currentCity.label) ? "text-zinc-200 truncate" : "text-zinc-500"}>
                {value && value.includes(currentCity.label.split(",")[0])
                  ? value.split(",")[0]
                  : "Neighborhood"}
              </span>
              <ChevronDown className={`w-3 h-3 text-zinc-500 shrink-0 transition-transform ${neighborhoodOpen ? "rotate-180" : ""}`} />
            </button>

            {neighborhoodOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-50 max-h-52 overflow-y-auto">
                {currentCity.neighborhoods.map((neighborhood) => (
                  <button
                    key={neighborhood}
                    type="button"
                    onClick={() => handleNeighborhoodSelect(neighborhood)}
                    className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-zinc-800 ${
                      value === neighborhood ? "text-blue-400 bg-blue-500/10" : "text-zinc-300"
                    }`}
                  >
                    {neighborhood.split(",")[0]}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Row 2: Custom text input — always visible */}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 bg-zinc-800/60 border border-zinc-700/50 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500/50 transition-colors"
      />

      {value && (
        <p className="text-[10px] text-zinc-500">
          📍 Searching: <span className="text-zinc-300">{value}</span>
        </p>
      )}
    </div>
  );
}
