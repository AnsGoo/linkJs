<script setup lang="ts">
withDefaults(
  defineProps<{
    msg: string;
  }>(),
  {
    msg: 'I am remote app!',
  },
);
</script>

<template>
  <div class="greetings">
    <h1 class="green">{{ msg }}</h1>
  </div>
</template>

<style scoped>
h1 {
  font-weight: 900;
  font-size: 2.6rem;
  position: relative;
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
