export type SplashScreen = {
    /** CSS pixels, portrait. */
    width: number;
    height: number;
    /** Device pixel ratio. */
    ratio: number;
};

/**
 * iPhone launch screens, portrait. An installed web app shows the one matching the device while it starts, instead of
 * a blank white screen. Add new devices here, then regenerate the images.
 */
export const SPLASH_SCREENS: readonly SplashScreen[] = [
    { height: 956, ratio: 3, width: 440 }, // 16 Pro Max, 17 Pro Max
    { height: 912, ratio: 3, width: 420 }, // Air
    { height: 874, ratio: 3, width: 402 }, // 16 Pro, 17, 17 Pro
    { height: 932, ratio: 3, width: 430 }, // 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus
    { height: 852, ratio: 3, width: 393 }, // 14 Pro, 15, 15 Pro, 16
    { height: 926, ratio: 3, width: 428 }, // 12 Pro Max, 13 Pro Max, 14 Plus
    { height: 844, ratio: 3, width: 390 }, // 12, 12 Pro, 13, 13 Pro, 14, 16e
    { height: 812, ratio: 3, width: 375 }, // X, XS, 11 Pro, 12 mini, 13 mini
    { height: 896, ratio: 3, width: 414 }, // XS Max, 11 Pro Max
    { height: 896, ratio: 2, width: 414 }, // XR, 11
    { height: 736, ratio: 3, width: 414 }, // 6 Plus to 8 Plus
    { height: 667, ratio: 2, width: 375 }, // SE 2nd and 3rd generation, 6 to 8
];

export const getSplashFile = ({ height, ratio, width }: SplashScreen): string =>
    `splash/iphone-${width * ratio}x${height * ratio}.png`;

export const getSplashMedia = ({ height, ratio, width }: SplashScreen): string =>
    `(device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait)`;
