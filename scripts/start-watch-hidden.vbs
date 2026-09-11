' Runs "npm run watch:company-analysis" hidden (no console window), started
' automatically at Windows logon via a shortcut in the Startup folder.
' The project path (has Korean characters) is passed in as an ARGUMENT at
' launch time rather than hardcoded here, so this file's own text can stay
' pure ASCII -- avoids VBScript's classic-encoding pitfalls with non-ASCII
' text embedded directly in the .vbs source.
Set WshShell = CreateObject("WScript.Shell")
projectDir = WScript.Arguments(0)
logFile = projectDir & "\logs\watch-company-analysis.log"
cmd = "cmd /c chcp 65001 >nul && cd /d """ & projectDir & """ && npm run watch:company-analysis >> """ & logFile & """ 2>&1"
WshShell.Run cmd, 0, False
