#!/usr/bin/env python3
"""
Repair script: rebuild invoice items from booking services for paid multi-customer bookings.

Problem: Due to a previous bug (NORMAL mode REPLACED invoice items instead of APPENDING),
some paid invoices for multi-customer bookings only contain items from the LAST customer
who paid — items from previously-paid customers were wiped.

This script:
1. Fetches all multi-customer bookings (note starts with [[MULTI]]).
2. For each booking, fetches its paid invoices.
3. For each invoice, rebuilds its items[] from the booking's services — including ALL
   services whose slot is "checkout" (paid). Each service item is tagged with _slotIdx
   so the slot-status API can later remove it if the slot reverts.
4. Recomputes total_amount, final_amount (preserving discount + tip from the invoice).
5. PUTs the updated invoice via the API.
"""
import json
import urllib.request
import urllib.parse

BASE = "http://localhost:3000"

def api_get(path):
    url = f"{BASE}{path}"
    with urllib.request.urlopen(url) as resp:
        return json.loads(resp.read())

def api_put(path, body):
    url = f"{BASE}{path}"
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="PUT",
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())

def main():
    print("Fetching bookings...")
    page = 1
    all_bookings = []
    while True:
        res = api_get(f"/api/supabase/bookings?page={page}&limit=200")
        if not res.get("ok"):
            print(f"  API error: {res.get('error')}")
            break
        items = res.get("data") or []
        all_bookings.extend(items)
        total_pages = res.get("pagination", {}).get("totalPages", 1)
        if page >= total_pages:
            break
        page += 1
    print(f"  Found {len(all_bookings)} bookings total.")

    multi_bookings = [b for b in all_bookings if (b.get("note") or "").startswith("[[MULTI]]")]
    print(f"  {len(multi_bookings)} are multi-customer bookings.")

    repaired = 0
    skipped = 0
    for b in multi_bookings:
        booking_id = b["id"]
        code = b.get("code", "")
        note = b.get("note") or ""

        try:
            multi_json = json.loads(note[len("[[MULTI]]"):])
        except Exception:
            continue
        slots = multi_json.get("slots", [])
        slot_statuses = multi_json.get("slotStatuses", [])
        service_slots = multi_json.get("serviceSlots", [])
        if not slots:
            continue

        booking_detail = api_get(f"/api/supabase/bookings/{booking_id}")
        if not booking_detail.get("ok"):
            continue
        bdata = booking_detail["data"]
        services = bdata.get("services") or []

        inv_res = api_get(f"/api/supabase/invoices?booking_id={booking_id}&limit=100")
        if not inv_res.get("ok"):
            continue
        invoices = inv_res.get("data") or []
        if not invoices:
            skipped += 1
            continue

        for inv in invoices:
            inv_id = inv["id"]
            inv_code = inv.get("code", "")
            inv_status = inv.get("status", "")
            if inv_status != "completed":
                continue

            new_items = []
            for svc_idx, svc in enumerate(services):
                if service_slots and svc_idx < len(service_slots):
                    slot_idx = service_slots[svc_idx]
                else:
                    slot_idx = svc_idx
                if slot_idx < len(slot_statuses):
                    slot_st = slot_statuses[slot_idx]
                else:
                    slot_st = bdata.get("status", "")
                if slot_st != "checkout":
                    continue
                s = svc.get("service") or {}
                price = int(s.get("price") or 0)
                staff = svc.get("staff") or {}
                new_items.append({
                    "itemId": s.get("id"),
                    "name": s.get("name", "Dịch vụ"),
                    "type": "service",
                    "quantity": 1,
                    "price": price,
                    "discount": 0,
                    "discountType": "VND",
                    "total": price,
                    "staffName": staff.get("name"),
                    "_slotIdx": slot_idx,
                })

            existing_items = inv.get("items") or []
            existing_names = sorted([it.get("name", "") for it in existing_items])
            new_names = sorted([it.get("name", "") for it in new_items])
            if existing_names == new_names and len(existing_items) == len(new_items):
                skipped += 1
                continue

            preserved_products = [
                it for it in existing_items
                if it.get("type") not in ("service", None)
            ]
            all_items = new_items + preserved_products

            subtotal = sum(
                (int(it.get("price") or 0)) * (int(it.get("quantity") or 1))
                for it in all_items
            )
            discount = int(inv.get("discount") or 0)
            tip = int(inv.get("tip") or 0)
            final_amount = max(0, subtotal - discount) + tip

            promotion = inv.get("promotion")
            photos = inv.get("photos") or []

            new_note = json.dumps({
                "__kind": "invoice_meta",
                "items": all_items,
                "note": None,
                "tip": tip,
                "promotion": promotion,
                "photos": photos,
            }, ensure_ascii=False, separators=(",", ":"))

            print(f"  Repairing invoice {inv_code} (booking {code}):")
            print(f"    Before: {len(existing_items)} items {existing_names}")
            print(f"    After:  {len(all_items)} items {sorted([it['name'] for it in all_items])}")
            print(f"    total: {subtotal}, final: {final_amount}")

            put_body = {
                "note": new_note,
                "total_amount": subtotal,
                "final_amount": final_amount,
            }
            result = api_put(f"/api/supabase/invoices/{inv_id}", put_body)
            if result.get("ok"):
                print(f"    OK Repaired.")
                repaired += 1
            else:
                print(f"    FAILED: {result.get('error')}")

    print(f"\nDone. Repaired: {repaired}, Skipped: {skipped}")

if __name__ == "__main__":
    main()
