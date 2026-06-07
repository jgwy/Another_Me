/**
 * i18n bootstrap for 觅见.AI.
 *
 * - **zh is the default** (and the fallback); en coexists and is switchable.
 * - Real i18next *namespaces* mirror the locale files 1:1 — one JSON per
 *   namespace per language under `locales/{zh,en}/<ns>.json`.
 * - Detection reads an explicit user choice from `localStorage`, then the
 *   `<html lang>` tag (which ships as `zh`), so a first visit lands on Chinese
 *   and a switch is remembered. Domain content (personas, scene prompts,
 *   reports) is intentionally NOT translated here — only UI chrome.
 */
import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import zhCommon from "./locales/zh/common.json";
import zhNav from "./locales/zh/nav.json";
import zhAgents from "./locales/zh/agents.json";
import zhCreate from "./locales/zh/create.json";
import zhMarketplace from "./locales/zh/marketplace.json";
import zhIsland from "./locales/zh/island.json";
import zhReports from "./locales/zh/reports.json";
import zhConversation from "./locales/zh/conversation.json";
import zhSandbox from "./locales/zh/sandbox.json";
import zhInbox from "./locales/zh/inbox.json";
import zhRelationships from "./locales/zh/relationships.json";
import zhTrips from "./locales/zh/trips.json";
import zhScenarios from "./locales/zh/scenarios.json";

import enCommon from "./locales/en/common.json";
import enNav from "./locales/en/nav.json";
import enAgents from "./locales/en/agents.json";
import enCreate from "./locales/en/create.json";
import enMarketplace from "./locales/en/marketplace.json";
import enIsland from "./locales/en/island.json";
import enReports from "./locales/en/reports.json";
import enConversation from "./locales/en/conversation.json";
import enSandbox from "./locales/en/sandbox.json";
import enInbox from "./locales/en/inbox.json";
import enRelationships from "./locales/en/relationships.json";
import enTrips from "./locales/en/trips.json";
import enScenarios from "./locales/en/scenarios.json";

export const SUPPORTED_LANGUAGES = ["zh", "en"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: SupportedLanguage = "zh";

/** Namespace order is the file set from the refactor plan §1. */
export const NAMESPACES = [
  "common",
  "nav",
  "agents",
  "create",
  "marketplace",
  "island",
  "reports",
  "conversation",
  "sandbox",
  "inbox",
  "relationships",
  "trips",
  "scenarios",
] as const;

export const resources = {
  zh: {
    common: zhCommon,
    nav: zhNav,
    agents: zhAgents,
    create: zhCreate,
    marketplace: zhMarketplace,
    island: zhIsland,
    reports: zhReports,
    conversation: zhConversation,
    sandbox: zhSandbox,
    inbox: zhInbox,
    relationships: zhRelationships,
    trips: zhTrips,
    scenarios: zhScenarios,
  },
  en: {
    common: enCommon,
    nav: enNav,
    agents: enAgents,
    create: enCreate,
    marketplace: enMarketplace,
    island: enIsland,
    reports: enReports,
    conversation: enConversation,
    sandbox: enSandbox,
    inbox: enInbox,
    relationships: enRelationships,
    trips: enTrips,
    scenarios: enScenarios,
  },
} as const;

let initialized = false;

export function initI18n() {
  if (initialized || i18n.isInitialized) return i18n;
  initialized = true;

  void i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      debug: import.meta.env.DEV,
      fallbackLng: DEFAULT_LANGUAGE,
      supportedLngs: [...SUPPORTED_LANGUAGES],
      nonExplicitSupportedLngs: true,
      load: "languageOnly",
      ns: [...NAMESPACES],
      defaultNS: "common",
      resources,
      detection: {
        order: ["localStorage", "htmlTag"],
        lookupLocalStorage: "mijian.lang",
        caches: ["localStorage"],
      },
      interpolation: {
        escapeValue: false,
      },
      react: {
        useSuspense: false,
      },
    });

  return i18n;
}

/** Persist + apply a language choice and keep `<html lang>` in sync. */
export function setLanguage(lng: SupportedLanguage) {
  void i18n.changeLanguage(lng);
  if (typeof document !== "undefined") {
    document.documentElement.lang = lng;
  }
}

export default i18n;
