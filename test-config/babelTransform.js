// Test-only Babel transform for the frontend Jest suite.
//
// Mirrors react-scripts' transform (babel-preset-react-app) and additionally lowers let/const
// to var, which is what the production browser bundle does (verified in build/static/js).
// Without it, Node-targeted test builds hit a temporal-dead-zone error that production never
// sees: pages/Chat.jsx references `students` in a useEffect dependency array before its
// `const` declaration (see research/simulator_audit/regression_test_plan.md, "Known latent
// defects"). Remove the plugin once that declaration order is fixed.
'use strict';

process.env.BABEL_ENV = process.env.BABEL_ENV || 'test';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const babelJest = require('babel-jest');

module.exports = babelJest.createTransformer({
  presets: [require.resolve('babel-preset-react-app')],
  plugins: [require.resolve('@babel/plugin-transform-block-scoping')],
  babelrc: false,
  configFile: false,
});
