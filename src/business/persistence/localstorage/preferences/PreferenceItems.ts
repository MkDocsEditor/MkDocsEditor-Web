/**
 * Preference constants
 */
import PreferenceItem from '@/business/persistence/localstorage/preferences/PreferenceItem';

export default {
    Server: {
        URL: new PreferenceItem('SettingsServerURL', ''),
        Username: new PreferenceItem('settingsServerUsername', ''),
        Password: new PreferenceItem('settingsServerPassword', ''),
    },
    Editor: {
        openDefault: new PreferenceItem('settingsEditorOpenDefault', 'both'),
    },
};
