# Non-Judicial Service Fields

This document extracts all fields used for:
- `Copy Of FIR`
- `Copy Of Registry/Deed`

Sources:
- `resources/views/services/copyOfFir.blade.php`
- `resources/views/services/registry.blade.php`
- `app/Http/Controllers/TicketController.php` (`generateTicketData`)
- `app/Http/Controllers/Api/TicketController.php` (`generateTicketData`)

## Copy Of FIR

### Form fields (request payload)
- `service_type` (hidden, fixed: `Copy Of FIR`)
- `service_category` (hidden, fixed: `nonjudicial`)
- `services` (fixed: `7`)
- `province`
- `district_id`
- `station_id`
- `other_station_id` (fallback text input if station list is hidden)
- `city_type` (`City` | `Sadar` | `Unknown`)
- `fir_no`
- `year`
- `offence`
- `case_title`
- `case_date`
- `date_unknow`
- `delivery_mode` (`courier` | `self_collection`)
- `address`
- `sets`
- `set_type` (`attested` | `non_attested` | `both`)
- `notes`
- `ticketDocuments[documents][][document_file]` (optional multiple files)

### Persisted fields in `tickets` (via `generateTicketData`)
- `service_id` <= `services`
- `service_category` <= `service_type`
- `case_title`
- `case_date` (null when `date_unknow` is checked)
- `address`
- `sets`
- `notes`
- `delivery_mode`
- `year`
- `set_type`
- `offence`
- `fir_no`
- `office_name` (normally null for FIR form)
- `city_type`
- `city` (normally null for FIR form)
- `doc_no` (normally null for FIR form)
- `district_id`
- `station_id` <= (`station_id` or fallback `other_station_id`)

## Copy Of Registry/Deed

### Form fields (request payload)
- `service_type` (hidden, fixed: `Copy Of Registry/Deed`)
- `service_category` (hidden, fixed: `nonjudicial`)
- `services` (fixed: `6`)
- `office_name` (default readonly: `Sub Registrar`)
- `city`
- `city_type` (`City` | `Sadar` | `Unknown`)
- `doc_no`
- `year`
- `case_title`
- `case_date`
- `date_unknow`
- `delivery_mode` (`courier` | `self_collection`)
- `address`
- `sets`
- `set_type` (`attested` | `non_attested` | `both`)
- `notes`
- `ticketDocuments[documents][][document_file]` (optional multiple files)

### Persisted fields in `tickets` (via `generateTicketData`)
- `service_id` <= `services`
- `service_category` <= `service_type`
- `case_title`
- `case_date` (null when `date_unknow` is checked)
- `address`
- `sets`
- `notes`
- `delivery_mode`
- `year`
- `set_type`
- `offence` (normally null for Registry form)
- `fir_no` (normally null for Registry form)
- `office_name`
- `city_type`
- `city`
- `doc_no`
- `district_id` (normally null for Registry form)
- `station_id` (normally null for Registry form)

## Shared notes
- Uploaded files are stored through ticket document handling (`ticketDocuments[documents][][document_file]`).
- `service_category` in DB is set from `service_type` in controller mapping.
- Hidden `service_category=nonjudicial` is used for branch logic in the web controller.
