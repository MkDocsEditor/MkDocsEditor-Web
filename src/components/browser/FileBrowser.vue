<template>
    <div>
        <h1>File Browser</h1>
        <section-overview :section="currentSection" v-if="currentSection"></section-overview>
        <md-button class="md-fab md-fab-bottom-right">
            <md-icon>add</md-icon>
            <md-icon>edit</md-icon>
        </md-button>
    </div>
</template>

<script lang="ts">
    import {Component, Vue, Watch} from 'vue-property-decorator';
    import SectionOverview from '@/components/browser/section/SectionOverview.vue';
    import SectionModel from '@/business/rest/model/SectionModel';

    @Component({
        components: {
            SectionOverview,
        },
    })

    export default class FileBrowser extends Vue {
        private currentSection: SectionModel | null = null;

        public mounted(): void {
            this.loadSectionData();
        }

        @Watch('$route', {immediate: true, deep: true})

        /**
         * Loads the currently specified section (per url param) from the server
         */
        private loadSectionData(): void {
            const sectionId = this.getSectionId();

            let restCall;
            if (sectionId) {
                restCall = this.$restClient.getSection(sectionId);
            } else {
                restCall = this.$restClient.getTree();
            }

            restCall.then((result: SectionModel) => {
                this.currentSection = result;
            }).catch((error: any) => {
                this.$toasted.show('Error loading section: ' + error);
            });
        }

        /**
         * @return the section id to show, or null if the root section should be shown
         */
        private getSectionId(): string {
            return this.$route.params.id;
        }

    }
</script>

<style lang="scss" scoped>

</style>
