import FileBrowser from './components/browser/FileBrowser.vue'
import CodeEditor from './components/CodeEditor.vue'
import Settings from './components/Settings.vue'
import About from './components/about/About.vue'
import AboutLibraries from './components/about/pages/libraries/AboutLibraries.vue'

export default [
    {name: "Home", path: '/', component: FileBrowser},
    {name: "FileBrowserMain", path: '/file_browser', component: FileBrowser},
    {name: "FileBrowser", path: '/file_browser/:id', component: FileBrowser},
    {name: "CodeEditor", path: '/code_editor/:id', component: CodeEditor},
    {name: "Settings", path: '/settings', component: Settings},
    {name: "About", path: '/about', component: About},
    {name: "AboutLibraries", path: '/about/libraries', component: AboutLibraries}
]