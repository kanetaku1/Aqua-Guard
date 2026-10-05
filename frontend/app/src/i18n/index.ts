import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import id from './id.json'
import type { Language } from '@/api/types'

/**
 * EN / ID (SCR-COM-006). Bahasa Indonesia is required for Technical Managers;
 * until translations are added, missing keys fall back to English.
 */
const STORAGE_KEY = 'aquaguard.language'

function storedLanguage(): Language {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === 'id' ? 'id' : 'en'
  } catch {
    return 'en'
  }
}

export function changeLanguage(language: Language) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, language)
  } catch {
    // Storage blocked: the choice still applies to this session.
  }
  return i18n.changeLanguage(language)
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, id: { translation: id } },
  lng: storedLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  initAsync: false,
})

export default i18n
