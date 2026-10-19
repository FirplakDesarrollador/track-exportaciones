# Directive: Supabase Setup - Logistics Tracking

This document outlines the configuration for your Supabase project using the `operations` table.

## 1. Create Supabase Project
1. Sign in to [Supabase](https://supabase.com/).
2. Click **"New Project"**.
3. Name it `Logistica-COMEX` and set a database password.
4. Click **"Create new project"**.

## 2. Get API Credentials
1. Once the project is ready, go to **Project Settings** -> **API**.
2. Copy the **Project URL** and paste it into your `.env` as `SUPABASE_URL`.
3. Copy the **service_role** key (secret) and paste it into your `.env` as `SUPABASE_SERVICE_KEY`.

## 3. Operations Table
The system expects a table named `operations` in Supabase with the schema defined in `directives/data_model.md`.

```sql
-- SQL Reference for the 'operations' table
CREATE TABLE IF NOT EXISTS operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shipment_id TEXT UNIQUE NOT NULL,
    supplier TEXT,
    po_number TEXT,
    eta DATE,
    status TEXT, -- e.g., 'In Production', 'Transit', 'Arrived'
    payment_status TEXT, -- 'Pending', 'Requested', 'Confirmed', 'Overdue'
    payment_type TEXT,
    incoterm TEXT,
    logistics_provider TEXT,
    cargo_type TEXT,
    risk_level TEXT DEFAULT 'Low',
    risk_reason TEXT,
    suggested_action TEXT,
    responsible_person TEXT,
    responsible_area TEXT,
    support_folder_link TEXT,
    operation_type TEXT, -- 'Import', 'Export'
    client TEXT,
    country TEXT,
    year INTEGER,
    urgency_flag BOOLEAN DEFAULT FALSE,
    original_production_date DATE,
    original_eta DATE,
    status_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster status-based processing
CREATE INDEX IF NOT EXISTS idx_operations_status ON operations (status);
```

## 4. Grant Access
The script uses the `service_role` key, which has full access to the database. No additional RLS (Row Level Security) policies are required for internal agent operations, but it is recommended to enable them if you plan to expose this data to a frontend.
