"""add github accounts

Revision ID: 247cc9d95ac3
Revises: e19c06653229
Create Date: 2026-06-16 07:06:56.302924

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '247cc9d95ac3'
down_revision: Union[str, Sequence[str], None] = 'e19c06653229'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'github_accounts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('github_id', sa.BigInteger(), nullable=True),
        sa.Column('github_login', sa.String(length=255), nullable=True),
        sa.Column('access_token', sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
    )


def downgrade() -> None:
    op.drop_table('github_accounts')