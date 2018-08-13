<template>
    <md-card md-with-hover>
        <md-list-item>
            <md-icon>attach_file</md-icon>
            <span class="md-list-item-text">{{ resource.name }}</span>
            <md-button class="md-icon-button md-list-action">
                <md-icon>edit</md-icon>
            </md-button>
            <md-button v-on:click="$emit('delete-resource', resource.id)" class="md-icon-button md-list-action">
                <md-icon>delete</md-icon>
            </md-button>
        </md-list-item>
    </md-card>
</template>

<script lang="ts">
    import Vue from "vue"

    import ResourceModel from "../../../business/rest/model/ResourceModel.js"

    export default Vue.extend({
        name: "ResourceListItem",
        props: {
            resource: {
                type: ResourceModel,
                required: true
            },
        },
        methods: {}
    })
</script>

<style scoped>

    .md-card {
        margin: 2px 16px
    }

</style>