import PreferenceItem from '@/business/persistence/preferences/PreferenceItem';

/**
 * Preference constants
 */
export default {
    Server: {
        URL: new PreferenceItem('SettingsServerURL', ''),
        Auth: {
            Enabled: new PreferenceItem('settingsServerAuthEnabled', false),
            Username: new PreferenceItem('settingsServerAuthUsername', ''),
            Password: new PreferenceItem('settingsServerAuthPassword', ''),
        },

    },
    Editor: {
        openDefault: new PreferenceItem('settingsEditorOpenDefault', 'both'),
    },
};
