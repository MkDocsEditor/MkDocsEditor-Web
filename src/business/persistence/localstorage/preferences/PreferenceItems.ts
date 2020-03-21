/**
 * Preference constants
 */
import PreferenceItem from '@/business/persistence/localstorage/preferences/PreferenceItem';

export default {
    Server: {
        URL: new PreferenceItem('SettingsServerURL', ''),
        Auth: {
            Enabled: new PreferenceItem('settingsServerAuthEnabled', ''),
            Username: new PreferenceItem('settingsServerAuthUsername', ''),
            Password: new PreferenceItem('settingsServerAuthPassword', ''),
        },

    },
    Editor: {
        openDefault: new PreferenceItem('settingsEditorOpenDefault', 'both'),
    },
};
