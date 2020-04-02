import StorageManager from '@/business/persistence/StorageManager';

/**
 * Manager for general access to local storage
 */
export default class LocalStorageManager implements StorageManager {

    private localStorage: any;

    public constructor(localStore: any) {
        this.localStorage = localStore;
    }

    public getValue(storeKey: string, defaultValue: any): any {
        let storeValue: any = localStorage.getItem(storeKey);
        if (storeValue) {
            if (storeValue instanceof Object) {
                // try to deserialize

                try {
                    storeValue = JSON.parse(storeValue);
                } catch (e) {
                    // @ts-ignore
                    this.console.error(e);
                }
            }
        }

        if (storeValue) {
            return storeValue;
        } else {
            return defaultValue;
        }
    }

    public setValue(storeKey: string, newValue: any): void {
        let serialized = false;
        if (newValue instanceof Object) {
            serialized = true;
        }

        if (serialized) {
            // try to deserialize
            try {
                newValue = JSON.stringify(newValue);
            } catch (e) {
                // @ts-ignore
                this.console.error(e);
            }
        }

        localStorage.setItem(storeKey, newValue);
    }
}
