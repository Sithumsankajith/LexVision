"""bootstrap postgres and add citizen otp tracking

Revision ID: 20260407_0001
Revises:
Create Date: 2026-04-07 00:00:00
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260407_0001"
down_revision = None
branch_labels = None
depends_on = None


ROLE_ENUM = sa.Enum("CITIZEN", "POLICE", "ADMIN", name="role_enum", native_enum=False)
REPORT_STATUS_ENUM = sa.Enum(
    "SUBMITTED",
    "AI_PROCESSING",
    "UNDER_REVIEW",
    "VALIDATED",
    "REJECTED",
    name="report_status_enum",
    native_enum=False,
)
STATUS_CHANGE_SOURCE_ENUM = sa.Enum(
    "SYSTEM",
    "CITIZEN",
    "POLICE",
    "ADMIN",
    "ML_WORKER",
    name="status_change_source_enum",
    native_enum=False,
)
SMS_NOTIFICATION_STATUS_ENUM = sa.Enum(
    "PENDING",
    "SENT",
    "FAILED",
    name="sms_notification_status_enum",
    native_enum=False,
)


def _table_exists(inspector: sa.Inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def _index_exists(inspector: sa.Inspector, table_name: str, index_name: str) -> bool:
    return any(index["name"] == index_name for index in inspector.get_indexes(table_name))


def _ensure_index(inspector: sa.Inspector, index_name: str, table_name: str, columns: list[str], *, unique: bool = False) -> None:
    if _table_exists(inspector, table_name) and not _index_exists(inspector, table_name, index_name):
        op.create_index(index_name, table_name, columns, unique=unique)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not _table_exists(inspector, "users"):
        op.create_table(
            "users",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("email", sa.String(), nullable=True),
            sa.Column("hashed_password", sa.String(), nullable=True),
            sa.Column("role", ROLE_ENUM, nullable=True),
            sa.Column("reward_points", sa.Float(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.PrimaryKeyConstraint("id"),
        )

    if not _table_exists(inspector, "rewards"):
        op.create_table(
            "rewards",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("title", sa.String(), nullable=True),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("points_cost", sa.Float(), nullable=True),
            sa.Column("image_url", sa.String(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )

    if not _table_exists(inspector, "reports"):
        op.create_table(
            "reports",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("tracking_id", sa.String(), nullable=True),
            sa.Column("user_id", sa.String(), nullable=True),
            sa.Column("violation_type", sa.String(), nullable=True),
            sa.Column("datetime", sa.DateTime(), nullable=True),
            sa.Column("location_lat", sa.Float(), nullable=True),
            sa.Column("location_lng", sa.Float(), nullable=True),
            sa.Column("location_address", sa.String(), nullable=True),
            sa.Column("location_city", sa.String(), nullable=True),
            sa.Column("status", REPORT_STATUS_ENUM, nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("updated_at", sa.DateTime(), nullable=True, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    if not _table_exists(inspector, "evidence"):
        op.create_table(
            "evidence",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("report_id", sa.String(), nullable=True),
            sa.Column("type", sa.String(), nullable=True),
            sa.Column("url", sa.String(), nullable=True),
            sa.Column("name", sa.String(), nullable=True),
            sa.Column("size", sa.Float(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(["report_id"], ["reports.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    if not _table_exists(inspector, "inference_logs"):
        op.create_table(
            "inference_logs",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("report_id", sa.String(), nullable=True),
            sa.Column("model_version", sa.String(), nullable=True),
            sa.Column("bbox_coordinates", sa.JSON(), nullable=True),
            sa.Column("confidence", sa.Float(), nullable=True),
            sa.Column("ocr_text", sa.String(), nullable=True),
            sa.Column("ocr_confidence", sa.Float(), nullable=True),
            sa.Column("inference_latency", sa.Float(), nullable=True),
            sa.Column("timestamp", sa.DateTime(), nullable=True, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(["report_id"], ["reports.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    if not _table_exists(inspector, "traffic_tickets"):
        op.create_table(
            "traffic_tickets",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("report_id", sa.String(), nullable=True),
            sa.Column("officer_id", sa.String(), nullable=True),
            sa.Column("issued_at", sa.DateTime(), nullable=True, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("created_at", sa.DateTime(), nullable=True, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("penal_code", sa.String(), nullable=True),
            sa.Column("fine_amount", sa.Float(), nullable=True),
            sa.ForeignKeyConstraint(["officer_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["report_id"], ["reports.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    if not _table_exists(inspector, "user_rewards"):
        op.create_table(
            "user_rewards",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=True),
            sa.Column("reward_id", sa.String(), nullable=True),
            sa.Column("claimed_at", sa.DateTime(), nullable=True, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(["reward_id"], ["rewards.id"]),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    if not _table_exists(inspector, "audit_logs"):
        op.create_table(
            "audit_logs",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=True),
            sa.Column("action", sa.String(), nullable=True),
            sa.Column("target_type", sa.String(), nullable=True),
            sa.Column("target_id", sa.String(), nullable=True),
            sa.Column("details", sa.JSON(), nullable=True),
            sa.Column("timestamp", sa.DateTime(), nullable=True, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    if not _table_exists(inspector, "citizens"):
        op.create_table(
            "citizens",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("firebase_uid", sa.String(), nullable=False),
            sa.Column("phone_number", sa.String(), nullable=False),
            sa.Column("verified_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.PrimaryKeyConstraint("id"),
        )

    if not _table_exists(inspector, "evidence_reports"):
        op.create_table(
            "evidence_reports",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("tracking_id", sa.String(), nullable=False),
            sa.Column("citizen_id", sa.String(), nullable=False),
            sa.Column("violation_type", sa.String(), nullable=False),
            sa.Column("incident_at", sa.DateTime(), nullable=False),
            sa.Column("location_lat", sa.Float(), nullable=False),
            sa.Column("location_lng", sa.Float(), nullable=False),
            sa.Column("location_address", sa.String(), nullable=True),
            sa.Column("location_city", sa.String(), nullable=True),
            sa.Column("status", REPORT_STATUS_ENUM, nullable=False, server_default=sa.text("'SUBMITTED'")),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(["citizen_id"], ["citizens.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )

    if not _table_exists(inspector, "evidence_files"):
        op.create_table(
            "evidence_files",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("report_id", sa.String(), nullable=False),
            sa.Column("file_type", sa.String(), nullable=False),
            sa.Column("storage_url", sa.Text(), nullable=False),
            sa.Column("original_name", sa.String(), nullable=False),
            sa.Column("mime_type", sa.String(), nullable=True),
            sa.Column("size_bytes", sa.Float(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(["report_id"], ["evidence_reports.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )

    if not _table_exists(inspector, "status_history"):
        op.create_table(
            "status_history",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("report_id", sa.String(), nullable=False),
            sa.Column("previous_status", REPORT_STATUS_ENUM, nullable=True),
            sa.Column("new_status", REPORT_STATUS_ENUM, nullable=False),
            sa.Column("changed_by_user_id", sa.String(), nullable=True),
            sa.Column("changed_by_citizen_id", sa.String(), nullable=True),
            sa.Column("change_source", STATUS_CHANGE_SOURCE_ENUM, nullable=False, server_default=sa.text("'SYSTEM'")),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("details", sa.JSON(), nullable=True),
            sa.Column("changed_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(["changed_by_citizen_id"], ["citizens.id"]),
            sa.ForeignKeyConstraint(["changed_by_user_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["report_id"], ["evidence_reports.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )

    if not _table_exists(inspector, "sms_notifications"):
        op.create_table(
            "sms_notifications",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("citizen_id", sa.String(), nullable=True),
            sa.Column("report_id", sa.String(), nullable=True),
            sa.Column("phone_number", sa.String(), nullable=False),
            sa.Column("template_key", sa.String(), nullable=True),
            sa.Column("provider", sa.String(), nullable=True),
            sa.Column("provider_message_id", sa.String(), nullable=True),
            sa.Column("message_body", sa.Text(), nullable=True),
            sa.Column("delivery_status", SMS_NOTIFICATION_STATUS_ENUM, nullable=False, server_default=sa.text("'PENDING'")),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("details", sa.JSON(), nullable=True),
            sa.Column("attempted_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(["citizen_id"], ["citizens.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["report_id"], ["evidence_reports.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
        )

    inspector = sa.inspect(bind)

    _ensure_index(inspector, "ix_users_email", "users", ["email"], unique=True)
    _ensure_index(inspector, "ix_reports_id", "reports", ["id"])
    _ensure_index(inspector, "ix_reports_tracking_id", "reports", ["tracking_id"], unique=True)
    _ensure_index(inspector, "ix_reports_datetime", "reports", ["datetime"])
    _ensure_index(inspector, "ix_reports_status", "reports", ["status"])
    _ensure_index(inspector, "ix_evidence_report_id", "evidence", ["report_id"])
    _ensure_index(inspector, "ix_inference_logs_report_id", "inference_logs", ["report_id"], unique=True)
    _ensure_index(inspector, "ix_inference_logs_ocr_text", "inference_logs", ["ocr_text"])
    _ensure_index(inspector, "ix_traffic_tickets_officer_id", "traffic_tickets", ["officer_id"])
    _ensure_index(inspector, "ix_audit_logs_action", "audit_logs", ["action"])

    _ensure_index(inspector, "ix_citizens_phone_number", "citizens", ["phone_number"], unique=True)
    _ensure_index(inspector, "ix_citizens_firebase_uid", "citizens", ["firebase_uid"], unique=True)

    _ensure_index(inspector, "ix_evidence_reports_citizen_id", "evidence_reports", ["citizen_id"])
    _ensure_index(inspector, "ix_evidence_reports_tracking_id", "evidence_reports", ["tracking_id"], unique=True)
    _ensure_index(inspector, "ix_evidence_reports_violation_type", "evidence_reports", ["violation_type"])
    _ensure_index(inspector, "ix_evidence_reports_incident_at", "evidence_reports", ["incident_at"])
    _ensure_index(inspector, "ix_evidence_reports_status", "evidence_reports", ["status"])
    _ensure_index(inspector, "ix_evidence_reports_location_city", "evidence_reports", ["location_city"])
    _ensure_index(inspector, "ix_evidence_reports_citizen_created_at", "evidence_reports", ["citizen_id", "created_at"])
    _ensure_index(inspector, "ix_evidence_reports_status_created_at", "evidence_reports", ["status", "created_at"])

    _ensure_index(inspector, "ix_evidence_files_report_id", "evidence_files", ["report_id"])
    _ensure_index(inspector, "ix_evidence_files_report_created_at", "evidence_files", ["report_id", "created_at"])

    _ensure_index(inspector, "ix_status_history_report_id", "status_history", ["report_id"])
    _ensure_index(inspector, "ix_status_history_new_status", "status_history", ["new_status"])
    _ensure_index(inspector, "ix_status_history_changed_by_user_id", "status_history", ["changed_by_user_id"])
    _ensure_index(inspector, "ix_status_history_changed_by_citizen_id", "status_history", ["changed_by_citizen_id"])
    _ensure_index(inspector, "ix_status_history_change_source", "status_history", ["change_source"])
    _ensure_index(inspector, "ix_status_history_changed_at", "status_history", ["changed_at"])
    _ensure_index(inspector, "ix_status_history_report_changed_at", "status_history", ["report_id", "changed_at"])
    _ensure_index(inspector, "ix_status_history_new_status_changed_at", "status_history", ["new_status", "changed_at"])

    _ensure_index(inspector, "ix_sms_notifications_citizen_id", "sms_notifications", ["citizen_id"])
    _ensure_index(inspector, "ix_sms_notifications_report_id", "sms_notifications", ["report_id"])
    _ensure_index(inspector, "ix_sms_notifications_phone_number", "sms_notifications", ["phone_number"])
    _ensure_index(inspector, "ix_sms_notifications_template_key", "sms_notifications", ["template_key"])
    _ensure_index(inspector, "ix_sms_notifications_provider_message_id", "sms_notifications", ["provider_message_id"])
    _ensure_index(inspector, "ix_sms_notifications_delivery_status", "sms_notifications", ["delivery_status"])
    _ensure_index(inspector, "ix_sms_notifications_attempted_at", "sms_notifications", ["attempted_at"])
    _ensure_index(inspector, "ix_sms_notifications_citizen_attempted_at", "sms_notifications", ["citizen_id", "attempted_at"])
    _ensure_index(inspector, "ix_sms_notifications_report_attempted_at", "sms_notifications", ["report_id", "attempted_at"])
    _ensure_index(inspector, "ix_sms_notifications_phone_attempted_at", "sms_notifications", ["phone_number", "attempted_at"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    for table_name in ["sms_notifications", "status_history", "evidence_files", "evidence_reports", "citizens"]:
        if _table_exists(inspector, table_name):
            op.drop_table(table_name)
            inspector = sa.inspect(bind)
