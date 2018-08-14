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
    import Library from "./pages/libraries/Library";

    export default Vue.extend({
        name: 'About',
        props: {
            msg: String
        },
        data: function () {
            return {
                libraries: [
                    new Library(
                        1,
                        "mavonEditor",
                        "A markdown editor based on Vue that supports a variety of personalized features",
                        "MIT",
                        "https://md.zhystar.com/",
                        null,
                        "HinesZhu"
                    ),
                    new Library(
                        2,
                        "vue-toasted",
                        "Responsive Touch Compatible Toast plugin for VueJS 2+",
                        "MIT",
                        "https://github.com/shakee93/vue-toasted#options",
                        "https://camo.githubusercontent.com/ad2f797f88f98ee4988dc82a4d70e72936170871/68747470733a2f2f66726573687069786c2e636f6d2f7675652d746f61737465642e706e673f6e6577",
                        "Shakeeb Sadikeen"
                    ),
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
