@echo off
echo ========================================
echo    LifeMed Health Care - System Check
echo ========================================
echo.

echo [1] Checking package.json...
findstr "lifemed" package.json >nul
if %errorlevel%==0 (echo ✅ package.json OK) else (echo ❌ package.json MISSING)

echo.
echo [2] Checking server.js...
findstr "Server running" server.js >nul
if %errorlevel%==0 (echo ✅ server.js OK) else (echo ❌ server.js MISSING)

echo.
echo [3] Checking public files...
if exist public\index.html (echo ✅ index.html OK) else (echo ❌ index.html MISSING)
if exist public\login.html (echo ✅ login.html OK) else (echo ❌ login.html MISSING)
if exist public\admin.html (echo ✅ admin.html OK) else (echo ❌ admin.html MISSING)

echo.
echo [4] Checking data folder...
if exist data\db.json (echo ✅ db.json OK) else (echo ❌ db.json MISSING)

echo.
echo [5] Testing API (products)...
curl -s http://localhost:5000/api/products | find "success" >nul
if %errorlevel%==0 (echo ✅ API Working) else (echo ❌ API Not Responding - Start server first)

echo.
echo ========================================
echo    Test Complete
echo ========================================
pause