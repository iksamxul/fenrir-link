#!/usr/bin/env bash
# The iOS project is made fresh on the Mac that builds it (it never lives in the repository): Capacitor's template with
# Swift Package Manager, then the camera sentence, plain-http friends' links, the name, the icon and the splash.
set -euo pipefail
cd "$(dirname "$0")/.."
npx cap add ios --packagemanager SPM
npx cap sync ios
PLIST=ios/App/App/Info.plist
pb() { /usr/libexec/PlistBuddy -c "$1" "$PLIST"; }
pb "Delete :NSCameraUsageDescription" 2>/dev/null || true
pb "Add :NSCameraUsageDescription string Fenrir Link reads the code on Fenrir or Fenrir Connect to link a world."
pb "Delete :NSAppTransportSecurity" 2>/dev/null || true
pb "Add :NSAppTransportSecurity dict"
pb "Add :NSAppTransportSecurity:NSAllowsArbitraryLoads bool true"
pb "Delete :CFBundleDisplayName" 2>/dev/null || true
pb "Add :CFBundleDisplayName string Fenrir Link"
pb "Delete :ITSAppUsesNonExemptEncryption" 2>/dev/null || true
pb "Add :ITSAppUsesNonExemptEncryption bool false"
ICONS=ios/App/App/Assets.xcassets/AppIcon.appiconset
cp resources/ios/AppIcon-512@2x.png "$ICONS/AppIcon-512@2x.png"
SPLASH=ios/App/App/Assets.xcassets/Splash.imageset
for f in "$SPLASH"/*.png; do cp resources/ios/splash-2732x2732.png "$f"; done
echo "iOS project ready"
