const id = 'linkjs-plugin';
const resolvedId = '\0' + id;

export default function linkjsPlugin() {
  return {
    name: 'linkjs-plugin', // this name will show up in logs and errors
    transform(code, id) {
      console.log(id);
    },
    resolvedId(id) {
      console.log(id);
    },
  };
}
