<template>
    <div>
        <md-card md-with-hover>
            <md-list-item>
                <md-icon>attach_file</md-icon>
                <span class="md-list-item-text">{{ resource.name }}</span>
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
                v-model="newResourceName"
                md-title="Rename resource"
                md-input-maxlength="30"
                md-input-placeholder="Type file name..."/>

        <md-dialog-confirm
                :md-active.sync="deleteDialogActive"
                md-title="Delete"
                :md-content="'Do you really want to delete the resource file <b>' + resource.name + '</b> ?'"
                md-confirm-text="Delete"
                md-cancel-text="Cancel"
                @md-cancel="onDeleteCanceled"
                @md-confirm="onDeleteConfirmed"/>
    </div>
</template>

<script lang="ts">
    import {Component, Prop, Vue, Watch} from "vue-property-decorator";
    import ResourceModel from "@/business/rest/model/ResourceModel";

    @Component({})

    export default class ResourceListItem extends Vue {

        @Prop({type: ResourceModel, required: true}) public readonly resource!: ResourceModel;

        private editDialogActive = false;
        private deleteDialogActive = false;
        private newResourceName = this.resource.name;

        @Watch("newResourceName", {immediate: true, deep: true})
        public onNewResourceNameChanged(newValue: string, oldValue: string) {
            this.$toasted.show(`Resource '${this.resource.name}' renamed from '${oldValue}' to '${newValue}'`);
        }

        public onEdit(): void {
            this.$emit("edit-resource", this.resource.id);
            this.newResourceName = this.resource.name;
            this.editDialogActive = true;
        }

        public onDelete(): void {
            this.$emit("delete-resource", this.resource.id);
            this.deleteDialogActive = true;
        }

        public onDeleteCanceled(): void {
            this.$toasted.show("Deletion of resource \"" + this.resource.name + "\" canceled");
        }

        public onDeleteConfirmed(): void {
            this.$toasted.show("Resource \"" + this.resource.name + "\" deleted");
        }
    }
</script>

<style lang="scss" scoped>

    .md-card {
        margin: 2px 16px
    }

</style>
