import Vue from 'vue';
import App from './App.vue';
// @ts-ignore: vue-material does not yet have typescript support
// tslint:disable-next-line
import VueMaterial from 'vue-material';
import 'vue-material/dist/vue-material.css';

import VueRouter from 'vue-router';
import router from './router';

import MavonEditor from 'mavon-editor';
import 'mavon-editor/dist/css/index.css';

import Toasted from 'vue-toasted';

import RestClient from './business/rest/RestClient';
import LocalStorageManager from './business/persistence/localstorage/LocalStorageManager';
import PreferenceManager from './business/persistence/preferences/PreferenceManger';
import PreferenceItems from './business/persistence/preferences/PreferenceItems';

import './registerServiceWorker';

Vue.config.productionTip = true;

Vue.use(VueMaterial);
Vue.use(VueRouter);
Vue.use(MavonEditor);
Vue.use(Toasted, {
    position: 'bottom-left',
    className: null,
    duration: 4000,
    type: null,
    theme: 'primary',
    iconPack: 'material',
});

// const router = new VueRouter({routes: Routes});

// GLOBAL PROPERTIES
Vue.prototype.$appName = 'MkDocsEditor';

const localStorageManager = new LocalStorageManager(Vue.prototype.localStorage);
const preferenceManager = new PreferenceManager(localStorageManager);
Vue.prototype.$preferenceManager = preferenceManager;

const serverUrl = preferenceManager.loadPreferenceValue(PreferenceItems.Server.URL);
const authEnabled = (preferenceManager.loadPreferenceValue(PreferenceItems.Server.Auth.Enabled) === 'true');
const username = preferenceManager.loadPreferenceValue(PreferenceItems.Server.Auth.Username);
const password = preferenceManager.loadPreferenceValue(PreferenceItems.Server.Auth.Password);

Vue.prototype.$restClient = new RestClient(serverUrl, authEnabled, username, password);

Vue.config.productionTip = false;

new Vue({
    router,
    render: (h) => h(App),
}).$mount('#app');
