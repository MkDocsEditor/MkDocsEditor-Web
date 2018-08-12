<template>
    <div>
        <md-list-item>
            <md-icon>attach_file</md-icon>
            <span class="md-list-item-text">{{ resource.name }}</span>
        </md-list-item>
    </div>
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
    })
</script>

<style scoped>

</style>