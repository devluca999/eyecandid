// app.json is the base config. This file only adds what must vary by build:
// EYELORE_E2E=1 (CI only) lets the release build talk to a local Convex backend over plain HTTP
// (adb reverse → http://127.0.0.1:3210). Store and preview builds never set it.
const { withAndroidManifest } = require("expo/config-plugins");

const withCleartext = (config) =>
  withAndroidManifest(config, (c) => {
    c.modResults.manifest.application[0].$["android:usesCleartextTraffic"] = "true";
    return c;
  });

module.exports = ({ config }) => (process.env.EYELORE_E2E === "1" ? withCleartext(config) : config);
