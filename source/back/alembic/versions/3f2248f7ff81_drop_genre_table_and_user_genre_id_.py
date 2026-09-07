"""drop genre table and user genre_id column

Revision ID: 3f2248f7ff81
Revises: 52f401760010
Create Date: 2026-09-06 18:33:27.386327

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3f2248f7ff81'
down_revision: str | None = '52f401760010'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table('users') as batch_op:
        batch_op.drop_constraint('fk_users_genre_id_genres', type_='foreignkey')
        batch_op.drop_index(op.f('ix_users_genre_id'))
        batch_op.drop_column('genre_id')

    op.drop_table('genres')


def downgrade() -> None:
    op.create_table('genres',
    sa.Column('name', sa.String(length=20), nullable=False),
    sa.Column('id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('deleted_at', sa.Date(), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )

    with op.batch_alter_table('users') as batch_op:
        batch_op.add_column(
            sa.Column(
                'genre_id',
                sa.BigInteger().with_variant(sa.Integer(), 'sqlite'),
                nullable=True,
            )
        )
        batch_op.create_index(op.f('ix_users_genre_id'), ['genre_id'], unique=False)
        batch_op.create_foreign_key(
            'fk_users_genre_id_genres',
            'genres', ['genre_id'], ['id'], ondelete='SET NULL',
        )
