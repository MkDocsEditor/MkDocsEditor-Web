/**
 * Manager for general access to local storage
 */
export default class LocalStorageManager {

    localStorage;

    constructor(localStore) {
        this.localStorage = localStore
    }

    /**
     * Load a preference from local storage into data section of this component
     *
     * @param storeKey the key used in local storage
     * @param defaultValue the default value to use if no persisted value was found
     */
    getValue(storeKey, defaultValue) {
        let storeValue = localStorage.getItem(storeKey);
        if (storeValue) {
            if (storeValue instanceof Object) {
                // try to deserialize

                try {
                    storeValue = JSON.parse(storeValue);
                } catch (e) {
                    this.console.error(e);
                }
            }
        }

        if (storeValue) {
            return storeValue
        } else {
            return defaultValue
        }
    }

    /**
     * Save a preference in local storage
     *
     * @param storeKey the key to use in local storage
     * @param newValue the new value to assign to it
     */
    setValue(storeKey, newValue) {
        let serialized = false;
        if (newValue instanceof Object) {
            serialized = true;
        }

        if (serialized) {
            // try to deserialize
            try {
                newValue = JSON.stringify(newValue);
            } catch (e) {
                this.console.error(e);
            }
        }

        localStorage.setItem(storeKey, newValue);
    }
}