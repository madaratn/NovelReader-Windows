#!/usr/bin/env bash
# CI (emulator): install the APK, open it, then drive the real app through the
# WebView debugger (scripts/android-smoke.cjs). Screens go to ./shots.
set -u
mkdir -p shots
adb install -r NovelReader-*.apk || exit 1
adb logcat -c
# The person allows it once in Android's settings; here it is set directly.
adb shell appops set com.madaratn.novelreader REQUEST_INSTALL_PACKAGES allow
adb shell am start -n com.madaratn.novelreader/.MainActivity
for i in $(seq 1 30); do sock=$(adb shell cat /proc/net/unix | grep -o 'webview_devtools_remote_[0-9]*' | head -1); [ -n "$sock" ] && break; sleep 2; done
echo "devtools socket: ${sock:-none}"
sleep 10
adb exec-out screencap -p > shots/android-start.png
code=1
if [ -n "${sock:-}" ]; then
  adb forward tcp:9222 localabstract:$sock
  node scripts/android-smoke.cjs; code=$?
fi
sleep 2; adb exec-out screencap -p > shots/android-after.png
echo "--- app log"; adb logcat -d | grep -E 'miwayomi|AndroidRuntime|FATAL|Capacitor/Console' | grep -v 'Handling local request' | tail -150
exit $code
