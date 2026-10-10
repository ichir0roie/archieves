"""add feedbacks announcements and updated_at

Revision ID: a3d9f0b6c214
Revises: 7adb6147a866
Create Date: 2026-10-10 20:46:48.557975

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a3d9f0b6c214'
down_revision: str | None = '7adb6147a866'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


EXISTING_TABLES = [
    'organizations',
    'regions',
    'users',
    'games',
    'rounds',
    'ends',
    'points',
    'matches',
    'game_comments',
    'round_comments',
    'end_comments',
]
NEW_TABLES = [
    'feedbacks',
    'announcements',
]


def _timestamp_columns() -> list[sa.Column]:
    return [
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('deleted_at', sa.Date(), nullable=True),
    ]


def upgrade() -> None:
    op.create_table(
        'announcements',
        sa.Column('published_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('body', sa.String(length=2000), nullable=False),
        *_timestamp_columns(),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_announcements_published_at'), 'announcements', ['published_at'], unique=False)
    op.create_table(
        'feedbacks',
        sa.Column('user_id', sa.BigInteger(), nullable=False),
        sa.Column('email', sa.String(length=254), nullable=True),
        sa.Column('body', sa.String(length=2000), nullable=False),
        sa.Column('reply', sa.String(length=2000), nullable=True),
        sa.Column('replied_at', sa.DateTime(timezone=True), nullable=True),
        *_timestamp_columns(),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_feedbacks_user_id'), 'feedbacks', ['user_id'], unique=False)

    for table in EXISTING_TABLES:
        op.add_column(
            table,
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        )
        # 既存の行は、更新の日時が分からないので作った日時に揃える(トリガーを付ける前に行う)
        op.execute(f'UPDATE {table} SET updated_at = created_at')

    # アプリが値を渡しても、更新のたびに db の時計で書き換える
    op.execute(
        """
        CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
        BEGIN
            NEW.updated_at = now();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
        """
    )
    for table in EXISTING_TABLES + NEW_TABLES:
        op.execute(
            f'CREATE TRIGGER {table}_set_updated_at BEFORE UPDATE ON {table} '
            'FOR EACH ROW EXECUTE FUNCTION set_updated_at()'
        )


def downgrade() -> None:
    for table in EXISTING_TABLES + NEW_TABLES:
        op.execute(f'DROP TRIGGER {table}_set_updated_at ON {table}')
    op.execute('DROP FUNCTION set_updated_at()')
    for table in reversed(EXISTING_TABLES):
        op.drop_column(table, 'updated_at')
    op.drop_index(op.f('ix_feedbacks_user_id'), table_name='feedbacks')
    op.drop_table('feedbacks')
    op.drop_index(op.f('ix_announcements_published_at'), table_name='announcements')
    op.drop_table('announcements')
