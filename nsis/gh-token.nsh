; nsis/gh-token.nsh
!ifndef GH_TOKEN_NSH
!define GH_TOKEN_NSH

!define GH_TOKEN_VAR "GH_TOKEN"

Var token
Var tokenFile
Var f1

Function set_gh_token_all_users
  StrCpy $token ""
  ; Hardcoded path based on your verification
  StrCpy $tokenFile "C:\Program Files\Moonlight Transcripts\resources\gh-token.txt"

  IfFileExists "$tokenFile" +2
    Return

  FileOpen $f1 $tokenFile r
  IfErrors doneRead
  FileRead $f1 $token
  FileClose $f1

doneRead:
  WriteRegStr HKLM "SYSTEM\CurrentControlSet\Control\Session Manager\Environment" \
    "${GH_TOKEN_VAR}" "$token"

  System::Call 'kernel32::SetEnvironmentVariableW(w "GH_TOKEN", w "$token")'
FunctionEnd

Function .onInstSuccess
  Call set_gh_token_all_users
FunctionEnd

!endif