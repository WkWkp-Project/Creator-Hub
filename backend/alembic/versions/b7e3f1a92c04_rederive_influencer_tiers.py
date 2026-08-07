"""re-derive influencer tiers from follower counts (5-band)

Historical rows were tiered under the old 3-band scheme (or imported with stale
labels), so e.g. a 450k-follower creator could still read "Micro". Re-derive the
tier from followers for every standard/empty tier; hand-entered custom labels
(anything not in the five canonical bands) are left untouched.

Revision ID: b7e3f1a92c04
Revises: c4d8e1f6a920
Create Date: 2026-07-01 00:30:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'b7e3f1a92c04'
down_revision: Union[str, Sequence[str], None] = 'c4d8e1f6a920'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Re-derive tier from followers (thresholds mirror services/tiers.py)."""
    op.execute(
        """
        UPDATE influencers SET tier = CASE
            WHEN COALESCE(followers, 0) >= 1000000 THEN 'Mega'
            WHEN COALESCE(followers, 0) >= 100000  THEN 'Macro'
            WHEN COALESCE(followers, 0) >= 50000   THEN 'Mid-Tier'
            WHEN COALESCE(followers, 0) >= 10000   THEN 'Micro'
            ELSE 'Nano'
        END
        WHERE tier IS NULL OR tier = ''
           OR tier IN ('Nano', 'Micro', 'Mid-Tier', 'Macro', 'Mega')
        """
    )


def downgrade() -> None:
    """One-way data fix — the previous per-row tiers are not recoverable."""
    pass
