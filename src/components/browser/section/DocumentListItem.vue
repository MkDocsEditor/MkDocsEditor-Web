<template>
    <div>
        <md-card md-with-hover v-on:click.native="onEdit()">
            <md-card-header>
                <div class="md-title">
                    <md-icon>description</md-icon>
                    {{ document.name }}
                </div>
                <div class="md-subhead">
                    {{ document.file_size}}
                </div>
            </md-card-header>

            <md-card-actions>
                <router-link :to="'/code_editor/' + document.id">
                    <md-button v-on:click="onEdit()" v-on:click.stop class="md-icon-button md-list-action">
                        <md-icon>edit</md-icon>
                    </md-button>
                </router-link>
                <md-button v-on:click="onDelete()" v-on:click.stop class="md-icon-button md-list-action">
                    <md-icon>delete</md-icon>
                </md-button>
            </md-card-actions>
        </md-card>

        <md-dialog-confirm
                :md-active.sync="deleteDialogActive"
                md-title="Delete"
                :md-content="'Do you really want to delete the document file <b>' + document.name + '</b> ?'"
                md-confirm-text="Delete"
                md-cancel-text="Cancel"
                @md-cancel="onDeleteCanceled"
                @md-confirm="onDeleteConfirmed"/>
    </div>
</template>

<script lang="ts">
    import {Component, Vue} from 'vue-property-decorator';
    import DocumentModel from '@/business/rest/model/DocumentModel'

    @Component({
        props: {
            document: {
                type: DocumentModel,
                required: true,
            },
        }
    })
    export default class DocumentListItem extends Vue {
        deleteDialogActive = false;

        onEdit(): void {
            this.$emit('edit-document', this.document.id);
            this.$router.push({name: 'CodeEditor', params: {id: this.document.id}});
        }

        onDelete(): void {
            this.$emit('delete-document', this.document.id);
            this.deleteDialogActive = true;
        }

        onDeleteCanceled(): void {
            this.$toasted.show('Deletion of document "' + this.document.name + '" canceled');
        }

        onDeleteConfirmed(): void {
            this.$toasted.show('Document "' + this.document.name + '" deleted');
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