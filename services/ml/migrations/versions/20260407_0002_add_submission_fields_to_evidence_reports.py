"""add submission fields to evidence reports

Revision ID: 20260407_0002
Revises: 20260407_0001
Create Date: 2026-04-07 00:30:00
"""

from alembic import op
import sqlalchemy as sa


revision = "20260407_0002"
down_revision = "20260407_0001"
branch_labels = None
depends_on = None


def _column_names(bind, table_name: str) -> set[str]:
    inspector = sa.inspect(bind)
    return {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    if "evidence_reports" not in sa.inspect(bind).get_table_names():
        return

    existing_columns = _column_names(bind, "evidence_reports")

    if "description" not in existing_columns:
        op.add_column("evidence_reports", sa.Column("description", sa.Text(), nullable=True))
    if "vehicle_plate" not in existing_columns:
        op.add_column("evidence_reports", sa.Column("vehicle_plate", sa.String(), nullable=True))
    if "vehicle_type" not in existing_columns:
        op.add_column("evidence_reports", sa.Column("vehicle_type", sa.String(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    if "evidence_reports" not in sa.inspect(bind).get_table_names():
        return

    existing_columns = _column_names(bind, "evidence_reports")

    if "vehicle_type" in existing_columns:
        op.drop_column("evidence_reports", "vehicle_type")
    if "vehicle_plate" in existing_columns:
        op.drop_column("evidence_reports", "vehicle_plate")
    if "description" in existing_columns:
        op.drop_column("evidence_reports", "description")
