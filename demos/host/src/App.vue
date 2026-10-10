<script setup lang="ts">
import HelloWorld from './components/HelloWorld.vue';
import { defineAsyncComponent } from 'vue';
import { loadLib } from 'linkjs';
import { createRemoteApp } from 'linkjs/vue';

const RemoteApp = createRemoteApp('remote');
const RemoteLibComponent = defineAsyncComponent(async () => {
  const remoteLib = await loadLib('remote-lib/HelloWorld', {
    host: 'http://localhost:4001',
  });
  return remoteLib;
});
</script>

<template>
  <header>
    <img alt="Vue logo" class="logo" src="@/assets/logo.svg" width="125" height="125" />

    <div class="wrapper">
      <HelloWorld msg="I am host app!" />
      <div data-linkjs-scope="remote">
        <RemoteApp msg="I am remote app" />
      </div>
      <div data-linkjs-scope="remote-lib">
        <RemoteLibComponent msg="I am remote lib" />
      </div>
    </div>
  </header>
</template>

<style scoped>
header {
  line-height: 1.5;
  max-height: 100vh;
}

.logo {
  display: block;
  margin: 0 auto 2rem;
}
.wrapper {
  display: flex;
  flex-wrap: wrap;
  flex-direction: column;
  align-items: center;
  width: 100vw;
}
</style>
