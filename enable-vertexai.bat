@echo off
echo ========================================
echo Enabling Vertex AI API
echo ========================================
echo.

echo Setting default project to cloud-run-455609...
gcloud config set project cloud-run-455609
echo.

echo Enabling Vertex AI API (this may take a minute)...
gcloud services enable aiplatform.googleapis.com
echo.

echo Verifying Vertex AI API is enabled...
gcloud services list --enabled | findstr aiplatform
echo.

echo ========================================
echo Setup Complete!
echo ========================================
echo.
echo You can now run: npm run dev
echo.
pause


