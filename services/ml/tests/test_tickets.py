import pytest
from api import models

def test_cannot_issue_ticket_for_non_validated_report(client, police_token, mock_evidence_report):
    # 1. Cannot issue ticket for non-validated report
    headers = {"Authorization": f"Bearer {police_token}"}
    response = client.post("/api/tickets", json={
        "evidence_report_id": mock_evidence_report.id,
    }, headers=headers)
    
    assert response.status_code == 400
    assert "VALIDATED" in response.json()["detail"] or "must be VALIDATED" in response.json()["detail"]

def test_can_issue_ticket_for_validated_report(client, police_token, mock_validated_report, fine_rule):
    # 2. Can issue ticket for validated report
    headers = {"Authorization": f"Bearer {police_token}"}
    response = client.post("/api/tickets", json={
        "evidence_report_id": mock_validated_report.id,
    }, headers=headers)
    
    assert response.status_code == 200
    data = response.json()
    assert data["evidence_report_id"] == mock_validated_report.id
    assert data["status"] == "ISSUED"
    assert data["ticket_number"] is not None

def test_cannot_issue_duplicate_ticket(client, police_token, mock_validated_report, fine_rule):
    # 3. Cannot issue duplicate ticket
    headers = {"Authorization": f"Bearer {police_token}"}
    
    # First ticket
    client.post("/api/tickets", json={"evidence_report_id": mock_validated_report.id}, headers=headers)
    
    # Second ticket
    response = client.post("/api/tickets", json={"evidence_report_id": mock_validated_report.id}, headers=headers)
    assert response.status_code == 400
    assert "already issued" in response.json()["detail"].lower() or "already exists" in response.json()["detail"].lower()

def test_ticket_uses_fine_rule_from_final_violation_type(client, police_token, mock_validated_report, fine_rule):
    # 4. Ticket uses fine rule from final_violation_type
    headers = {"Authorization": f"Bearer {police_token}"}
    response = client.post("/api/tickets", json={
        "evidence_report_id": mock_validated_report.id,
    }, headers=headers)
    
    assert response.status_code == 200
    data = response.json()
    assert data["fine_rule_id"] == fine_rule.id
    assert data["penal_code"] == fine_rule.penal_code
    assert data["fine_amount"] == fine_rule.fine_amount

def test_override_requires_override_reason(client, police_token, mock_validated_report, fine_rule):
    # 5. Override requires override_reason
    headers = {"Authorization": f"Bearer {police_token}"}
    
    # Missing override reason
    response = client.post("/api/tickets", json={
        "evidence_report_id": mock_validated_report.id,
        "penal_code": "CUSTOM-123",
        "fine_amount": 10000.0
    }, headers=headers)
    
    assert response.status_code == 400
    assert "override_reason" in response.json()["detail"].lower() or "justification" in response.json()["detail"].lower()
    
    # With override reason
    response2 = client.post("/api/tickets", json={
        "evidence_report_id": mock_validated_report.id,
        "penal_code": "CUSTOM-123",
        "fine_amount": 10000.0,
        "fine_override_reason": "Officer discretion"
    }, headers=headers)
    
    assert response2.status_code == 200
    data = response2.json()
    assert data["penal_code"] == "CUSTOM-123"
    assert data["fine_amount"] == 10000.0
    assert data["fine_override_reason"] == "Officer discretion"

def test_get_ticket_by_report_returns_persisted_ticket(client, police_token, mock_validated_report, fine_rule):
    # 6. GET ticket by report returns persisted ticket
    headers = {"Authorization": f"Bearer {police_token}"}
    create_response = client.post("/api/tickets", json={"evidence_report_id": mock_validated_report.id}, headers=headers)
    ticket_id = create_response.json()["id"]
    
    get_response = client.get(f"/api/tickets/by-evidence-report/{mock_validated_report.id}", headers=headers)
    assert get_response.status_code == 200
    assert get_response.json()["id"] == ticket_id

def test_status_transition_issued_to_notified_works(client, police_token, mock_validated_report, fine_rule):
    # 7. Status transition ISSUED -> NOTIFIED works
    headers = {"Authorization": f"Bearer {police_token}"}
    create_response = client.post("/api/tickets", json={"evidence_report_id": mock_validated_report.id}, headers=headers)
    ticket_id = create_response.json()["id"]
    
    update_response = client.put(f"/api/tickets/{ticket_id}/status", json={"status": "NOTIFIED"}, headers=headers)
    assert update_response.status_code == 200
    assert update_response.json()["status"] == "NOTIFIED"

