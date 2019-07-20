<template>
    <div>
        <md-card md-with-hover v-on:click.native="onOpenSection()">
            <md-list-item>
                <md-icon>folder</md-icon>
                <span :key="section.id + '-label'" class="md-list-item-text">{{ section.name }}</span>
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
    import {Component, Prop, Vue, Watch} from "vue-property-decorator";
    import SectionModel from "@/business/rest/model/SectionModel";

    @Component({})

    export default class SectionListItem extends Vue {

        @Prop({type: SectionModel, required: true}) public readonly section!: SectionModel;

        public editDialogActive: boolean = false;
        public deleteDialogActive: boolean = false;
        public newSectionName: string = this.section.name;

        @Watch("newSectionName", {immediate: false, deep: false})
        public onNewSectionNameChanged(newValue: string, oldValue: string) {
            this.$restClient.renameSection(this.section.id, newValue).then((value: any) => {
                if (value.status !== 200) {
                    this.$toasted.show("Error renaming section! :-(");
                } else {
                    this.$toasted.show(`Section "${this.section.name}" renamed from "${oldValue}" to "${newValue}"`);
                    this.section.name = newValue;
                }
            }).catch((err: any) => {
                this.$toasted.show("Unknown Error: " + err);
            });
        }

        public onOpenSection(): void {
            this.$emit("open-section", this.section.id);
            this.$router.push({name: "FileBrowser", params: {id: this.section.id}});
        }

        public onEdit(): void {
            this.$emit("edit-section", this.section.id);
            this.editDialogActive = true;
        }

        public onDelete(): void {
            this.$emit("delete-section", this.section.id);
            this.deleteDialogActive = true;
        }

        public onDeleteCanceled(): void {
            this.$toasted.show("Deletion of section \"" + this.section.name + "\" canceled");
        }

        public onDeleteConfirmed(): void {
            this.$restClient.deleteSection(this.section.id).then((value: any) => {
                if (value.status !== 200) {
                    this.$toasted.show(`Error deleting section '${this.section.name}'`);
                } else {
                    this.$toasted.show(`Section '${this.section.name}' deleted`);
                }
            }).catch((err: any) => {
                this.$toasted.show("Unknown Error: " + err);
            });
        }

    }
</script>

<style lang="scss" scoped>

    .md-card {
        margin: 2px 16px
    }

</style>
