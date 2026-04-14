"use client";

import React from "react";
import { useLanguage } from "@/lib/i18n";

export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="flex bg-gray-100 p-1 rounded-full dark:bg-gray-800">
      {[
        { code: "pt", flagUrl: "https://flagcdn.com/w40/pt.png", title: "Português" },
        { code: "en", flagUrl: "https://flagcdn.com/w40/gb.png", title: "English" },
        { code: "es", flagUrl: "https://flagcdn.com/w40/es.png", title: "Español" },
      ].map((lang) => (
        <button
          key={lang.code}
          onClick={() => setLanguage(lang.code as any)}
          className={`flex items-center space-x-2 px-4 py-1.5 text-sm font-medium rounded-full transition-all ${
            language === lang.code
              ? "bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-50"
              : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-50"
          }`}
        >
          <img src={lang.flagUrl} alt={lang.title} className="w-4 h-auto rounded-[2px] object-cover shadow-sm" />
          <span>{lang.title}</span>
        </button>
      ))}
    </div>
  );
}
