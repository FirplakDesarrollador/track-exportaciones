from process_logistics import calculate_risk
from datetime import date, timedelta

def test_risk_logic():
    today = date.today().strftime("%Y-%m-%d")
    yesterday = (date.today() - timedelta(days=2)).strftime("%Y-%m-%d")
    last_week = (date.today() - timedelta(days=7)).strftime("%Y-%m-%d")

    test_cases = [
        {
            "name": "High Risk - Payment Pending (Active)",
            "item": {"Status": "In Transit", "Payment Status": "Pending", "Original ETA": today},
            "expected_risk": "High"
        },
        {
            "name": "Medium Risk - Payment Requested",
            "item": {"Status": "In Transit", "Payment Status": "Requested", "Original ETA": today},
            "expected_risk": "Medium"
        },
        {
            "name": "High Risk - Delay > 5 days + Urgency Flag",
            "item": {"Status": "In Production", "Urgency Flag": "Yes", "Original Production Date": last_week},
            "expected_risk": "High"
        },
        {
            "name": "Medium Risk - Delay > 1 day",
            "item": {"Status": "In Transit", "Original ETA": yesterday},
            "expected_risk": "Medium"
        },
        {
            "name": "Escalation - Air + Delay (Low to Medium)",
            "item": {"Status": "In Transit", "Cargo Type": "Air", "Original ETA": yesterday, "Payment Status": "Confirmed"},
            "expected_risk": "Medium" 
            # Delay > 1 is Medium. U1 escalates to High if score < 2.
            # Wait, score 1 (Medium) + 1 = score 2 (High).
        },
        {
            "name": "Low Risk - On Track",
            "item": {"Status": "In Transit", "Payment Status": "Confirmed", "Original ETA": today},
            "expected_risk": "Low"
        }
    ]

    print(f"{'Test Case':<40} | {'Expected':<10} | {'Actual':<10} | {'Result'}")
    print("-" * 80)
    
    for case in test_cases:
        result = calculate_risk(case["item"])
        actual_risk = result["Risk Level"]
        pass_fail = "PASS" if actual_risk == case["expected_risk"] else "FAIL"
        print(f"{case['name']:<40} | {case['expected_risk']:<10} | {actual_risk:<10} | {pass_fail}")
        if pass_fail == "FAIL":
            print(f"  > Reason: {result['Risk Reason']}")

if __name__ == "__main__":
    test_risk_logic()
