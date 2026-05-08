"""add evidence storage metadata and inference jobs

Revision ID: 20260508_0006
Revises: 20260430_0005
Create Date: 2026-05-08 14:30:00
"""

from alembic import op
import sqlalchemy as sa


revision = "20260508_0006"
down_revision = "20260430_0005"
branch_labels = None
depends_on = None


def _table_exists(inspector: sa.Inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def _column_exists(inspector: sa.Inspector, table_name: str, column_name: str) -> bool:
    return any(column["name"] == column_name for column in inspector.get_columns(table_name))


def _index_exists(inspector: sa.Inspector, table_name: str, index_name: str) -> bool:
    return any(index["name"] == index_name for index in inspector.get_indexes(table_name))


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _table_exists(inspector, "evidence_files"):
        if not _column_exists(inspector, "evidence_files", "storage_backend"):
            op.add_column("evidence_files", sa.Column("storage_backend", sa.String(), nullable=False, server_default="legacy"))
        if not _column_exists(inspector, "evidence_files", "storage_path"):
            op.add_column("evidence_files", sa.Column("storage_path", sa.Text(), nullable=True))
        if not _column_exists(inspector, "evidence_files", "checksum_sha256"):
            op.add_column("evidence_files", sa.Column("checksum_sha256", sa.String(), nullable=True))
        if not _column_exists(inspector, "evidence_files", "access_metadata"):
            op.add_column("evidence_files", sa.Column("access_metadata", sa.JSON(), nullable=True))

        inspector = sa.inspect(bind)
        if not _index_exists(inspector, "evidence_files", "ix_evidence_files_checksum_sha256"):
            op.create_index("ix_evidence_files_checksum_sha256", "evidence_files", ["checksum_sha256"], unique=False)

    inspector = sa.inspect(bind)
    if _table_exists(inspector, "evidence_reports"):
        if not _index_exists(inspector, "evidence_reports", "ix_evidence_reports_violation_created_at"):
            op.create_index("ix_evidence_reports_violation_created_at", "evidence_reports", ["violation_type", "created_at"], unique=False)
        if not _index_exists(inspector, "evidence_reports", "ix_evidence_reports_vehicle_plate"):
            op.create_index("ix_evidence_reports_vehicle_plate", "evidence_reports", ["vehicle_plate"], unique=False)

    if not _table_exists(inspector, "inference_jobs"):
        op.create_table(
            "inference_jobs",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("report_id", sa.String(), nullable=False),
            sa.Column("report_kind", sa.String(), nullable=False, server_default="legacy"),
            sa.Column("queue_backend", sa.String(), nullable=False, server_default="background"),
            sa.Column("queue_job_id", sa.String(), nullable=True),
            sa.Column("status", sa.String(), nullable=False, server_default="queued"),
            sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("max_retries", sa.Integer(), nullable=False, server_default="2"),
            sa.Column("last_error", sa.Text(), nullable=True),
            sa.Column("details", sa.JSON(), nullable=True),
            sa.Column("queued_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("started_at", sa.DateTime(), nullable=True),
            sa.Column("completed_at", sa.DateTime(), nullable=True),
            sa.Column("failed_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_inference_jobs_report_id", "inference_jobs", ["report_id"], unique=False)
        op.create_index("ix_inference_jobs_report_kind", "inference_jobs", ["report_kind"], unique=False)
        op.create_index("ix_inference_jobs_queue_job_id", "inference_jobs", ["queue_job_id"], unique=False)
        op.create_index("ix_inference_jobs_queued_at", "inference_jobs", ["queued_at"], unique=False)
        op.create_index("ix_inference_jobs_status", "inference_jobs", ["status"], unique=False)
        op.create_index("ix_inference_jobs_status_created_at", "inference_jobs", ["status", "created_at"], unique=False)
        op.create_index("ix_inference_jobs_report_kind_report_id", "inference_jobs", ["report_kind", "report_id"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _table_exists(inspector, "inference_jobs"):
        op.drop_table("inference_jobs")

    inspector = sa.inspect(bind)
    if _table_exists(inspector, "evidence_reports"):
        if _index_exists(inspector, "evidence_reports", "ix_evidence_reports_vehicle_plate"):
            op.drop_index("ix_evidence_reports_vehicle_plate", table_name="evidence_reports")
        if _index_exists(inspector, "evidence_reports", "ix_evidence_reports_violation_created_at"):
            op.drop_index("ix_evidence_reports_violation_created_at", table_name="evidence_reports")

    inspector = sa.inspect(bind)
    if _table_exists(inspector, "evidence_files"):
        if _index_exists(inspector, "evidence_files", "ix_evidence_files_checksum_sha256"):
            op.drop_index("ix_evidence_files_checksum_sha256", table_name="evidence_files")
        for column_name in ["access_metadata", "checksum_sha256", "storage_path", "storage_backend"]:
            if _column_exists(sa.inspect(bind), "evidence_files", column_name):
                op.drop_column("evidence_files", column_name)
