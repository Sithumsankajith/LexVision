"""add evidence_report_id link to inference_logs

Revision ID: 20260430_0005
Revises: 4b0fb4e42570
Create Date: 2026-04-30 16:30:00
"""

from alembic import op
import sqlalchemy as sa


revision = "20260430_0005"
down_revision = "4b0fb4e42570"
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
    if not _table_exists(inspector, "inference_logs"):
        return

    if not _column_exists(inspector, "inference_logs", "evidence_report_id"):
        op.add_column("inference_logs", sa.Column("evidence_report_id", sa.String(), nullable=True))

    inspector = sa.inspect(bind)
    if not _index_exists(inspector, "inference_logs", "ix_inference_logs_evidence_report_id"):
        op.create_index(
            "ix_inference_logs_evidence_report_id",
            "inference_logs",
            ["evidence_report_id"],
            unique=True,
        )

    if bind.dialect.name != "sqlite" and _table_exists(inspector, "evidence_reports"):
        try:
            op.create_foreign_key(
                "fk_inference_logs_evidence_report_id",
                "inference_logs",
                "evidence_reports",
                ["evidence_report_id"],
                ["id"],
            )
        except Exception:
            pass


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not _table_exists(inspector, "inference_logs"):
        return

    existing_indexes = {index["name"] for index in inspector.get_indexes("inference_logs")}
    if "ix_inference_logs_evidence_report_id" in existing_indexes:
        op.drop_index("ix_inference_logs_evidence_report_id", table_name="inference_logs")

    if bind.dialect.name != "sqlite":
        try:
            op.drop_constraint("fk_inference_logs_evidence_report_id", "inference_logs", type_="foreignkey")
        except Exception:
            pass

    if _column_exists(sa.inspect(bind), "inference_logs", "evidence_report_id"):
        op.drop_column("inference_logs", "evidence_report_id")
