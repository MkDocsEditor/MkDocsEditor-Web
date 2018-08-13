import Vue from 'vue'
import App from './App.vue'

import VueMaterial from 'vue-material'
import 'vue-material/dist/vue-material.css'

import VueRouter from 'vue-router'
import Routes from './routes.js'

import MavonEditor from "mavon-editor"
import 'mavon-editor/dist/css/index.css'

import RestClient from "./business/rest/RestClient";
import LocalStorageManager from "./business/persistence/localstorage/LocalStorageManager";
import PreferenceManager from "./business/persistence/localstorage/preferences/PreferenceManger.";

Vue.config.productionTip = true;

Vue.use(VueMaterial);
Vue.use(MavonEditor);
Vue.use(VueRouter);

const router = new VueRouter({routes: Routes});

// GLOBAL PROPERTIES
Vue.prototype.$appName = 'MkDocs Editor';
Vue.prototype.$restClient = new RestClient();

let localStorageManager = new LocalStorageManager(Vue.prototype.localStorage);
Vue.prototype.$preferenceManager = new PreferenceManager(localStorageManager);

new Vue({
    el: '#app',
    data: {},
    render: h => h(App),
    router: router
}).$mount('#app');
