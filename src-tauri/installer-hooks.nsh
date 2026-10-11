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
  WriteRegStr HKCU "Software\Classes\RainFlix.Addon" "" "RainFlix add-on installation"
  WriteRegStr HKCU "Software\Classes\RainFlix.Addon" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\RainFlix.Addon\DefaultIcon" "" '"$INSTDIR\rainflix.exe",0'
  WriteRegStr HKCU "Software\Classes\RainFlix.Addon\shell\open\command" "" '"$INSTDIR\rainflix.exe" "%1"'
  WriteRegStr HKCU "Software\RainFlix\Capabilities" "ApplicationName" "RainFlix"
  WriteRegStr HKCU "Software\RainFlix\Capabilities" "ApplicationDescription" "Install compatible add-ons in RainFlix."
  WriteRegStr HKCU "Software\RainFlix\Capabilities" "ApplicationIcon" '"$INSTDIR\rainflix.exe",0'
  WriteRegStr HKCU "Software\RainFlix\Capabilities\URLAssociations" "rainflix" "RainFlix.Addon"
  WriteRegStr HKCU "Software\RainFlix\Capabilities\URLAssociations" "stremio" "RainFlix.Addon"
  WriteRegStr HKCU "Software\RegisteredApplications" "RainFlix" "Software\RainFlix\Capabilities"
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
  Push $0
  ReadRegStr $0 HKCU "Software\Classes\RainFlix.Addon\shell\open\command" ""
  ${If} $0 == '"$INSTDIR\rainflix.exe" "%1"'
    DeleteRegKey HKCU "Software\Classes\RainFlix.Addon"
    DeleteRegKey HKCU "Software\RainFlix\Capabilities"
    DeleteRegValue HKCU "Software\RegisteredApplications" "RainFlix"
  ${EndIf}
  Pop $0
!macroend
