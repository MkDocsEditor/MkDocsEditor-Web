<template>
    <div>
        <md-card md-with-hover>
            <md-list-item>
                <md-icon>attach_file</md-icon>
                <span :key="resource.id + '-label'" class="md-list-item-text">{{ resource.name }}</span>
                <md-button class="md-icon-button md-list-action" v-on:click="onEdit()" v-on:click.stop>
                    <md-icon>edit</md-icon>
                </md-button>
                <md-button class="md-icon-button md-list-action" v-on:click="onDelete()" v-on:click.stop>
                    <md-icon>delete</md-icon>
                </md-button>
            </md-list-item>
        </md-card>

        <md-dialog-prompt
            v-model="newResourceName"
            v-model:md-active="editDialogActive"
            md-input-maxlength="30"
            md-input-placeholder="Type file name..."
            md-title="Rename resource"/>

      <md-dialog-confirm
          v-model:md-active="deleteDialogActive"
          :md-content="'Do you really want to delete the resource file <b>' + resource.name + '</b> ?'"
          md-cancel-text="Cancel"
          md-confirm-text="Delete"
          md-title="Delete"
          @md-cancel="onDeleteCanceled"
          @md-confirm="onDeleteConfirmed"/>
    </div>
</template>

<script lang="ts">
    import {Component, Prop, Vue, Watch} from 'vue-property-decorator';
    import ResourceModel from '@/business/rest/model/ResourceModel';

    @Component({})

    export default class ResourceListItem extends Vue {

        @Prop({type: ResourceModel, required: true}) public readonly resource!: ResourceModel;

        private editDialogActive = false;
        private deleteDialogActive = false;
        private newResourceName = this.resource.name;

        @Watch('newResourceName', {immediate: false, deep: true})
        public onNewResourceNameChanged(newValue: string, oldValue: string) {
            this.$toasted.show(`Resource '${this.resource.name}' renamed from '${oldValue}' to '${newValue}'`);
            this.$emit('edit-resource', this.resource.id);
        }

        public onEdit(): void {
            this.newResourceName = this.resource.name;
            this.editDialogActive = true;
        }

        public onDelete(): void {
            this.deleteDialogActive = true;
        }

        public onDeleteCanceled(): void {
            this.$toasted.show('Deletion of resource "' + this.resource.name + '" canceled');
        }

        public onDeleteConfirmed(): void {
            this.$restClient.deleteResource(this.resource.id).then((value: any) => {
                if (value.status !== 200) {
                    this.$toasted.show(`Error deleting resource '${this.resource.name}'`);
                } else {
                    this.$toasted.show(`Resource '${this.resource.name}' deleted`);
                }
                this.$emit('delete-resource', this.resource.id);
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
