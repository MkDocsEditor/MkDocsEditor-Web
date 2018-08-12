<template>
    <div>
        <md-tabs md-sync-route>
            <md-tab id="tab-home" md-label="Home" to="about/libraries">
                <about-libraries></about-libraries>
            </md-tab>
        </md-tabs>
    </div>
</template>

<script lang="ts">
    import Vue from "vue"
    import AboutLibraries from "./pages/AboutLibraries.vue"

    export default Vue.extend({
        name: 'About',
        props: {
            msg: String
        },
        methods: {
        },
        components: {
            AboutLibraries
        },
    })
</script>

<style scoped>
    li {
        display: inline-block;
    }
</style>
