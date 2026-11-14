; NovelReader — additions to the installer (electron-builder includes this file).
;
; Updating failed on some PCs with "Failed to uninstall old application files: 2":
; the video engine (Java, started by NovelReader from its own folder) was still
; running, so the old files could not be removed and the installer gave up.
;
; 1. Before anything else, NovelReader itself and the programs still running from
;    its engine folder are closed. Since 0.27, closing the window keeps NovelReader
;    running near the clock (to check for new episodes), so its files stay open:
;    the uninstaller said "the file is open in NovelReader" (v8_context_snapshot.bin).
; 2. If the old version still cannot be removed completely, the installation goes
;    on anyway: the new files replace the old ones.

!macro closeNovelReader
  ; NovelReader (all its windows and helper processes, the one near the clock too)
  nsExec::Exec `"$SYSDIR\taskkill.exe" /F /T /IM "NovelReader.exe"`
  Pop $0
  ; its video engine (Java)
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -WindowStyle Hidden -Command "Get-Process | Where-Object { $$_.Path -like '*\resources\engine\jre\bin\*' } | Stop-Process -Force"`
  Pop $0
  Sleep 800
!macroend

!macro customInit
  !insertmacro closeNovelReader
!macroend

; The uninstaller too (Windows Settings › Apps › Uninstall, or an update).
!macro customUnInit
  !insertmacro closeNovelReader
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
