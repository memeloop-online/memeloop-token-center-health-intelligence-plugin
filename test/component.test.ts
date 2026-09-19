import { describe, expect, it } from 'vitest';

describe('signed operator UI module', () => {
  it('activates using host React and Fluent and exposes the manifest component', async () => {
    const url = new URL('../ui/health-intelligence.mjs', import.meta.url).href;
    const module = await import(url);
    const componentPackage = module.activateOperatorUi({
      React: {}, Fluent: { makeStyles: () => () => ({}), tokens: {} },
      defineOperatorUiPackage: (value: unknown) => value,
    });
    expect(componentPackage.pluginId).toBe('mtc-health-intelligence');
    expect(componentPackage.compatiblePluginVersions).toContain('1.1.0');
    expect(typeof componentPackage.components['health-intelligence']).toBe('function');
  });
});
