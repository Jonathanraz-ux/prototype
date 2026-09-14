// withVpnBlocker.js — Config plugin Expo qui préserve intégralement le
// module natif VpnBlocker (VpnService local) à travers les prebuilds CNG.
//
// Le répertoire `android/` étant généré (gitignoré), toute build cloud
// (EAS) régénère le projet natif sans ce code. Ce plugin le réinjecte à
// chaque prebuild :
//   1. copies des sources Kotlin VpnBlockerService/Module/Package ;
//   2. enregistrement du ReactPackage dans MainApplication.getPackages() ;
//   3. permissions + déclaration du <service> VpnService dans le manifest.
//
// Rien de secret ici : aucun identifiant, aucun token.

const { withAndroidManifest, withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const APP_PACKAGE = "com.wifizone.app";
const PACKAGE_SRC = `android/app/src/main/java/${APP_PACKAGE.split(".").join("/")}`;
const KOTLIN_FILES = ["VpnBlockerService.kt", "VpnBlockerModule.kt", "VpnBlockerPackage.kt"];

function projectSrcDir(config) {
  return path.join(config.modRequest.projectRoot, PACKAGE_SRC);
}

function withNativeFiles(config) {
  return withDangerousMod(config, ["android", (config) => {
    const srcDir = projectSrcDir(config);
    fs.mkdirSync(srcDir, { recursive: true });
    for (const file of KOTLIN_FILES) {
      fs.copyFileSync(path.join(__dirname, "vpn-blocker", file), path.join(srcDir, file));
    }

    const mainAppPath = path.join(srcDir, "MainApplication.kt");
    if (fs.existsSync(mainAppPath)) {
      let content = fs.readFileSync(mainAppPath, "utf8");
      if (!content.includes("VpnBlockerPackage")) {
        const marker = "return PackageList(this).packages";
        if (content.includes(marker)) {
          content = content.replace(
            marker,
            "return (PackageList(this).packages as MutableList<ReactPackage>)\n" +
              "              .apply { add(VpnBlockerPackage()) }"
          );
          fs.writeFileSync(mainAppPath, content);
        }
      }
    }
    return config;
  }]);
}

function withManifest(config) {
  return withAndroidManifest(config, (config) => {
    const { manifest } = config.modResults;

    manifest["uses-permission"] = manifest["uses-permission"] ?? [];
    const addPermission = (name) => {
      if (
        !manifest["uses-permission"].some(
          (p) => p.$ && p.$["android:name"] === name
        )
      ) {
        manifest["uses-permission"].push({ $: { "android:name": name } });
      }
    };
    addPermission("android.permission.FOREGROUND_SERVICE");
    addPermission("android.permission.FOREGROUND_SERVICE_SPECIAL_USE");
    addPermission("android.permission.POST_NOTIFICATIONS");

    const application = manifest.application[0];
    application.service = application.service ?? [];
    const hasService = application.service.some(
      (s) => s.$ && s.$["android:name"] === ".VpnBlockerService"
    );
    if (!hasService) {
      application.service.push({
        $: {
          "android:name": ".VpnBlockerService",
          "android:permission": "android.permission.BIND_VPN_SERVICE",
          "android:exported": "false",
          "android:foregroundServiceType": "specialUse",
        },
        "intent-filter": [
          {
            action: [{ $: { "android:name": "android.net.VpnService" } }],
          },
        ],
        property: [
          {
            $: {
              "android:name": "android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE",
              "android:value": "wifizone_android_device_demo_network_gating",
            },
          },
        ],
      });
    }
    return config;
  });
}

module.exports = function withVpnBlocker(config) {
  config = withNativeFiles(config);
  config = withManifest(config);
  return config;
};