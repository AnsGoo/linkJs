import { exposeLib } from 'linkjs';
import HelloWorld from './components/HelloWorld.vue';
exposeLib('remote', { HelloWorld }, {
  version: '1.0.0'
});

export {
    HelloWorld,
}
