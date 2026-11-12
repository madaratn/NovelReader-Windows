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
# Restart with the extensions installed above: they are opened several at a time at
# start (ExtensionManager.loadAll) and must all come back.
count() { curl -s -m 5 http://127.0.0.1:14567/api/v1/sources | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);console.log((j.anime||[]).length)}catch{console.log(-1)}})"; }
# The emulator sometimes goes offline after the video checks (out of memory on the CI
# machine). adb then waits for the device for ever and the job was cancelled after an
# hour, so nothing got published. From here every adb call has a time limit, and a
# dead emulator only skips the restart check (the checks above have already passed).
A() { timeout 40 adb "$@"; }
alive() { [ "$(timeout 15 adb get-state 2>/dev/null)" = device ]; }
if [ "$code" = 0 ] && ! alive; then
  echo "::warning::The emulator went offline after the checks: restart check skipped"
elif [ "$code" = 0 ]; then
  A forward tcp:14567 tcp:4567 >/dev/null
  before=$(count)
  if [ "${before:-0}" -ge 2 ]; then
    A shell am force-stop com.madaratn.novelreader; A logcat -c || true
    A shell am start -n com.madaratn.novelreader/.MainActivity >/dev/null
    after=-1; for i in $(seq 1 40); do after=$(count); [ "$after" = "$before" ] && break; alive || break; sleep 2; done
    echo "restart: $before video sources before, $after after"
    A logcat -d | grep -E 'extension\(s\) opened in|engine running' | tail -3
    if alive; then [ "$after" = "$before" ] || { echo "Sources lost at restart"; code=1; }
    else echo "::warning::The emulator went offline during the restart check: skipped"; fi
  fi
fi
if alive; then
  sleep 2; A exec-out screencap -p > shots/android-after.png
  echo "--- app log"; A logcat -d | grep -E 'miwayomi|AndroidRuntime|FATAL|Capacitor/Console' | grep -v 'Handling local request' | tail -150
fi
exit $code
