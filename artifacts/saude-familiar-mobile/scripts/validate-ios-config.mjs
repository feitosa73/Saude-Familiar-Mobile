import { readFileSync } from 'node:fs';

const configOutputPath = process.argv[2];
if (!configOutputPath) {
  throw new Error('Usage: node scripts/validate-ios-config.mjs <expo-config-output.json>');
}

const rawOutput = readFileSync(configOutputPath, 'utf8');
const jsonStart = rawOutput.indexOf('{');
if (jsonStart < 0) {
  throw new Error('Expo config output did not contain JSON.');
}

const config = JSON.parse(rawOutput.slice(jsonStart));
const expectedVersion = '1.0.0';
const expectedBundleIdentifier = 'br.com.fiqueok.saudefamiliar';
const version = config.version;
const bundleIdentifier = config.ios?.bundleIdentifier;
const buildNumber = config.ios?.buildNumber;
const androidPackage = config.android?.package;
const androidVersionCode = config.android?.versionCode;

if (version !== expectedVersion) {
  throw new Error(`Expected iOS version ${expectedVersion}; received: ${version ?? 'undefined'}`);
}

if (bundleIdentifier !== expectedBundleIdentifier) {
  throw new Error(
    `Expected iOS bundleIdentifier ${expectedBundleIdentifier}; received: ${bundleIdentifier ?? 'undefined'}`,
  );
}

if (!/^\d+$/.test(String(buildNumber)) || Number(buildNumber) <= 0) {
  throw new Error(`Invalid iOS buildNumber: ${buildNumber ?? 'undefined'}`);
}

if (androidPackage !== expectedBundleIdentifier) {
  throw new Error(
    `Expected Android package ${expectedBundleIdentifier}; received: ${androidPackage ?? 'undefined'}`,
  );
}

if (!Number.isInteger(androidVersionCode) || androidVersionCode <= 0) {
  throw new Error(`Invalid Android versionCode: ${androidVersionCode ?? 'undefined'}`);
}

const easConfig = JSON.parse(readFileSync('eas.json', 'utf8'));
const requiredProfiles = ['development', 'preview', 'production'];
for (const profile of requiredProfiles) {
  if (!easConfig.build?.[profile]) {
    throw new Error(`Missing EAS build profile: ${profile}`);
  }
}

if (easConfig.submit || easConfig.build.development.autoSubmit || easConfig.build.preview.autoSubmit || easConfig.build.production.autoSubmit) {
  throw new Error('Automatic EAS submission is not allowed in the iOS foundation sprint.');
}

console.log(`iOS version: ${version} (${buildNumber})`);
console.log(`Bundle ID: ${bundleIdentifier}`);
console.log(`Android package: ${androidPackage} (${androidVersionCode})`);
console.log('EAS profiles: development, preview, production');
