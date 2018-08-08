import FileBrowser from './components/FileBrowser.vue'
import CodeEditor from './components/CodeEditor.vue'
import HelloWorld from './components/HelloWorld.vue'
import Settings from './components/Settings.vue'
import About from './components/About.vue'

export default [
    {path: '/', component: HelloWorld},
    {path: '/file_browser', component: FileBrowser},
    {path: '/code_editor', component: CodeEditor},
    {path: '/settings', component: Settings},
    {path: '/about', component: About}
]