"""add content asset performance results

Revision ID: e2b7c3d9a401
Revises: b7e3f1a92c04
Create Date: 2026-07-07 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e2b7c3d9a401'
down_revision: Union[str, Sequence[str], None] = 'b7e3f1a92c04'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('content_assets', schema=None) as batch_op:
        batch_op.add_column(sa.Column('performance_results', sa.JSON(), server_default=sa.text("'[]'"), nullable=False))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('content_assets', schema=None) as batch_op:
        batch_op.drop_column('performance_results')
