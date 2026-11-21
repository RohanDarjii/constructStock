# ConstructStock — Product Requirements Document

## 1. Product Overview

**Product Name:** ConstructStock  
**Product Type:** Web-based Construction Material Inventory and Waste Management System

ConstructStock is a construction inventory management platform designed to help construction companies manage materials across one or more project sites. The system tracks the complete material lifecycle, including purchasing, receiving, storing, issuing, consumption, wastage, stock transfers, supplier activity, low-stock alerts, and reporting.

The product is intended to provide construction companies with accurate and centralized visibility into material availability, usage, wastage, and procurement so that they can reduce shortages, over-purchasing, unnecessary wastage, and manual inventory errors.

---

## 2. Problem Statement

Construction companies frequently manage materials using spreadsheets, paper records, phone calls, and disconnected systems. This creates several problems:

- Site managers may not know the actual stock available at a site.
- Materials may be purchased even when sufficient stock exists at another site.
- Material consumption is often not properly recorded.
- Wastage and damaged materials may go undocumented.
- Management has limited visibility into project-wise material costs.
- Low-stock situations are often detected too late.
- Purchase and delivery information may not be traceable.
- Material transfers between construction sites can be difficult to track.
- Reports require significant manual effort.

ConstructStock addresses these challenges through a centralized and traceable inventory management system.

---

## 3. Product Goal

The primary goal of ConstructStock is to provide construction companies with a reliable digital platform to monitor and control construction materials throughout their lifecycle.

The system should enable users to know:

- What materials are available.
- Where those materials are located.
- How much material has been purchased.
- How much has been consumed.
- How much has been wasted.
- Which supplier provided the material.
- Which construction activity consumed the material.
- Which materials require reordering.
- Whether materials can be transferred from another site.
- What the current inventory value is.

---

## 4. Target Users

### Admin / Owner

The Admin or Owner has complete access to the system.

Responsibilities include:

- Managing users and permissions.
- Creating and managing construction sites.
- Monitoring inventory across all sites.
- Managing suppliers.
- Viewing purchase orders.
- Approving transfers.
- Monitoring wastage.
- Viewing company-wide reports and analytics.

### Site Manager

The Site Manager manages inventory operations for assigned construction sites.

Responsibilities include:

- Monitoring site inventory.
- Creating purchase requests or purchase orders.
- Recording material usage.
- Monitoring wastage.
- Requesting stock transfers.
- Viewing site reports.
- Monitoring low-stock alerts.

### Storekeeper / Supervisor

The Storekeeper manages daily physical inventory transactions.

Responsibilities include:

- Recording incoming materials.
- Recording material issues.
- Recording damaged or wasted materials.
- Confirming material transfers.
- Viewing available stock.
- Scanning QR codes for material information.

---

## 5. Product Scope

ConstructStock will cover the following major areas:

1. Authentication and role-based access.
2. Construction site management.
3. Material catalogue management.
4. Supplier management.
5. Purchase order management.
6. Material receiving.
7. Inventory management.
8. Material consumption and issuing.
9. Material wastage management.
10. Inter-site material transfers.
11. Low-stock and inventory alerts.
12. Dashboard and analytics.
13. Reports and exports.
14. QR-code-based material tracking.

---

# 6. Functional Requirements

## 6.1 Authentication and User Management

Users must be able to securely log in to the application.

The system must support:

- Login.
- Logout.
- Password management.
- Role-based access control.
- User activation and deactivation.
- Assignment of users to construction sites.

Supported roles:

- Admin / Owner.
- Site Manager.
- Storekeeper / Supervisor.

Users should only be able to access functionality authorized for their role.

---

## 6.2 Construction Site Management

Admin users must be able to create and manage multiple construction sites.

Each construction site should contain:

- Site name.
- Project name.
- Location.
- Project description.
- Start date.
- Expected completion date.
- Project status.
- Assigned Site Manager.
- Contact information.
- Optional project budget.

Possible project statuses:

- Planned.
- Active.
- On Hold.
- Completed.
- Cancelled.

Each site must maintain its own inventory.

---

## 6.3 Material Management

The system must maintain a centralized material catalogue.

Material information should include:

- Material name.
- Material code.
- Category.
- Unit of measurement.
- Description.
- Minimum stock level.
- Default reorder quantity.
- Active / inactive status.

Example materials:

- Cement.
- Steel.
- Sand.
- Bricks.
- Aggregate.
- Tiles.
- Paint.
- Electrical materials.
- Plumbing materials.

Supported units may include:

- Bags.
- Kilograms.
- Tonnes.
- Pieces.
- Litres.
- Square Feet.
- Cubic Metres.

---

## 6.4 Supplier Management

Users with appropriate permissions must be able to manage suppliers.

Supplier information should include:

- Supplier name.
- Contact person.
- Phone number.
- Email.
- Address.
- Tax / GST information where applicable.
- Materials supplied.
- Payment terms.
- Status.

The system should maintain supplier purchase history.

Users should be able to view:

