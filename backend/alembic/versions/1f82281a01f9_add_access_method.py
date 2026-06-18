"""add access method

Revision ID: 1f82281a01f9
Revises: 247cc9d95ac3
Create Date: 2026-06-17 09:25:31.948403

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "1f82281a01f9"
down_revision = "247cc9d95ac3"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "fact_access_event",
        sa.Column(
            "access_method",
            sa.String(),
            nullable=False,
            server_default="card"
        )
    )


def downgrade():
    op.drop_column(
        "fact_access_event",
        "access_method"
    )
