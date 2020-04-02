/**
 * Interface for storage implementations
 */
export default interface StorageManager {

    /**
     * Loads a value
     *
     * @param storeKey the item key
     * @param defaultValue the default value to use if no persisted value was found
     */
    getValue(storeKey: string, defaultValue: any): any

    /**
     * Saves a new value
     *
     * @param storeKey the item key
     * @param newValue the new value
     */
    setValue(storeKey: string, newValue: any): void

}
