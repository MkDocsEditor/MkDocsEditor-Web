import RestClient from '@/business/rest/RestClient';
import PreferenceManager from '@/business/persistence/preferences/PreferenceManger';
import {Toasted} from 'vue-toasted';

declare module 'vue/types/vue' {
    interface Vue {
        $appName: string; // define real typings here if you want
        $preferenceManager: PreferenceManager;
        $restClient: RestClient;
        $toasted: Toasted;
    }
}
