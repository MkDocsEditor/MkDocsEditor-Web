<template>
    <md-list>
        <md-list-item>
            <md-icon>move_to_inbox</md-icon>
            <span class="md-list-item-text">Inbox</span>
        </md-list-item>
    </md-list>
</template>

<script>
    import Vue from "vue"

    import RestClient from '../business/rest/RestClient.js';

    export default Vue.extend({
        name: "FileBrowser",
        methods: {
        }
    })
</script>

<style scoped>

</style>