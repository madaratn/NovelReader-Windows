; NovelReader — additions to the installer (electron-builder includes this file).
;
; Updating failed on some PCs with "Failed to uninstall old application files: 2":
; the video engine (Java, started by NovelReader from its own folder) was still
; running, so the old files could not be removed and the installer gave up.
;
; 1. Before anything else, the programs still running from NovelReader's engine
;    folder are closed.
; 2. If the old version still cannot be removed completely, the installation goes
;    on anyway: the new files replace the old ones.

!macro customInit
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -WindowStyle Hidden -Command "Get-Process | Where-Object { $$_.Path -like '*\resources\engine\jre\bin\*' } | Stop-Process -Force"`
  Pop $0
  Sleep 500
!macroend

!macro customUnInstallCheck
  ${if} $R0 != 0
    DetailPrint "The old version could not be removed completely ($R0): installing over it."
  ${endif}
  ClearErrors
!macroend

!macro customUnInstallCheckCurrentUser
  ${if} $R0 != 0
    DetailPrint "The old version could not be removed completely ($R0): installing over it."
  ${endif}
  ClearErrors
!macroend
