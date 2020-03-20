<template>
    <div>
        <md-card md-with-hover v-on:click.native="onEdit()">
            <md-card-header>
                <div :key="document.id + '-label'" class="md-title">
                    <md-icon>description</md-icon>
                    {{ document.name }}
                </div>
                <div class="md-subhead">
                    {{ document.file_size}}
                </div>
            </md-card-header>

            <md-card-actions>
                <router-link :to="'/code_editor/' + document.id">
                    <md-button class="md-icon-button md-list-action" v-on:click="onEdit()" v-on:click.stop>
                        <md-icon>edit</md-icon>
                    </md-button>
                </router-link>
                <md-button class="md-icon-button md-list-action" v-on:click="onDelete()" v-on:click.stop>
                    <md-icon>delete</md-icon>
                </md-button>
            </md-card-actions>
        </md-card>

        <md-dialog-confirm
                :md-active.sync="deleteDialogActive"
                :md-content="'Do you really want to delete the document file <b>' + document.name + '</b> ?'"
                @md-cancel="onDeleteCanceled"
                @md-confirm="onDeleteConfirmed"
                md-cancel-text="Cancel"
                md-confirm-text="Delete"
                md-title="Delete"/>
    </div>
</template>

<script lang="ts">
    import {Component, Prop, Vue} from 'vue-property-decorator';
    import DocumentModel from '@/business/rest/model/DocumentModel';

    @Component({})

    export default class DocumentListItem extends Vue {

        @Prop({type: DocumentModel, required: true}) private readonly document!: DocumentModel;

        private deleteDialogActive = false;

        public onEdit(): void {
            this.$emit('edit-document', this.document.id);
            this.$router.push({name: 'CodeEditor', params: {id: this.document.id}});
        }

        public onDelete(): void {
            this.$emit('delete-document', this.document.id);
            this.deleteDialogActive = true;
        }

        public onDeleteCanceled(): void {
            this.$toasted.show(`Deletion of document '${this.document.name}' canceled`);
        }

        public onDeleteConfirmed(): void {
            this.$restClient.deleteDocument(this.document.id).then((value: any) => {
                if (value.status !== 200) {
                    this.$toasted.show(`Error deleting document '${this.document.name}'`);
                } else {
                    this.$toasted.show(`Document '${this.document.name}' deleted`);
                }
            }).catch((err: any) => {
                this.$toasted.show('Unknown Error: ' + err);
            });
        }
    }
</script>

<style lang="scss" scoped>

    .md-title .md-icon {
        vertical-align: middle;
        margin-bottom: 5px;
    }

    .md-card {
        margin: 2px 16px
    }

</style>
