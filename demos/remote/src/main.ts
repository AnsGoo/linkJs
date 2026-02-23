if (location.href.includes('8080')) {
  console.log('Loading remote app');
  import('./loadApp');
} else {
  console.log('Loading local app');
  import('./index.ts');
}
