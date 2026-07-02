# Store the directory where this script sits
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Starting Django Backend..." -ForegroundColor Green
$DjangoProc = Start-Process cmd.exe -ArgumentList "/k cd /d `"$ScriptDir\backend`" && python manage.py runserver" -PassThru

Write-Host "Starting React Frontend..." -ForegroundColor Green
$ReactProc = Start-Process cmd.exe -ArgumentList "/k cd /d `"$ScriptDir\frontend`" && npm run dev"  -PassThru

Write-Host "`n====================================================" -ForegroundColor Yellow
Write-Host " Servers are running in their own windows." -ForegroundColor Yellow
Write-Host " Press CTRL + C inside THIS window to kill both!" -ForegroundColor Yellow
Write-Host "====================================================`n" -ForegroundColor Yellow

# Trap the Ctrl+C event
try {
    while ($true) {
        Start-Sleep -Seconds 1
    }
}
finally {
    Write-Host "`nShutting down servers cleanly..." -ForegroundColor Red
    
    # Force stop the specific window tracking IDs we stored
    Stop-Process -Id $DjangoProc.Id -Force -ErrorAction SilentlyContinue
    Stop-Process -Id $ReactProc.Id -Force -ErrorAction SilentlyContinue
    
    # Deep cleanup for Node and Python subprocesses
    Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue
    Stop-Process -Name "python" -Force -ErrorAction SilentlyContinue
    
    Write-Host "Done! Everything closed." -ForegroundColor Red
    Start-Sleep -Seconds 2
}
