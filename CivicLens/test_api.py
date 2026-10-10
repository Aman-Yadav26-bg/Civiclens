#!/usr/bin/env python3
import urllib.request
import json
import time
import subprocess
import sys
import os

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

PORT = 5002
env = dict(os.environ)
env["PORT"] = str(PORT)
env["PYTHONIOENCODING"] = "utf-8"

# Start app.py in background on port 5002 for test
server_process = subprocess.Popen([sys.executable, "app.py"], env=env)
time.sleep(2)

base_url = f"http://localhost:{PORT}"

def test_endpoint(name, url, method="GET", data=None):
    req = urllib.request.Request(url, method=method)
    if data:
        req.add_header("Content-Type", "application/json")
        body = json.dumps(data).encode("utf-8")
    else:
        body = None
    try:
        with urllib.request.urlopen(req, data=body, timeout=5) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            print(f"[SUCCESS] [{method}] {name}: Status {response.status}")
            return res_data
    except Exception as e:
        print(f"[FAILED] [{method}] {name}: {e}")
        return None

try:
    print("\n--- RUNNING CIVICLENS AUTOMATED API TEST SUITE ---")
    
    # 1. Health
    health_res = test_endpoint("Health Check", f"{base_url}/api/health")
    assert health_res and health_res.get("status") == "active", "Health check failed"
    
    # 2. Get All Reports
    reports_res = test_endpoint("Get All Reports", f"{base_url}/api/reports")
    assert reports_res and len(reports_res.get("data", [])) >= 4, "Should have initial complaints"
    
    # 3. Create Report with Dynamic City (Kanpur)
    new_report_payload = {
        "category": "Pothole",
        "description": "Critical deep cavity near Mall Road intersection posing severe risk of vehicle damage.",
        "location": "Mall Road, Kanpur, Uttar Pradesh - 208001",
        "city": "Kanpur",
        "latitude": 26.4499,
        "longitude": 80.3319,
        "citizenEmail": "citizen@demo.com"
    }
    create_res = test_endpoint("Create New Report with Dynamic City", f"{base_url}/api/reports", method="POST", data=new_report_payload)
    assert create_res and create_res.get("success"), "Report creation failed"
    new_id = create_res["data"]["id"]
    assigned_ward = create_res["data"]["ward"]
    email_recipient = create_res.get("emailResult", {}).get("recipient", "")
    print(f"   -> Created Report ID: {new_id}, City: {create_res['data'].get('city')}, Assigned Ward: {assigned_ward}")
    print(f"   -> Dynamic Nodal Email Dispatch Target: {email_recipient}")
    assert "kanpur" in email_recipient, f"Expected kanpur in email domain, got: {email_recipient}"
    
    # 4. Upvote Report
    upvote_res = test_endpoint("Upvote Report", f"{base_url}/api/reports/{new_id}/upvote", method="POST", data={"userEmail": "citizen2@demo.com"})
    assert upvote_res and upvote_res.get("upvotes") == 2, "Upvote count should increment to 2"
    print(f"   -> Upvote Count: {upvote_res.get('upvotes')}")
    
    # 5. Patch Report (Officer Resolution)
    patch_payload = {
        "status": "Resolved",
        "resolutionNote": "Pothole filled with Bituminous Cold Mix by PWD Quick Response Team.",
        "resolutionProofUrl": "https://images.unsplash.com/photo-1584467735815-f778f274e296?w=600"
    }
    patch_res = test_endpoint("Officer Resolution Patch", f"{base_url}/api/reports/{new_id}", method="PATCH", data=patch_payload)
    assert patch_res and patch_res["data"]["status"] == "Resolved", "Status should be Resolved"
    print(f"   -> Ticket Status: {patch_res['data']['status']}, Resolution Note: {patch_res['data']['resolutionNote']}")
    
    # 6. Fetch Single Report
    single_res = test_endpoint("Get Single Report", f"{base_url}/api/reports/{new_id}")
    assert single_res and single_res["data"]["resolutionProof"], "Should have resolution proof"
    assert len(single_res["data"]["timeline"]) >= 2, "Timeline should reflect progression"
    
    # 7. Get Stats
    stats_res = test_endpoint("Get Dashboard Stats", f"{base_url}/api/stats")
    assert stats_res and stats_res["data"]["total"] >= 5, "Total count should reflect new report"
    print(f"   -> Dynamic Stats: Total={stats_res['data']['total']}, Resolved={stats_res['data']['resolved']}, Pending={stats_res['data']['pending']}")
    
    # 8. Auth Login
    login_res = test_endpoint("Officer Auth Login", f"{base_url}/api/auth/login", method="POST", data={"email": "officer@demo.com", "password": "password123"})
    assert login_res and login_res["user"]["role"] == "officer", "User role should be officer"
    print(f"   -> Authenticated User: {login_res['user']['name']} (Role: {login_res['user']['role']})")
    
    print("\n>>> ALL 8 AUTOMATED REST API TESTS PASSED SUCCESSFULLY WITH DYNAMIC CITY DERIVATION! <<<\n")

finally:
    server_process.terminate()
