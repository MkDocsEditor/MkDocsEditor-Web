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
    import {Component, Vue} from 'vue-property-decorator';
    import PreferenceItems from '@/business/persistence/localstorage/preferences/PreferenceItems';

    @Component({
        props: {
            initiallyShow: {
                type: String,
                required: false,
                validator(value) {
                    // The value must match one of these strings
                    return ['editor', 'preview', 'both'].indexOf(value) !== -1;
                },
            },
        },
        mounted() {
            // get preference value
            const initiallyShow = this.$preferenceManager.loadPreferenceValue(PreferenceItems.Editor.openDefault);

            // and map it to the (slightly weird) properties of the component
            this.defaultOpen = (initiallyShow === 'preview' || initiallyShow === 'both') ? 'preview' : 'edit';
            this.subfield = initiallyShow === 'both';

            const that = this;
            this.retrieveFileContent().then((result) => {
                if (result.status === 200) {
                    that.input = result.data;
                } else {
                    that.$toasted.show('Error loading file :-(');
                }
            });
        },
    })
    export default class CodeEditor extends Vue {

        file_name: string = '';
        input: string = '';
        editable: boolean = true;
        defaultOpen: string = 'edit';
        subfield: boolean = false;
        toolbarOptions = {
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
        };

        getDocumentId() {
            return this.$route.params.id;
        }

        acceptImageFile() {
            // don't allow uploading files (yet)
            return false;
        }

        retrieveFileContent() {
            const documentId = this.getDocumentId();
            return this.$restClient.getFileContent(documentId);
        }

    }
</script>

<style lang="scss" scoped>

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