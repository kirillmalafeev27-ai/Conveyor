@echo off
setlocal
chcp 65001 >nul

set "REPO_URL=https://github.com/kirillmalafeev27-ai/Conveyor.git"
set "COMMIT_MESSAGE=%*"
if not defined COMMIT_MESSAGE set "COMMIT_MESSAGE=Update Conveyor"

cd /d "%~dp0"

where git >nul 2>&1
if errorlevel 1 (
  echo ERROR: Git is not installed or is not available in PATH.
  goto :failed
)

rem The workspace may have been created by another Windows account.
rem Trust only this exact folder before asking Git to inspect it.
git config --global --get-all safe.directory | findstr /I /X /C:"%CD%" >nul
if errorlevel 1 (
  git config --global --add safe.directory "%CD%"
  if errorlevel 1 (
    echo ERROR: Git could not mark this project folder as trusted.
    goto :failed
  )
)

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo Initializing Git repository...
  git init
  if errorlevel 1 goto :failed
)

git remote get-url origin >nul 2>&1
if errorlevel 1 (
  echo Adding GitHub remote...
  git remote add origin "%REPO_URL%"
) else (
  echo Updating GitHub remote...
  git remote set-url origin "%REPO_URL%"
)
if errorlevel 1 goto :failed

echo Staging project files...
git add -A
if errorlevel 1 goto :failed

git diff --cached --quiet
if errorlevel 1 (
  echo Creating commit: %COMMIT_MESSAGE%
  git commit -m "%COMMIT_MESSAGE%"
  if errorlevel 1 goto :failed
) else (
  echo No new changes to commit.
)

git branch -M main
if errorlevel 1 goto :failed

echo Pushing to %REPO_URL% ...
git push -u origin main
if errorlevel 1 goto :failed

echo.
echo DONE: Conveyor was pushed to GitHub.
echo %REPO_URL%
pause
exit /b 0

:failed
echo.
echo PUSH FAILED. Read the error above.
echo If GitHub asks you to sign in, complete the browser login and run this file again.
pause
exit /b 1
