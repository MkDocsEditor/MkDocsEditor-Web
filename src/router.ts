import Vue from "vue";
import Router from "vue-router";
import FileBrowser from "@/components/browser/FileBrowser.vue";
import CodeEditor from "@/components/CodeEditor.vue";
import Settings from "@/components/Settings.vue";

Vue.use(Router);

export default new Router({
    routes: [
        {name: "Home", path: "/", component: FileBrowser},
        {name: "FileBrowserMain", path: "/file_browser", component: FileBrowser},
        {name: "FileBrowser", path: "/file_browser/:id", component: FileBrowser},
        {name: "CodeEditor", path: "/code_editor/:id", component: CodeEditor},
        {name: "Settings", path: "/settings", component: Settings},
        {
            name: "AboutApp",
            path: "/about",
            component: () => import(/* webpackChunkName: "about" */ "@/components/about/About.vue"),
        },
        {
            name: "AboutLibraries",
            path: "/about/libraries",
            component: () => import(/* webpackChunkName: "about" */ "@/components/about/About.vue"),
        },
    ],
});
