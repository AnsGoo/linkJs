if (location.href.includes('8080')) {
  import('./loadApp');
} else {
  import('./index.ts');
}
