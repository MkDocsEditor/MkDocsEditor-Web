<template>
    <div>
        <md-tabs md-sync-route>
            <md-tab id="tab-app" md-label="App">
                <about-app></about-app>
            </md-tab>
            <md-tab id="tab-libraries" md-label="Libraries">
                <about-libraries :libraries="libraries"></about-libraries>
            </md-tab>
        </md-tabs>
    </div>
</template>

<script lang="ts">
    import Vue from "vue"
    import AboutApp from "./pages/AboutApp.vue"
    import AboutLibraries from "./pages/libraries/AboutLibraries.vue"

    export default Vue.extend({
        name: 'About',
        props: {
            msg: String
        },
        data: function () {
            return {
                libraries: [
                    {
                        id: 0,
                        name: "Library 1",
                        description: "An awesome library!",
                        license: "AGPLv3",
                        url: "http://www.google.de",
                    },
                    {
                        id: 1,
                        name: "Library 2",
                        description: "An awesome library too!",
                        license: "GPLv3",
                        url: "http://www.google.de",
                    }
                ]
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
