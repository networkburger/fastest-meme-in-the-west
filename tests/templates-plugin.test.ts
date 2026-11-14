import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { templatesPlugin } from '../build/templates-plugin.ts';

/** Call the plugin's load hook with a minimal stand-in for Rollup's plugin context. */
function load(manifest: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fmitw-'));
  const file = path.join(dir, 'templates.json');
  fs.writeFileSync(file, typeof manifest === 'string' ? manifest : JSON.stringify(manifest));
  const [plugin] = templatesPlugin(file);
  (plugin.configResolved as (c: unknown) => void)({ command: 'serve' }); // dev: library inline
  const ctx = {
    addWatchFile() {},
    error(message: string): never {
      throw new Error(message);
    },
  };
  const resolveId = plugin.resolveId as (id: string) => string | undefined;
  const id = resolveId.call(ctx, 'virtual:templates')!;
  return (plugin.load as (id: string) => string).call(ctx, id);
}

const real = JSON.parse(fs.readFileSync('src/data/templates.json', 'utf8'));

describe('virtual:templates (build-time validation)', () => {
  it('emits the grid index and the resolved library for a valid manifest', () => {
    const code = load(real);
    const exported = (name: string) => JSON.parse(new RegExp(`export const ${name} = (.*);`).exec(code)![1]);
    const index = exported('index');
    const library = exported('library');
    expect(index).toHaveLength(real.templates.length);
    expect(Object.keys(index[0]).sort()).toEqual(['avif', 'height', 'id', 'name', 'thumbnail', 'width']);
    expect(library).toHaveLength(real.templates.length);
    expect(library[0].fields[0].style.fontFamily).toBe('MemeFont'); // defaults merged in
  });

  it('fails the build for an invalid manifest, naming the problem', () => {
    const broken = structuredClone(real);
    broken.templates[0].fields[0].box.width = -5;
    expect(() => load(broken)).toThrow(/templates\.0\.fields\.0\.box\.width/);
  });

  it('fails the build for malformed JSON', () => {
    expect(() => load('{ nope')).toThrow(/not valid JSON/);
  });
});
