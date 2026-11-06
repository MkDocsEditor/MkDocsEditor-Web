import { useStored } from './useStored'

export type StartPage = 'dashboard' | 'files'

/** What `/` shows on this device: "What's going on" (the default) or the files of the top folder. */
export const startPage = useStored<StartPage>('mkdocseditor.startPage', 'dashboard')
