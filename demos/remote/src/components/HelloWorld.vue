<script setup lang="ts">
withDefaults(
  defineProps<{
    msg: string;
    age: number;
    name: string;
    sex: 'male' | 'female';
  }>(),
  {
    msg: 'I am remote app!',
  },
);
</script>

<template>
  <div class="greetings">
    <h1 class="green">{{ msg }} hot update</h1>
    <p>Age: {{ age }}</p>
    <p>Name: {{ name }}</p>
    <p>Sex: {{ sex }}</p>
    <h3>
      You’ve successfully created a project with
      <a href="https://vite.dev/" target="_blank" rel="noopener">Vite</a> +
      <a href="https://vuejs.org/" target="_blank" rel="noopener">Vue 3</a>. What's next?
    </h3>
  </div>
</template>

<style scoped>
h1 {
  font-weight: 900;
  font-size: 2.6rem;
  position: relative;
  top: -10px;
  color: aquamarine;
}

h3 {
  font-size: 1.2rem;
}

.greetings h1,
.greetings h3 {
  text-align: center;
}

@media (min-width: 1024px) {
  .greetings h1,
  .greetings h3 {
    text-align: left;
  }
}
</style>
