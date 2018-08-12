import Vue from 'vue'
import App from './App.vue'
import VueMaterial from 'vue-material'
import VueRouter from 'vue-router'

import Routes from './routes.js'

import 'vue-material/dist/vue-material.css'
import RestClient from "./business/rest/RestClient";
// import 'vue-material/dist/theme/default.css'

Vue.config.productionTip = false;

Vue.use(VueMaterial);

import MavonEditor from "mavon-editor"
import 'mavon-editor/dist/css/index.css'

Vue.use(MavonEditor);


Vue.use(VueRouter);

const router = new VueRouter({routes: Routes});

// GLOBAL PROPERTIES
Vue.prototype.$appName = 'MkDocs Editor';
Vue.prototype.$restClient = new RestClient();

new Vue({
    el: '#app',
    data: {},
    render: h => h(App),
    router: router
}).$mount('#app');
