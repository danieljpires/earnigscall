"use client";

import React, { useState, useEffect, useRef } from "react";
import { Search, Loader2 } from "lucide-react";
import { TickerSuggestion } from "../types";
import { useLanguage } from "../lib/i18n";

interface Props {
  onSelect: (ticker: string, name?: string) => void;
  isLoading: boolean;
}

export function TickerAutocomplete({ onSelect, isLoading }: Props) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<TickerSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!query) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/ticker-search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setSuggestions(data.suggestions || []);
        setIsOpen(true);
      } catch (e) {
        console.error("Search error", e);
      } finally {
        setIsSearching(false);
      }
    }, 400); // 400ms debounce

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (ticker: string, name: string) => {
    setQuery("");
    setIsOpen(false);
    onSelect(ticker, name);
  };

  return (
    <div className="relative w-full max-w-2xl mx-auto" ref={dropdownRef}>
      <div className="relative flex items-center">
        <div className="absolute left-4 text-gray-400">
          <Search className="h-5 w-5" />
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={isLoading}
          placeholder={t("searchPlaceholder")}
          className="w-full rounded-2xl border border-gray-200 bg-white py-4 pl-12 pr-4 text-lg shadow-sm outline-none transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:opacity-70 dark:border-gray-800 dark:bg-gray-900 dark:focus:border-blue-500"
        />
        {isSearching && (
          <div className="absolute right-4 text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
      </div>

      {isOpen && suggestions.length > 0 && (
        <div className="absolute mt-2 max-h-80 w-full overflow-auto rounded-xl border border-gray-100 bg-white p-2 shadow-xl dark:border-gray-800 dark:bg-gray-900 z-50">
          {suggestions.map((s) => (
            <button
              key={s.symbol}
              onClick={() => handleSelect(s.symbol, s.name)}
              className="flex w-full items-center justify-between rounded-lg px-4 py-3 text-left transition-colors hover:bg-gray-50 focus:bg-gray-50 focus:outline-none dark:hover:bg-gray-800 dark:focus:bg-gray-800"
            >
              <div>
                <span className="block font-semibold text-gray-900 dark:text-gray-100">{s.symbol}</span>
                <span className="block text-sm text-gray-500 dark:text-gray-400">{s.name}</span>
              </div>
              {s.exchange && (
                <span className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                  {s.exchange}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {isOpen && query && !isSearching && suggestions.length === 0 && (
        <div className="absolute mt-2 w-full rounded-xl border border-gray-100 bg-white p-6 text-center text-sm text-gray-500 shadow-xl dark:border-gray-800 dark:bg-gray-900 z-50">
          {t("noResults")}
        </div>
      )}
    </div>
  );
}
