import { expose } from 'linkjs';
import NegotiationProbe from './components/NegotiationProbe.vue';
import { registerSharedKit } from './register-shared';

// 被宿主加载时：注册自带版本的共享库，并暴露探针组件供宿主消费。
registerSharedKit();

expose('shareRemote', { NegotiationProbe }, { version: '1.0.0' });

export { NegotiationProbe };
