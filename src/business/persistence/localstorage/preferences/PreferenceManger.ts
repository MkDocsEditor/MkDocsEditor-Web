/**
 * Manager for application preferences
 */
import LocalStorageManager from "@/business/persistence/localstorage/LocalStorageManager";
import PreferenceItem from "@/business/persistence/localstorage/preferences/PreferenceItem";

export default class PreferenceManager {

    localStorageManager: LocalStorageManager;

    constructor(localStorageManager: LocalStorageManager) {
        this.localStorageManager = localStorageManager
    }

    /**
     * Load a preference from local storage into data section of this component
     *
     * @param preferenceItem the preference item to retrieve
     */
    loadPreferenceValue(preferenceItem: PreferenceItem) {
        let key = preferenceItem.key;
        let defaultValue = preferenceItem.defaultValue;

        return this.localStorageManager.getValue(key, defaultValue);
    }

    /**
     * Save a preference in local storage
     *
     * @param preferenceItem the preference item to set a new value for
     * @param newValue the new value to assign to it
     */
    savePreferenceValue(preferenceItem: PreferenceItem, newValue: any) {
        let key = preferenceItem.key;
        if (newValue == null) {
            newValue = preferenceItem.defaultValue;
        }

        this.localStorageManager.setValue(key, newValue);
    }

}