import type { Configuration, MacConfiguration } from 'electron-builder';
import type { GithubOptions, S3Options } from 'builder-util-runtime';

const {
    GITHUB_REF_TYPE,
    GITHUB_REF_NAME,
    GITHUB_RUN_ID,
    GITHUB_REF,
    AWS_URL,
    AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY,
    GH_TOKEN,
    CSC_IDENTITY_AUTO_DISCOVERY,
} = process.env;

const isGithubTag = GITHUB_REF_TYPE === 'tag';
const isGithubMaster = GITHUB_REF_TYPE === 'branch' && GITHUB_REF_NAME === 'master';
const isDevPublish = AWS_URL?.includes(':9000');
const isNoAutoDiscovery = CSC_IDENTITY_AUTO_DISCOVERY === 'false';
const isSkipPublish = !isDevPublish && !isGithubMaster && !isGithubTag;

//FIXME Refine logic, tags should be versions, not channels, use branches? See how Changesets does it
const channel = isGithubTag ? 'latest' : GITHUB_REF_NAME; // https://www.electron.build/tutorials/release-using-channels.html

function getVersion() {
    if (isGithubMaster) {
        return `0.0.${GITHUB_RUN_ID}`; //TODO Figure out last normal in master and bump it
    }
    if (isGithubTag) {
        return GITHUB_REF!.split('/').pop();
    }
    return `0.0.${Date.now()}`; //TODO Read from package.json?
}

function getTarget() {
    const arch = ['arm64', isNoAutoDiscovery ? '' : 'x64'].filter(Boolean) as any;

    const target: MacConfiguration['target'] = [
        {
            target: 'dmg',
            arch,
        },
        {
            target: 'zip',
            arch,
        },
    ];

    // Leave only DMG if no signing
    if (isNoAutoDiscovery) {
        console.log('Skipping signing...');
        delete process.env.CSC_LINK;
        return [target[0]]; // only keep DMG
    }

    return target;
}

export function builerConfig(options: {
    config: Configuration;
    s3?: Pick<S3Options, 'bucket'> & Partial<S3Options>; //TODO Omit?
    githubReleases: Pick<GithubOptions, 'owner' | 'repo'> & Partial<GithubOptions>;
}): Configuration {
    if (options.s3 && (!AWS_URL || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY)) {
        throw new Error('Missing AWS configuration');
    }

    if (options.githubReleases && !GH_TOKEN) {
        throw new Error('Missing AWS configuration');
    }

    const config: Configuration = {
        files: [
            '**/*',
            '!electron-builder.js',
            '!electron-builder.yml',
            '!package.json',
            'assets',
            ...(options.config.files as never),
        ],
        directories: {
            buildResources: 'assets',
        },
        mac: {
            category: options.config.mac?.category ?? 'public.app-category.utils',
            target: getTarget(),
        },
        //TODO Windows target
        dmg: {
            contents: [
                {
                    x: 130,
                    y: 130,
                },
                {
                    x: 370,
                    y: 130,
                    type: 'link',
                    path: '/Applications',
                },
            ],
        },
        publish: [
            options.s3 &&
                ({
                    provider: 's3',
                    endpoint: AWS_URL,
                    channel,
                    ...options.s3, // bucket
                } as S3Options),
            options.githubReleases &&
                GH_TOKEN &&
                (isGithubTag || isGithubMaster) &&
                ({
                    provider: 'github',
                    private: true,
                    token: GH_TOKEN,
                    releaseType: isGithubTag ? 'release' : 'draft',
                    channel,
                    ...options.githubReleases, // repo, owner
                } as GithubOptions),
        ].filter(Boolean) as never,
        extraMetadata: {
            version: getVersion(),
        },
    };

    if (isSkipPublish) {
        delete config.publish;
        delete (config as never as any).extraMetadata;
    }

    console.log('Electron Builder context', {
        isDevPublish,
        isGithubMaster,
        isGithubTag,
        isSkipPublish,
        isNoAutoDiscovery,
        channel,
        GITHUB_RUN_ID: GITHUB_RUN_ID,
        GITHUB_REF_TYPE: GITHUB_REF_TYPE,
        GITHUB_REF_NAME: GITHUB_REF_NAME,
        CSC_IDENTITY_AUTO_DISCOVERY: CSC_IDENTITY_AUTO_DISCOVERY,
        AWS_URL: AWS_URL,
    });

    console.log('Electron Builder configuration', JSON.stringify(config, null, 2));

    return config;
}
