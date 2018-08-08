<template>
    <div id="editor">
        <h1>{{ file_name }}</h1>

        <div id="editor-container">
            <div class="codemirror">
                <!-- codemirror -->
                <codemirror ref="code-editor" v-model="input" :options="codeMirrorOptions"></codemirror>
            </div>
            <div id="compiled-markdown" v-html="compiledMarkdown"></div>
        </div>

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
                // scroll: none,
                fixedGutter: false,
                scrollbarStyle: "native",
                styleActiveLine: true,
                lineNumbers: true,
                lineWrapping: true,
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

    #editor {
        height: calc(100vh - 80px);
    }

    #editor-container {
        display: flex;
        flex-direction: row;
        height: 100%;
        width: 100%;
    }

    #compiled-markdown {
        width: 50%;
        height: 100%;
    }

    .codemirror {
        width: 50%;
        height: 100%;
    }

    /* Why does this have no effect? */
    .CodeMirror {
        height: 100% !important;
    }

    /* TODO */

</style>