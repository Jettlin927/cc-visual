import * as esbuild from 'esbuild';

const common = {
  bundle: true,
  format: 'esm',
  target: 'es2022',
  sourcemap: true,
  minify: false,
};

await Promise.all([
  esbuild.build({
    ...common,
    entryPoints: ['src/client/game.ts'],
    outfile: 'public/dist/game.js',
  }),
  esbuild.build({
    ...common,
    entryPoints: ['src/client/app.ts'],
    outfile: 'public/dist/app.js',
  }),
]);

console.log('Build complete: public/dist/game.js, public/dist/app.js');
