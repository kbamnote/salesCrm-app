/**
 * Expo config plugin.
 *
 * Notifee ships its foreground service declared as
 *   <service android:name="app.notifee.core.ForegroundService"
 *            android:foregroundServiceType="shortService" />
 * inside its embedded AAR. `shortService` is time-limited (~3 min) and does NOT
 * grant background microphone access, so a long presentation recording started
 * via Notifee's foreground service would be rejected on Android 14+.
 *
 * This plugin overrides that service's foregroundServiceType to `microphone`
 * (via the manifest merger's tools:replace) so recording can continue while the
 * app is backgrounded. The FOREGROUND_SERVICE_MICROPHONE permission itself is
 * declared in app.json (android.permissions).
 */
const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');

const SERVICE_NAME = 'app.notifee.core.ForegroundService';

const withNotifeeMicrophoneService = (config) => {
  return withAndroidManifest(config, (cfg) => {
    const androidManifest = cfg.modResults;
    const manifest = androidManifest.manifest;

    // Ensure the `tools` namespace exists so tools:replace works.
    manifest.$ = manifest.$ || {};
    if (!manifest.$['xmlns:tools']) {
      manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    // Override Notifee's ForegroundService type to `microphone`.
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);
    application.service = application.service || [];
    application.service = application.service.filter(
      (s) => s?.$?.['android:name'] !== SERVICE_NAME,
    );
    application.service.push({
      $: {
        'android:name': SERVICE_NAME,
        'android:foregroundServiceType': 'microphone',
        'tools:replace': 'android:foregroundServiceType',
      },
    });

    return cfg;
  });
};

module.exports = withNotifeeMicrophoneService;
