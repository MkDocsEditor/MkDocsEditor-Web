<template>
    <div id="editor">
        <h1>{{ file_name }}</h1>

        <textarea :value="input" @input="update"></textarea>
        <div v-html="compiledMarkdown"></div>
    </div>
</template>

<script>
    export default {
        name: "CodeEditor",
        data: () => ({
            file_name: "Main.md",
            input: '# hello'
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
        }
    }
</script>

<style scoped>
    html, body, #editor {
        margin: 0;
        height: 100%;
        font-family: 'Helvetica Neue', Arial, sans-serif;
        color: #333;
    }

    textarea, #editor div {
        display: inline-block;
        width: 49%;
        height: 100%;
        vertical-align: top;
        box-sizing: border-box;
        padding: 0 20px;
    }

    textarea {
        border: none;
        border-right: 1px solid #ccc;
        resize: none;
        outline: none;
        background-color: #f6f6f6;
        font-size: 14px;
        font-family: 'Monaco', courier, monospace;
        padding: 20px;
    }

    code {
        color: #f66;
    }
</style>