import requests

baseUrl = "http://localhost:8000/api"
res = requests.post(f"{baseUrl}/auth/login", data={"username": "final_test@citizen.com", "password": "password123"})
if res.status_code != 200:
    print("Login failed:", res.text)
    exit(1)

token = res.json()["access_token"]
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
data = {
    "violation_type": "helmet",
    "datetime": "2026-03-03T00:00:00Z",
    "location_lat": 1.0,
    "location_lng": 1.0,
    "location_address": "Test",
    "location_city": "Test",
    "evidence": []
}
res = requests.post(f"{baseUrl}/reports/", headers=headers, json=data)
print("Post Report Status:", res.status_code)
print("Post Report Response:", res.text)
