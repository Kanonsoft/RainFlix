!macro RainFlixRegisterProtocol SCHEME
  Push $0
  Push $1
  ReadRegStr $0 HKCR "${SCHEME}\shell\open\command" ""
  ReadRegStr $1 HKCU "Software\Microsoft\Windows\Shell\Associations\UrlAssociations\${SCHEME}\UserChoice" "ProgId"
  ${If} $0 == ""
  ${AndIf} $1 == ""
    WriteRegStr HKCU "Software\Classes\${SCHEME}" "" "URL:RainFlix add-on installation"
    WriteRegStr HKCU "Software\Classes\${SCHEME}" "URL Protocol" ""
    WriteRegStr HKCU "Software\Classes\${SCHEME}\shell\open\command" "" '"$INSTDIR\rainflix.exe" "%1"'
  ${EndIf}
  Pop $1
  Pop $0
!macroend

!macro NSIS_HOOK_POSTINSTALL
  !insertmacro RainFlixRegisterProtocol "rainflix"
  !insertmacro RainFlixRegisterProtocol "stremio"
!macroend

!macro RainFlixRemoveProtocol SCHEME
  Push $0
  ReadRegStr $0 HKCU "Software\Classes\${SCHEME}\shell\open\command" ""
  ${If} $0 == '"$INSTDIR\rainflix.exe" "%1"'
    DeleteRegKey HKCU "Software\Classes\${SCHEME}"
  ${EndIf}
  Pop $0
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro RainFlixRemoveProtocol "rainflix"
  !insertmacro RainFlixRemoveProtocol "stremio"
!macroend
