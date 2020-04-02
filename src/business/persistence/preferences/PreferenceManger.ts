import LocalStorageManager from '@/business/persistence/localstorage/LocalStorageManager';
import PreferenceItem from '@/business/persistence/preferences/PreferenceItem';

/**
 * Manager for application preferences
 */
export default class PreferenceManager {

    private storageManager: LocalStorageManager;

    public constructor(storageManager: LocalStorageManager) {
        this.storageManager = storageManager;
    }

    /**
     * Load a preference from local storage into data section of this component
     *
     * @param preferenceItem the preference item to retrieve
     */
    public loadPreferenceValue(preferenceItem: PreferenceItem): any {
        const key = preferenceItem.key;
        const defaultValue = preferenceItem.defaultValue;

        return this.storageManager.getValue(key, defaultValue);
    }

    /**
     * Save a preference in local storage
     *
     * @param preferenceItem the preference item to set a new value for
     * @param newValue the new value to assign to it
     */
    public savePreferenceValue(preferenceItem: PreferenceItem, newValue: any) {
        const key = preferenceItem.key;
        if (newValue == null) {
            newValue = preferenceItem.defaultValue;
        }

        this.storageManager.setValue(key, newValue);
    }

}
