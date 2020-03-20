import Vue from 'vue';
import Router from 'vue-router';
import FileBrowser from '@/components/browser/FileBrowser.vue';
import CodeEditor from '@/components/CodeEditor.vue';
import Settings from '@/components/Settings.vue';

Vue.use(Router);

const router = new Router({
    routes: [
        {
            name: 'Home', path: '/', component: FileBrowser,
            meta: {
                title: 'MkDocsEditor',
                metaTags: [
                    {name: 'description', content: 'The home page of MkDocsEditor.',},
                    {property: 'og:description', content: 'The home page of MkDocsEditor.',},
                ],
            },
        },
        {
            name: 'FileBrowserMain', path: '/file_browser',
            component: () => import(/* webpackChunkName: "codeEditor" */ '@/components/browser/FileBrowser.vue'),
            meta: {title: 'File Browser'},
        },
        {
            name: 'FileBrowser', path: '/file_browser/:id',
            component: () => import(/* webpackChunkName: "codeEditor" */ '@/components/browser/FileBrowser.vue'),
            meta: {title: 'File Browser'},
        },
        {
            name: 'CodeEditor', path: '/code_editor/:id',
            component: () => import(/* webpackChunkName: "codeEditor" */ '@/components/CodeEditor.vue'),
            meta: {title: 'Code Editor'},
        },
        {
            name: 'Settings', path: '/settings',
            component: () => import(/* webpackChunkName: "settings" */ '@/components/Settings.vue'),
            meta: {title: 'Settings'},
        },
        {
            name: 'AboutApp', path: '/about',
            component: () => import(/* webpackChunkName: "about" */ '@/components/about/About.vue'),
            meta: {title: 'About'},
        },
        {
            name: 'AboutLibraries',
            path: '/about/libraries',
            component: () => import(/* webpackChunkName: "about" */ '@/components/about/About.vue'),
            meta: {title: 'Libraries'},
        },
    ],
});
router.beforeEach((to, from, next) => {
    document.title = to.meta.title;
    next();
});

export default router;
