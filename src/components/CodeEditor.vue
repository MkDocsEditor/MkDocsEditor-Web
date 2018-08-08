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

    export default {
        name: "CodeEditor",
        data: () => ({
            file_name: "Main.md",
            input: '# hello',
            codeMirrorOptions: {
                tabSize: 4,
                styleActiveLine: true,
                lineNumbers: true,
                lineWrapping: false,
                line: true,
                mode: 'text/x-markdown',
                theme: 'lesser-dark'
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