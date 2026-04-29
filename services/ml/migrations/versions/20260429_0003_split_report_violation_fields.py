"""split report violation fields into claimed, inferred, and final

Revision ID: 20260429_0003
Revises: 20260407_0002
Create Date: 2026-04-29 10:00:00
"""

from alembic import op
import sqlalchemy as sa


revision = "20260429_0003"
down_revision = "20260407_0002"
branch_labels = None
depends_on = None


def _column_names(bind, table_name: str) -> set[str]:
    inspector = sa.inspect(bind)
    return {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "reports" not in inspector.get_table_names():
        return

    existing_columns = _column_names(bind, "reports")

    if "claimed_violation_type" not in existing_columns:
        op.add_column("reports", sa.Column("claimed_violation_type", sa.String(), nullable=True))
        op.create_index("ix_reports_claimed_violation_type", "reports", ["claimed_violation_type"], unique=False)

    if "inferred_violation_type" not in existing_columns:
        op.add_column("reports", sa.Column("inferred_violation_type", sa.String(), nullable=True))
        op.create_index("ix_reports_inferred_violation_type", "reports", ["inferred_violation_type"], unique=False)

    # Preserve the existing user-submitted value as the claimed type for legacy rows.
    op.execute(
        sa.text(
            """
            UPDATE reports
            SET claimed_violation_type = violation_type
            WHERE claimed_violation_type IS NULL
              AND violation_type IS NOT NULL
            """
        )
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "reports" not in inspector.get_table_names():
        return

    existing_columns = _column_names(bind, "reports")
    existing_indexes = {index["name"] for index in inspector.get_indexes("reports")}

    if "ix_reports_inferred_violation_type" in existing_indexes:
        op.drop_index("ix_reports_inferred_violation_type", table_name="reports")
    if "inferred_violation_type" in existing_columns:
        op.drop_column("reports", "inferred_violation_type")

    if "ix_reports_claimed_violation_type" in existing_indexes:
        op.drop_index("ix_reports_claimed_violation_type", table_name="reports")
    if "claimed_violation_type" in existing_columns:
        op.drop_column("reports", "claimed_violation_type")
