// Preloaded via `node --import` for the backend tests (see server/package.json "test").
import { register } from 'node:module';

register('./loader.mjs', import.meta.url);
