import { expect, test, vi } from 'vite-plus/test';

import { builerConfig } from './builder';

vi.spyOn(console, 'log').mockImplementation(() => {});

test('builerConfig keeps the caller config and fills the defaults', () => {
    const config = builerConfig({
        config: {
            appId: 'org.example.app',
            productName: 'Example',
            directories: { output: 'out' },
            mac: { category: 'public.app-category.travel', hardenedRuntime: true },
        },
    });

    expect(config).toMatchObject({
        appId: 'org.example.app',
        productName: 'Example',
        directories: { buildResources: 'assets', output: 'out' },
        mac: { category: 'public.app-category.travel', hardenedRuntime: true, icon: 'icon.icns' },
    });
});

test('builerConfig keeps an explicit mac.icon, the Icon Composer bundle or null', () => {
    expect(builerConfig({ config: { mac: { icon: 'icon.icon' } } }).mac?.icon).toBe('icon.icon');
    expect(builerConfig({ config: { mac: { icon: null } } }).mac?.icon).toBeNull();
});