- Total orders.
- Total purchase value.
- Last purchase.
- Pending purchase orders.
- Materials supplied.

---

## 6.5 Purchase Order Management

Authorized users must be able to create purchase orders.

A purchase order should contain:

- Purchase order number.
- Supplier.
- Construction site.
- Order date.
- Expected delivery date.
- List of materials.
- Quantity.
- Unit price.
- Tax if applicable.
- Total amount.
- Notes.
- Status.

Purchase order statuses:

- Draft.
- Ordered.
- Partially Received.
- Received.
- Cancelled.

The system must support partial deliveries.

Example:

Purchase Order:

500 cement bags ordered.

First delivery:

300 bags received.

Remaining:

200 bags pending.

The system should automatically update the purchase order status.

---

## 6.6 Material Receiving

When materials arrive at a construction site, the Storekeeper or Site Manager should record the delivery.

Receiving information should include:

- Purchase order.
- Supplier.
- Construction site.
- Material.
- Quantity received.
- Date.
- Delivery reference.
- Invoice number.
- Batch number.
- Remarks.

Receiving materials should automatically increase site inventory.

The system should maintain a complete receiving history.

---

## 6.7 Inventory Management

The system must maintain real-time inventory for every construction site.

The inventory should display:

- Material.
- Site.
- Total received.
- Total consumed.
- Total wasted.
- Quantity transferred in.
- Quantity transferred out.
- Current available stock.
- Minimum stock level.
- Inventory value.

Inventory calculation:

**Available Stock = Received + Transfer In - Consumption - Wastage - Transfer Out**

Inventory quantities must update automatically whenever a transaction occurs.

---

## 6.8 Material Consumption / Issue Management

Users must be able to record materials issued from inventory.

An issue record should contain:

- Material.
- Construction site.
- Quantity.
- Date.
- Construction activity.
- Issued to.
- Contractor if applicable.
- Description.
- Remarks.

Example construction activities:

- Foundation.
- Ground Floor Slab.
- First Floor Slab.
- Brickwork.
- Plastering.
- Flooring.
- Painting.
- Electrical Installation.

When material is issued, inventory must decrease automatically.

The system must prevent users from issuing more stock than is currently available unless an authorized override is provided.

---

## 6.9 Wastage Management

Users should be able to record materials that have been damaged, lost, or wasted.

A wastage entry should contain:

- Material.
- Construction site.
- Quantity wasted.
- Date.
- Reason.
- Construction activity.
- Notes.
- Optional supporting image.

Wastage reasons may include:

- Damage.
- Breakage.
- Transportation damage.
- Improper storage.
- Excess usage.
- Theft / loss.
- Weather damage.
- Quality rejection.
- Other.

Recording wastage should automatically reduce inventory.

The system should calculate:

**Wastage Percentage = Total Wasted / Total Received × 100**

---

## 6.10 Inter-Site Material Transfer

Materials should be transferable between construction sites.

A transfer should contain:

- Source site.
- Destination site.
- Material.
- Quantity.
- Requested by.
- Approved by.
- Transfer date.
- Notes.
- Status.

Transfer statuses:

- Requested.
- Approved.
- Rejected.
- In Transit.
- Received.
- Cancelled.

When a transfer is completed:

- Inventory must decrease at the source site.
- Inventory must increase at the destination site.

The transfer should remain fully traceable.

---

## 6.11 Low-Stock and Inventory Alerts

Each material should have a minimum stock level.

The system must generate alerts when stock reaches or falls below this level.

Example:

Material: Cement  
Available: 80 Bags  
Minimum Stock: 100 Bags

System alert:

**Low Stock — Cement**

The application may also recommend a reorder quantity.

Alerts should include:

- Low stock.
- Out of stock.
- Pending delivery.
- Delayed purchase order.
- High wastage.
- Transfer pending approval.

---

## 6.12 Dashboard

The dashboard should provide management with a high-level overview of inventory operations.

Dashboard metrics should include:

- Total inventory value.
- Number of active sites.
- Total materials.
- Low-stock materials.
- Out-of-stock materials.
- Pending deliveries.
- Today's material consumption.
- Monthly consumption.
- Wastage percentage.
- Pending transfers.

Dashboard charts may include:

- Monthly material consumption.
- Monthly purchasing.
- Material wastage by category.
- Site-wise inventory value.
- Most consumed materials.
- Supplier purchase distribution.

The dashboard should also display:

- Recent inventory transactions.
- Important alerts.
- Pending purchase deliveries.
- Recent transfers.

---

## 6.13 Reports and Analytics

The system must provide detailed reports.

Required reports include:

### Inventory Report

Shows current available stock by:

- Site.
- Material.
- Category.

### Purchase Report

Shows:

- Purchase orders.
- Supplier.
- Materials.
- Purchase value.
- Date range.

### Consumption Report

Shows:

- Materials consumed.
- Site.
- Construction activity.
- Quantity.
- Date.

### Wastage Report

Shows:

- Wasted materials.
- Wastage reasons.
- Quantity.
- Site.
- Wastage percentage.

