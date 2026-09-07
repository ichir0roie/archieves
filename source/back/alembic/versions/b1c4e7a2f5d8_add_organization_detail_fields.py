"""add organization detail fields

Revision ID: b1c4e7a2f5d8
Revises: 74a5fff8029d
Create Date: 2026-09-04 00:00:00.000000

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b1c4e7a2f5d8'
down_revision: str | None = '74a5fff8029d'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table('organizations') as batch_op:
        batch_op.add_column(sa.Column('formal_name', sa.String(length=200), nullable=True))
        batch_op.add_column(sa.Column('homepage_url', sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column('location', sa.String(length=200), nullable=True))
        batch_op.add_column(
            sa.Column(
                'parent_organization_id',
                sa.BigInteger().with_variant(sa.Integer(), 'sqlite'),
                nullable=True,
            )
        )
        batch_op.create_index(
            op.f('ix_organizations_parent_organization_id'),
            ['parent_organization_id'],
            unique=False,
        )
        batch_op.create_foreign_key(
            'fk_organizations_parent_organization_id_organizations',
            'organizations', ['parent_organization_id'], ['id'], ondelete='SET NULL',
        )


def downgrade() -> None:
    with op.batch_alter_table('organizations') as batch_op:
        batch_op.drop_constraint(
            'fk_organizations_parent_organization_id_organizations', type_='foreignkey'
        )
        batch_op.drop_index(op.f('ix_organizations_parent_organization_id'))
        batch_op.drop_column('parent_organization_id')
        batch_op.drop_column('location')
        batch_op.drop_column('homepage_url')
        batch_op.drop_column('formal_name')
