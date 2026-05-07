@echo off

for /f %%i in ('hostname') do set HOST=%%i
set DATE=%date%
set TIME=%time%

git add .

git commit -m "deploy from %HOST% at %DATE% %TIME%"

git push origin main --force-with-lease