import type { ExpoConfig } from 'expo/config';

const PRODUCT_VERSION = '1.0.0';
const LOCAL_ANDROID_VERSION_CODE = 1;
const MAX_ANDROID_VERSION_CODE = 2_147_483_647;

function isCiEnvironment(): boolean {
  return process.env.CI === '1'
    || process.env.CI === 'true'
    || process.env.GITHUB_ACTIONS === 'true';
}

function resolveAndroidVersionCode(): number {
  const rawValue = process.env.ANDROID_VERSION_CODE
    ?? process.env.GITHUB_RUN_NUMBER;

  if (rawValue === undefined) {
    if (isCiEnvironment()) {
      throw new Error('CI builds require ANDROID_VERSION_CODE or GITHUB_RUN_NUMBER.');
    }
    return LOCAL_ANDROID_VERSION_CODE;
  }

  const value = Number(rawValue.trim());
  const isValid = Number.isInteger(value) && value > 0 && value <= MAX_ANDROID_VERSION_CODE;

  if (!isValid) {
    throw new Error(
      `ANDROID_VERSION_CODE must be a positive integer no greater than ${MAX_ANDROID_VERSION_CODE}; received: ${rawValue}`,
    );
  }

  return value;
}

const config: ExpoConfig = {
  name: 'Saúde Familiar Mobile',
  slug: 'saude-familiar-mobile',
  version: PRODUCT_VERSION,
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'saude-familiar-mobile',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  splash: {
    image: './assets/images/icon.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff',
  },
  ios: {
    supportsTablet: false,
  },
  android: {
    package: 'br.com.fiqueok.saudefamiliar',
    versionCode: resolveAndroidVersionCode(),
    permissions: ['POST_NOTIFICATIONS', 'SCHEDULE_EXACT_ALARM'],
  },
  web: {
    favicon: './assets/images/icon.png',
  },
  plugins: [
    [
      'expo-router',
      {
        origin: 'https://replit.com/',
      },
    ],
    'expo-font',
    'expo-notifications',
    'expo-web-browser',
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
};

export default config;
