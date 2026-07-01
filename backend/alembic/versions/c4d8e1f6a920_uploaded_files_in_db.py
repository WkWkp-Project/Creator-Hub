"""store uploaded media in the database

Keeps avatars + campaign media in a DB table so they survive on hosts with an
ephemeral filesystem (Render wipes local disk on every restart/redeploy).

Revision ID: c4d8e1f6a920
Revises: d18cef3bba4c
Create Date: 2026-07-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4d8e1f6a920'
down_revision: Union[str, Sequence[str], None] = 'd18cef3bba4c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'uploaded_files',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('path', sa.String(length=255), nullable=False),
        sa.Column('content', sa.LargeBinary(), nullable=False),
        sa.Column('content_type', sa.String(length=100), nullable=False, server_default='application/octet-stream'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_uploaded_files_path', 'uploaded_files', ['path'], unique=True)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_uploaded_files_path', table_name='uploaded_files')
    op.drop_table('uploaded_files')
