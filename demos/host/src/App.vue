<script setup lang="ts">
import HelloWorld from './components/HelloWorld.vue';
import { defineAsyncComponent } from 'vue';
import { getRemote, loadRemoteLib } from 'linkjs';

// const RemoteComponent = defineAsyncComponent(async () => {
//   const remote = await getRemote('remote/HelloWorld');
//   return remote;
// });
const RemoteLibComponent = defineAsyncComponent(async () => {
  const remoteLib = await loadRemoteLib('remote-lib/HelloWorld', {
    host: 'http://localhost:4001',
  });
  return remoteLib;
});
</script>

<template>
  <header>
    <img alt="Vue logo" class="logo" src="@/assets/logo.svg" width="125" height="125" />

    <div class="wrapper">
      <HelloWorld msg="I am host app" />
      <!-- <RemoteComponent msg="I am remote app" /> -->
      <RemoteLibComponent msg="I am remote lib" />
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
