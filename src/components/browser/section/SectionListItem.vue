<template>
    <div>
        <md-card md-with-hover>
            <md-list-item>
                <md-icon>folder</md-icon>
                <span class="md-list-item-text">{{ section.name }}</span>
                <md-button v-on:click="onEdit()" class="md-icon-button md-list-action">
                    <md-icon>edit</md-icon>
                </md-button>
                <md-button v-on:click="onDelete()" class="md-icon-button md-list-action">
                    <md-icon>delete</md-icon>
                </md-button>
            </md-list-item>
        </md-card>

        <md-dialog-prompt
                :md-active.sync="editDialogActive"
                v-model="newSectionName"
                md-title="Rename section"
                md-input-maxlength="30"
                md-input-placeholder="Type folder name..."/>

        <md-dialog-confirm
                :md-active.sync="deleteDialogActive"
                md-title="Delete"
                :md-content="'Do you really want to delete section <b>\'' + section.name + '\'</b> and all of it`s content?'"
                md-confirm-text="Delete"
                md-cancel-text="Cancel"
                @md-cancel="onDeleteCanceled"
                @md-confirm="onDeleteConfirmed"/>

    </div>
</template>

<script lang="ts">
    import Vue from "vue"

    import SectionModel from "../../../business/rest/model/SectionModel.js"

    export default Vue.extend({
        name: "SectionListItem",
        props: {
            section: {
                type: SectionModel,
                required: true
            },
        },
        data: function () {
            return {
                editDialogActive: false,
                deleteDialogActive: false,
                newSectionName: this.section.name
            }
        },
        methods: {
            onEdit: function () {
                this.$emit('edit-section', this.section.id);
                this.editDialogActive = true;
            },
            onDelete: function () {
                this.$emit('delete-section', this.section.id);
                this.deleteDialogActive = true;
            },
            onDeleteCanceled: function () {
                this.$toasted.show("Deletion of section '" + this.section.name + "' canceled");
            },
            onDeleteConfirmed: function () {
                this.$toasted.show("Section '" + this.section.name + "' deleted");
            }
        },
        watch: {
            newSectionName: function (newValue, oldValue) {
                this.$toasted.show("Section '" + this.section.name + "' renamed from '" + oldValue + "' to '" + newValue + "'");
            }
        }
    })
</script>

<style scoped>

    .md-card {
        margin: 2px 16px
    }

</style>