<script setup lang="ts">
import HelloWorld from './components/HelloWorld.vue';
import { defineAsyncComponent } from 'vue';
import { loadRemote, loadRemoteLib } from 'linkjs';

const RemoteComponent = defineAsyncComponent(async () => {
  const remote = await loadRemote('remote/HelloWorld', {
    host: 'http://localhost:8080',
  });
  return remote;
});
const RemoteComponentLib = defineAsyncComponent(async () => {
  const remote = await loadRemoteLib('remote/HelloWorld', {
    host: 'http://localhost:4001',
  });
  return remote;
});
</script>

<template>
  <header>
    <img alt="Vue logo" class="logo" src="@/assets/logo.svg" width="125" height="125" />

    <div class="wrapper">
      <HelloWorld msg="I am host app" />
      <RemoteComponent msg="I am remote app" />
      <RemoteComponentLib msg="I am remote lib"/>
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
  width: 100vw
}
</style>
