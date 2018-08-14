import FileBrowser from './components/browser/FileBrowser.vue'
import CodeEditor from './components/CodeEditor.vue'
import Settings from './components/Settings.vue'
import About from './components/about/About.vue'
import AboutLibraries from './components/about/pages/libraries/AboutLibraries.vue'

export default [
    {path: '/', component: FileBrowser},
    {path: '/file_browser', component: FileBrowser},
    {path: '/code_editor/:id', component: CodeEditor},
    {path: '/settings', component: Settings},
    {path: '/about', component: About},
    {path: '/about/libraries', component: AboutLibraries}
]