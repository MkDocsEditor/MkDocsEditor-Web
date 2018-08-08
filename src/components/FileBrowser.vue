<template>
    <md-list>
        <md-list-item>
            <md-icon>move_to_inbox</md-icon>
            <span class="md-list-item-text">Inbox</span>
        </md-list-item>
    </md-list>
</template>

<script>
    import RestClient from '../business/rest/RestClient.js';

    export default {
        name: "FileBrowser",
        data () {
            tree = RestClient.getTree()
        },
        methods: {
            getSection() {

            }
        }
    }
</script>

<style scoped>

</style>