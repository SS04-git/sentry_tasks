"""add user permissions

Revision ID: 8743cc1bbd8a
Revises: 1f82281a01f9
Create Date: 2026-07-20 09:02:56.626480

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8743cc1bbd8a'
down_revision: Union[str, Sequence[str], None] = '1f82281a01f9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('permissions', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'permissions')