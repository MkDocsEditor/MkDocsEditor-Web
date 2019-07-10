<template>
    <div>
        <md-card md-with-hover v-on:click.native="onOpenSection()">
            <md-list-item>
                <md-icon>folder</md-icon>
                <span class="md-list-item-text">{{ section.name }}</span>
                <md-button v-on:click="onEdit()" v-on:click.stop class="md-icon-button md-list-action">
                    <md-icon>edit</md-icon>
                </md-button>
                <md-button v-on:click="onDelete()" v-on:click.stop class="md-icon-button md-list-action">
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
    import {Component, Vue} from 'vue-property-decorator';
    import SectionModel from '@/business/rest/model/SectionModel'

    @Component({
        props: {
            section: {
                type: SectionModel,
                required: true,
            },
        },
        watch: {
            newSectionName: function (newValue, oldValue) {
                this.$restClient.renameSection(this.section.id, newValue).then((value) => {
                    if (value.status != 200) {
                        this.$toasted.show('Error renaming section! :-(');
                    } else {
                        this.$toasted.show('Section "' + this.section.name + '" renamed from "' + oldValue + '" to "' + newValue + '"');
                        this.section.name = newValue;
                    }
                }).catch((err) => {
                    this.$toasted.show('Unknown Error: ' + err);
                });
            }
        }
    })
    export default class SectionListItem extends Vue {

        editDialogActive: boolean = false;
        deleteDialogActive: boolean = false;
        newSectionName: string = this.section.name;

        onOpenSection(): void {
            this.$emit('open-section', this.section.id);
            this.$router.push({name: 'FileBrowser', params: {id: this.section.id}});
        }

        onEdit(): void {
            this.$emit('edit-section', this.section.id);
            this.editDialogActive = true;
        }

        onDelete(): void {
            this.$emit('delete-section', this.section.id);
            this.deleteDialogActive = true;
        }

        onDeleteCanceled(): void {
            this.$toasted.show('Deletion of section "' + this.section.name + '" canceled');
        }

        onDeleteConfirmed(): void {
            this.$toasted.show('Section "' + this.section.name + '" deleted');
        }

    }
</script>

<style lang="scss" scoped>

    .md-card {
        margin: 2px 16px
    }

</style>