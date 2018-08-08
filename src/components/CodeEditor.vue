<template>
    <div id="editor">
        <h1>{{ file_name }}</h1>

        <div class="codemirror">
            <!-- codemirror -->
            <codemirror v-model="input" :options="codeMirrorOptions"></codemirror>
        </div>
        <div v-html="compiledMarkdown"></div>

    </div>
</template>

<script>
    // require component
    import {codemirror} from 'vue-codemirror'

    // require styles
    import 'codemirror/lib/codemirror.css'

    // require more codemirror resource...
    import 'codemirror/mode/gfm/gfm.js'
    import 'codemirror/mode/xml/xml.js'

    // theme
    import 'codemirror/theme/darcula.css'
    import 'codemirror/theme/idea.css'

    export default {
        name: "CodeEditor",
        data: () => ({
            file_name: "Main.md",
            input: '# hello',
            codeMirrorOptions: {
                undoDepth: 1000,
                tabSize: 4,
                styleActiveLine: true,
                lineNumbers: true,
                lineWrapping: false,
                line: true,
                indentWithTabs: false,
                readOnly: false,
                mode: 'gfm',
                gitHubSpice: true,
                theme: 'darcula'
            }
        }),
        computed: {
            compiledMarkdown: function () {
                return marked(this.input, {sanitize: true})
            }
        },
        methods: {
            update: _.debounce(function (e) {
                this.input = e.target.value
            }, 150)
        },
        components: {
            codemirror
        }
    }
</script>

<style scoped>

    /* TODO */

</style>