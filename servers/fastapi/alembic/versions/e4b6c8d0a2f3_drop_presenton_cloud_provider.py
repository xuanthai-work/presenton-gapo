"""drop Presenton Cloud provider

Revision ID: e4b6c8d0a2f3
Revises: d2f4a6b8c0e1
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e4b6c8d0a2f3"
down_revision: str | None = "d2f4a6b8c0e1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "presenton_cloud_provider" in inspector.get_table_names():
        op.drop_table("presenton_cloud_provider")


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "presenton_cloud_provider" in inspector.get_table_names():
        return
    op.create_table(
        "presenton_cloud_provider",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("issuer", sa.String(length=512), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("access_token_encrypted", sa.Text(), nullable=True),
        sa.Column("token_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