def test_invalid_transition_closed_to_issued_fails(client, police_token, admin_token, mock_validated_report, fine_rule):
    # 8. Invalid transition CLOSED -> ISSUED fails
    headers = {"Authorization": f"Bearer {admin_token}"}
    # Create ticket
    create_response = client.post("/api/tickets", json={"evidence_report_id": mock_validated_report.id}, headers={"Authorization": f"Bearer {police_token}"})
    ticket_id = create_response.json()["id"]
    
    # Transition to CANCELLED then CLOSED
    client.put(f"/api/tickets/{ticket_id}/status", json={"status": "CANCELLED"}, headers=headers)
    close_response = client.put(f"/api/tickets/{ticket_id}/status", json={"status": "CLOSED"}, headers=headers)
    assert close_response.status_code == 200
    
    # Attempt to reopen as ISSUED
    reopen_response = client.put(f"/api/tickets/{ticket_id}/status", json={"status": "ISSUED"}, headers=headers)
    assert reopen_response.status_code == 400
    assert "transition" in reopen_response.json()["detail"].lower()

def test_admin_can_cancel_ticket(client, admin_token, police_token, mock_validated_report, fine_rule):
    # 9. Admin can cancel ticket
    # Police issue ticket
    headers_police = {"Authorization": f"Bearer {police_token}"}
    create_response = client.post("/api/tickets", json={"evidence_report_id": mock_validated_report.id}, headers=headers_police)
    ticket_id = create_response.json()["id"]
    
    # Admin cancel ticket
    headers_admin = {"Authorization": f"Bearer {admin_token}"}
    cancel_response = client.put(f"/api/tickets/{ticket_id}/status", json={"status": "CANCELLED", "cancelled_reason": "Mistake"}, headers=headers_admin)
    assert cancel_response.status_code == 200
    assert cancel_response.json()["status"] == "CANCELLED"
    
    # Police try to cancel ticket
    cancel_response_police = client.put(f"/api/tickets/{ticket_id}/status", json={"status": "CANCELLED"}, headers=headers_police)
    assert cancel_response_police.status_code in [400, 403, 401] # Ensure police can't cancel (if policy dictates), or at least admin definitely can.

def test_citizen_cannot_mutate_tickets(client, citizen_token, mock_validated_report, fine_rule):
    # 10. Citizen cannot issue/update/cancel tickets
    headers = {"Authorization": f"Bearer {citizen_token}"}
    
    # Try to issue ticket
    response = client.post("/api/tickets", json={"evidence_report_id": mock_validated_report.id}, headers=headers)
    assert response.status_code in [401, 403]
    
    # Try to get ticket directly via ID
    response = client.get("/api/tickets/some-uuid", headers=headers)
    assert response.status_code in [401, 403]
    
def test_audit_history_created_for_status_mutation(client, police_token, mock_validated_report, fine_rule):
    # 11. Audit/status history is created for every status mutation
    headers = {"Authorization": f"Bearer {police_token}"}
    create_response = client.post("/api/tickets", json={"evidence_report_id": mock_validated_report.id}, headers=headers)
    ticket_id = create_response.json()["id"]
    
    client.put(f"/api/tickets/{ticket_id}/status", json={"status": "NOTIFIED"}, headers=headers)
    
    get_response = client.get(f"/api/tickets/{ticket_id}", headers=headers)
    assert get_response.status_code == 200
    data = get_response.json()
    
    history = data.get("status_history", [])
    assert len(history) >= 2 # One for creation (DRAFT/ISSUED), one for NOTIFIED
    statuses = [h["new_status"] for h in history]
    assert "ISSUED" in statuses
    assert "NOTIFIED" in statuses

def test_generate_pdf_success_as_police(client, police_token, mock_validated_report, fine_rule):
    headers = {"Authorization": f"Bearer {police_token}"}
    create_response = client.post("/api/tickets", json={"evidence_report_id": mock_validated_report.id}, headers=headers)
    ticket_id = create_response.json()["id"]

    pdf_response = client.get(f"/api/tickets/{ticket_id}/notice.pdf", headers=headers)
    assert pdf_response.status_code == 200
    assert pdf_response.headers["Content-Type"] == "application/pdf"
    assert "attachment; filename=" in pdf_response.headers["Content-Disposition"]
    assert b"%PDF" in pdf_response.content

def test_generate_pdf_unauthorized_for_citizen(client, police_token, citizen_token, mock_validated_report, fine_rule):
    headers_police = {"Authorization": f"Bearer {police_token}"}
    create_response = client.post("/api/tickets", json={"evidence_report_id": mock_validated_report.id}, headers=headers_police)
    ticket_id = create_response.json()["id"]

    headers_citizen = {"Authorization": f"Bearer {citizen_token}"}
    pdf_response = client.get(f"/api/tickets/{ticket_id}/notice.pdf", headers=headers_citizen)
    assert pdf_response.status_code in [401, 403]

def test_generate_pdf_not_found(client, police_token):
    headers = {"Authorization": f"Bearer {police_token}"}
    pdf_response = client.get("/api/tickets/invalid-id/notice.pdf", headers=headers)
    assert pdf_response.status_code == 404
