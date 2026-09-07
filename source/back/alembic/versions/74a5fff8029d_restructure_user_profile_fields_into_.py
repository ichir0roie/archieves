"""restructure user profile fields into name, region, and genre

Revision ID: 74a5fff8029d
Revises: 32af97cd6393
Create Date: 2026-09-03 00:00:30.548712

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '74a5fff8029d'
down_revision: str | None = '32af97cd6393'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('regions',
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('genres',
    sa.Column('name', sa.String(length=20), nullable=False),
    sa.Column('id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )

    op.drop_index(op.f('ix_organizations_name'), table_name='organizations')

    with op.batch_alter_table('users') as batch_op:
        batch_op.drop_index(op.f('ix_users_username'))
        batch_op.alter_column('username', new_column_name='name')
        batch_op.drop_column('display_name')
        batch_op.drop_column('gender')
        batch_op.drop_column('bio')
        batch_op.drop_column('region')
        # Never had a migration of its own - added straight to the model at
        # some point, so alembic never knew about it until now.
        batch_op.add_column(sa.Column('sub', sa.String(length=100), nullable=True))
        batch_op.create_index(op.f('ix_users_sub'), ['sub'], unique=True)
        batch_op.add_column(
            sa.Column(
                'genre_id',
                sa.BigInteger().with_variant(sa.Integer(), 'sqlite'),
                nullable=True,
            )
        )
        batch_op.add_column(
            sa.Column(
                'region_id',
                sa.BigInteger().with_variant(sa.Integer(), 'sqlite'),
                nullable=True,
            )
        )
        batch_op.create_index(op.f('ix_users_genre_id'), ['genre_id'], unique=False)
        batch_op.create_index(op.f('ix_users_region_id'), ['region_id'], unique=False)
        batch_op.create_foreign_key(
            'fk_users_genre_id_genres',
            'genres', ['genre_id'], ['id'], ondelete='SET NULL',
        )
        batch_op.create_foreign_key(
            'fk_users_region_id_regions',
            'regions', ['region_id'], ['id'], ondelete='SET NULL',
        )


def downgrade() -> None:
    with op.batch_alter_table('users') as batch_op:
        batch_op.drop_constraint('fk_users_region_id_regions', type_='foreignkey')
        batch_op.drop_constraint('fk_users_genre_id_genres', type_='foreignkey')
        batch_op.drop_index(op.f('ix_users_region_id'))
        batch_op.drop_index(op.f('ix_users_genre_id'))
        batch_op.drop_column('region_id')
        batch_op.drop_column('genre_id')
        batch_op.drop_index(op.f('ix_users_sub'))
        batch_op.drop_column('sub')
        batch_op.add_column(sa.Column('region', sa.String(length=100), nullable=True))
        batch_op.add_column(sa.Column('bio', sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column('gender', sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column('display_name', sa.String(length=100), nullable=False, server_default=''))
        batch_op.alter_column('name', new_column_name='username')
        batch_op.create_index(op.f('ix_users_username'), ['username'], unique=True)

    op.create_index(op.f('ix_organizations_name'), 'organizations', ['name'], unique=True)

    op.drop_table('genres')
    op.drop_table('regions')