### Supplier Report

Shows:

- Supplier purchases.
- Number of orders.
- Total purchase amount.
- Materials supplied.

### Site Report

Shows complete inventory activity for a selected construction site.

Users should be able to filter reports by:

- Date range.
- Site.
- Supplier.
- Material.
- Material category.

Reports should support:

- PDF export.
- Excel export.

---

## 6.14 QR Code Material Tracking

The system may generate a QR code for material batches or receiving transactions.

The QR code should allow users to quickly view:

- Material.
- Batch number.
- Supplier.
- Construction site.
- Quantity received.
- Remaining quantity.
- Receiving date.

Authorized users may also use QR scanning to access material transaction options.

This feature will be considered an advanced feature and may be implemented after the core MVP.

---

# 7. Main User Workflow

The primary workflow will be:

**Admin creates construction site**

↓

**Admin creates materials and suppliers**

↓

**Purchase Order is created**

↓

**Supplier delivers material**

↓

**Storekeeper records Material Receiving**

↓

**Inventory increases**

↓

**Material is issued for construction activity**

↓

**Inventory decreases**

↓

**Wastage is recorded where required**

↓

**Inventory is automatically adjusted**

↓

**System checks minimum stock levels**

↓

**Low-stock alert is generated**

↓

User can either:

**Create new Purchase Order**

or

**Request Material Transfer from another site**

↓

**Dashboard and Reports update automatically**

---

# 8. Business Rules

1. Every inventory transaction must belong to a construction site.

2. Material stock must not become negative under normal operations.

3. Users cannot consume more material than available stock.

4. Purchase receiving must update inventory automatically.

5. Material consumption must reduce inventory automatically.

6. Wastage must reduce inventory automatically.

7. Completed transfers must update both source and destination inventory.

8. Every major transaction must store the responsible user.

9. Transaction records should not normally be deleted permanently.

10. Important financial and inventory changes should maintain an audit history.

11. Only authorized roles may approve material transfers.

12. Site Managers should normally only access assigned sites.

13. Admin users should have visibility across all sites.

---

# 9. Non-Functional Requirements

## Performance

Normal dashboard and inventory pages should load quickly even when thousands of transactions exist.

## Security

The application should implement:

- Secure authentication.
- Password hashing.
- Role-based authorization.
- Protected API endpoints.
- Input validation.
- Secure session or token management.

## Reliability

Inventory calculations must remain consistent across all transactions.

Database transactions should be used for critical stock operations.

## Scalability

The system architecture should support:

- Multiple users.
- Multiple construction sites.
- Thousands of materials.
- Large transaction histories.

## Usability

The interface should be simple enough for construction-site employees who may not have extensive technical experience.

## Responsiveness

The application should work on:

- Desktop computers.
- Tablets.
- Mobile browsers.

Mobile usability is particularly important for site managers and storekeepers.

---

# 10. MVP Scope

The first working version should include:

- Authentication.
- Role-based access.
- Site management.
- Material catalogue.
- Supplier management.
- Purchase orders.
- Material receiving.
- Inventory management.
- Material consumption.
- Wastage management.
- Inter-site transfer.
- Low-stock alerts.
- Dashboard.
- Basic reports.

The following can be added after the MVP:

- QR-code tracking.
- Advanced analytics.
- Automatic reorder recommendations.
- Supplier performance scoring.
- Email notifications.
- Mobile application.

---

# 11. Out of Scope

The initial version of ConstructStock will not include:

- Employee payroll.
- Worker attendance.
- Construction equipment tracking.
- Full accounting.
- Customer relationship management.
- Contractor billing.
- Project scheduling.
- Building design.
- BIM integration.
- AI-based image recognition.
- Complete ERP functionality.

These features may be considered in future versions but are outside the core purpose of ConstructStock.

---

# 12. Success Criteria

The project will be considered successful when users can:

- Maintain multiple construction sites.
- Track site-level inventory accurately.
- Create and track purchase orders.
- Record material receiving.
- Record material consumption.
- Monitor material wastage.
- Transfer inventory between sites.
- Receive low-stock alerts.
- View management dashboards.
- Generate inventory and transaction reports.
- Trace the complete lifecycle of a construction material.

---

# 13. Future Enhancements

Possible future enhancements include:

- AI-based material demand forecasting.
- Automatic procurement recommendations.
- Supplier price comparison.
- Supplier performance scoring.
- Budget vs. actual material spending.
- Mobile application.
- Offline inventory entry for construction sites.
- Barcode support.
- IoT weighing-system integration.
- WhatsApp or email alerts.
- Integration with accounting software.
- Integration with construction project management platforms.
- Advanced predictive wastage analytics.

---

# 14. Product Vision

ConstructStock should eventually become a centralized construction material intelligence platform that allows construction companies to understand exactly what materials they own, where those materials are located, how they are being consumed, where wastage is occurring, and when additional procurement is required. The first version will focus on accurate inventory control and traceability while keeping the system simple enough for daily use at construction sites.