<template>
    <div>
        <md-card md-with-hover>
            <md-card-header>
                <div class="md-title">{{ document.name }}</div>
                <div class="md-subhead">{{ document.file_size}}</div>
            </md-card-header>

            <md-card-actions>
                <md-button v-on:click="onEdit()" class="md-icon-button md-list-action">
                    <md-icon>edit</md-icon>
                </md-button>
                <md-button v-on:click="onDelete()" class="md-icon-button md-list-action">
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
    import Vue from "vue"

    import DocumentModel from "../../../business/rest/model/DocumentModel.js"

    export default Vue.extend({
        name: "DocumentListItem",
        props: {
            document: {
                type: DocumentModel,
                required: true
            },
        },
        data: () => ({
            deleteDialogActive: false
        }),
        methods: {
            onEdit: function () {
                this.$emit('edit-document', this.document.id);
            },
            onDelete: function () {
                this.$emit('delete-document', this.document.id);
                this.deleteDialogActive = true;
            },
            onDeleteCanceled: function () {
                this.$toasted.show("Deletion of document '" + this.document.name  + "' canceled");
            },
            onDeleteConfirmed: function () {
                this.$toasted.show("Document '" + this.document.name + "' deleted");
            }
        }
    })
</script>

<style scoped>

    .md-card {
        margin: 2px 16px
    }

</style>