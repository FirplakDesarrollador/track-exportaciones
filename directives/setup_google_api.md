# Directive: Google API Setup - Logistics Tracking

This document outlines the steps required to authorize the **Seguimiento Logístico COMEX** system to read and write data in your Google Sheets.

## 1. Create a Google Cloud Project
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Click on "Select a project" -> "New Project".
3. Name it `Logistica-COMEX` and click "Create".

## 2. Enable APIs
1. In the search bar, type **"Google Sheets API"**.
2. Click on it and then click **"Enable"**.

## 3. Create a Service Account
1. Go to **APIs & Services** -> **Credentials**.
2. Click **"+ Create Credentials"** -> **Service Account**.
3. Name it `logistics-agent`, then click "Create and Continue".
4. (Optional) Skip roles and click "Done".

## 4. Generate JSON Key
1. Click on the email address of the service account you just created.
2. Go to the **"Keys"** tab.
3. Click **"Add Key"** -> **"Create new key"**.
4. Select **JSON** and click "Create".
5. A file will download. Rename it to `credentials.json` and move it to the root project folder:
   `c:\Users\catalina.white\Documents\SEGUIMIENTO LOGÍSTICO COMEX\credentials.json`

## 5. Authorize the Agent on your Sheet
1. Open the Google Sheet you want to track.
2. Copy the **Service Account Email** (from step 3).
3. Click the **"Share"** button in Google Sheets.
4. Paste the email and grant **"Editor"** access.

## 6. Update Configuration
1. Open the `.env` file in the project folder.
2. Set `GOOGLE_SHEET_ID` to the ID found in your sheet's URL (the string between `/d/` and `/edit`).
3. Set `RANGE_NAME` to the range you want to process (e.g., `Sheet1!A2:Z`).
