@echo off
echo ========================================
echo Diagnosing Google Cloud Setup
echo ========================================
echo.

echo 1. Checking current authentication...
gcloud auth list
echo.

echo 2. Checking current project...
gcloud config get-value project
echo.

echo 3. Checking accessible projects...
gcloud projects list
echo.

echo 4. Checking if Vertex AI API is enabled...
gcloud services list --enabled --project=cloud-run-455609 | findstr aiplatform
echo.

echo ========================================
echo Diagnosis Complete
echo ========================================
pause


