# Directive: Risk Logic - Logistics Tracking

This document defines the business rules for automatically calculating the **Risk Level**, **Risk Reason**, and **Suggested Action**.

## 1. Risk Conditions

### Payment Layer
- **Rule P1:** If `Payment Status` is "Pending" or "Overdue" AND "Status" is not "Arrived/Finished" -> **Risk: HIGH**. (High risk for any active operation with payment issues).
- **Rule P2:** If `Payment Status` is "Requested" but not confirmed -> **Risk: MEDIUM**.

### Delay Layer
- **Rule D1:** If `Calculation: Delay` > 5 days AND `Urgency Flag` is "Yes" -> **Risk: HIGH**.
- **Rule D2:** If `Calculation: Delay` > 1 day -> **Risk: MEDIUM**.

> [!NOTE]
> **Delay Calculation Method:**
> - `Delay` = `Current Date` - `Baseline Date`.
> - `Baseline Date` is defined as:
>     - If in Production: `Original Production Completion Date`.
>     - If in Transit: `Original ETA`.

### Urgency Layer
- **Rule U1:** If `Cargo Type` is "Air" or `Urgency Flag` is "Yes" -> **Risk: INCREASE** by 1 level if there is any delay (Delay > 0).

## 2. Risk Level Definitions

| Risk Level | Description |
| :--- | :--- |
| **High** | Critical issue requiring immediate intervention from the **Responsible Person**. |
| **Medium** | Potential delay or payment issue. Needs monitoring. |
| **Low** | On track. No immediate action required. |

## 3. Automated Logic Flow

1. Check Payment Status.
2. Check Delay (Production vs Shipping).
3. Evaluate Urgency.
4. Set highest risk found from any category.
5. Populate `Risk Reason` with the triggered rule.
6. Populate `Suggested Action` based on the rule (e.g., "Contact Finance for payment", "Expedite with Freight Agent").
