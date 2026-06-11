"""add role to users

Revision ID: dcfe700ba87a
Revises: 32d25f6009ac
Create Date: 2026-06-11 06:31:22.995256

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'dcfe700ba87a'
down_revision: Union[str, Sequence[str], None] = '32d25f6009ac'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    role_enum = sa.Enum('admin', 'leadership', 'manager', 'employee', name='roleenum')
    role_enum.create(op.get_bind())
    op.add_column('users', sa.Column('role', role_enum, nullable=False, server_default='employee'))
    op.drop_constraint('users_username_key', 'users', type_='unique')
    op.drop_index('ix_users_email', table_name='users', if_exists=True)
    op.drop_index('ix_users_id', table_name='users', if_exists=True)
    op.add_column('users', sa.Column('email', sa.String(), nullable=False))
    op.add_column('users', sa.Column('hashed_password', sa.String(), nullable=False))
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_index(op.f('ix_users_id'), 'users', ['id'], unique=False)
    op.drop_column('users', 'username')

def downgrade() -> None:
    op.add_column('users', sa.Column('username', sa.String(), nullable=False))
    op.drop_index(op.f('ix_users_id'), table_name='users')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_column('users', 'hashed_password')
    op.drop_column('users', 'email')
    op.drop_column('users', 'role')
    sa.Enum(name='roleenum').drop(op.get_bind())
    op.create_unique_constraint('users_username_key', 'users', ['username'])