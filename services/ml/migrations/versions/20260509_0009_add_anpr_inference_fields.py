"""add dedicated ANPR inference fields

Revision ID: 20260509_0009
Revises: 20260508_0008
Create Date: 2026-05-09 15:45:00
"""

from alembic import op
import sqlalchemy as sa


revision = "20260509_0009"
down_revision = "20260508_0008"
branch_labels = None
depends_on = None


ANPR_COLUMNS = {
    "plate_text": sa.Column("plate_text", sa.String(), nullable=True),
    "normalized_plate_text": sa.Column("normalized_plate_text", sa.String(), nullable=True),
    "plate_confidence": sa.Column("plate_confidence", sa.Float(), nullable=True),
    "plate_bbox": sa.Column("plate_bbox", sa.JSON(), nullable=True),
    "anpr_status": sa.Column("anpr_status", sa.String(), nullable=True),
    "anpr_error": sa.Column("anpr_error", sa.Text(), nullable=True),
    "plate_crop_path": sa.Column("plate_crop_path", sa.Text(), nullable=True),
    "officer_corrected_plate_text": sa.Column("officer_corrected_plate_text", sa.String(), nullable=True),
    "plate_corrected_by": sa.Column("plate_corrected_by", sa.String(), nullable=True),
    "plate_corrected_at": sa.Column("plate_corrected_at", sa.DateTime(), nullable=True),
}

ANPR_INDEXES = (
    ("ix_inference_logs_normalized_plate_text", ["normalized_plate_text"]),
    ("ix_inference_logs_anpr_status", ["anpr_status"]),
    ("ix_inference_logs_officer_corrected_plate_text", ["officer_corrected_plate_text"]),
    ("ix_inference_logs_plate_corrected_by", ["plate_corrected_by"]),
)


def _table_exists(inspector: sa.Inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def _column_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    return {column["name"] for column in inspector.get_columns(table_name)}


def _index_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    return {index["name"] for index in inspector.get_indexes(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not _table_exists(inspector, "inference_logs"):
        return

    existing_columns = _column_names(inspector, "inference_logs")
    for column_name, column in ANPR_COLUMNS.items():
        if column_name not in existing_columns:
            op.add_column("inference_logs", column.copy())

    existing_indexes = _index_names(sa.inspect(bind), "inference_logs")
    for index_name, columns in ANPR_INDEXES:
        if index_name not in existing_indexes:
            op.create_index(index_name, "inference_logs", columns, unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not _table_exists(inspector, "inference_logs"):
        return

    existing_indexes = _index_names(inspector, "inference_logs")
    for index_name, _columns in reversed(ANPR_INDEXES):
        if index_name in existing_indexes:
            op.drop_index(index_name, table_name="inference_logs")

    existing_columns = _column_names(sa.inspect(bind), "inference_logs")
    for column_name in reversed(tuple(ANPR_COLUMNS.keys())):
        if column_name in existing_columns:
            op.drop_column("inference_logs", column_name)
