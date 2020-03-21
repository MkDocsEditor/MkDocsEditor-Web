<template>
    <div>
        <md-card md-with-hover v-on:click.native="onOpenSection()">
            <md-list-item>
                <md-icon>folder</md-icon>
                <span :key="section.id + '-label'" class="md-list-item-text">{{ section.name }}</span>
                <md-button class="md-icon-button md-list-action" v-on:click="onEdit()" v-on:click.stop>
                    <md-icon>edit</md-icon>
                </md-button>
                <md-button class="md-icon-button md-list-action" v-on:click="onDelete()" v-on:click.stop>
                    <md-icon>delete</md-icon>
                </md-button>
            </md-list-item>
        </md-card>

        <md-dialog-prompt
                :md-active.sync="editDialogActive"
                md-input-maxlength="30"
                md-input-placeholder="Type folder name..."
                md-title="Rename section"
                v-model="newSectionName"/>

        <md-dialog-confirm
                :md-active.sync="deleteDialogActive"
                :md-content="'Do you really want to delete section <b>\'' + section.name + '\'</b> and all of it`s content?'"
                @md-cancel="onDeleteCanceled"
                @md-confirm="onDeleteConfirmed"
                md-cancel-text="Cancel"
                md-confirm-text="Delete"
                md-title="Delete"/>

    </div>
</template>

<script lang="ts">
    import {Component, Prop, Vue, Watch} from 'vue-property-decorator';
    import SectionModel from '@/business/rest/model/SectionModel';

    @Component({})

    export default class SectionListItem extends Vue {

        @Prop({type: SectionModel, required: true}) public readonly section!: SectionModel;

        public editDialogActive = false;
        public deleteDialogActive = false;
        public newSectionName: string = this.section.name;

        @Watch('newSectionName', {immediate: false, deep: false})
        public onNewSectionNameChanged(newValue: string, oldValue: string) {
            this.$restClient.renameSection(this.section.id, newValue).then((value: any) => {
                if (value.status !== 200) {
                    this.$toasted.show('Error renaming section! :-(');
                } else {
                    this.$toasted.show(`Section "${this.section.name}" renamed from "${oldValue}" to "${newValue}"`);
                    this.section.name = newValue;
                }
                this.$emit('edit-section', this.section.id);
            }).catch((err: any) => {
                this.$toasted.show('Unknown Error: ' + err);
            });
        }

        public onOpenSection(): void {
            this.$emit('open-section', this.section.id);
            this.$router.push({name: 'FileBrowser', params: {id: this.section.id}});
        }

        public onEdit(): void {
            this.editDialogActive = true;
        }

        public onDelete(): void {
            this.deleteDialogActive = true;
        }

        public onDeleteCanceled(): void {
            this.$toasted.show('Deletion of section "' + this.section.name + '" canceled');
        }

        public onDeleteConfirmed(): void {
            this.$restClient.deleteSection(this.section.id).then((value: any) => {
                if (value.status !== 200) {
                    this.$toasted.show(`Error deleting section '${this.section.name}'`);
                } else {
                    this.$toasted.show(`Section '${this.section.name}' deleted`);
                }
                this.$emit('delete-section', this.section.id);
            }).catch((err: any) => {
                this.$toasted.show('Unknown Error: ' + err);
            });
        }

    }
</script>

<style lang="scss" scoped>

    .md-card {
        margin: 2px 16px
    }

</style>
