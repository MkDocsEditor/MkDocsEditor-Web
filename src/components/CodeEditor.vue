<template>
    <div id="editor">
        <h1>{{ file_name }}</h1>

        <mavon-editor
                language="en"
                placeholder="Empty document ¯\_(ツ)_/¯"
                :toolbars="toolbarOptions"
                :editable="editable"
                :defaultOpen="defaultOpen"
                :subfield="subfield"
                :imageFilter="acceptImageFile"
                v-model="input"/>
    </div>
</template>

<script lang="ts">
    import Vue from "vue"

    import PreferenceItems from "../business/persistence/localstorage/preferences/PreferenceItems.js"

    export default Vue.extend({
        name: "CodeEditor",
        props: {
            initiallyShow: {
                type: String,
                required: false,
                validator: function (value) {
                    // The value must match one of these strings
                    return ['editor', 'preview', 'both'].indexOf(value) !== -1
                }
            },
        },
        data: function () {
            return {
                file_name: "",
                input: '',
                editable: true,
                defaultOpen: 'edit',
                subfield: false,
                toolbarOptions: {
                    bold: true,
                    italic: true,
                    header: true,
                    underline: true,
                    strikethrough: true,
                    mark: true,
                    superscript: true,
                    subscript: true,
                    quote: true,
                    ol: true,
                    ul: true,
                    link: true,
                    imagelink: true,
                    code: true,
                    table: true,
                    fullscreen: false,
                    readmodel: false,
                    /* 1.3.5 */
                    undo: true,
                    redo: true,
                    trash: false,
                    save: false,
                    /* 1.4.2 */
                    navigation: true,
                    /* 2.1.8 */
                    alignleft: true,
                    aligncenter: true,
                    alignright: true,
                    /* 2.2.1 */
                    subfield: true,
                    preview: true,

                    htmlcode: true,
                    help: true,
                }
            }
        },
        mounted: function () {
            // get preference value
            let initiallyShow = this.$preferenceManager.loadPreferenceValue(PreferenceItems.Editor.openDefault);

            // and map it to the (slightly weird) properties of the component
            this.defaultOpen = (initiallyShow == 'preview' || initiallyShow == 'both') ? 'preview' : 'edit';
            this.subfield = initiallyShow == 'both';

            let that = this;
            this.retrieveFileContent().then(function (result) {
                if (result.status == 200) {
                    that.input = result.data;
                } else {
                    this.$toasted.show("Error loading file :-(");
                }
            });
        },
        methods: {
            getDocumentId: function () {
                return this.$route.params.id
            },
            acceptImageFile: function () {
                // don't allow uploading files (yet)
                return false
            },
            retrieveFileContent: function () {
                let documentId = this.getDocumentId();
                return this.$restClient.getFileContent(documentId)
            }
        },
    })
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

    /* TODO */

</style>