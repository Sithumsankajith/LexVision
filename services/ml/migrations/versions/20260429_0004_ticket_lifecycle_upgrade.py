"""ticket lifecycle upgrade

Revision ID: 20260429_0004
Revises: 20260429_0003
Create Date: 2026-04-29 15:30:00

Upgrades the traffic_tickets table from a minimal record into a full
enforcement ticket lifecycle, and creates the ticket_status_history
audit table.

Changes to traffic_tickets:
  - ADD ticket_number (String, unique, not-null)
  - ADD evidence_report_id (FK → evidence_reports.id, nullable, unique)
  - ADD status (String/Enum, not-null, default ISSUED)
  - ADD violation_type, vehicle_plate, offender_name, offender_contact
  - ADD due_date, paid_at, payment_reference
  - ADD appeal_reason, appealed_at
  - ADD cancelled_at, cancelled_reason
  - ADD notes, updated_at

New table: ticket_status_history
  - Full audit trail for ticket status transitions.
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260429_0004"
down_revision = "20260429_0003"
branch_labels = None
depends_on = None


TICKET_STATUS_ENUM = sa.Enum(
    "DRAFT",
    "ISSUED",
    "NOTIFIED",
    "PAID",
    "OVERDUE",
    "APPEALED",
    "CANCELLED",
    "CLOSED",
    name="ticket_status_enum",
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


def _table_exists(inspector: sa.Inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def _column_exists(inspector: sa.Inspector, table_name: str, column_name: str) -> bool:
    columns = [col["name"] for col in inspector.get_columns(table_name)]
    return column_name in columns


def _index_exists(inspector: sa.Inspector, table_name: str, index_name: str) -> bool:
    return any(idx["name"] == index_name for idx in inspector.get_indexes(table_name))


def _ensure_index(
    inspector: sa.Inspector,
    index_name: str,
    table_name: str,
    columns: list[str],
    *,
    unique: bool = False,
) -> None:
    if _table_exists(inspector, table_name) and not _index_exists(inspector, table_name, index_name):
        op.create_index(index_name, table_name, columns, unique=unique)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # ------------------------------------------------------------------
    # 1. Add new columns to traffic_tickets
    # ------------------------------------------------------------------
    if _table_exists(inspector, "traffic_tickets"):
        new_columns = {
            "ticket_number": sa.Column("ticket_number", sa.String(), nullable=True),
            "evidence_report_id": sa.Column(
                "evidence_report_id", sa.String(), nullable=True,
            ),
            "status": sa.Column(
                "status", sa.String(), nullable=True,
                server_default=sa.text("'ISSUED'"),
            ),
            "violation_type": sa.Column("violation_type", sa.String(), nullable=True),
            "vehicle_plate": sa.Column("vehicle_plate", sa.String(), nullable=True),
            "offender_name": sa.Column("offender_name", sa.String(), nullable=True),
            "offender_contact": sa.Column("offender_contact", sa.String(), nullable=True),
            "due_date": sa.Column("due_date", sa.DateTime(), nullable=True),
            "paid_at": sa.Column("paid_at", sa.DateTime(), nullable=True),
            "payment_reference": sa.Column("payment_reference", sa.String(), nullable=True),
            "appeal_reason": sa.Column("appeal_reason", sa.Text(), nullable=True),
            "appealed_at": sa.Column("appealed_at", sa.DateTime(), nullable=True),
            "cancelled_at": sa.Column("cancelled_at", sa.DateTime(), nullable=True),
            "cancelled_reason": sa.Column("cancelled_reason", sa.Text(), nullable=True),
            "notes": sa.Column("notes", sa.Text(), nullable=True),
            "updated_at": sa.Column(
                "updated_at", sa.DateTime(), nullable=True,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
        }

        for col_name, col_def in new_columns.items():
            if not _column_exists(inspector, "traffic_tickets", col_name):
                op.add_column("traffic_tickets", col_def)

        # Refresh inspector after schema changes.
        inspector = sa.inspect(bind)

        # ------------------------------------------------------------------
        # 2. Backfill existing rows
        # ------------------------------------------------------------------
        # Set status = ISSUED for all existing tickets (they were already issued).
        op.execute(
            sa.text(
                "UPDATE traffic_tickets SET status = 'ISSUED' WHERE status IS NULL"
            )
        )

        # Generate ticket_number for existing rows that don't have one.
        # Use a deterministic format based on the existing id.
        op.execute(
            sa.text(
                "UPDATE traffic_tickets "
                "SET ticket_number = 'TKT-LEGACY-' || UPPER(SUBSTR(id, 1, 8)) "
                "WHERE ticket_number IS NULL"
            )
        )

        # Now make ticket_number NOT NULL (SQLite doesn't support ALTER COLUMN,
        # so we skip the NOT NULL enforcement on SQLite — the model enforces it).
        dialect = bind.dialect.name
        if dialect != "sqlite":
            op.alter_column(
                "traffic_tickets",
                "ticket_number",
                existing_type=sa.String(),
                nullable=False,
            )
            op.alter_column(
                "traffic_tickets",
                "status",
                existing_type=sa.String(),
                nullable=False,
            )

        # ------------------------------------------------------------------
        # 3. Add FK for evidence_report_id
        # ------------------------------------------------------------------
        if dialect != "sqlite" and _table_exists(inspector, "evidence_reports"):
            try:
                op.create_foreign_key(
                    "fk_traffic_tickets_evidence_report_id",
                    "traffic_tickets",
                    "evidence_reports",
                    ["evidence_report_id"],
                    ["id"],
                )
            except Exception:
                pass  # FK may already exist

        # ------------------------------------------------------------------
        # 4. Indexes on traffic_tickets
        # ------------------------------------------------------------------
        inspector = sa.inspect(bind)
        _ensure_index(inspector, "ix_traffic_tickets_ticket_number", "traffic_tickets", ["ticket_number"], unique=True)
        _ensure_index(inspector, "ix_traffic_tickets_status", "traffic_tickets", ["status"])
        _ensure_index(inspector, "ix_traffic_tickets_evidence_report_id", "traffic_tickets", ["evidence_report_id"])
        _ensure_index(inspector, "ix_traffic_tickets_report_status", "traffic_tickets", ["report_id", "status"])

    # ------------------------------------------------------------------
    # 5. Create ticket_status_history table
    # ------------------------------------------------------------------
    if not _table_exists(inspector, "ticket_status_history"):
        op.create_table(
            "ticket_status_history",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("ticket_id", sa.String(), nullable=False),
            sa.Column("previous_status", sa.String(), nullable=True),
            sa.Column("new_status", sa.String(), nullable=False),
            sa.Column("changed_by_user_id", sa.String(), nullable=True),
            sa.Column(
                "change_source",
                sa.String(),
                nullable=False,
                server_default=sa.text("'SYSTEM'"),
            ),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("details", sa.JSON(), nullable=True),
            sa.Column(
                "changed_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.text("CURRENT_TIMESTAMP"),
            ),
            sa.ForeignKeyConstraint(
                ["ticket_id"],
                ["traffic_tickets.id"],
                ondelete="CASCADE",
            ),
            sa.ForeignKeyConstraint(
                ["changed_by_user_id"],
                ["users.id"],
            ),
            sa.PrimaryKeyConstraint("id"),
        )

        inspector = sa.inspect(bind)
        _ensure_index(inspector, "ix_ticket_status_history_ticket_id", "ticket_status_history", ["ticket_id"])
        _ensure_index(inspector, "ix_ticket_status_history_new_status", "ticket_status_history", ["new_status"])
        _ensure_index(inspector, "ix_ticket_status_history_changed_by_user_id", "ticket_status_history", ["changed_by_user_id"])
        _ensure_index(inspector, "ix_ticket_status_history_change_source", "ticket_status_history", ["change_source"])
        _ensure_index(inspector, "ix_ticket_status_history_changed_at", "ticket_status_history", ["changed_at"])
        _ensure_index(inspector, "ix_ticket_status_history_ticket_changed_at", "ticket_status_history", ["ticket_id", "changed_at"])
        _ensure_index(inspector, "ix_ticket_status_history_new_status_changed_at", "ticket_status_history", ["new_status", "changed_at"])

    # ------------------------------------------------------------------
    # 6. Seed initial ticket_status_history for existing tickets
    # ------------------------------------------------------------------
    # Create an ISSUED history entry for every existing ticket that has no history yet.
    dialect = bind.dialect.name
    if dialect == "sqlite":
        uuid_expr = "LOWER(HEX(RANDOMBLOB(16)))"
    else:
        # PostgreSQL (and most other engines) can use gen_random_uuid()
        uuid_expr = "gen_random_uuid()::text"

    op.execute(
        sa.text(
            f"INSERT INTO ticket_status_history (id, ticket_id, previous_status, new_status, change_source, notes, changed_at) "
            f"SELECT "
            f"  {uuid_expr}, "
            f"  tt.id, "
            f"  NULL, "
            f"  'ISSUED', "
            f"  'SYSTEM', "
            f"  'Backfilled during lifecycle upgrade migration.', "
            f"  COALESCE(tt.issued_at, tt.created_at, CURRENT_TIMESTAMP) "
            f"FROM traffic_tickets tt "
            f"WHERE NOT EXISTS ("
            f"  SELECT 1 FROM ticket_status_history tsh WHERE tsh.ticket_id = tt.id"
            f")"
        )
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _table_exists(inspector, "ticket_status_history"):
        op.drop_table("ticket_status_history")

    if _table_exists(inspector, "traffic_tickets"):
        drop_cols = [
            "ticket_number", "evidence_report_id", "status",
            "violation_type", "vehicle_plate", "offender_name", "offender_contact",
            "due_date", "paid_at", "payment_reference",
            "appeal_reason", "appealed_at",
            "cancelled_at", "cancelled_reason",
            "notes", "updated_at",
        ]
        inspector = sa.inspect(bind)
        for col in drop_cols:
            if _column_exists(inspector, "traffic_tickets", col):
                op.drop_column("traffic_tickets", col)
