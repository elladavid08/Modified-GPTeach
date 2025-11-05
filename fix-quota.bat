@echo off
echo ========================================
echo Fixing Application Default Credentials
echo ========================================
echo.

echo Setting quota project to cloud-run-455609...
gcloud auth application-default set-quota-project cloud-run-455609
echo.

echo Re-authenticating with application-default credentials...
gcloud auth application-default login
echo.

echo ========================================
echo Quota Project Fixed!
echo ========================================
echo.
pause


