import { getManifestIcons } from '@kirill.konshin/app-images/next';
import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'Web Static',
        short_name: 'Web Static',
        description: 'Web Static',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#000000',
        icons: getManifestIcons(),
    };
}
