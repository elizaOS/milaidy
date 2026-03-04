; windows-long-paths.nsh
; Included by electron-builder NSIS installer via nsis.include config.
; Enables Windows long-path support (>260 chars) in the registry so that
; deeply-nested node_modules in app.asar.unpacked do not hit MAX_PATH.
; Requires: the user runs the installer with admin rights (allowElevation: true).

!macro customInstall
  ; Enable long-path support for this machine.
  ; HKLM\SYSTEM\CurrentControlSet\Control\FileSystem LongPathsEnabled = 1
  WriteRegDWORD HKLM "SYSTEM\CurrentControlSet\Control\FileSystem" "LongPathsEnabled" 1
!macroend

!macro customUninstall
  ; Do NOT remove LongPathsEnabled on uninstall — it is a machine-wide setting
  ; and other applications may depend on it.
!macroend
