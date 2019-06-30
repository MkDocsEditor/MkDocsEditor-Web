<template>
    <div>
        <md-tabs md-sync-route>
            <md-tab id="tab-app" md-label="App" to="/about" exact>
                <about-app></about-app>
            </md-tab>
            <md-tab id="tab-libraries" md-label="Libraries" to="/about/libraries">
                <about-libraries :libraries="libraries"></about-libraries>
            </md-tab>
        </md-tabs>
    </div>
</template>

<script lang="ts">
    import Vue from "vue"
    import AboutApp from "./pages/AboutApp.vue"
    import AboutLibraries from "./pages/libraries/AboutLibraries.vue"
    import LibraryItems from "./pages/libraries/LibraryItems.js";

    export default Vue.extend({
        name: 'About',
        data: function () {
            return {
                libraries: LibraryItems.getAllLibraries()
            }
        },
        methods: {},
        components: {
            AboutApp,
            AboutLibraries
        },
    })
</script>

<style scoped>
    li {
        display: inline-block;
    }
</style>
