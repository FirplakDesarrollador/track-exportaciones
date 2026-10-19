import os
import json
from datetime import datetime, date
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

def get_supabase_client() -> Client:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env")
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

def calculate_delay(item):
    """
    Calculates delay based on status and baseline dates.
    Baseline is 'original_production_date' if 'In Production'
    or 'original_eta' if 'In Transit'.
    """
    status = item.get("current_status", "").lower() if item.get("current_status") else ""
    current_date = date.today()
    baseline_date_str = None
    
    if "production" in status:
        baseline_date_str = item.get("original_production_date")
    elif "transit" in status:
        baseline_date_str = item.get("original_eta")
    
    if not baseline_date_str:
        return 0
    
    try:
        # Supabase returns ISO strings
        if isinstance(baseline_date_str, str):
            baseline_date = datetime.strptime(baseline_date_str[:10], "%Y-%m-%d").date()
        else:
            baseline_date = baseline_date_str
            
        delay_days = (current_date - baseline_date).days
        return max(0, delay_days)
    except (ValueError, TypeError, AttributeError):
        return 0

def calculate_risk(item):
    """
    Apply risk logic defined in directives/risk_logic.md
    """
    risk_level_map = {"Low": 0, "Medium": 1, "High": 2}
    risk_reverse_map = {0: "Low", 1: "Medium", 2: "High"}
    
    current_risk_score = 0
    reasons = []
    
    status = item.get("current_status", "").lower() if item.get("current_status") else ""
    is_active = status not in ["arrived", "finished", "delivered"]
    
    # 1. Payment Layer (Rule P1 & P2)
    payment_status = (item.get("payment_status") or "").strip().lower()
    if is_active and payment_status in ["pending", "overdue"]:
        current_risk_score = max(current_risk_score, 2)
        reasons.append(f"Payment is {payment_status} for an active operation.")
    elif payment_status == "requested":
        current_risk_score = max(current_risk_score, 1)
        reasons.append("Payment has been requested but not confirmed.")

    # 2. Delay Layer (Rule D1 & D2)
    delay = calculate_delay(item)
    urgency_flag = item.get("urgency_flag", False)
    
    if delay > 5 and urgency_flag:
        current_risk_score = max(current_risk_score, 2)
        reasons.append(f"Delay is {delay} days with Urgency Flag set.")
    elif delay > 1:
        current_risk_score = max(current_risk_score, 1)
        reasons.append(f"Delay is {delay} days.")

    # 3. Urgency Layer (Rule U1 - Escalation)
    cargo_type = item.get("cargo_type", "").lower() if item.get("cargo_type") else ""
    if (cargo_type == "air" or urgency_flag) and delay > 0:
        if current_risk_score < 2:
            current_risk_score += 1
            reasons.append("Risk escalated due to Urgency/Air cargo and existing delay.")

    risk_level = risk_reverse_map.get(current_risk_score, "Low")
    risk_reason = "; ".join(reasons) if reasons else "No issues detected"
    
    # Suggested Action Mapping
    suggested_action = "Routine monitoring"
    if risk_level == "High":
        if "Payment" in risk_reason:
            suggested_action = "Contact Finance immediately to regularize payment."
        else:
            suggested_action = "Expedite shipment and contact Freight Agent/Supplier."
    elif risk_level == "Medium":
        suggested_action = "Monitor status closely and verify next milestones."

    return {
        "risk_level": risk_level,
        "risk_reason": risk_reason,
        "suggested_action": suggested_action,
        "updated_at": datetime.now().isoformat()
    }

def process_operations():
    """End-to-end processing loop for Supabase records."""
    try:
        supabase = get_supabase_client()
        
        # 1. Fetch active operations
        response = supabase.table("operations").select("*").not_.in_("current_status", ["Arrived", "Finished", "Delivered"]).execute()
        operations = response.data
        
        print(f"Fetched {len(operations)} active operations for processing.")
        
        for operation in operations:
            print("DEBUG:", operation["fp_po_reference"], operation.get("current_status"), operation.get("payment_status"))  

            # 2. Calculate Risk
            risk_data = calculate_risk(operation)
            
            # 3. Update Supabase
            supabase.table("operations").update(risk_data).eq("id", operation["id"]).execute()
            print(f"Updated operation {operation['fp_po_reference']} with risk level: {risk_data['risk_level']}")
            
    except Exception as e:
        print(f"Error processing operations: {e}")

def main():
    print("Initializing logistics risk processor (Supabase Edition)...")
    process_operations()

if __name__ == "__main__":
    main()
