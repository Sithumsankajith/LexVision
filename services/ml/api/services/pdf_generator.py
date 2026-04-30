from datetime import datetime
from fpdf import FPDF, XPos, YPos
from .. import models

class TicketNoticePDF(FPDF):
    def header(self):
        self.set_font("helvetica", "B", 20)
        self.cell(0, 10, "LexVision", align="C", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_font("helvetica", "I", 12)
        self.cell(0, 10, "Official Traffic Violation Notice", align="C", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(10)

    def footer(self):
        self.set_y(-25)
        self.set_font("helvetica", "I", 8)
        self.multi_cell(0, 5, "DISCLAIMER: AI-assisted evidence, final decision validated by police officer.", align="C")
        self.cell(0, 10, f"Page {self.page_no()}", align="C")


def generate_ticket_pdf(ticket: models.TrafficTicket) -> bytes:
    pdf = TicketNoticePDF()
    pdf.add_page()
    pdf.set_font("helvetica", size=12)

    # Basic Info
    pdf.set_font("helvetica", "B", 14)
    pdf.cell(0, 10, f"Ticket Number: {ticket.ticket_number}", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(5)

    pdf.set_font("helvetica", size=12)
    report_ref = ticket.evidence_report_id or ticket.report_id or "N/A"
    pdf.cell(50, 8, "Report Reference:", border=0)
    pdf.cell(0, 8, str(report_ref), border=0, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf.cell(50, 8, "Violation Type:", border=0)
    pdf.cell(0, 8, str(ticket.violation_type).upper().replace("-", " ") if ticket.violation_type else "N/A", border=0, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf.cell(50, 8, "Penal Code:", border=0)
    pdf.cell(0, 8, str(ticket.penal_code), border=0, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf.cell(50, 8, "Fine Amount:", border=0)
    pdf.cell(0, 8, f"{ticket.fine_amount:,.2f} {ticket.fine_rule.currency if ticket.fine_rule else 'LKR'}", border=0, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf.cell(50, 8, "Vehicle Plate:", border=0)
    pdf.cell(0, 8, str(ticket.vehicle_plate or "Unknown"), border=0, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    officer_name = ticket.officer.email if ticket.officer else str(ticket.officer_id)
    pdf.cell(50, 8, "Issuing Officer:", border=0)
    pdf.cell(0, 8, officer_name, border=0, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    issued_date = ticket.issued_at.strftime("%Y-%m-%d %H:%M:%S") if ticket.issued_at else "N/A"
    pdf.cell(50, 8, "Issued Date:", border=0)
    pdf.cell(0, 8, issued_date, border=0, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    due_date = ticket.due_date.strftime("%Y-%m-%d %H:%M:%S") if getattr(ticket, "due_date", None) else "Upon Notice"
    pdf.cell(50, 8, "Due Date:", border=0)
    pdf.cell(0, 8, due_date, border=0, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf.cell(50, 8, "Status:", border=0)
    pdf.set_font("helvetica", "B", 12)
    pdf.cell(0, 8, ticket.status.value.upper(), border=0, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("helvetica", size=12)

    pdf.ln(10)

    # Payment Instructions
    pdf.set_font("helvetica", "B", 14)
    pdf.cell(0, 10, "Payment Instructions", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("helvetica", size=11)
    pdf.multi_cell(0, 6, "Please pay the fine amount to the designated LexVision payment portal or your local traffic division within the specified due date. Late payments may incur additional penalties.")
    pdf.ln(5)

    # Appeal Instructions
    pdf.set_font("helvetica", "B", 14)
    pdf.cell(0, 10, "Appeal Instructions", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_font("helvetica", size=11)
    pdf.multi_cell(0, 6, "If you wish to dispute this ticket, you may file an appeal through the Citizen Portal within 14 days of receiving this notice. Provide clear evidence supporting your claim.")

    return pdf.output()
