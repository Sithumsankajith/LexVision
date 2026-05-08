"""add district and custom violation fields

Revision ID: 20260508_0008
Revises: 20260508_0007
Create Date: 2026-05-08 18:00:00
"""

from alembic import op
import sqlalchemy as sa


revision = "20260508_0008"
down_revision = "20260508_0007"
branch_labels = None
depends_on = None


def _table_exists(inspector: sa.Inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def _column_names(bind, table_name: str) -> set[str]:
    inspector = sa.inspect(bind)
    return {column["name"] for column in inspector.get_columns(table_name)}


def _index_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    return {index["name"] for index in inspector.get_indexes(table_name)}


def _add_report_columns(table_name: str) -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not _table_exists(inspector, table_name):
        return

    existing_columns = _column_names(bind, table_name)
    existing_indexes = _index_names(inspector, table_name)

    if "location_district" not in existing_columns:
        op.add_column(table_name, sa.Column("location_district", sa.String(), nullable=True))
    if f"ix_{table_name}_location_district" not in existing_indexes:
        op.create_index(f"ix_{table_name}_location_district", table_name, ["location_district"], unique=False)

    if "custom_violation_description" not in existing_columns:
        op.add_column(table_name, sa.Column("custom_violation_description", sa.Text(), nullable=True))

    if "manual_review_required" not in existing_columns:
        op.add_column(
            table_name,
            sa.Column("manual_review_required", sa.Boolean(), nullable=False, server_default=sa.false()),
        )


def upgrade() -> None:
    _add_report_columns("reports")
    _add_report_columns("evidence_reports")


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    for table_name in ("evidence_reports", "reports"):
        if not _table_exists(inspector, table_name):
            continue
        existing_columns = _column_names(bind, table_name)
        existing_indexes = _index_names(inspector, table_name)

        index_name = f"ix_{table_name}_location_district"
        if index_name in existing_indexes:
            op.drop_index(index_name, table_name=table_name)
        if "manual_review_required" in existing_columns:
            op.drop_column(table_name, "manual_review_required")
        if "custom_violation_description" in existing_columns:
            op.drop_column(table_name, "custom_violation_description")
        if "location_district" in existing_columns:
            op.drop_column(table_name, "location_district")
