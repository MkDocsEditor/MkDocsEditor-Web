<template>
    <div class="page-container">
        <md-app>
            <md-app-toolbar class="md-primary" md-elevation="2">
                <md-button class="md-icon-button menuToggle" @click="toggleMenu" v-if="!menuVisible">
                    <md-icon>menu</md-icon>
                </md-button>
                <md-avatar style="margin: 0">
                    <img src="./assets/logo.png" alt="App Logo">
                </md-avatar>
                <span class="md-title">{{ $appName }}</span>
            </md-app-toolbar>

            <md-app-drawer :md-active.sync="menuVisible" md-persistent="mini">
                <md-toolbar class="md-transparent" md-elevation="2">
                    <span>Navigation</span>

                    <div class="md-toolbar-section-end">
                        <md-button class="md-icon-button md-dense" @click="toggleMenu">
                            <md-icon>keyboard_arrow_left</md-icon>
                        </md-button>
                    </div>
                </md-toolbar>

                <md-list>
                    <router-link to="/file_browser">
                        <md-list-item>
                            <md-icon>list</md-icon>
                            <span class="md-list-item-text">File Browser</span>
                        </md-list-item>
                    </router-link>

                    <router-link to="/settings">
                        <md-list-item>
                            <md-icon>settings</md-icon>
                            <span class="md-list-item-text">Settings</span>
                        </md-list-item>
                    </router-link>

                    <router-link to="/about">
                        <md-list-item>
                            <md-icon>info</md-icon>
                            <span class="md-list-item-text">About</span>
                        </md-list-item>
                    </router-link>
                </md-list>
            </md-app-drawer>

            <md-app-content>
                <router-view></router-view>
            </md-app-content>
        </md-app>
    </div>
</template>

<script lang="ts">
    import {Vue} from "vue-property-decorator";

    export default class MainAppLayout extends Vue {
    private menuVisible: boolean = false;

    public toggleMenu(): boolean {
        this.menuVisible = !this.menuVisible;
        return this.menuVisible;
    }
    }
</script>

<style lang="scss">
    /* ====================== */
    /*  Vue Material Theming  */
    /* ====================== */
    @import "~vue-material/dist/theme/engine"; // Import the theme engine

    @include md-register-theme("default", (
            primary: md-get-palette-color(lightgreen, 700), // The primary color of your application
            accent: md-get-palette-color(lightblue, A700) // The accent or secondary color
    ));

    @import "~vue-material/dist/theme/all"; // Apply the theme

    /* ====================== */
    /*         Toasted        */
    /* ====================== */
    //.my-toast .toasted.primary.info {
    //    background: #3c3c3c;
    //}

    /* ====================== */
    /*   Other app wide css   */
    /* ====================== */
    * {
        font-family: "Roboto", "Helvetica Neue", Arial, sans-serif;
    }
</style>

<style lang="scss" scoped>
    .md-app {
        min-height: calc(100vh);
        //border: 1px solid rgba(#000, .12);
    }

    .md-content {
        height: calc(100vh - 80px);
    }

    .menuToggle {
        margin-right: 45px
    }

    // Demo purposes only
    .md-drawer {
        width: 230px;
        max-width: calc(100vw - 125px);
    }
</style>