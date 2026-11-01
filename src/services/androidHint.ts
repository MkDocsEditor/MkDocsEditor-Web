import { useDisplay } from 'vuetify'

import { mayUseAndroidApp } from './connectLink'
import { local } from './storage'

/** The "Use the Android app" hint shows once per browser, on phone-sized screens. */
const KEY = 'mkdocseditor.androidHintShown'

function androidHintSeen(): boolean {
  try {
    return local()?.getItem(KEY) === '1'
  } catch {
    return true
  }
}

export function markAndroidHintSeen(): void {
  try {
    local()?.setItem(KEY, '1')
  } catch {
    // without storage the hint may show again, which is fine
  }
}

/** Whether to offer the app hint now. Call from a component's setup (uses Vuetify's display). */
export function useAndroidHint(): () => boolean {
  const display = useDisplay()
  return () => display.smAndDown.value && mayUseAndroidApp() && !androidHintSeen()
}
