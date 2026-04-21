; nsis/gh-token.nsh

!ifndef GH_TOKEN_NSH
!define GH_TOKEN_NSH

; We expect electron-builder to replace this at build time
; with the value you provide (e.g. via a NSIS define / environment mapping).
!define GH_TOKEN_VAR "GH_TOKEN"
!define GH_TOKEN_PLACEHOLDER "${GH_TOKEN_PLACEHOLDER}"

Var token

Function set_gh_token_all_users
  ; Write system environment variable
  StrCpy $token "${GH_TOKEN_PLACEHOLDER}"

  ; Safety: don't write empty token
  StrLen $0 $token
  ${If} $0 == 0
    Return
  ${EndIf}

  WriteRegStr HKLM "SYSTEM\CurrentControlSet\Control\Session Manager\Environment" \
    "${GH_TOKEN_VAR}" "$token"

  ; Notify Windows that environment variables changed
  System::Call 'kernel32::SetEnvironmentVariableW(w "GH_TOKEN", w "$token")'

  ; Broadcast setting change
  System::Call 'user32::SendMessageTimeoutW(i 0xffff, i ${WM_SETTINGCHANGE}, i 0, t "Environment", i 0, i 5000, *i 0)'
FunctionEnd

; Hook our function into the installer end
; electron-builder NSIS supports these hooks:
; - onInstSuccess (end of install)
Function .onInstSuccess
  Call set_gh_token_all_users
FunctionEnd

!endif