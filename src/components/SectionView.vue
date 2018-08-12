<template>
    <div>
        Section: {{ section.name }}<br/>
        <br/>
        Subsections:<br/>
        <md-list>
            <md-list-item v-for="subsection in section.subsections" :key="subsection.id">
                <md-icon>move_to_inbox</md-icon>
                <span class="md-list-item-text">{{ subsection.name }}</span>
            </md-list-item>
        </md-list>
        Documents:<br/>
        <md-list>
            <md-list-item v-for="document in section.documents" :key="document.id">
                <md-icon>move_to_inbox</md-icon>
                <span class="md-list-item-text">{{ document.name }}</span>
            </md-list-item>
        </md-list>
        Resources:<br/>
        <md-list>
            <md-list-item v-for="resource in section.resources" :key="resource.id">
                <md-icon>move_to_inbox</md-icon>
                <span class="md-list-item-text">{{ resource.name }}</span>
            </md-list-item>
        </md-list>
    </div>
</template>

<script lang="ts">
    import Vue from "vue"

    export default Vue.extend({
        name: "SectionView",
        props: [ 'section']
    })
</script>

<style scoped>

</style>