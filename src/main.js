import Vue from 'vue'
import App from './App.vue'
import VueMaterial from 'vue-material'
import VueRouter from 'vue-router'

import Routes from './routes.js'

import 'vue-material/dist/vue-material.css'
// import 'vue-material/dist/theme/default.css'

Vue.config.productionTip = false;

Vue.use(VueMaterial);


Vue.use(VueRouter);

const router = new VueRouter({routes: Routes});

Vue.prototype.$appName = 'MkDocs Editor';

new Vue({
    el: '#app',
    data: {},
    render: h => h(App),
    router: router
}).$mount('#app');
