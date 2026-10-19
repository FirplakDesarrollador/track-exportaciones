# Directive: Data Model - Logistics Tracking

This document defines the fields and data types for the Seguimiento Logístico COMEX.

## Core Fields
| Field Name | Type | Description |
| :--- | :--- | :--- |
| **Shipment ID** | String | Unique identifier for the shipment. |
| **Supplier** | String | Name of the supplier. |
| **PO Number** | String | Purchase Order number. |
| **ETA** | Date | Estimated Time of Arrival. |
| **Status** | Enum | Current status (e.g., In Production, Transit, Arrived). |

## Expanded Fields (New)
| Field Name | Type | Description / Options |
| :--- | :--- | :--- |
| **Payment Status** | Enum | Pending, Requested, Confirmed, Overdue. |
| **Payment Type** | Enum | Advance, CAD (Cash Against Documents), Letter of Credit, Net 30, etc. |
| **Incoterm** | Enum | FOB, CIF, EXW, FCA, DDP, etc. |
| **Logistics Provider** | String | Freight agent or shipping line (e.g., Maersk, DHL). |
| **Cargo Type** | Enum | 20FT, 40FT, LCL (Less than Container Load), Air. |
| **Risk Level** | Enum | Low, Medium, High. |
| **Risk Reason** | String | Explanation for the assigned risk level. |
| **Suggested Action** | String | Recommended next step to mitigate risk. |
| **Responsible Person** | String | Name of the person in charge. |
| **Responsible Area** | String | Department (e.g., Purchasing, Logistics, Finance). |
| **Support Folder** | Link | URL or path to the documentation folder. |

## Traceability Fields (Further Expansion)
| Field Name | Type | Description / Options |
| :--- | :--- | :--- |
| **Operation Type** | Enum | Import, Export. |
| **Client** | String | Name of the client (required for Export operations). |
| **Country** | String | Origin (for Import) or Destination (for Export). |
| **Year** | Integer | The fiscal or calendar year of the operation. |
| **Created At** | DateTime | Timestamp when the operation record was created. |
| **Updated At** | DateTime | Timestamp of the last record modification. |
| **Status Date** | Date | Effective date of the current status. |
| **Urgency Flag** | Boolean | Yes / No. |
