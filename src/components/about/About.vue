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
    import {Component, Vue} from "vue-property-decorator";

    import AboutLibraries from "@/components/about/pages/libraries/AboutLibraries.vue";
    import AboutApp from "@/components/about/pages/AboutApp.vue";
    import LibraryItems from "@/components/about/pages/libraries/LibraryItems";

    @Component({
        components: {
            AboutApp,
            AboutLibraries,
        },
    })

    export default class About extends Vue {
    public libraries = new LibraryItems().getAllLibraries();
    }
</script>

<style lang="scss" scoped>
</style>
