import Vue from 'vue'
import App from './App.vue'

import VueMaterial from 'vue-material'
import 'vue-material/dist/vue-material.css'

import VueRouter from 'vue-router'
import Routes from './routes.js'

import MavonEditor from "mavon-editor"
import 'mavon-editor/dist/css/index.css'

import Toasted from 'vue-toasted'

import RestClient from "./business/rest/RestClient";
import LocalStorageManager from "./business/persistence/localstorage/LocalStorageManager";
import PreferenceManager from "./business/persistence/localstorage/preferences/PreferenceManger.";
import PreferenceItems from "./business/persistence/localstorage/preferences/PreferenceItems.js"


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
    iconPack: 'material'
});

const router = new VueRouter({routes: Routes});

// GLOBAL PROPERTIES
Vue.prototype.$appName = 'MkDocs Editor';

let localStorageManager = new LocalStorageManager(Vue.prototype.localStorage);
const preferenceManager = new PreferenceManager(localStorageManager);
Vue.prototype.$preferenceManager = preferenceManager;

const serverUrl = preferenceManager.loadPreferenceValue(PreferenceItems.Server.URL);
const username = preferenceManager.loadPreferenceValue(PreferenceItems.Server.Username);
const password = preferenceManager.loadPreferenceValue(PreferenceItems.Server.Password);

Vue.prototype.$restClient = new RestClient(serverUrl, username, password);

new Vue({
    el: '#app',
    data: {},
    render: h => h(App),
    router: router
}).$mount('#app');