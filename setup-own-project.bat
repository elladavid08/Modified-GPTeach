@echo off
echo ========================================
echo Setting up YOUR project (gen-lang-client-0375164944)
echo ========================================
echo.

echo Setting default project...
gcloud config set project gen-lang-client-0375164944
echo.

echo Setting quota project for ADC...
gcloud auth application-default set-quota-project gen-lang-client-0375164944
echo.

echo Enabling Vertex AI API...
gcloud services enable aiplatform.googleapis.com
echo.

echo Verifying API is enabled...
gcloud services list --enabled | findstr aiplatform
echo.

echo ========================================
echo Setup Complete!
echo ========================================
echo.
echo You can now run: npm run dev
echo.
pause


