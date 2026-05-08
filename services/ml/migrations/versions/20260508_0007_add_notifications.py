"""add in-app notifications table

Revision ID: 20260508_0007
Revises: 20260508_0006
Create Date: 2026-05-08 16:00:00
"""

from alembic import op
import sqlalchemy as sa


revision = "20260508_0007"
down_revision = "20260508_0006"
branch_labels = None
depends_on = None


def _table_exists(inspector: sa.Inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def _index_exists(inspector: sa.Inspector, table_name: str, index_name: str) -> bool:
    return any(index["name"] == index_name for index in inspector.get_indexes(table_name))


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not _table_exists(inspector, "notifications"):
        op.create_table(
            "notifications",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("recipient_user_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
            sa.Column("recipient_citizen_id", sa.String(), sa.ForeignKey("citizens.id", ondelete="CASCADE"), nullable=True),
            sa.Column("recipient_role", sa.String(), nullable=False),
            sa.Column("title", sa.String(), nullable=False),
            sa.Column("message", sa.Text(), nullable=False),
            sa.Column("notification_type", sa.String(), nullable=False),
            sa.Column("related_entity_type", sa.String(), nullable=True),
            sa.Column("related_entity_id", sa.String(), nullable=True),
            sa.Column("priority", sa.String(), nullable=False, server_default="normal"),
            sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("read_at", sa.DateTime(), nullable=True),
            sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("metadata", sa.JSON(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )

        inspector = sa.inspect(bind)
        op.create_index("ix_notifications_recipient_user_id", "notifications", ["recipient_user_id"], unique=False)
        op.create_index("ix_notifications_recipient_citizen_id", "notifications", ["recipient_citizen_id"], unique=False)
        op.create_index("ix_notifications_recipient_role", "notifications", ["recipient_role"], unique=False)
        op.create_index("ix_notifications_is_read_created_at", "notifications", ["is_read", "created_at"], unique=False)
        op.create_index("ix_notifications_related_entity_id", "notifications", ["related_entity_id"], unique=False)
        op.create_index("ix_notifications_notification_type", "notifications", ["notification_type"], unique=False)
        op.create_index("ix_notifications_is_deleted", "notifications", ["is_deleted"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if _table_exists(inspector, "notifications"):
        op.drop_table("notifications")
