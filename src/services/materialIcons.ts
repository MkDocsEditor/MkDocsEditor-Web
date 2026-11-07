import { mdiAlertDecagram, mdiTrashCanOutline } from '@mdi/js'
import { shallowRef } from 'vue'

/**
 * The icons of front matter (`icon: material/emoticon-happy`), which Material for MkDocs takes
 * from Material Design Icons. All of them are a big download, so they load on first use.
 */

type IconSet = Record<string, string>
const icons = shallowRef<IconSet | null>(null)
let loading: Promise<void> | null = null

function load(): void {
  loading ??= import('@mdi/js')
    .then((module) => {
      icons.value = module as unknown as IconSet
    })
    .catch((error: unknown) => {
      console.warn('mkdocseditor: could not load the page icons', error)
    })
}

/** `material/emoticon-happy` becomes `mdiEmoticonHappy`; null for other icon sets. */
export function mdiName(shortcode: string): string | null {
  const match = /^material\/([a-z0-9-]+)$/.exec(shortcode.trim())
  if (!match) return null
  return `mdi${match[1]!.replace(/(^|-)([a-z0-9])/g, (_, _dash, c: string) => c.toUpperCase())}`
}

/**
 * The SVG path of a front matter icon. Undefined while the icons load, for unknown icons and
 * for icon sets other than Material's (FontAwesome, Octicons, Simple Icons). Reactive.
 */
export function materialIcon(shortcode: string | undefined): string | undefined {
  if (!shortcode) return undefined
  const name = mdiName(shortcode)
  if (!name) return undefined
  if (!icons.value) {
    load()
    return undefined
  }
  return icons.value[name]
}

/** Material's icons for the page status: `new` and `deprecated`. */
export function statusIcon(status: string | undefined): string | undefined {
  if (status === 'new') return mdiAlertDecagram
  if (status === 'deprecated') return mdiTrashCanOutline
  return undefined
}

export function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1)
}
